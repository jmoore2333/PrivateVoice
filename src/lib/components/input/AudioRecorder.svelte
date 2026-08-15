<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import WaveSurfer from 'wavesurfer.js';
  import RecordPlugin from 'wavesurfer.js/dist/plugins/record.esm.js';

  interface Props {
    onRecordingComplete?: (blob: Blob, url: string) => void;
    onImport?: (file: File) => void;
    /**
     * Audio restored from outside the recorder (e.g. a saved voice profile).
     * Without this the waveform stays blank even though the parent holds the
     * audio, which reads as "no reference loaded".
     */
    restoredAudioUrl?: string | null;
  }

  let { onRecordingComplete, onImport, restoredAudioUrl = null }: Props = $props();

  let container: HTMLDivElement;
  let wavesurfer: WaveSurfer | null = null;
  let recorder: ReturnType<typeof RecordPlugin.create> | null = null;
  let isRecording = $state(false);
  let hasRecording = $state(false);
  let recordedUrl = $state<string | null>(null);
  let recordingTime = $state(0);
  let error = $state<string | null>(null);
  let microphoneSupported = $state(true);
  let micPermissionDenied = $state(false);
  let isPlaying = $state(false);
  let isFallbackRecording = false;

  let fallbackStream: MediaStream | null = null;
  let fallbackAudioContext: AudioContext | null = null;
  let fallbackSource: MediaStreamAudioSourceNode | null = null;
  let fallbackProcessor: ScriptProcessorNode | null = null;
  let fallbackSilence: GainNode | null = null;
  let fallbackAnalyser: AnalyserNode | null = null;
  let fallbackChunks: Float32Array[] = [];
  let fallbackSampleRate = 44100;
  let fallbackTimerId: number | null = null;
  let fallbackStartTime = 0;
  let fallbackWaveformTimerId: number | null = null;
  let fallbackWaveformData: Float32Array | null = null;
  let fallbackWaveformRenderBusy = false;
  let fallbackWaveformRenderPending = false;
  let fallbackNoiseFloor = 0.006;
  let fallbackNoiseCalibratingUntil = 0;
  let fallbackDisplayLevel = 0;

  const FALLBACK_WAVEFORM_SECONDS = 5;
  const FALLBACK_WAVEFORM_HZ = 24;

  function isLinuxDesktop(): boolean {
    const ua = navigator.userAgent.toLowerCase();
    return ua.includes('linux') && !ua.includes('android');
  }

  function getAudioContextCtor(): typeof AudioContext | undefined {
    const g = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
    return g.AudioContext ?? g.webkitAudioContext;
  }

  function getSupportedRecordingMimeType(): string | undefined {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
      return undefined;
    }

    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
      'audio/ogg',
    ];

    return candidates.find(type => MediaRecorder.isTypeSupported(type));
  }

  function hasWebAudioFallbackSupport(): boolean {
    return typeof getAudioContextCtor() === 'function';
  }

  function startFallbackTimer() {
    if (fallbackTimerId !== null) {
      clearInterval(fallbackTimerId);
    }
    fallbackStartTime = performance.now();
    recordingTime = 0;
    fallbackTimerId = window.setInterval(() => {
      recordingTime = (performance.now() - fallbackStartTime) / 1000;
    }, 100);
  }

  function stopFallbackTimer() {
    if (fallbackTimerId !== null) {
      clearInterval(fallbackTimerId);
      fallbackTimerId = null;
    }
  }

  function stopFallbackWaveformLoop() {
    if (fallbackWaveformTimerId !== null) {
      clearInterval(fallbackWaveformTimerId);
      fallbackWaveformTimerId = null;
    }
    fallbackWaveformData = null;
    fallbackWaveformRenderPending = false;
    fallbackWaveformRenderBusy = false;
  }

  async function renderFallbackWaveform() {
    if (!wavesurfer || !fallbackWaveformData) return;

    if (fallbackWaveformRenderBusy) {
      fallbackWaveformRenderPending = true;
      return;
    }

    fallbackWaveformRenderBusy = true;
    const snapshot = new Float32Array(fallbackWaveformData);

    try {
      await wavesurfer.load('', [snapshot], FALLBACK_WAVEFORM_SECONDS);
    } catch (err) {
      console.warn('[AudioRecorder] Failed to render fallback waveform:', err);
    } finally {
      fallbackWaveformRenderBusy = false;
      if (fallbackWaveformRenderPending && isFallbackRecording) {
        fallbackWaveformRenderPending = false;
        void renderFallbackWaveform();
      } else {
        fallbackWaveformRenderPending = false;
      }
    }
  }

  function startFallbackWaveformLoop(analyser: AnalyserNode) {
    stopFallbackWaveformLoop();

    const points = FALLBACK_WAVEFORM_SECONDS * FALLBACK_WAVEFORM_HZ;
    fallbackWaveformData = new Float32Array(points);
    const timeDomain = new Float32Array(analyser.fftSize);
    const intervalMs = Math.round(1000 / FALLBACK_WAVEFORM_HZ);
    fallbackNoiseFloor = 0.006;
    fallbackDisplayLevel = 0;
    fallbackNoiseCalibratingUntil = performance.now() + 1000;

    fallbackWaveformTimerId = window.setInterval(() => {
      if (!isFallbackRecording || !fallbackWaveformData) return;

      analyser.getFloatTimeDomainData(timeDomain);
      let sumSquares = 0;
      for (let i = 0; i < timeDomain.length; i++) {
        const v = timeDomain[i];
        sumSquares += v * v;
      }
      const rms = Math.sqrt(sumSquares / timeDomain.length);

      const now = performance.now();
      if (now < fallbackNoiseCalibratingUntil) {
        // Quick baseline capture right after mic opens.
        fallbackNoiseFloor = fallbackNoiseFloor * 0.92 + rms * 0.08;
      } else if (rms < fallbackNoiseFloor * 1.2) {
        // Follow quiet-room drift faster.
        fallbackNoiseFloor = fallbackNoiseFloor * 0.995 + rms * 0.005;
      } else {
        // Follow rising ambient noise very slowly.
        fallbackNoiseFloor = fallbackNoiseFloor * 0.999 + rms * 0.001;
      }

      const gated = Math.max(0, rms - fallbackNoiseFloor * 1.25);
      const normalized = Math.min(1, gated * 14);

      if (normalized > fallbackDisplayLevel) {
        fallbackDisplayLevel = fallbackDisplayLevel * 0.6 + normalized * 0.4;
      } else {
        fallbackDisplayLevel = fallbackDisplayLevel * 0.9 + normalized * 0.1;
      }

      const level = fallbackDisplayLevel < 0.01 ? 0 : fallbackDisplayLevel;

      fallbackWaveformData.copyWithin(0, 1);
      fallbackWaveformData[fallbackWaveformData.length - 1] = level;
      void renderFallbackWaveform();
    }, intervalMs);
  }

  function buildWavBlob(chunks: Float32Array[], sampleRate: number): Blob {
    const totalSamples = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const pcm = new Float32Array(totalSamples);
    let offset = 0;
    for (const chunk of chunks) {
      pcm.set(chunk, offset);
      offset += chunk.length;
    }

    const bytesPerSample = 2; // PCM16
    const buffer = new ArrayBuffer(44 + totalSamples * bytesPerSample);
    const view = new DataView(buffer);

    const writeAscii = (at: number, value: string) => {
      for (let i = 0; i < value.length; i++) {
        view.setUint8(at + i, value.charCodeAt(i));
      }
    };

    writeAscii(0, 'RIFF');
    view.setUint32(4, 36 + totalSamples * bytesPerSample, true);
    writeAscii(8, 'WAVE');
    writeAscii(12, 'fmt ');
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
    view.setUint16(32, bytesPerSample, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    writeAscii(36, 'data');
    view.setUint32(40, totalSamples * bytesPerSample, true);

    let index = 44;
    for (let i = 0; i < totalSamples; i++) {
      const sample = Math.max(-1, Math.min(1, pcm[i]));
      const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(index, int16, true);
      index += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  async function cleanupFallbackRecorder() {
    stopFallbackTimer();
    stopFallbackWaveformLoop();

    try {
      fallbackProcessor?.disconnect();
    } catch {
      // ignore
    }
    try {
      fallbackSource?.disconnect();
    } catch {
      // ignore
    }
    try {
      fallbackSilence?.disconnect();
    } catch {
      // ignore
    }
    try {
      fallbackAnalyser?.disconnect();
    } catch {
      // ignore
    }

    fallbackProcessor = null;
    fallbackSource = null;
    fallbackSilence = null;
    fallbackAnalyser = null;

    if (fallbackStream) {
      for (const track of fallbackStream.getTracks()) {
        track.stop();
      }
      fallbackStream = null;
    }

    if (fallbackAudioContext) {
      try {
        await fallbackAudioContext.close();
      } catch {
        // ignore
      }
      fallbackAudioContext = null;
    }

    isFallbackRecording = false;
  }

  async function startWebAudioFallbackRecording() {
    const AudioContextCtor = getAudioContextCtor();
    if (!AudioContextCtor) {
      throw new Error('Recording is not supported in this environment.');
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const audioContext = new AudioContextCtor();
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }

    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    const silence = audioContext.createGain();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    silence.gain.value = 0;

    fallbackChunks = [];
    fallbackSampleRate = audioContext.sampleRate;
    processor.onaudioprocess = (event: AudioProcessingEvent) => {
      if (!isFallbackRecording) return;
      const input = event.inputBuffer.getChannelData(0);
      fallbackChunks.push(new Float32Array(input));
    };

    source.connect(processor);
    source.connect(analyser);
    processor.connect(silence);
    silence.connect(audioContext.destination);

    fallbackStream = stream;
    fallbackAudioContext = audioContext;
    fallbackSource = source;
    fallbackProcessor = processor;
    fallbackSilence = silence;
    fallbackAnalyser = analyser;

    isFallbackRecording = true;
    isRecording = true;
    startFallbackTimer();
    if (!isLinuxDesktop()) {
      startFallbackWaveformLoop(analyser);
    }
    console.log('[AudioRecorder] Recording with WebAudio fallback (WAV)');
  }

  async function stopWebAudioFallbackRecording() {
    if (!isFallbackRecording) return;

    const chunks = fallbackChunks.map(chunk => new Float32Array(chunk));
    const sampleRate = fallbackSampleRate;
    isRecording = false;

    await cleanupFallbackRecorder();

    if (chunks.length === 0) {
      error = 'No audio captured. Please try again.';
      return;
    }

    const blob = buildWavBlob(chunks, sampleRate);
    const url = URL.createObjectURL(blob);
    recordedUrl = url;
    hasRecording = true;
    wavesurfer?.load(url);
    onRecordingComplete?.(blob, url);
  }

  onMount(() => {
    // Check if microphone recording is supported
    // Note: Tauri's WebView on macOS may not support navigator.mediaDevices
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.warn('[AudioRecorder] navigator.mediaDevices not available - recording disabled');
      microphoneSupported = false;
    }

    // Create WaveSurfer for playback of recorded/imported audio
    wavesurfer = WaveSurfer.create({
      container,
      waveColor: '#4a9eff',
      progressColor: '#2563eb',
      height: 60,
      barWidth: 2,
      barGap: 1,
    });

    wavesurfer.on('play', () => {
      isPlaying = true;
    });

    wavesurfer.on('pause', () => {
      isPlaying = false;
    });

    wavesurfer.on('finish', () => {
      isPlaying = false;
    });

    // Only create RecordPlugin if microphone is supported
    if (microphoneSupported) {
      const mimeType = getSupportedRecordingMimeType();
      if (mimeType) {
        console.log('[AudioRecorder] Using recording mime type:', mimeType);
      } else {
        console.warn('[AudioRecorder] No preferred recording mime type reported as supported; using browser default');
      }

      // Create RecordPlugin
      // Note: scrollingWaveform shows live visualization during recording
      recorder = wavesurfer.registerPlugin(RecordPlugin.create({
        ...(mimeType ? { mimeType } : {}),
        scrollingWaveform: true,
        renderRecordedAudio: true,
      }));

      recorder.on('record-start', () => {
        console.log('[AudioRecorder] Recording started');
        isRecording = true;
      });

      recorder.on('record-progress', (time: number) => {
        // Update recording time from plugin
        recordingTime = time / 1000; // Convert ms to seconds
      });

      recorder.on('record-end', (blob: Blob) => {
        console.log('[AudioRecorder] Recording ended, blob size:', blob.size);
        isRecording = false;
        const url = URL.createObjectURL(blob);
        recordedUrl = url;
        hasRecording = true;
        wavesurfer?.load(url);
        onRecordingComplete?.(blob, url);
      });
    }
  });

  onDestroy(() => {
    wavesurfer?.destroy();
    void cleanupFallbackRecorder();
  });

  async function retryMicPermission() {
    micPermissionDenied = false;
    error = null;

    // On Windows, clear cached WebView2 permission denials before retrying
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const cleared = await invoke<boolean>('reset_mic_permissions');
      if (cleared) {
        console.log('[AudioRecorder] Cleared cached mic permission denial');
      }
    } catch {
      // Not in Tauri or command unavailable — ignore
    }

    startRecording();
  }

  async function startRecording() {
    if (!recorder || !microphoneSupported) {
      error = 'Recording not available. Please use the Import button to upload an audio file.';
      return;
    }

    error = null;
    recordingTime = 0;
    hasRecording = false;

    try {
      // Request microphone and start recording
      console.log('[AudioRecorder] Requesting microphone access...');
      await recorder.startRecording();
      console.log('[AudioRecorder] Microphone granted, recording...');
      isRecording = true;
    } catch (err) {
      console.error('[AudioRecorder] Failed to start recording:', err);
      isRecording = false;

      // RecordPlugin starts mic monitoring before MediaRecorder construction.
      // If start fails (e.g., unsupported mime type), force mic cleanup.
      try {
        recorder.stopRecording();
        recorder.stopMic();
      } catch (cleanupErr) {
        console.warn('[AudioRecorder] Failed to cleanup recorder after start error:', cleanupErr);
      }

      if (err instanceof Error) {
        const messageLower = err.message.toLowerCase();
        const mediaRecorderUnsupported =
          err.name === 'NotSupportedError' ||
          messageLower.includes('mediarecorder is unsupported') ||
          messageLower.includes('mediarecorder unsupported') ||
          messageLower.includes('mimetype is not supported') ||
          messageLower.includes('mime type is not supported');

        if (mediaRecorderUnsupported && hasWebAudioFallbackSupport()) {
          try {
            await startWebAudioFallbackRecording();
            error = null;
            return;
          } catch (fallbackErr) {
            console.error('[AudioRecorder] WebAudio fallback failed:', fallbackErr);
          }
        }

        if (
          err.name === 'NotAllowedError' ||
          messageLower.includes('permission') ||
          messageLower.includes('not allowed')
        ) {
          micPermissionDenied = true;
          error = null;
        } else if (err.name === 'NotFoundError') {
          error = 'No microphone found. Please connect a microphone and try again.';
        } else if (err.message.includes('mediaDevices')) {
          error = 'Microphone recording is not supported in this environment. Please use the Import button.';
          microphoneSupported = false;
        } else {
          error = err.message || 'Failed to start recording';
        }
      } else {
        error = 'Failed to start recording';
      }
    }
  }

  function stopRecording() {
    if (!recorder) return;

    console.log('[AudioRecorder] Stopping recording...');
    if (isFallbackRecording) {
      void stopWebAudioFallbackRecording();
      return;
    }

    const wasActive = recorder.isActive();
    try {
      if (wasActive) {
        recorder.stopRecording();
      } else {
        recorder.stopMic();
      }
    } catch (err) {
      console.warn('[AudioRecorder] Failed to stop recorder cleanly:', err);
      try {
        recorder.stopMic();
      } catch {
        // ignore
      }
    } finally {
      isRecording = false;
    }
  }

  function handleFileImport(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file && wavesurfer) {
      const url = URL.createObjectURL(file);
      recordedUrl = url;
      hasRecording = true;
      wavesurfer.load(url);
      onImport?.(file);
    }
  }

  // Show audio the parent restored (saved voice profile) in the waveform.
  $effect(() => {
    const url = restoredAudioUrl;
    if (!url || url === recordedUrl || !wavesurfer) return;
    recordedUrl = url;
    hasRecording = true;
    wavesurfer.load(url);
  });

  function clearRecording() {
    hasRecording = false;
    recordedUrl = null;
    wavesurfer?.empty();
    isPlaying = false;
  }

  function togglePlayback() {
    if (!wavesurfer || !recordedUrl) return;
    wavesurfer.playPause();
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
</script>

<div class="space-y-3">
  <div class="block text-sm font-medium text-[var(--color-text-primary)]">
    Reference Audio
  </div>

  <!-- Microphone not supported message -->
  {#if !microphoneSupported}
    <div class="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
      <p class="font-medium">Recording not available</p>
      <p class="text-xs mt-1 text-amber-400/80">
        Microphone access is not available in this environment. Please use the <strong>Import</strong> button to upload a pre-recorded audio file.
      </p>
    </div>
  {/if}

  <!-- Microphone permission denied -->
  {#if micPermissionDenied}
    <div class="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
      <p class="font-medium">Microphone access denied</p>
      <p class="text-xs mt-1 text-amber-400/80">
        Click "Try Again" to re-request permission, or use <strong>Import</strong> to upload a pre-recorded file.
      </p>
      <button
        class="mt-2 px-3 py-1 text-xs font-medium rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 transition-colors"
        onclick={retryMicPermission}
      >
        Try Again
      </button>
    </div>
  {/if}

  <!-- Error message -->
  {#if error}
    <div class="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
      {error}
    </div>
  {/if}

  <!-- Waveform display -->
  <div class="relative">
    <div
      bind:this={container}
      class="rounded-lg overflow-hidden bg-[var(--color-bg-elevated)] min-h-[60px]"
    ></div>

    <!-- Recording indicator overlay -->
    {#if isRecording}
      <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div class="flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/50">
          <span class="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
          <span class="text-xs text-red-400 font-medium">Recording...</span>
        </div>
      </div>
    {/if}
  </div>

  <!-- Controls -->
  <div class="flex items-center gap-3">
    {#if isRecording}
      <button
        class="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
        onclick={stopRecording}
      >
        <span class="w-3 h-3 rounded-sm bg-white"></span>
        Stop ({formatTime(recordingTime)})
      </button>
    {:else}
      <button
        class="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-[var(--color-text-secondary)] disabled:hover:border-[var(--color-border-default)]"
        onclick={startRecording}
        disabled={!microphoneSupported}
        title={microphoneSupported ? 'Start recording' : 'Recording not available - use Import instead'}
      >
        <span class="w-3 h-3 rounded-full {microphoneSupported ? 'bg-red-500' : 'bg-gray-500'}"></span>
        Record
      </button>
    {/if}

    <label class="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] transition-colors cursor-pointer">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
      Import
      <input
        type="file"
        accept="audio/*"
        class="hidden"
        onchange={handleFileImport}
      />
    </label>

    {#if hasRecording}
      <button
        class="px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
        onclick={togglePlayback}
      >
        {isPlaying ? 'Pause' : 'Play'}
      </button>
      <button
        class="px-3 py-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-colors"
        onclick={clearRecording}
      >
        Clear
      </button>
    {/if}
  </div>
</div>
