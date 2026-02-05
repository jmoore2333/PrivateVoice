<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";

  // Stores
  import { ttsStore, type TTSMode, MODEL_CAPABILITIES, MODEL_OPTIONS, getRecommendedModel, modelSupportsMode } from "$lib/stores/ttsStore.svelte";
  import { appStore, type StartupPhase } from "$lib/stores/appStore.svelte";
  import { debugStore } from "$lib/stores/debugStore.svelte";
  import { settingsStore } from "$lib/stores/settingsStore.svelte";
  import { libraryStore } from "$lib/stores/libraryStore.svelte";
  import { ttsClient, type Speaker, type SystemInfo } from "$lib/api/ttsClient";

  // Layout components
  import Header from "$lib/components/layout/Header.svelte";
  import Workspace from "$lib/components/layout/Workspace.svelte";

  // Input panels
  import CustomVoicePanel from "$lib/components/input/CustomVoicePanel.svelte";
  import VoiceClonePanel from "$lib/components/input/VoiceClonePanel.svelte";
  import VoiceDesignPanel from "$lib/components/input/VoiceDesignPanel.svelte";

  // Output
  import OutputPanel from "$lib/components/output/OutputPanel.svelte";

  // Library
  import LibraryDrawer from "$lib/components/library/LibraryDrawer.svelte";

  // Keep existing components
  import LoadingScreen from "$lib/components/startup/LoadingScreen.svelte";
  import DebugConsole from "$lib/components/debug/DebugConsole.svelte";
  import SettingsPanel from "$lib/components/settings/SettingsPanel.svelte";
  import HelpPanel from "$lib/components/help/HelpPanel.svelte";
  import { helpStore } from "$lib/stores/helpStore.svelte";
  import { useKeyboardShortcuts } from "$lib/hooks/useKeyboardShortcuts";

  // Onboarding
  import Welcome from "$lib/components/onboarding/Welcome.svelte";

  const { state: ttsState } = ttsStore;
  const { state: appState } = appStore;

  // Local state
  let healthInterval: ReturnType<typeof setInterval> | null = null;
  let unlistenStartup: (() => void) | null = null;
  let unlistenLog: (() => void) | null = null;
  let libraryOpen = $state(false);
  let generationStartTime = $state<number | null>(null);
  let elapsedTime = $state(0);
  let elapsedInterval: ReturnType<typeof setInterval> | null = null;
  let startupStatusAvailable = $state(true);
  let hasFetchedSystemInfo = $state(false);

  // Component refs
  let outputPanelRef = $state<OutputPanel>();

  // Voice clone local state
  let referenceAudioBlob = $state<Blob | null>(null);
  let referenceAudioUrl = $state<string | null>(null);

  // Local text/language state for binding
  let localText = $state(ttsState.text);
  let localLanguage = $state(ttsState.language);
  let localSpeaker = $state<string>(ttsState.speaker);
  let localInstruction = $state(ttsState.instruction);
  let localReferenceText = $state(ttsState.referenceText);
  let localVoiceDescription = $state(ttsState.voiceDescription);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onPlayPause: () => {
      outputPanelRef?.togglePlay();
    },
    onGenerate: () => {
      if (!ttsState.isGenerating && ttsState.text.trim()) {
        handleGenerate();
      }
    },
    onSave: () => {
      if (ttsState.audioUrl) {
        handleSave();
      }
    },
    onSwitchMode: (mode) => {
      handleModeChange(mode);
    },
    onEscape: () => {
      // Close any open panels in priority order
      if (libraryOpen) {
        libraryOpen = false;
      } else if (settingsStore.isOpen) {
        settingsStore.close();
      } else if (helpStore.isOpen) {
        helpStore.close();
      }
    },
  });

  // Derived state
  const isStartupComplete = $derived(appState.startup.phase === "ready");
  const showOnboarding = $derived(!settingsStore.state.hasCompletedOnboarding);

  function computeStatus(): 'ready' | 'generating' | 'downloading' | 'loading' | 'error' {
    if (ttsState.error) return 'error';
    if (ttsState.isGenerating) return 'generating';
    if (ttsState.isLoadingModel) return 'loading';
    if (appState.download.status !== 'idle') return 'downloading';
    return 'ready';
  }

  const currentStatus = $derived(computeStatus());

  const voiceDesignModelLoaded = $derived(ttsState.modelId === '1.7b-design');
  const voiceCloneModelSupported = $derived(modelSupportsMode(ttsState.modelId, 'voice-clone'));
  const customVoiceModelSupported = $derived(modelSupportsMode(ttsState.modelId, 'custom-voice'));

  function getModelLabel(modelId: string): string {
    const match = MODEL_OPTIONS.find((model) => model.id === modelId);
    return match ? match.label : modelId;
  }

  function pickRecommendedModel(mode: TTSMode, info: SystemInfo | null): string {
    const isCpu = info?.device === "cpu";
    const memoryAvailable = info?.memory_available_gb ?? info?.memory_total_gb ?? 0;
    const prefersQuality = !isCpu && memoryAvailable >= 12;

    switch (mode) {
      case "voice-clone":
        return prefersQuality ? "1.7b-base" : "0.6b-base";
      case "voice-design":
        return "1.7b-design";
      case "custom-voice":
      default:
        return prefersQuality ? "1.7b" : "0.6b";
    }
  }

  const recommendedCustomModelId = $derived(pickRecommendedModel("custom-voice", debugStore.state.systemInfo));
  const recommendedCloneModelId = $derived(pickRecommendedModel("voice-clone", debugStore.state.systemInfo));
  const recommendedDesignModelId = $derived("1.7b-design");

  const recommendedCustomModelLabel = $derived(getModelLabel(recommendedCustomModelId));
  const recommendedCloneModelLabel = $derived(getModelLabel(recommendedCloneModelId));
  const recommendedDesignModelLabel = $derived(getModelLabel(recommendedDesignModelId));

  function buildRecommendedHint(info: SystemInfo | null): string {
    if (!info) return "";
    const deviceLabel = info.device_name ?? info.device;
    const memory = info.memory_available_gb ?? info.memory_total_gb;
    const memoryLabel = memory ? ` • ${memory.toFixed(1)} GB available` : "";
    return `Detected ${deviceLabel}${memoryLabel}.`;
  }

  const recommendedCloneHint = $derived(buildRecommendedHint(debugStore.state.systemInfo));

  // Sync local state from store when store changes
  $effect(() => {
    localText = ttsState.text;
  });

  $effect(() => {
    localLanguage = ttsState.language;
  });

  $effect(() => {
    localSpeaker = ttsState.speaker;
  });

  $effect(() => {
    localInstruction = ttsState.instruction;
  });

  $effect(() => {
    localReferenceText = ttsState.referenceText;
  });

  $effect(() => {
    localVoiceDescription = ttsState.voiceDescription;
  });

  // Auto-load model when server is ready and onboarding was already completed
  // This handles returning users who already went through onboarding
  // Respects the autoLoadModel setting (defaults to true)
  let hasAutoLoaded = $state(false);
  $effect(() => {
    if (
      isStartupComplete &&
      !showOnboarding &&
      settingsStore.state.autoLoadModel &&
      !ttsState.modelLoaded &&
      !ttsState.isLoadingModel &&
      !hasAutoLoaded
    ) {
      hasAutoLoaded = true;
      // Clear any stale errors from previous sessions
      ttsStore.clearError();
      // Load the user's preferred default model
      const defaultModel = settingsStore.state.defaultModel || "0.6b";
      ttsStore.loadModel(defaultModel);
    }
  });

  // Track elapsed time during generation
  $effect(() => {
    if (ttsState.isGenerating) {
      generationStartTime = Date.now();
      elapsedInterval = setInterval(() => {
        if (generationStartTime) {
          elapsedTime = (Date.now() - generationStartTime) / 1000;
        }
      }, 100);
    } else {
      if (elapsedInterval) {
        clearInterval(elapsedInterval);
        elapsedInterval = null;
      }
      generationStartTime = null;
    }
  });

  // --- Keep existing lifecycle code from current +page.svelte ---
  onMount(() => {
    listen<{ phase: string; message: string; progress: number }>("sidecar-startup", (event) => {
      const { phase, message, progress } = event.payload;
      appStore.setStartupPhase(phase as StartupPhase, message);
      appStore.setStartupProgress(progress);
    }).then((unlisten) => {
      unlistenStartup = unlisten;
    });

    listen<{ level: string; message: string; timestamp: string }>("sidecar-log", (event) => {
      debugStore.addLog(event.payload);
    }).then((unlisten) => {
      unlistenLog = unlisten;
    });

    startServer();
  });

  onDestroy(() => {
    if (healthInterval) clearInterval(healthInterval);
    if (unlistenStartup) unlistenStartup();
    if (unlistenLog) unlistenLog();
    if (elapsedInterval) clearInterval(elapsedInterval);
  });

  async function startServer() {
    try {
      appStore.setStartupPhase("initializing", "Starting Python environment...");
      await invoke("start_tts_server");

      // Attempt an immediate health check to unblock UI even if startup-status is delayed.
      try {
        await ttsStore.checkServerHealth();
      } catch {
        // Ignore; health polling below will retry.
      }

      healthInterval = setInterval(async () => {
        try {
          let statusPhase: StartupPhase | null = null;

          await ttsClient.health();

          if (!ttsState.serverConnected) {
            ttsStore.checkServerHealth();
          }

          if (startupStatusAvailable) {
            try {
              const status = await ttsClient.getStartupStatus();
              appStore.setStartupPhase(status.phase as StartupPhase, status.message);
              appStore.setStartupProgress(status.progress);
              statusPhase = status.phase as StartupPhase;

              if (status.phase === "downloading") {
                const download = await ttsClient.getDownloadProgress();
                appStore.updateDownloadProgress({
                  status: download.status,
                  fileName: download.file_name,
                  bytesDownloaded: download.bytes_downloaded,
                  bytesTotal: download.bytes_total,
                  speedMbps: download.speed_mbps,
                  eta: download.eta,
                });
              }
            } catch (e) {
              const statusCode = (e as Error & { status?: number }).status;
              if (statusCode === 404) {
                startupStatusAvailable = false;
                appStore.setStartupPhase("ready", "Server connected");
                appStore.setStartupProgress(100);
                statusPhase = "ready";
              } else {
                throw e;
              }
            }
          } else {
            appStore.setStartupPhase("ready", "Server connected");
            appStore.setStartupProgress(100);
            statusPhase = "ready";
          }

          if (ttsState.serverConnected && !hasFetchedSystemInfo) {
            hasFetchedSystemInfo = true;
            debugStore.fetchSystemInfo();
          }

          if (statusPhase === "ready") {
            if (healthInterval) {
              clearInterval(healthInterval);
              healthInterval = null;
            }
            await ttsStore.refreshModelStatus();

            // Auto-load the recommended model if none is loaded
            if (settingsStore.state.autoLoadModel && !ttsState.modelLoaded) {
              const recommended = getRecommendedModel(ttsState.mode);
              ttsStore.loadModel(recommended);
            }
          }
        } catch {
          // Server not ready yet
        }
      }, 500);
    } catch (e) {
      console.error("Failed to start TTS server:", e);
      appStore.setStartupError(`Failed to start server: ${e}`);
    }
  }

  function handleRetry() {
    appStore.setStartupPhase("initializing", "Retrying...");
    startServer();
  }

  // --- New handlers for PrivateVoice ---

  function handleModeChange(mode: TTSMode) {
    ttsStore.setMode(mode);

    // Auto-load appropriate model if needed
    if (mode === 'voice-design' && ttsState.modelId !== '1.7b-design') {
      // Will show warning in VoiceDesignPanel
    }
  }

  function buildLibraryItem(): import('$lib/stores/libraryStore.svelte').LibraryItem {
    return {
      id: crypto.randomUUID(),
      type: ttsState.mode === 'voice-clone' ? 'clone' : ttsState.mode === 'voice-design' ? 'design' : 'audio',
      name: ttsState.text.slice(0, 30) + (ttsState.text.length > 30 ? '...' : ''),
      audioUrl: ttsState.audioUrl!,
      createdAt: new Date(),
      metadata: {
        speaker: ttsState.speaker,
        language: ttsState.language,
        referenceText: ttsState.referenceText || undefined,
        voiceDescription: ttsState.voiceDescription || undefined,
        modelId: ttsState.modelId ?? undefined,
      }
    };
  }

  async function handleGenerate() {
    await ttsStore.generate();

    // Add to recent library if successful
    if (ttsState.audioBlob && ttsState.audioUrl) {
      libraryStore.addToRecent(buildLibraryItem());
    }
  }

  async function handleSave() {
    if (ttsState.audioBlob && ttsState.audioUrl) {
      await libraryStore.saveToLibrary(buildLibraryItem(), ttsState.audioBlob);
    }
  }

  function handleExport() {
    ttsStore.downloadAudio();
  }

  function handleLoadVoiceDesignModel() {
    ttsStore.loadModel(recommendedDesignModelId);
  }

  function handleLoadVoiceCloneModel() {
    ttsStore.loadModel(recommendedCloneModelId);
  }

  function handleLoadCustomVoiceModel() {
    ttsStore.loadModel(recommendedCustomModelId);
  }

  function handleReferenceAudioChange(blob: Blob, url: string) {
    referenceAudioBlob = blob;
    referenceAudioUrl = url;
    // Convert blob to File for ttsStore
    const file = new File([blob], 'reference.wav', { type: blob.type });
    ttsStore.setReferenceAudio(file);
  }

  function handleLanguageChange(language: string) {
    localLanguage = language;
    ttsStore.setLanguage(language);
  }

  function handleTextChange(text: string) {
    localText = text;
    ttsStore.setText(text);
  }

  function handleSpeakerChange(speaker: string, _isPreset: boolean) {
    localSpeaker = speaker;
    ttsStore.setSpeaker(speaker as Speaker);
  }

  function handleInstructionChange(instruction: string) {
    localInstruction = instruction;
    ttsStore.setInstruction(instruction);
  }

  function handleReferenceTextChange(text: string) {
    localReferenceText = text;
    ttsStore.setReferenceText(text);
  }

  function handleCloneQualityChange(enabled: boolean) {
    ttsStore.setCloneLowQualityMode(enabled);
  }

  function handleDescriptionChange(description: string) {
    localVoiceDescription = description;
    ttsStore.setVoiceDescription(description);
  }

  function handleOnboardingComplete(selectedModel: string) {
    // Load the selected model after onboarding
    ttsStore.loadModel(selectedModel);
  }
