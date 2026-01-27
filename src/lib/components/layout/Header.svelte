<script lang="ts">
  import type { TTSMode } from '$lib/stores/ttsStore.svelte';

  type Status = 'ready' | 'generating' | 'downloading' | 'loading' | 'error';

  interface Props {
    currentMode: TTSMode;
    modelId: string | null;
    status: Status;
    statusDetail?: string;
    onModeChange?: (mode: TTSMode) => void;
    onSettingsClick?: () => void;
    onHelpClick?: () => void;
  }

  let {
    currentMode,
    modelId,
    status,
    statusDetail,
    onModeChange,
    onSettingsClick,
    onHelpClick
  }: Props = $props();

  const modes: { id: TTSMode; label: string }[] = [
    { id: 'custom-voice', label: 'Custom Voice' },
    { id: 'voice-clone', label: 'Voice Clone' },
    { id: 'voice-design', label: 'Voice Design' },
  ];

  const statusConfig: Record<Status, { color: string; label: string }> = {
    ready: { color: 'bg-green-500', label: 'Ready' },
    generating: { color: 'bg-amber-500', label: 'Generating...' },
    downloading: { color: 'bg-blue-500', label: 'Downloading...' },
    loading: { color: 'bg-blue-500', label: 'Loading...' },
    error: { color: 'bg-red-500', label: 'Error' },
  };
</script>

<header class="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
  <!-- Mode Selector -->
  <nav class="flex gap-1 bg-[var(--color-bg-deep)] rounded-lg p-1">
    {#each modes as mode}
      <button
        class="px-4 py-2 rounded-md text-sm font-medium transition-colors
          {currentMode === mode.id
            ? 'bg-[var(--color-accent)] text-white'
            : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]'}"
        onclick={() => onModeChange?.(mode.id)}
      >
        {mode.label}
      </button>
    {/each}
  </nav>

  <!-- Right section -->
  <div class="flex items-center gap-4">
    <!-- Model Indicator -->
    {#if modelId}
      <div class="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
        <span>Model:</span>
        <span class="font-mono text-[var(--color-text-primary)]">{modelId}</span>
      </div>
    {/if}

    <!-- Status Badge -->
    <div class="flex items-center gap-2">
      <span class="w-2 h-2 rounded-full {statusConfig[status].color} {status === 'generating' ? 'animate-pulse' : ''}"></span>
      <span class="text-sm text-[var(--color-text-secondary)]">
        {statusConfig[status].label}
        {#if statusDetail}
          <span class="text-[var(--color-text-muted)]">({statusDetail})</span>
        {/if}
      </span>
    </div>

    <!-- Action Buttons -->
    <div class="flex items-center gap-1">
      <button
        class="p-2 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
        onclick={onHelpClick}
        aria-label="Help"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
      <button
        class="p-2 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
        onclick={onSettingsClick}
        aria-label="Settings"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    </div>
  </div>
</header>
