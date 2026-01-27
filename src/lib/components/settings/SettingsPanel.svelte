<script lang="ts">
  import { settingsStore, type Settings } from "$lib/stores/settingsStore.svelte";
  import StudioButton from "$lib/components/ui/StudioButton.svelte";
  import StudioSelect from "$lib/components/ui/StudioSelect.svelte";
  import { PRESET_SPEAKERS } from "$lib/api/ttsClient";

  const MODELS = [
    { value: "0.6b", label: "0.6B", description: "Fast" },
    { value: "1.7b", label: "1.7B", description: "Quality" },
    { value: "1.7b-design", label: "1.7B Design", description: "Voice Design" },
  ];

  const THEMES = [
    { value: "dark", label: "Dark" },
    { value: "light", label: "Light" },
    { value: "system", label: "System" },
  ];

  const SPEAKERS = PRESET_SPEAKERS.map((s) => ({ value: s, label: s }));

  function handleChange<K extends keyof Settings>(key: K) {
    return (value: string) => {
      settingsStore.updateSetting(key, value as Settings[K]);
    };
  }

  function handleToggle(key: keyof Settings) {
    return () => {
      const current = settingsStore.state[key] as boolean;
      settingsStore.updateSetting(key, !current);
    };
  }
</script>

{#if settingsStore.isOpen}
  <!-- Backdrop -->
  <button
    class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
    onclick={() => settingsStore.close()}
    aria-label="Close settings"
  ></button>

  <!-- Panel -->
  <div
    class="fixed inset-y-0 right-0 w-full max-w-md z-50
      bg-[var(--color-bg-surface)] border-l border-[var(--color-border-default)]
      shadow-2xl animate-slide-left overflow-y-auto"
  >
    <!-- Header -->
    <div class="sticky top-0 flex items-center justify-between p-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
      <h2 class="text-lg font-semibold text-[var(--color-text-primary)]">Settings</h2>
      <button
        onclick={() => settingsStore.close()}
        class="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
        aria-label="Close settings"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Content -->
    <div class="p-4 space-y-6">
      <!-- Appearance Section -->
      <section>
        <h3 class="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
          Appearance
        </h3>
        <div class="space-y-4">
          <StudioSelect
            value={settingsStore.state.theme}
            options={THEMES}
            label="Theme"
            onchange={handleChange("theme")}
          />
        </div>
      </section>

      <!-- Defaults Section -->
      <section>
        <h3 class="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
          Defaults
        </h3>
        <div class="space-y-4">
          <StudioSelect
            value={settingsStore.state.defaultModel}
            options={MODELS}
            label="Default Model"
            onchange={handleChange("defaultModel")}
          />

          <StudioSelect
            value={settingsStore.state.defaultSpeaker}
            options={SPEAKERS}
            label="Default Speaker"
            onchange={handleChange("defaultSpeaker")}
          />
        </div>
      </section>

      <!-- Behavior Section -->
      <section>
        <h3 class="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
          Behavior
        </h3>
        <div class="space-y-3">
          <!-- Toggle: Auto-load model -->
          <label class="flex items-center justify-between p-3 rounded-lg bg-[var(--color-bg-elevated)] cursor-pointer hover:bg-[var(--color-bg-hover)] transition-colors">
            <div>
              <span class="text-sm font-medium text-[var(--color-text-primary)]">Auto-load model</span>
              <p class="text-xs text-[var(--color-text-muted)]">Load default model on startup</p>
            </div>
            <button
              onclick={handleToggle("autoLoadModel")}
              class="relative w-11 h-6 rounded-full transition-colors
                {settingsStore.state.autoLoadModel ? 'bg-[var(--color-accent-cyan)]' : 'bg-[var(--color-bg-hover)]'}"
              role="switch"
              aria-checked={settingsStore.state.autoLoadModel}
              aria-label="Toggle auto-load model"
            >
              <span
                class="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform
                  {settingsStore.state.autoLoadModel ? 'translate-x-5' : ''}"
              ></span>
            </button>
          </label>

          <!-- Toggle: Show waveform -->
          <label class="flex items-center justify-between p-3 rounded-lg bg-[var(--color-bg-elevated)] cursor-pointer hover:bg-[var(--color-bg-hover)] transition-colors">
            <div>
              <span class="text-sm font-medium text-[var(--color-text-primary)]">Show waveform</span>
              <p class="text-xs text-[var(--color-text-muted)]">Display waveform in audio player</p>
            </div>
            <button
              onclick={handleToggle("showWaveform")}
              class="relative w-11 h-6 rounded-full transition-colors
                {settingsStore.state.showWaveform ? 'bg-[var(--color-accent-cyan)]' : 'bg-[var(--color-bg-hover)]'}"
              role="switch"
              aria-checked={settingsStore.state.showWaveform}
              aria-label="Toggle show waveform"
            >
              <span
                class="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform
                  {settingsStore.state.showWaveform ? 'translate-x-5' : ''}"
              ></span>
            </button>
          </label>

          <!-- Toggle: Show debug on startup -->
          <label class="flex items-center justify-between p-3 rounded-lg bg-[var(--color-bg-elevated)] cursor-pointer hover:bg-[var(--color-bg-hover)] transition-colors">
            <div>
              <span class="text-sm font-medium text-[var(--color-text-primary)]">Debug on startup</span>
              <p class="text-xs text-[var(--color-text-muted)]">Open debug console when app starts</p>
            </div>
            <button
              onclick={handleToggle("showDebugOnStartup")}
              class="relative w-11 h-6 rounded-full transition-colors
                {settingsStore.state.showDebugOnStartup ? 'bg-[var(--color-accent-cyan)]' : 'bg-[var(--color-bg-hover)]'}"
              role="switch"
              aria-checked={settingsStore.state.showDebugOnStartup}
              aria-label="Toggle debug on startup"
            >
              <span
                class="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform
                  {settingsStore.state.showDebugOnStartup ? 'translate-x-5' : ''}"
              ></span>
            </button>
          </label>
        </div>
      </section>

      <!-- Reset Section -->
      <section>
        <h3 class="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
          Danger Zone
        </h3>
        <StudioButton
          variant="secondary"
          onclick={() => settingsStore.resetToDefaults()}
          class="w-full"
        >
          Reset to Defaults
        </StudioButton>
      </section>
    </div>

    <!-- Footer -->
    <div class="sticky bottom-0 p-4 border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
      <p class="text-xs text-[var(--color-text-muted)] text-center">
        Qwen3-TTS Desktop v0.1.0
      </p>
    </div>
  </div>
{/if}

<style>
  @keyframes slide-left {
    from {
      transform: translateX(100%);
    }
    to {
      transform: translateX(0);
    }
  }

  .animate-slide-left {
    animation: slide-left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
</style>
