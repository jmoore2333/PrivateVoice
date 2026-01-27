<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createWaveSurfer } from '$lib/audio/wavesurfer';
  import type WaveSurfer from 'wavesurfer.js';

  interface Props {
    audioUrl?: string;
    height?: number;
    waveColor?: string;
    progressColor?: string;
    onReady?: () => void;
    onPlay?: () => void;
    onPause?: () => void;
    onFinish?: () => void;
  }

  let {
    audioUrl,
    height = 80,
    waveColor = '#4a9eff',
    progressColor = '#2563eb',
    onReady,
    onPlay,
    onPause,
    onFinish,
  }: Props = $props();

  let container: HTMLDivElement;
  let wavesurfer: WaveSurfer | null = null;
  let isPlaying = $state(false);
  let currentTime = $state(0);
  let duration = $state(0);

  onMount(() => {
    wavesurfer = createWaveSurfer({
      container,
      height,
      waveColor,
      progressColor,
    });

    wavesurfer.on('ready', () => {
      duration = wavesurfer!.getDuration();
      onReady?.();
    });

    wavesurfer.on('play', () => {
      isPlaying = true;
      onPlay?.();
    });

    wavesurfer.on('pause', () => {
      isPlaying = false;
      onPause?.();
    });

    wavesurfer.on('finish', () => {
      isPlaying = false;
      onFinish?.();
    });

    wavesurfer.on('timeupdate', (time: number) => {
      currentTime = time;
    });

    if (audioUrl) {
      wavesurfer.load(audioUrl);
    }
  });

  onDestroy(() => {
    wavesurfer?.destroy();
  });

  // React to audioUrl changes
  $effect(() => {
    if (wavesurfer && audioUrl) {
      wavesurfer.load(audioUrl);
    }
  });

  function togglePlay() {
    wavesurfer?.playPause();
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Exported methods for parent components
  export function play() { wavesurfer?.play(); }
  export function pause() { wavesurfer?.pause(); }
  export function stop() { wavesurfer?.stop(); }
</script>

<div class="space-y-3">
  <!-- Waveform container -->
  <div
    bind:this={container}
    class="rounded-lg overflow-hidden bg-[var(--color-bg-elevated)]"
  ></div>

  <!-- Controls -->
  <div class="flex items-center gap-4">
    <button
      class="w-10 h-10 flex items-center justify-center rounded-full bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      onclick={togglePlay}
      disabled={!audioUrl}
      aria-label={isPlaying ? 'Pause' : 'Play'}
    >
      {#if isPlaying}
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
        </svg>
      {:else}
        <svg class="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z"/>
        </svg>
      {/if}
    </button>

    <div class="flex-1 h-1 bg-[var(--color-bg-hover)] rounded-full overflow-hidden">
      <div
        class="h-full bg-[var(--color-accent)] transition-all duration-100"
        style="width: {duration > 0 ? (currentTime / duration) * 100 : 0}%"
      ></div>
    </div>

    <span class="text-sm text-[var(--color-text-secondary)] font-mono min-w-[80px] text-right">
      {formatTime(currentTime)} / {formatTime(duration)}
    </span>
  </div>
</div>
