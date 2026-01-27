<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import { listen } from "@tauri-apps/api/event";
  import { ttsStore } from "$lib/stores/ttsStore.svelte";
  import { appStore, type StartupPhase } from "$lib/stores/appStore.svelte";
  import { debugStore } from "$lib/stores/debugStore.svelte";
  import { ttsClient, PRESET_SPEAKERS, type Speaker } from "$lib/api/ttsClient";
  import { settingsStore } from "$lib/stores/settingsStore.svelte";

  // Components
  import LoadingScreen from "$lib/components/startup/LoadingScreen.svelte";
  import DebugConsole from "$lib/components/debug/DebugConsole.svelte";
  import SettingsPanel from "$lib/components/settings/SettingsPanel.svelte";
  import StatusBar from "$lib/components/tts/StatusBar.svelte";
  import ModeSelector from "$lib/components/tts/ModeSelector.svelte";
  import SpeakerSelector from "$lib/components/tts/SpeakerSelector.svelte";
  import AudioPlayer from "$lib/components/tts/AudioPlayer.svelte";
  import GenerateButton from "$lib/components/tts/GenerateButton.svelte";
  import StudioCard from "$lib/components/ui/StudioCard.svelte";
  import StudioTextarea from "$lib/components/ui/StudioTextarea.svelte";
  import StudioInput from "$lib/components/ui/StudioInput.svelte";

  const { state: ttsState } = ttsStore;
  const { state: appState } = appStore;

  // Available models
  const MODELS = [
    { id: "0.6b", name: "0.6B", description: "Fast, Custom Voice" },
    { id: "1.7b", name: "1.7B", description: "Quality, Custom Voice" },
    { id: "1.7b-design", name: "1.7B Design", description: "Voice Design mode" },
  ] as const;

  // Speaker data with descriptions
  const SPEAKERS = PRESET_SPEAKERS.map((name) => ({
    id: name,
    name,
    description: getSpeakerDescription(name),
    language: getSpeakerLanguage(name),
  }));

  function getSpeakerDescription(name: string): string {
    const descriptions: Record<string, string> = {
      Vivian: "Bright, slightly edgy young female",
      Serena: "Warm, gentle young female",
      Uncle_Fu: "Seasoned male, low mellow timbre",
      Dylan: "Youthful Beijing male, clear natural",
      Eric: "Lively Chengdu male, slightly husky",
      Ryan: "Dynamic male, strong rhythmic drive",
      Aiden: "Sunny American male, clear midrange",
      Ono_Anna: "Playful Japanese female, light nimble",
      Sohee: "Warm Korean female, rich emotion",
    };
    return descriptions[name] ?? "";
  }

  function getSpeakerLanguage(name: string): string {
    const languages: Record<string, string> = {
      Vivian: "Chinese",
      Serena: "Chinese",
      Uncle_Fu: "Chinese",
      Dylan: "Chinese (Beijing)",
      Eric: "Chinese (Sichuan)",
      Ryan: "English",
      Aiden: "English",
      Ono_Anna: "Japanese",
      Sohee: "Korean",
    };
    return languages[name] ?? "Multilingual";
  }

  let selectedModelId = $state("0.6b");
  let healthInterval: ReturnType<typeof setInterval> | null = null;
  let unlistenStartup: (() => void) | null = null;
  let unlistenLog: (() => void) | null = null;

  const isStartupComplete = $derived(appState.startup.phase === "ready");

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

  async function handleRetry() {
    appStore.setStartupPhase("initializing", "Retrying...");
    await startServer();
  }

  function handleGenerate() {
    ttsStore.generate();
  }

  function handleLoadModel() {
    appStore.setStartupPhase("loading-model", `Loading ${selectedModelId} model...`);
    ttsStore.loadModel(selectedModelId).then(() => {
      appStore.setStartupPhase("ready", "Model loaded and ready");
    });
  }

  function handleModelChange(modelId: string) {
    selectedModelId = modelId;
  }

  function handleSpeakerChange(speakerId: string) {
    ttsStore.setSpeaker(speakerId as Speaker);
  }

  function handleFileChange(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0] ?? null;
    ttsStore.setReferenceAudio(file);
  }

  function handleModeChange(mode: "custom-voice" | "voice-clone" | "voice-design") {
    ttsStore.setMode(mode);
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
<main
  class="min-h-screen p-6 noise"
  class:hidden={!isStartupComplete && !ttsState.serverConnected}
>
  <div class="max-w-2xl mx-auto space-y-6">
    <!-- Header -->
    <header class="text-center py-4 animate-fade-in">
      <h1 class="text-2xl font-bold text-[var(--color-text-primary)] tracking-tight font-mono">
        Qwen3-TTS
      </h1>
      <p class="text-sm text-[var(--color-text-muted)]">
        Text-to-speech for Apple Silicon
      </p>
    </header>

    <!-- Status Bar -->
    <div class="animate-slide-up stagger-1">
      <StatusBar
        serverConnected={ttsState.serverConnected}
        modelLoaded={ttsState.modelLoaded}
        modelId={ttsState.modelId ?? undefined}
        device={ttsState.device}
        isLoadingModel={ttsState.isLoadingModel}
        models={[...MODELS]}
        {selectedModelId}
        onModelChange={handleModelChange}
        onLoadModel={handleLoadModel}
      />
    </div>

    <!-- Error Display -->
    {#if ttsState.error}
      <div
        class="p-4 rounded-xl bg-[var(--color-accent-red-glow)] border border-[var(--color-accent-red)] animate-slide-up"
      >
        <div class="flex items-start gap-3">
          <div class="led led-red mt-1"></div>
          <div class="flex-1">
            <p class="text-sm text-[var(--color-accent-red)]">{ttsState.error}</p>
            <button
              onclick={() => ttsStore.clearError()}
              class="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] mt-1 underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    {/if}

    <!-- Mode Selector -->
    <div class="animate-slide-up stagger-2">
      <ModeSelector mode={ttsState.mode} onchange={handleModeChange} />
    </div>

    <!-- Main Form -->
    <StudioCard variant="elevated" class="animate-slide-up stagger-3">
      <!-- Text Input -->
      <StudioTextarea
        value={ttsState.text}
        label="Text to speak"
        placeholder="Enter the text you want to convert to speech..."
        rows={4}
        oninput={(value) => ttsStore.setText(value)}
      />

      <!-- Custom Voice Options -->
      {#if ttsState.mode === "custom-voice"}
        <div class="grid grid-cols-2 gap-4 mt-5">
          <SpeakerSelector
            speakers={SPEAKERS}
            selectedSpeaker={ttsState.speaker}
            onchange={handleSpeakerChange}
          />

          <StudioInput
            value={ttsState.instruction}
            label="Style (optional)"
            placeholder="e.g., speaks slowly"
            oninput={(value) => ttsStore.setInstruction(value)}
          />
        </div>
      {/if}

      <!-- Voice Clone Options -->
      {#if ttsState.mode === "voice-clone"}
        <div class="space-y-4 mt-5">
          <div>
            <span class="block text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider mb-1.5">
              Reference Audio
            </span>
            <input
              type="file"
              accept="audio/*"
              onchange={handleFileChange}
              class="w-full text-sm text-[var(--color-text-secondary)]
                file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium
                file:bg-[var(--color-bg-elevated)] file:text-[var(--color-text-primary)]
                file:border file:border-[var(--color-border-default)]
                hover:file:bg-[var(--color-bg-hover)]
                file:cursor-pointer file:transition-colors"
            />
          </div>

          <StudioInput
            value={ttsState.referenceText}
            label="Reference Text"
            placeholder="Transcript of the reference audio..."
            oninput={(value) => ttsStore.setReferenceText(value)}
          />
        </div>
      {/if}

      <!-- Voice Design Options -->
      {#if ttsState.mode === "voice-design"}
        <div class="mt-5">
          <StudioTextarea
            value={ttsState.voiceDescription}
            label="Voice Description"
            placeholder="Describe the voice: e.g., A deep male voice with a British accent, speaking in a calm and reassuring manner..."
            rows={3}
            oninput={(value) => ttsStore.setVoiceDescription(value)}
          />
          {#if ttsState.modelId !== "1.7b-design"}
            <div class="mt-3 p-3 rounded-lg bg-[var(--color-accent-amber-glow)] border border-[var(--color-accent-amber)]">
              <p class="text-xs text-[var(--color-accent-amber)]">
                Voice Design requires the 1.7B Design model. Please select and load it above.
              </p>
            </div>
          {/if}
        </div>
      {/if}

      <!-- Generate Button -->
      <div class="mt-6">
        <GenerateButton
          disabled={!ttsState.modelLoaded || !ttsState.text.trim()}
          isGenerating={ttsState.isGenerating}
          onclick={handleGenerate}
        />
      </div>
    </StudioCard>

    <!-- Audio Player -->
    <AudioPlayer
      audioUrl={ttsState.audioUrl}
      onDownload={() => ttsStore.downloadAudio()}
    />

    <!-- Bottom toolbar -->
    <div class="fixed bottom-4 right-4 flex items-center gap-2 z-30">
      <!-- Settings -->
      <button
        onclick={() => settingsStore.open()}
        class="p-3 rounded-xl
          bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)]
          text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]
          hover:border-[var(--color-border-strong)]
          transition-all duration-200"
        title="Settings"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

      <!-- Debug Toggle -->
      <button
        onclick={() => debugStore.toggleVisibility()}
        class="p-3 rounded-xl
          bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)]
          text-[var(--color-text-muted)] hover:text-[var(--color-accent-cyan)]
          hover:border-[var(--color-accent-cyan)] hover:shadow-[0_0_15px_rgba(0,212,255,0.2)]
          transition-all duration-200"
        title="Toggle Debug Console"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
          />
        </svg>
      </button>
    </div>
  </div>
</main>

<!-- Debug Console -->
<DebugConsole />

<!-- Settings Panel -->
<SettingsPanel />