</script>

<!-- Welcome/Onboarding -->
{#if showOnboarding}
  <Welcome onComplete={handleOnboardingComplete} />
{/if}

<!-- Loading Screen -->
{#if !isStartupComplete && !ttsState.serverConnected}
  <LoadingScreen
    phase={appState.startup.phase}
    message={appState.startup.message}
    progress={appState.startup.progress}
    download={appState.download.status !== "idle" ? appState.download : null}
    onRetry={handleRetry}
  />
{/if}

<!-- Main App -->
<div
  class="h-screen flex flex-col bg-[var(--color-bg-deep)]"
  class:hidden={!isStartupComplete && !ttsState.serverConnected}
>
  <!-- Header -->
  <Header
    currentMode={ttsState.mode}
    modelId={ttsState.modelId}
    status={currentStatus}
    isLoadingModel={ttsState.isLoadingModel}
    onModeChange={handleModeChange}
    onModelChange={(modelId) => ttsStore.loadModel(modelId)}
    onSettingsClick={() => settingsStore.open()}
    onHelpClick={() => helpStore.open()}
  />

  <!-- Error Banner -->
  {#if ttsState.error}
    <div class="px-4 py-2 bg-[var(--color-error)]/10 border-b border-[var(--color-error)]/30">
      <div class="flex items-center justify-between max-w-4xl mx-auto">
        <span class="text-sm text-[var(--color-error)]">{ttsState.error}</span>
        <button
          onclick={() => ttsStore.clearError()}
          class="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
        >
          Dismiss
        </button>
      </div>
    </div>
  {/if}

  <!-- Workspace -->
  <Workspace>
    {#snippet inputPanel()}
      {#if ttsState.mode === 'custom-voice'}
        <CustomVoicePanel
          bind:text={localText}
          bind:language={localLanguage}
          bind:speaker={localSpeaker}
          bind:instruction={localInstruction}
          modelSupported={customVoiceModelSupported}
          modelLoading={ttsState.isLoadingModel}
          recommendedModelLabel={recommendedCustomModelLabel}
          currentModelId={ttsState.modelId}
          isGenerating={ttsState.isGenerating}
          onGenerate={handleGenerate}
          onTextChange={handleTextChange}
          onLanguageChange={handleLanguageChange}
          onSpeakerChange={handleSpeakerChange}
          onInstructionChange={handleInstructionChange}
          onLoadModel={handleLoadCustomVoiceModel}
        />
      {:else if ttsState.mode === 'voice-clone'}
        <VoiceClonePanel
          bind:text={localText}
          bind:language={localLanguage}
          bind:referenceText={localReferenceText}
          {referenceAudioUrl}
          {referenceAudioBlob}
          modelSupported={voiceCloneModelSupported}
          modelLoading={ttsState.isLoadingModel}
          recommendedModelLabel={recommendedCloneModelLabel}
          recommendedModelHint={recommendedCloneHint}
          isGenerating={ttsState.isGenerating}
          hasWhisper={false}
          onGenerate={handleGenerate}
          onTextChange={handleTextChange}
          onLanguageChange={handleLanguageChange}
          onReferenceTextChange={handleReferenceTextChange}
          onReferenceAudioChange={handleReferenceAudioChange}
          onLowQualityModeChange={handleCloneQualityChange}
          onLoadModel={handleLoadVoiceCloneModel}
        />
      {:else if ttsState.mode === 'voice-design'}
        <VoiceDesignPanel
          bind:text={localText}
          bind:language={localLanguage}
          bind:voiceDescription={localVoiceDescription}
          isGenerating={ttsState.isGenerating}
          modelLoaded={voiceDesignModelLoaded}
          modelLoading={ttsState.isLoadingModel}
          recommendedModelLabel={recommendedDesignModelLabel}
          onGenerate={handleGenerate}
          onLoadModel={handleLoadVoiceDesignModel}
          onTextChange={handleTextChange}
          onLanguageChange={handleLanguageChange}
          onDescriptionChange={handleDescriptionChange}
        />
      {/if}
    {/snippet}

    {#snippet outputPanel()}
      <OutputPanel
        bind:this={outputPanelRef}
        audioUrl={ttsState.audioUrl ?? undefined}
        isGenerating={ttsState.isGenerating}
        {elapsedTime}
        generatingText={ttsState.text}
        onRegenerate={handleGenerate}
        onSave={handleSave}
        onExport={handleExport}
        onCancel={() => ttsStore.abortGeneration()}
      />
    {/snippet}
  </Workspace>

  <!-- Library Button (floating) -->
  <button
    onclick={() => libraryOpen = true}
    class="fixed bottom-4 left-4 p-3 rounded-xl bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] transition-all z-30"
    title="Voice Library"
  >
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
    </svg>
  </button>

  <!-- Debug Button (floating) -->
  <button
    onclick={() => debugStore.toggleVisibility()}
    class="fixed bottom-4 right-4 p-3 rounded-xl bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] transition-all z-30"
    title="Toggle Debug Console"
  >
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
    </svg>
  </button>
</div>

<!-- Library Drawer -->
<LibraryDrawer
  isOpen={libraryOpen}
  onClose={() => libraryOpen = false}
  onUseVoice={(id) => {
    const item = libraryStore.saved.find(i => i.id === id) ?? libraryStore.recent.find(i => i.id === id);
    if (!item) { libraryOpen = false; return; }

    // Set mode from item type
    const modeMap = { clone: 'voice-clone', design: 'voice-design', audio: 'custom-voice' } as const;
    ttsStore.setMode(modeMap[item.type]);

    // Restore metadata
    if (item.metadata?.speaker) ttsStore.setSpeaker(item.metadata.speaker as Speaker);
    if (item.metadata?.language) ttsStore.setLanguage(item.metadata.language);
    if (item.metadata?.voiceDescription) ttsStore.setVoiceDescription(item.metadata.voiceDescription);
    if (item.metadata?.referenceText) ttsStore.setReferenceText(item.metadata.referenceText);

    // Restore text from item name (truncated, but best we have)
    ttsStore.setText(item.name.replace(/\.\.\.$/,''));

    libraryOpen = false;
  }}
/>

<!-- Debug Console -->
<DebugConsole />

<!-- Settings Panel -->
<SettingsPanel />

<!-- Help Panel -->
<HelpPanel />
