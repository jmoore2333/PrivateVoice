<script lang="ts">
  import { settingsStore } from '$lib/stores/settingsStore.svelte';

  interface Props {
    onComplete: (selectedModel: string) => void;
  }

  let { onComplete }: Props = $props();

  let selectedModel = $state('0.6b');

  const models = [
    {
      id: '0.6b',
      name: '0.6B',
      size: '~1.2 GB',
      description: 'Fast generation, great for getting started',
      recommended: true
    },
    {
      id: '1.7b',
      name: '1.7B',
      size: '~3.4 GB',
      description: 'Higher quality, slower generation'
    },
    {
      id: '1.7b-design',
      name: '1.7B Design',
      size: '~3.4 GB',
      description: 'Required for Voice Design mode'
    },
  ];

  function handleGetStarted() {
    // Save the selected model as the user's default for future launches
    settingsStore.updateSetting('defaultModel', selectedModel);
    // Enable auto-load so the model loads automatically on next launch
    settingsStore.updateSetting('autoLoadModel', true);
    settingsStore.updateSetting('hasCompletedOnboarding', true);
    onComplete(selectedModel);
  }
</script>

<div class="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
  <div class="w-full max-w-lg bg-[var(--color-bg-surface)] rounded-2xl shadow-2xl overflow-hidden">
    <!-- Header -->
    <div class="p-8 text-center border-b border-[var(--color-border-subtle)]">
      <h1 class="text-3xl font-bold text-[var(--color-text-primary)] mb-2">
        Welcome to PrivateVoice
      </h1>
      <p class="text-[var(--color-text-secondary)]">
        Your voices, your machine, forever free.
      </p>
    </div>

    <!-- Content -->
    <div class="p-6 space-y-6">
      <!-- Three Modes -->
      <div>
        <h2 class="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
          Three Ways to Create
        </h2>
        <div class="grid grid-cols-3 gap-3">
          <div class="p-3 rounded-lg bg-[var(--color-bg-elevated)] text-center">
            <div class="text-2xl mb-1">🎙️</div>
            <div class="text-sm font-medium text-[var(--color-text-primary)]">Custom Voice</div>
            <div class="text-xs text-[var(--color-text-muted)]">Preset speakers</div>
          </div>
          <div class="p-3 rounded-lg bg-[var(--color-bg-elevated)] text-center">
            <div class="text-2xl mb-1">🎭</div>
            <div class="text-sm font-medium text-[var(--color-text-primary)]">Voice Clone</div>
            <div class="text-xs text-[var(--color-text-muted)]">From audio sample</div>
          </div>
          <div class="p-3 rounded-lg bg-[var(--color-bg-elevated)] text-center">
            <div class="text-2xl mb-1">✨</div>
            <div class="text-sm font-medium text-[var(--color-text-primary)]">Voice Design</div>
            <div class="text-xs text-[var(--color-text-muted)]">From description</div>
          </div>
        </div>
      </div>

      <!-- Model Selection -->
      <div>
        <h2 class="text-sm font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
          Choose Your First Model
        </h2>
        <div class="space-y-2">
          {#each models as model}
            <button
              class="w-full p-4 rounded-lg text-left border-2 transition-colors
                {selectedModel === model.id
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)]'
                  : 'border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] hover:border-[var(--color-border-default)]'}"
              onclick={() => selectedModel = model.id}
            >
              <div class="flex items-center justify-between">
                <div>
                  <span class="font-medium text-[var(--color-text-primary)]">{model.name}</span>
                  {#if model.recommended}
                    <span class="ml-2 text-xs px-2 py-0.5 rounded bg-[var(--color-accent)] text-white">
                      Recommended
                    </span>
                  {/if}
                </div>
                <span class="text-sm text-[var(--color-text-muted)]">{model.size}</span>
              </div>
              <p class="text-sm text-[var(--color-text-secondary)] mt-1">{model.description}</p>
            </button>
          {/each}
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="p-6 border-t border-[var(--color-border-subtle)]">
      <button
        onclick={handleGetStarted}
        class="w-full py-3 rounded-lg bg-[var(--color-accent)] text-white font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
      >
        Get Started
      </button>
      <p class="text-xs text-[var(--color-text-muted)] text-center mt-3">
        The model will begin downloading when you click Get Started.
      </p>
    </div>
  </div>
</div>
