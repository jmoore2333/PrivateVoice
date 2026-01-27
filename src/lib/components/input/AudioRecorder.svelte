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
  let recordingInterval: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    wavesurfer = WaveSurfer.create({
      container,
      waveColor: '#4a9eff',
      progressColor: '#2563eb',
      height: 60,
      barWidth: 2,
      barGap: 1,
    });

    recorder = wavesurfer.registerPlugin(RecordPlugin.create({
      scrollingWaveform: false,
      renderRecordedAudio: true,
    }));

    recorder.on('record-end', (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      recordedUrl = url;
      hasRecording = true;
      onRecordingComplete?.(blob, url);
    });
  });

  onDestroy(() => {
    if (recordingInterval) clearInterval(recordingInterval);
    wavesurfer?.destroy();
  });

  async function startRecording() {
    if (!recorder) return;

    isRecording = true;
    recordingTime = 0;
    hasRecording = false;

    recordingInterval = setInterval(() => {
      recordingTime += 0.1;
    }, 100);

    await recorder.startRecording();
  }

  function stopRecording() {
    if (!recorder) return;

    isRecording = false;
    if (recordingInterval) {
      clearInterval(recordingInterval);
      recordingInterval = null;
    }

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
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
</script>

<div class="space-y-3">
  <label class="block text-sm font-medium text-[var(--color-text-primary)]">
    Reference Audio
  </label>

  <!-- Waveform display -->
  <div
    bind:this={container}
    class="rounded-lg overflow-hidden bg-[var(--color-bg-elevated)] min-h-[60px]"
  ></div>

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
        class="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] transition-colors"
        onclick={startRecording}
      >
        <span class="w-3 h-3 rounded-full bg-red-500"></span>
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
        class="px-3 py-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-colors"
        onclick={clearRecording}
      >
        Clear
      </button>
    {/if}
  </div>
</div>
