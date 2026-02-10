<script lang="ts">
  import { MODEL_OPTIONS, modelSupportsMode, getRecommendedModel, type TTSMode } from '$lib/stores/ttsStore.svelte';

  type Status = 'ready' | 'generating' | 'downloading' | 'loading' | 'error';

  interface Props {
    currentMode: TTSMode;
    modelId: string | null;
    status: Status;
    statusDetail?: string;
    isLoadingModel?: boolean;
    onModeChange?: (mode: TTSMode) => void;
    onModelChange?: (modelId: string) => void;
    onSettingsClick?: () => void;
    onHelpClick?: () => void;
  }

  let {
    currentMode,
    modelId,
    status,
    statusDetail,
    isLoadingModel = false,
    onModeChange,
    onModelChange,
    onSettingsClick,
    onHelpClick
  }: Props = $props();

  let showModelMenu = $state(false);
  let modelSwitchPrompt = $state<{ mode: TTSMode; recommendedModel: string; label: string } | null>(null);

  const modes: { id: TTSMode; label: string }[] = [
    { id: 'custom-voice', label: 'Custom Voice' },
    { id: 'voice-clone', label: 'Voice Clone' },
    { id: 'voice-design', label: 'Voice Design' },
  ];

  const models = MODEL_OPTIONS;

  function getModelLabel(id: string | null): string {
    if (!id) return "None";
    const match = models.find((m) => m.id === id);
    return match ? match.label : id;
  }

  const statusConfig: Record<Status, { color: string; label: string }> = {
    ready: { color: 'bg-green-500', label: 'Ready' },
    generating: { color: 'bg-amber-500', label: 'Generating...' },
    downloading: { color: 'bg-blue-500', label: 'Downloading...' },
    loading: { color: 'bg-blue-500', label: 'Loading...' },
    error: { color: 'bg-red-500', label: 'Error' },
  };

  function handleModelSelect(id: string) {
    showModelMenu = false;
    onModelChange?.(id);
  }

  function handleModeClick(mode: TTSMode) {
    if (mode === currentMode) return;

    const compatible = modelSupportsMode(modelId, mode);

    if (compatible || !modelId) {
      // Model supports this mode (or no model loaded yet) — switch directly
      modelSwitchPrompt = null;
      onModeChange?.(mode);
    } else {
      // Incompatible — switch mode but show prompt to load correct model
      onModeChange?.(mode);
      const recommended = getRecommendedModel(mode);
      const label = getModelLabel(recommended);
      modelSwitchPrompt = { mode, recommendedModel: recommended, label };
    }
  }

  function acceptModelSwitch() {
    if (modelSwitchPrompt) {
      onModelChange?.(modelSwitchPrompt.recommendedModel);
      modelSwitchPrompt = null;
    }
  }

  function dismissModelSwitch() {
    modelSwitchPrompt = null;
  }
</script>

<header class="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)] gap-2 min-w-0">
  <!-- Mode Selector -->
  <nav class="flex gap-0.5 bg-[var(--color-bg-deep)] rounded-lg p-0.5 flex-shrink-0">
    {#each modes as mode}
      {@const isCompatible = !modelId || modelSupportsMode(modelId, mode.id)}
      <button
        class="relative px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap
          {currentMode === mode.id
            ? 'bg-[var(--color-accent)] text-white'
            : isCompatible
              ? 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'}"
        onclick={() => handleModeClick(mode.id)}
        title={isCompatible ? mode.label : `${mode.label} — requires a different model`}
      >
        {mode.label}
        {#if !isCompatible && currentMode !== mode.id}
          <span class="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[var(--color-warning)]" title="Requires model switch"></span>
        {/if}
      </button>
    {/each}
  </nav>

  <!-- Right section -->
  <div class="flex items-center gap-2 min-w-0 flex-shrink-0">
    <!-- Model Selector -->
    <div class="relative">
      <button
        class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm
          bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)]
          hover:border-[var(--color-border-strong)] transition-colors
          {isLoadingModel ? 'opacity-50 cursor-wait' : ''}"
        onclick={() => showModelMenu = !showModelMenu}
        disabled={isLoadingModel}
      >
        <span class="text-[var(--color-text-secondary)]">Model:</span>
        <span class="font-mono text-[var(--color-text-primary)]">
            {#if isLoadingModel}
            Loading...
          {:else if modelId}
            {getModelLabel(modelId)}
          {:else}
            None
          {/if}
        </span>
        <svg class="w-4 h-4 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {#if showModelMenu}
        <!-- Backdrop -->
        <button
          class="fixed inset-0 z-40"
          onclick={() => showModelMenu = false}
          aria-label="Close menu"
        ></button>

        <!-- Dropdown Menu -->
        <div class="absolute right-0 top-full mt-1 w-64 py-1 z-50
          bg-[var(--color-bg-surface)] border border-[var(--color-border-default)]
          rounded-lg shadow-xl">
          {#each models as model}
            {@const isCompatible = modelSupportsMode(model.id, currentMode)}
            <button
              class="w-full px-4 py-2 text-left transition-colors
                {modelId === model.id ? 'bg-[var(--color-accent-muted)]' : ''} 
                {isCompatible ? 'hover:bg-[var(--color-bg-hover)]' : 'opacity-40 cursor-not-allowed'}"
              onclick={() => isCompatible && handleModelSelect(model.id)}
              disabled={!isCompatible}
            >
              <div class="flex items-center justify-between">
                <span class="font-medium text-[var(--color-text-primary)]">{model.label}</span>
                {#if modelId === model.id}
                  <svg class="w-4 h-4 text-[var(--color-accent)]" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                  </svg>
                {/if}
              </div>
              <p class="text-xs text-[var(--color-text-muted)]">{model.description}</p>
            </button>
          {/each}
        </div>
      {/if}
    </div>

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

<!-- Model switch prompt -->
{#if modelSwitchPrompt && !isLoadingModel}
  <div class="flex items-center justify-between px-4 py-2 bg-[var(--color-accent)]/10 border-b border-[var(--color-accent)]/30">
    <span class="text-sm text-[var(--color-text-secondary)]">
      This mode requires a different model.
    </span>
    <div class="flex items-center gap-3">
      <button
        class="text-sm font-medium text-[var(--color-accent)] hover:underline"
        onclick={acceptModelSwitch}
      >
        Load {modelSwitchPrompt.label}
      </button>
      <button
        class="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
        onclick={dismissModelSwitch}
      >
        Dismiss
      </button>
    </div>
  </div>
{/if}
