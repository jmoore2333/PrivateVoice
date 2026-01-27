<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";

  // Stores
  import { ttsStore, type TTSMode, MODEL_CAPABILITIES, getRecommendedModel, modelSupportsMode } from "$lib/stores/ttsStore.svelte";
  import { appStore, type StartupPhase } from "$lib/stores/appStore.svelte";
  import { debugStore } from "$lib/stores/debugStore.svelte";
  import { settingsStore } from "$lib/stores/settingsStore.svelte";
  import { libraryStore } from "$lib/stores/libraryStore.svelte";
  import { ttsClient, type Speaker } from "$lib/api/ttsClient";

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

  // Voice clone local state
  let referenceAudioBlob = $state<Blob | null>(null);
  let referenceAudioUrl = $state<string | null>(null);

  // Local text/language state for binding
  let localText = $state(ttsState.text);
  let localLanguage = $state('English');
  let localSpeaker = $state<string>(ttsState.speaker);
  let localInstruction = $state(ttsState.instruction);
  let localReferenceText = $state(ttsState.referenceText);
  let localVoiceDescription = $state(ttsState.voiceDescription);

  // Derived state
  const isStartupComplete = $derived(appState.startup.phase === "ready");

  function computeStatus(): 'ready' | 'generating' | 'downloading' | 'loading' | 'error' {
    if (ttsState.error) return 'error';
    if (ttsState.isGenerating) return 'generating';
    if (ttsState.isLoadingModel) return 'loading';
    if (appState.download.status !== 'idle') return 'downloading';
    return 'ready';
  }

  const currentStatus = $derived(computeStatus());

  const voiceDesignModelLoaded = $derived(ttsState.modelId === '1.7b-design');

  // Sync local state from store when store changes
  $effect(() => {
    localText = ttsState.text;
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

      healthInterval = setInterval(async () => {
        try {
          await ttsClient.health();

          const status = await ttsClient.getStartupStatus();
          appStore.setStartupPhase(status.phase as StartupPhase, status.message);
          appStore.setStartupProgress(status.progress);

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

          if (!ttsState.serverConnected) {
            ttsStore.checkServerHealth();
          }

          if (status.phase === "ready" || status.phase === "checking-models") {
            if (healthInterval) {
              clearInterval(healthInterval);
              healthInterval = null;
            }
            await ttsStore.refreshModelStatus();
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

  async function handleGenerate() {
    await ttsStore.generate();

    // Add to recent library if successful
    if (ttsState.audioBlob && ttsState.audioUrl) {
      libraryStore.addToRecent({
        id: crypto.randomUUID(),
        type: ttsState.mode === 'voice-clone' ? 'clone' : ttsState.mode === 'voice-design' ? 'design' : 'audio',
        name: ttsState.text.slice(0, 30) + (ttsState.text.length > 30 ? '...' : ''),
        audioUrl: ttsState.audioUrl,
        createdAt: new Date(),
        metadata: {
          speaker: ttsState.speaker,
          modelId: ttsState.modelId ?? undefined,
        }
      });
    }
  }

  function handleSave() {
    if (ttsState.audioBlob && ttsState.audioUrl) {
      libraryStore.saveToLibrary({
        id: crypto.randomUUID(),
        type: ttsState.mode === 'voice-clone' ? 'clone' : ttsState.mode === 'voice-design' ? 'design' : 'audio',
        name: ttsState.text.slice(0, 30) + (ttsState.text.length > 30 ? '...' : ''),
        audioUrl: ttsState.audioUrl,
        createdAt: new Date(),
        metadata: {
          speaker: ttsState.speaker,
          modelId: ttsState.modelId ?? undefined,
        }
      });
    }
  }

  function handleExport() {
    ttsStore.downloadAudio();
  }

  function handleLoadVoiceDesignModel() {
    ttsStore.loadModel('1.7b-design');
  }

  function handleReferenceAudioChange(blob: Blob, url: string) {
    referenceAudioBlob = blob;
    referenceAudioUrl = url;
    // Convert blob to File for ttsStore
    const file = new File([blob], 'reference.wav', { type: blob.type });
    ttsStore.setReferenceAudio(file);
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

  function handleDescriptionChange(description: string) {
    localVoiceDescription = description;
    ttsStore.setVoiceDescription(description);
  }
</script>

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
    onModeChange={handleModeChange}
    onSettingsClick={() => settingsStore.open()}
    onHelpClick={() => {/* TODO: help panel */}}
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
          isGenerating={ttsState.isGenerating}
          onGenerate={handleGenerate}
          onTextChange={handleTextChange}
          onSpeakerChange={handleSpeakerChange}
          onInstructionChange={handleInstructionChange}
        />
      {:else if ttsState.mode === 'voice-clone'}
        <VoiceClonePanel
          bind:text={localText}
          bind:language={localLanguage}
          bind:referenceText={localReferenceText}
          {referenceAudioUrl}
          {referenceAudioBlob}
          isGenerating={ttsState.isGenerating}
          hasWhisper={false}
          onGenerate={handleGenerate}
          onTextChange={handleTextChange}
          onReferenceTextChange={handleReferenceTextChange}
          onReferenceAudioChange={handleReferenceAudioChange}
        />
      {:else if ttsState.mode === 'voice-design'}
        <VoiceDesignPanel
          bind:text={localText}
          bind:language={localLanguage}
          bind:voiceDescription={localVoiceDescription}
          isGenerating={ttsState.isGenerating}
          modelLoaded={voiceDesignModelLoaded}
          modelLoading={ttsState.isLoadingModel}
          onGenerate={handleGenerate}
          onLoadModel={handleLoadVoiceDesignModel}
          onTextChange={handleTextChange}
          onDescriptionChange={handleDescriptionChange}
        />
      {/if}
    {/snippet}

    {#snippet outputPanel()}
      <OutputPanel
        audioUrl={ttsState.audioUrl ?? undefined}
        isGenerating={ttsState.isGenerating}
        {elapsedTime}
        generatingText={ttsState.text}
        onRegenerate={handleGenerate}
        onSave={handleSave}
        onExport={handleExport}
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
    // TODO: Load voice configuration
    libraryOpen = false;
  }}
/>

<!-- Debug Console -->
<DebugConsole />

<!-- Settings Panel -->
<SettingsPanel />
