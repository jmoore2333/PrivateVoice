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

  const EXPORT_FORMATS = [
    { value: "wav", label: "WAV", description: "Lossless" },
    // MP3 export requires backend encoding support (coming soon)
    // { value: "mp3", label: "MP3", description: "Compressed" },
  ];

  const CACHE_SIZES = [
    { value: "5", label: "5 items" },
    { value: "10", label: "10 items" },
    { value: "15", label: "15 items" },
    { value: "20", label: "20 items" },
  ];

  // Format speaker name for display
  function formatSpeakerName(name: string): string {
    return name
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  const SPEAKERS = PRESET_SPEAKERS.map((s) => ({ value: s, label: formatSpeakerName(s) }));

  function handleChange<K extends keyof Settings>(key: K) {
    return (value: string) => {
      settingsStore.updateSetting(key, value as Settings[K]);
    };
  }

  function handleNumberChange<K extends keyof Settings>(key: K) {
    return (value: string) => {
      settingsStore.updateSetting(key, parseInt(value, 10) as Settings[K]);
    };
  }

  function handleToggle(key: keyof Settings) {
    return () => {
      const current = settingsStore.state[key] as boolean;
      settingsStore.updateSetting(key, !current);
    };
  }

  // Static system info (can be enhanced later with actual detection)
  const systemInfo = {
    device: "MPS (Apple Silicon)",
    memory: "16 GB",
    isCPU: false,
  };
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

      <!-- Audio Section -->
      <section>
        <h3 class="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
          Audio
        </h3>
        <div class="space-y-4">
          <!-- Export folder (read-only) -->
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
              Export Folder
            </label>
            <div class="p-3 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)]">
              <span class="text-sm text-[var(--color-text-muted)] font-mono">
                {settingsStore.state.exportFolder}
              </span>
            </div>
          </div>

          <StudioSelect
            value={settingsStore.state.exportFormat}
            options={EXPORT_FORMATS}
            label="Default Format"
            onchange={handleChange("exportFormat")}
          />
        </div>
      </section>

      <!-- Library Section -->
      <section>
        <h3 class="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
          Library
        </h3>
        <div class="space-y-4">
          <StudioSelect
            value={settingsStore.state.recentCacheSize.toString()}
            options={CACHE_SIZES}
            label="Recent Cache Size"
            onchange={handleNumberChange("recentCacheSize")}
          />
        </div>
      </section>

      <!-- System Section -->
      <section>
        <h3 class="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
          System
        </h3>
        <div class="space-y-3">
          <div class="p-3 rounded-lg bg-[var(--color-bg-elevated)]">
            <div class="flex justify-between items-center">
              <span class="text-sm text-[var(--color-text-secondary)]">GPU</span>
              <span class="text-sm font-medium text-[var(--color-text-primary)]">{systemInfo.device}</span>
            </div>
          </div>
          <div class="p-3 rounded-lg bg-[var(--color-bg-elevated)]">
            <div class="flex justify-between items-center">
              <span class="text-sm text-[var(--color-text-secondary)]">Memory</span>
              <span class="text-sm font-medium text-[var(--color-text-primary)]">{systemInfo.memory}</span>
            </div>
          </div>
          {#if systemInfo.isCPU}
            <div class="p-3 rounded-lg bg-[var(--color-warning-bg)] border border-[var(--color-warning-border)]">
              <div class="flex items-center gap-2">
                <svg class="w-4 h-4 text-[var(--color-warning)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span class="text-sm text-[var(--color-warning)]">Running in CPU mode - generation will be slower</span>
              </div>
            </div>
          {/if}
        </div>
      </section>

      <!-- Optional Features Section -->
      <section>
        <h3 class="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
          Optional Features
        </h3>
        <div class="space-y-3">
          <!-- Toggle: Whisper transcription -->
          <label class="flex items-center justify-between p-3 rounded-lg bg-[var(--color-bg-elevated)] cursor-pointer hover:bg-[var(--color-bg-hover)] transition-colors">
            <div>
              <span class="text-sm font-medium text-[var(--color-text-primary)]">Auto-transcription</span>
              <p class="text-xs text-[var(--color-text-muted)]">Use Whisper for automatic transcription</p>
            </div>
            <button
              onclick={handleToggle("enableWhisper")}
              class="relative w-11 h-6 rounded-full transition-colors
                {settingsStore.state.enableWhisper ? 'bg-[var(--color-accent-cyan)]' : 'bg-[var(--color-bg-hover)]'}"
              role="switch"
              aria-checked={settingsStore.state.enableWhisper}
              aria-label="Toggle auto-transcription"
            >
              <span
                class="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform
                  {settingsStore.state.enableWhisper ? 'translate-x-5' : ''}"
              ></span>
            </button>
          </label>

          <!-- Toggle: Translation support -->
          <label class="flex items-center justify-between p-3 rounded-lg bg-[var(--color-bg-elevated)] cursor-pointer hover:bg-[var(--color-bg-hover)] transition-colors">
            <div>
              <span class="text-sm font-medium text-[var(--color-text-primary)]">Translation support</span>
              <p class="text-xs text-[var(--color-text-muted)]">Enable translation features</p>
            </div>
            <button
              onclick={handleToggle("enableTranslation")}
              class="relative w-11 h-6 rounded-full transition-colors
                {settingsStore.state.enableTranslation ? 'bg-[var(--color-accent-cyan)]' : 'bg-[var(--color-bg-hover)]'}"
              role="switch"
              aria-checked={settingsStore.state.enableTranslation}
              aria-label="Toggle translation support"
            >
              <span
                class="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform
                  {settingsStore.state.enableTranslation ? 'translate-x-5' : ''}"
              ></span>
            </button>
          </label>
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

      <!-- Advanced Section -->
      <section>
        <h3 class="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
          Advanced
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

          <!-- Toggle: Show debug on startup -->
          <label class="flex items-center justify-between p-3 rounded-lg bg-[var(--color-bg-elevated)] cursor-pointer hover:bg-[var(--color-bg-hover)] transition-colors">
            <div>
              <span class="text-sm font-medium text-[var(--color-text-primary)]">Debug console on startup</span>
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

          <!-- Model cache location (read-only) -->
          <div class="flex flex-col gap-1.5">
            <label class="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
              Model Cache Location
            </label>
            <div class="p-3 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)]">
              <span class="text-sm text-[var(--color-text-muted)] font-mono">
                ~/.cache/huggingface/hub
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- About Section -->
      <section>
        <h3 class="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
          About
        </h3>
        <div class="space-y-3">
          <div class="p-3 rounded-lg bg-[var(--color-bg-elevated)]">
            <div class="flex justify-between items-center mb-2">
              <span class="text-sm font-medium text-[var(--color-text-primary)]">PrivateVoice</span>
              <span class="text-sm text-[var(--color-text-muted)]">v0.1.0</span>
            </div>
            <div class="flex flex-wrap gap-2">
              <a href="https://github.com/jmoore2333/PrivateVoice" target="_blank"
                 class="text-sm text-[var(--color-accent)] hover:underline">GitHub</a>
              <span class="text-[var(--color-text-muted)]">•</span>
              <a href="https://github.com/jmoore2333/PrivateVoice/issues" target="_blank"
                 class="text-sm text-[var(--color-accent)] hover:underline">Report Issue</a>
            </div>
          </div>
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
        PrivateVoice v0.1.0
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
