<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import WaveSurfer from 'wavesurfer.js';
  import RecordPlugin from 'wavesurfer.js/dist/plugins/record.esm.js';

  interface Props {
    onRecordingComplete?: (blob: Blob, url: string) => void;
    onImport?: (file: File) => void;
  }

  let { onRecordingComplete, onImport }: Props = $props();

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
      // Create RecordPlugin
      // Note: scrollingWaveform shows live visualization during recording
      recorder = wavesurfer.registerPlugin(RecordPlugin.create({
        mimeType: 'audio/webm',
        scrollingWaveform: true,
        renderRecordedAudio: true,
      }));

      recorder.on('record-start', () => {
        console.log('[AudioRecorder] Recording started');
      });

      recorder.on('record-progress', (time: number) => {
        // Update recording time from plugin
        recordingTime = time / 1000; // Convert ms to seconds
      });

      recorder.on('record-end', (blob: Blob) => {
        console.log('[AudioRecorder] Recording ended, blob size:', blob.size);
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
  });

  function retryMicPermission() {
    micPermissionDenied = false;
    error = null;
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
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError' || err.message.includes('Permission')) {
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
    isRecording = false;
    recorder.stopRecording();
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
