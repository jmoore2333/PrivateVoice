<script lang="ts">
  import { onDestroy } from "svelte";
  import StudioButton from "$lib/components/ui/StudioButton.svelte";

  interface Props {
    audioUrl: string | null;
    onDownload?: () => void;
  }

  let { audioUrl, onDownload }: Props = $props();

  let waveformContainer: HTMLDivElement | undefined = $state(undefined);
  let wavesurfer: any = $state(null);
  let isPlaying = $state(false);
  let currentTime = $state(0);
  let duration = $state(0);
  let volume = $state(1);
  let isReady = $state(false);
  let usesFallback = $state(false);
  let audioElement: HTMLAudioElement | undefined = $state(undefined);

  // Initialize audio player (using fallback HTML5 audio for now)
  // WaveSurfer.js can be added later via npm install wavesurfer.js
  function initPlayer() {
    if (!waveformContainer || !audioUrl) return;

    // For now, use the fallback player
    // WaveSurfer integration is prepared but requires npm install wavesurfer.js
    usesFallback = true;
    isReady = true;
  }

  // Fallback audio handlers
  function handleFallbackTimeUpdate() {
    if (audioElement) {
      currentTime = audioElement.currentTime;
    }
  }

  function handleFallbackLoadedMetadata() {
    if (audioElement) {
      duration = audioElement.duration;
    }
  }

  // Watch for audioUrl changes
  $effect(() => {
    if (audioUrl && waveformContainer) {
      isReady = false;
      usesFallback = false;
      initPlayer();
    }
  });

  onDestroy(() => {
    if (wavesurfer) {
      wavesurfer.destroy();
    }
  });

  function togglePlay() {
    if (usesFallback && audioElement) {
      if (isPlaying) {
        audioElement.pause();
      } else {
        audioElement.play();
      }
      isPlaying = !isPlaying;
    } else if (wavesurfer) {
      wavesurfer.playPause();
    }
  }

  function handleSeek(e: Event) {
    const target = e.target as HTMLInputElement;
    const seekTime = parseFloat(target.value);
    if (usesFallback && audioElement) {
      audioElement.currentTime = seekTime;
    } else if (wavesurfer) {
      wavesurfer.seekTo(seekTime / duration);
    }
    currentTime = seekTime;
  }

  function handleVolumeChange(e: Event) {
    const target = e.target as HTMLInputElement;
    volume = parseFloat(target.value);
    if (usesFallback && audioElement) {
      audioElement.volume = volume;
    } else if (wavesurfer) {
      wavesurfer.setVolume(volume);
    }
  }

  function toggleMute() {
    const newVolume = volume > 0 ? 0 : 1;
    volume = newVolume;
    if (usesFallback && audioElement) {
      audioElement.volume = newVolume;
    } else if (wavesurfer) {
      wavesurfer.setVolume(newVolume);
    }
  }

  function formatTime(seconds: number): string {
    if (!isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  const progress = $derived(duration > 0 ? (currentTime / duration) * 100 : 0);
</script>

{#if audioUrl}
  <div class="rounded-xl bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] p-4 animate-slide-up">
    <!-- Hidden fallback audio element -->
    {#if usesFallback}
      <audio
        bind:this={audioElement}
        src={audioUrl}
        onplay={() => (isPlaying = true)}
        onpause={() => (isPlaying = false)}
        onended={() => (isPlaying = false)}
        ontimeupdate={handleFallbackTimeUpdate}
        onloadedmetadata={handleFallbackLoadedMetadata}
      ></audio>
    {/if}

    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <div class="led led-cyan {isPlaying ? 'animate-pulse-soft' : ''}"></div>
        <span class="text-sm font-medium text-[var(--color-text-primary)]">Generated Audio</span>
      </div>
      <StudioButton variant="ghost" size="sm" onclick={onDownload}>
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Download
      </StudioButton>
    </div>

    <!-- Waveform container -->
    <div
      bind:this={waveformContainer}
      class="h-16 mb-4 rounded-lg bg-[var(--color-bg-elevated)] overflow-hidden"
    >
      {#if !isReady}
        <!-- Loading state -->
        <div class="h-full flex items-center justify-center">
          <div class="flex items-center gap-1">
            {#each [0, 1, 2, 3, 4] as i}
              <div
                class="w-1 bg-[var(--color-accent-cyan)] rounded-full animate-pulse-soft"
                style="height: {20 + Math.random() * 20}px; animation-delay: {i * 0.1}s;"
              ></div>
            {/each}
          </div>
        </div>
      {:else if usesFallback}
        <!-- Fallback visualization - simple progress bar -->
        <div class="h-full flex items-center px-4">
          <div class="w-full h-2 bg-[var(--color-border-default)] rounded-full overflow-hidden">
            <div
              class="h-full bg-[var(--color-accent-cyan)] rounded-full transition-all"
              style="width: {progress}%;"
            ></div>
          </div>
        </div>
      {/if}
    </div>

    <!-- Controls -->
    <div class="flex items-center gap-4">
      <!-- Play/Pause -->
      <button
        onclick={togglePlay}
        disabled={!isReady}
        class="w-10 h-10 flex items-center justify-center rounded-full
          bg-[var(--color-accent-cyan)] text-[var(--color-bg-deep)]
          hover:brightness-110 hover:shadow-[0_0_15px_rgba(0,212,255,0.4)]
          disabled:opacity-50 disabled:cursor-not-allowed
          transition-all duration-200 active:scale-95"
      >
        {#if isPlaying}
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
          </svg>
        {:else}
          <svg class="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        {/if}
      </button>

      <!-- Time / Seek -->
      <div class="flex-1 flex items-center gap-3">
        <span class="text-xs font-mono text-[var(--color-text-muted)] w-10">
          {formatTime(currentTime)}
        </span>
        <input
          type="range"
          min="0"
          max={duration || 0}
          step="0.1"
          value={currentTime}
          oninput={handleSeek}
          disabled={!isReady}
          class="flex-1 h-1 rounded-full appearance-none cursor-pointer
            bg-[var(--color-border-default)]
            disabled:opacity-50 disabled:cursor-not-allowed
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-3
            [&::-webkit-slider-thumb]:h-3
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-[var(--color-accent-cyan)]
            [&::-webkit-slider-thumb]:shadow-[0_0_6px_var(--color-accent-cyan)]
            [&::-webkit-slider-thumb]:cursor-pointer"
        />
        <span class="text-xs font-mono text-[var(--color-text-muted)] w-10">
          {formatTime(duration)}
        </span>
      </div>

      <!-- Volume -->
      <div class="flex items-center gap-2">
        <button
          onclick={toggleMute}
          class="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          {#if volume === 0}
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          {:else}
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
          {/if}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={volume}
          oninput={handleVolumeChange}
          class="w-20 h-1 rounded-full appearance-none cursor-pointer
            bg-[var(--color-border-default)]
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-2.5
            [&::-webkit-slider-thumb]:h-2.5
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-[var(--color-text-secondary)]
            [&::-webkit-slider-thumb]:cursor-pointer"
        />
      </div>
    </div>
  </div>
{/if}
