<script lang="ts">
  import WaveformPlayer from '$lib/components/audio/WaveformPlayer.svelte';

  interface Suggestion {
    message: string;
    action: () => void;
    actionLabel: string;
  }

  interface Props {
    audioUrl?: string;
    isGenerating?: boolean;
    elapsedTime?: number;
    generatingText?: string;
    onRegenerate?: () => void;
    onSave?: () => void;
    onExport?: () => void;
    suggestion?: Suggestion | null;
  }

  let {
    audioUrl,
    isGenerating = false,
    elapsedTime = 0,
    generatingText,
    onRegenerate,
    onSave,
    onExport,
    suggestion,
  }: Props = $props();

  let showSuggestion = $state(true);

  function dismissSuggestion() {
    showSuggestion = false;
  }

  // Reset suggestion visibility when suggestion changes
  $effect(() => {
    if (suggestion) {
      showSuggestion = true;
    }
  });
</script>

<div class="h-full flex flex-col">
  {#if isGenerating}
    <!-- Generating State -->
    <div class="flex-1 flex flex-col items-center justify-center text-center">
      <div class="w-12 h-12 border-4 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin mb-4"></div>
      <p class="text-lg text-[var(--color-text-primary)] mb-2">Generating...</p>
      <p class="text-2xl font-mono text-[var(--color-accent)]">{elapsedTime.toFixed(1)}s</p>
      {#if generatingText}
        <p class="mt-4 text-sm text-[var(--color-text-muted)] max-w-md truncate px-4">
          "{generatingText}"
        </p>
      {/if}
    </div>

  {:else if audioUrl}
    <!-- Playback State -->
    <div class="flex-1 flex flex-col">
      <div class="flex-1 flex items-center">
        <div class="w-full">
          <WaveformPlayer {audioUrl} height={120} />
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex gap-3 mt-6">
        <button
          class="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] transition-colors"
          onclick={onRegenerate}
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Regenerate
        </button>

        <button
          class="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] transition-colors"
          onclick={onSave}
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg>
          Save
        </button>

        <button
          class="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors"
          onclick={onExport}
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Export
        </button>
      </div>

      <!-- Contextual Suggestion -->
      {#if suggestion && showSuggestion}
        <div class="mt-4 p-3 rounded-lg bg-[var(--color-accent-muted)] border border-[var(--color-accent)]/30 flex items-center justify-between">
          <span class="text-sm text-[var(--color-text-primary)]">
            {suggestion.message}
          </span>
          <div class="flex gap-2">
            <button
              class="text-sm text-[var(--color-accent)] hover:underline"
              onclick={suggestion.action}
            >
              {suggestion.actionLabel}
            </button>
            <button
              class="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              onclick={dismissSuggestion}
            >
              Dismiss
            </button>
          </div>
        </div>
      {/if}
    </div>

  {:else}
    <!-- Empty State -->
    <div class="flex-1 flex flex-col items-center justify-center text-center">
      <div class="w-24 h-16 rounded-lg bg-[var(--color-bg-elevated)] mb-4 flex items-center justify-center">
        <svg class="w-8 h-8 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      </div>
      <p class="text-[var(--color-text-muted)]">Generate audio to preview</p>
    </div>
  {/if}
</div>
