<script lang="ts">
  import { settingsStore, type Settings } from "$lib/stores/settingsStore.svelte";
  import StudioButton from "$lib/components/ui/StudioButton.svelte";
  import StudioSelect from "$lib/components/ui/StudioSelect.svelte";
  import Spinner from "$lib/components/ui/Spinner.svelte";
  import { PRESET_SPEAKERS, ttsClient, type WhisperStatus, type WhisperModelInfo } from "$lib/api/ttsClient";
  import { MODEL_OPTIONS } from "$lib/stores/ttsStore.svelte";
  import { debugStore } from "$lib/stores/debugStore.svelte";

  // Whisper state
  let whisperStatus = $state<WhisperStatus | null>(null);
  let whisperModels = $state<WhisperModelInfo[]>([]);
  let selectedWhisperModel = $state("base");
  let isLoadingWhisper = $state(false);
  let whisperError = $state<string | null>(null);

  const whisperModelOptions = $derived(
    whisperModels.map((m) => ({
      value: m.size,
      label: `${m.size} (${m.download_size_mb >= 1000 ? `${(m.download_size_mb / 1000).toFixed(1)} GB` : `${m.download_size_mb} MB`})`,
      description: m.parameters,
    }))
  );

  async function fetchWhisperState() {
    try {
      whisperError = null;
      const [status, models] = await Promise.all([
        ttsClient.whisperStatus(),
        ttsClient.whisperModels(),
      ]);
      whisperStatus = status;
      whisperModels = models;
      if (status.loaded && status.model_size) {
        selectedWhisperModel = status.model_size;
      }
    } catch (e) {
      whisperError = e instanceof Error ? e.message : "Failed to fetch Whisper status";
    }
  }

  async function handleLoadWhisper() {
    isLoadingWhisper = true;
    whisperError = null;
    try {
      await ttsClient.loadWhisper(selectedWhisperModel);
      whisperStatus = await ttsClient.whisperStatus();
    } catch (e) {
      whisperError = e instanceof Error ? e.message : "Failed to load Whisper model";
    } finally {
      isLoadingWhisper = false;
    }
  }

  async function handleUnloadWhisper() {
    isLoadingWhisper = true;
    whisperError = null;
    try {
      await ttsClient.unloadWhisper();
      whisperStatus = await ttsClient.whisperStatus();
    } catch (e) {
      whisperError = e instanceof Error ? e.message : "Failed to unload Whisper model";
    } finally {
      isLoadingWhisper = false;
    }
  }

  function handleWhisperToggle() {
    const enabling = !settingsStore.state.enableWhisper;
    settingsStore.updateSetting("enableWhisper", enabling);
    if (enabling) {
      fetchWhisperState();
    }
  }

  // Fetch whisper state when panel opens if enabled
  $effect(() => {
    if (settingsStore.isOpen && settingsStore.state.enableWhisper) {
      fetchWhisperState();
    }
  });

  const MODELS = MODEL_OPTIONS.map((model) => ({
    value: model.id,
    label: model.label,
    description: model.description,
  }));

  const THEMES = [
    { value: "dark", label: "Dark" },
    { value: "light", label: "Light" },
    { value: "system", label: "System" },
  ];

  const EXPORT_FORMATS = [
    { value: "wav", label: "WAV", description: "Lossless" },
    { value: "mp3", label: "MP3", description: "Compressed (192kbps)" },
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

  const deviceLabel = $derived(debugStore.state.systemInfo?.device_name ?? "Detecting...");
  const memoryLabel = $derived(
    debugStore.state.systemInfo
      ? `${debugStore.state.systemInfo.memory_total_gb.toFixed(1)} GB`
      : "Detecting..."
  );
  const isCPU = $derived(debugStore.state.systemInfo?.device === "cpu");
  const cacheDir = $derived(debugStore.state.systemInfo?.cache_dir ?? "~/.cache/huggingface/hub");

  // Environment status (deferred installer)
  interface EnvironmentStatus {
    setup_complete: boolean;
    gpu_target: string | null;
    gpu_display: string | null;
    python_path: string | null;
    venv_path: string | null;
    disk_usage_mb: number | null;
    uv_version: string | null;
    uv_needs_update: boolean;
    state: string;
    state_detail: string | null;
  }

  let envStatus = $state<EnvironmentStatus | null>(null);
  let isRepairingEnv = $state(false);
  let envRepairMessage = $state<string | null>(null);

  async function fetchEnvironmentStatus() {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<EnvironmentStatus>("get_environment_status");
      envStatus = result;
    } catch {
      // Not in Tauri or command not available
    }
  }

  async function handleRepairEnvironment(deleteVenv: boolean) {
    isRepairingEnv = true;
    envRepairMessage = null;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const message = await invoke<string>("repair_environment", { deleteVenv });
      envRepairMessage = message;
      await fetchEnvironmentStatus();
    } catch (e) {
      envRepairMessage = e instanceof Error ? e.message : "Failed to repair environment";
    } finally {
      isRepairingEnv = false;
    }
  }

  function formatDiskUsage(mb: number | null): string {
    if (mb === null) return "Unknown";
    if (mb >= 1000) return `${(mb / 1000).toFixed(1)} GB`;
    return `${Math.round(mb)} MB`;
  }

  // Fetch environment status when settings opens
  $effect(() => {
    if (settingsStore.isOpen && !envStatus) {
      fetchEnvironmentStatus();
    }
  });

  async function browseExportFolder() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, title: "Choose Export Folder" });
      if (selected) {
        settingsStore.updateSetting("exportFolder", selected as string);
      }
    } catch {
      // Not in Tauri — ignore
    }
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

      <!-- Audio Section -->
      <section>
        <h3 class="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
          Audio
        </h3>
        <div class="space-y-4">
          <!-- Export folder with Browse -->
          <div class="flex flex-col gap-1.5">
            <div class="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
              Export Folder
            </div>
            <div class="flex items-center gap-2">
              <div class="flex-1 p-3 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] min-w-0">
                <span class="text-sm text-[var(--color-text-muted)] font-mono truncate block">
                  {settingsStore.state.exportFolder}
                </span>
              </div>
              <button
                onclick={browseExportFolder}
                class="shrink-0 px-3 py-3 rounded-lg text-sm font-medium
                  bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)]
                  text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]
                  hover:bg-[var(--color-bg-hover)] transition-colors"
                aria-label="Browse for export folder"
              >
                Browse
              </button>
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
              <span class="text-sm font-medium text-[var(--color-text-primary)]">{deviceLabel}</span>
            </div>
          </div>
          <div class="p-3 rounded-lg bg-[var(--color-bg-elevated)]">
            <div class="flex justify-between items-center">
              <span class="text-sm text-[var(--color-text-secondary)]">Memory</span>
              <span class="text-sm font-medium text-[var(--color-text-primary)]">{memoryLabel}</span>
            </div>
          </div>
          {#if isCPU}
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
          <!-- Whisper auto-transcription toggle -->
          <div class="rounded-lg bg-[var(--color-bg-elevated)] overflow-hidden">
            <label class="flex items-center justify-between p-3 cursor-pointer hover:bg-[var(--color-bg-hover)] transition-colors">
              <div>
                <span class="text-sm font-medium text-[var(--color-text-primary)]">Auto-transcription</span>
                <p class="text-xs text-[var(--color-text-muted)]">Whisper-powered transcription for Voice Clone</p>
              </div>
              <button
                onclick={handleWhisperToggle}
                class="relative w-11 h-6 rounded-full transition-colors
                  {settingsStore.state.enableWhisper ? 'bg-[var(--color-accent-cyan)]' : 'bg-[var(--color-bg-hover)]'}"
                role="switch"
                aria-checked={settingsStore.state.enableWhisper}
                aria-label="Toggle Whisper auto-transcription"
              >
                <span
                  class="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform
                    {settingsStore.state.enableWhisper ? 'translate-x-5' : ''}"
                ></span>
              </button>
            </label>

            {#if settingsStore.state.enableWhisper}
              <div class="px-3 pb-3 space-y-3 border-t border-[var(--color-border-subtle)]">
                <!-- Model selector -->
                <div class="pt-3">
                  <StudioSelect
                    value={selectedWhisperModel}
                    options={whisperModelOptions.length > 0 ? whisperModelOptions : [{ value: "base", label: "base (145 MB)", description: "74M" }]}
                    label="Whisper Model"
                    disabled={isLoadingWhisper || whisperStatus?.loaded === true}
                    onchange={(v) => { selectedWhisperModel = v; }}
                  />
                </div>

                <!-- Load / Unload button -->
                <div class="flex items-center gap-3">
                  {#if whisperStatus?.loaded}
                    <StudioButton
                      variant="secondary"
                      size="sm"
                      loading={isLoadingWhisper}
                      onclick={handleUnloadWhisper}
                      class="flex-1"
                    >
                      Unload
                    </StudioButton>
                  {:else}
                    <StudioButton
                      variant="primary"
                      size="sm"
                      loading={isLoadingWhisper}
                      onclick={handleLoadWhisper}
                      class="flex-1"
                    >
                      {isLoadingWhisper ? 'Loading...' : 'Load Model'}
                    </StudioButton>
                  {/if}
                </div>

                <!-- Status display -->
                <div class="flex items-center gap-2 text-xs">
                  {#if isLoadingWhisper}
                    <Spinner size="sm" />
                    <span class="text-[var(--color-text-muted)]">Loading {selectedWhisperModel}...</span>
                  {:else if whisperStatus?.loaded}
                    <span class="w-2 h-2 rounded-full bg-[var(--color-success)]"></span>
                    <span class="text-[var(--color-text-secondary)]">
                      Model: {whisperStatus.model_size} &bull; Device: {whisperStatus.device}
                    </span>
                  {:else}
                    <span class="w-2 h-2 rounded-full bg-[var(--color-text-muted)]"></span>
                    <span class="text-[var(--color-text-muted)]">No model loaded</span>
                  {/if}
                </div>

                <!-- Error -->
                {#if whisperError}
                  <p class="text-xs text-[var(--color-error)]">{whisperError}</p>
                {/if}
              </div>
            {/if}
          </div>

          <!-- Translation note -->
          <div class="p-3 rounded-lg bg-[var(--color-bg-elevated)]">
            <span class="text-sm font-medium text-[var(--color-text-primary)]">Translation helpers</span>
            {#if settingsStore.state.enableWhisper}
              <p class="text-xs text-[var(--color-text-muted)] mt-1">
                Enabled with Auto-transcription. You can translate text-to-generate to the selected speech language in all modes.
              </p>
            {:else}
              <p class="text-xs text-[var(--color-text-muted)] mt-1">
                Enable Auto-transcription to unlock local translation helpers.
              </p>
            {/if}
          </div>
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
            <div class="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
              Model Cache Location
            </div>
            <div class="p-3 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)]">
              <span class="text-sm text-[var(--color-text-muted)] font-mono">
                {cacheDir}
              </span>
            </div>
          </div>
        </div>
      </section>

      <!-- Environment Section (deferred installer status) -->
      <section>
        <h3 class="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
          Environment
        </h3>
        <div class="space-y-3">
          {#if envStatus}
            <div class="p-3 rounded-lg bg-[var(--color-bg-elevated)] space-y-2">
              <div class="flex justify-between items-center">
                <span class="text-sm text-[var(--color-text-secondary)]">Status</span>
                <span class="text-sm font-medium {envStatus.setup_complete
                  ? 'text-emerald-400'
                  : 'text-amber-400'}">
                  {envStatus.setup_complete ? 'Ready' : envStatus.state === 'needs_update' ? 'Update needed' : envStatus.state === 'corrupted' ? 'Needs repair' : 'Not set up'}
                </span>
              </div>

              {#if envStatus.gpu_display}
                <div class="flex justify-between items-center">
                  <span class="text-sm text-[var(--color-text-secondary)]">GPU Target</span>
                  <span class="text-sm text-[var(--color-text-muted)]">{envStatus.gpu_display}</span>
                </div>
              {/if}

              {#if envStatus.disk_usage_mb}
                <div class="flex justify-between items-center">
                  <span class="text-sm text-[var(--color-text-secondary)]">Disk Usage</span>
                  <span class="text-sm text-[var(--color-text-muted)]">{formatDiskUsage(envStatus.disk_usage_mb)}</span>
                </div>
              {/if}

              {#if envStatus.uv_version}
                <div class="flex justify-between items-center">
                  <span class="text-sm text-[var(--color-text-secondary)]">uv Version</span>
                  <span class="text-sm text-[var(--color-text-muted)]">
                    {envStatus.uv_version}
                    {#if envStatus.uv_needs_update}
                      <span class="text-amber-400 text-xs ml-1">(update available)</span>
                    {/if}
                  </span>
                </div>
              {/if}

              {#if envStatus.venv_path}
                <div class="flex flex-col gap-1">
                  <span class="text-xs text-[var(--color-text-secondary)]">Venv Path</span>
                  <span class="text-xs text-[var(--color-text-muted)] font-mono break-all">{envStatus.venv_path}</span>
                </div>
              {/if}

              {#if envStatus.state_detail}
                <p class="text-xs text-amber-400">{envStatus.state_detail}</p>
              {/if}
            </div>

            {#if envRepairMessage}
              <p class="text-xs text-[var(--color-text-secondary)] p-2 rounded bg-[var(--color-bg-elevated)]">{envRepairMessage}</p>
            {/if}

            <div class="flex gap-2">
              <button
                class="flex-1 text-xs py-2 rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] transition-colors disabled:opacity-50"
                onclick={() => handleRepairEnvironment(false)}
                disabled={isRepairingEnv}
              >
                {isRepairingEnv ? 'Repairing...' : 'Repair (re-verify)'}
              </button>
              <button
                class="flex-1 text-xs py-2 rounded-lg border border-[var(--color-accent-red)]/40 text-[var(--color-accent-red)] hover:bg-[var(--color-accent-red)]/10 transition-colors disabled:opacity-50"
                onclick={() => handleRepairEnvironment(true)}
                disabled={isRepairingEnv}
              >
                {isRepairingEnv ? 'Rebuilding...' : 'Full rebuild'}
              </button>
            </div>
          {:else}
            <div class="p-3 rounded-lg bg-[var(--color-bg-elevated)]">
              <span class="text-sm text-[var(--color-text-muted)]">Loading environment status...</span>
            </div>
          {/if}
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
              <span class="text-sm text-[var(--color-text-muted)]">v1.0.0</span>
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
        PrivateVoice v1.0.0
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
    animation: slide-left 0.3s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }
</style>
