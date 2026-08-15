<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createWaveSurfer } from '$lib/audio/wavesurfer';
  import type WaveSurfer from 'wavesurfer.js';
  import type { LibraryItem as LibraryItemType } from '$lib/stores/libraryStore.svelte';

  interface Props {
    item: LibraryItemType;
    onPlay?: () => void;
    onEdit?: () => void;
    onExport?: () => void;
    onUse?: () => void;
    onDelete?: () => void;
  }

  let { item, onPlay, onEdit, onExport, onUse, onDelete }: Props = $props();

  let container: HTMLDivElement;
  let wavesurfer: WaveSurfer | null = null;
  let isPlaying = $state(false);
  let showMenu = $state(false);

  const typeLabels: Record<LibraryItemType['type'], string> = {
    audio: 'Audio',
    clone: 'Clone',
    design: 'Design',
  };

  const typeColors: Record<LibraryItemType['type'], string> = {
    audio: 'bg-blue-500/20 text-blue-400',
    clone: 'bg-green-500/20 text-green-400',
    design: 'bg-purple-500/20 text-purple-400',
  };

  onMount(() => {
    wavesurfer = createWaveSurfer({
      container,
      waveColor: '#4a4a4a',
      progressColor: '#4a9eff',
      height: 32,
      barWidth: 2,
      barGap: 1,
    });

    wavesurfer.on('play', () => isPlaying = true);
    wavesurfer.on('pause', () => isPlaying = false);
    wavesurfer.on('finish', () => isPlaying = false);

    if (item.audioUrl) {
      wavesurfer.load(item.audioUrl);
    }
  });

  onDestroy(() => {
    wavesurfer?.destroy();
  });

  function togglePlay() {
    wavesurfer?.playPause();
    onPlay?.();
  }

  function formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  }

  function handleMenuClick() {
    showMenu = !showMenu;
  }

  function handleEdit() {
    onEdit?.();
    showMenu = false;
  }

  function handleExport() {
    onExport?.();
    showMenu = false;
  }

  function handleUse() {
    onUse?.();
    showMenu = false;
  }

  function handleDelete() {
    onDelete?.();
    showMenu = false;
  }
</script>

<div class="group p-3 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] hover:border-[var(--color-border-default)] transition-colors">
  <div class="flex items-center gap-3">
    <!-- Play Button -->
    <button
      class="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors flex-shrink-0"
      onclick={togglePlay}
      aria-label={isPlaying ? 'Pause' : 'Play'}
    >
      {#if isPlaying}
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
        </svg>
      {:else}
        <svg class="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z"/>
        </svg>
      {/if}
    </button>

    <!-- Waveform -->
    <div bind:this={container} class="flex-1 min-w-0"></div>

    <!-- Info -->
    <div class="flex-shrink-0 text-right min-w-[120px]">
      <div class="font-medium text-sm text-[var(--color-text-primary)] truncate">
        {item.name}
      </div>
      <div class="flex items-center justify-end gap-2 mt-1">
        <span class="text-xs px-2 py-0.5 rounded {typeColors[item.type]}">
          {typeLabels[item.type]}
        </span>
        <span class="text-xs text-[var(--color-text-muted)]">
          {formatDate(item.createdAt)}
        </span>
      </div>
    </div>

    <!-- Menu -->
    <div class="relative">
      <button
        class="p-1.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] opacity-0 group-hover:opacity-100 transition-opacity"
        onclick={handleMenuClick}
        aria-label="More options"
      >
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
        </svg>
      </button>

      {#if showMenu}
        <div class="absolute right-0 top-full mt-1 w-40 py-1 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] shadow-lg z-10">
          <button
            class="w-full px-3 py-2 text-left text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
            onclick={handleEdit}
          >
            Edit
          </button>
          <button
            class="w-full px-3 py-2 text-left text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
            onclick={handleExport}
          >
            Export
          </button>
          {#if item.type === 'clone'}
            <button
              class="w-full px-3 py-2 text-left text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
              onclick={handleUse}
            >
              Use in Voice Clone
            </button>
          {/if}
          <hr class="my-1 border-[var(--color-border-subtle)]" />
          <button
            class="w-full px-3 py-2 text-left text-sm text-[var(--color-error)] hover:bg-[var(--color-bg-hover)]"
            onclick={handleDelete}
          >
            Delete
          </button>
        </div>
      {/if}
    </div>
  </div>

  {#if item.comment}
    <p class="mt-2 text-xs text-[var(--color-text-muted)] truncate pl-11">
      {item.comment}
    </p>
  {/if}
</div>
