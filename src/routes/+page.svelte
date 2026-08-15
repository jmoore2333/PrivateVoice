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
  import { batchStore } from "$lib/stores/batchStore.svelte";
  import { ttsClient, PRESET_SPEAKERS, type BatchRequest, type Speaker, type SystemInfo } from "$lib/api/ttsClient";

  // Layout components
  import Header from "$lib/components/layout/Header.svelte";
  import Workspace from "$lib/components/layout/Workspace.svelte";

  // Input panels
  import CustomVoicePanel from "$lib/components/input/CustomVoicePanel.svelte";
  import VoiceClonePanel from "$lib/components/input/VoiceClonePanel.svelte";
  import VoiceDesignPanel from "$lib/components/input/VoiceDesignPanel.svelte";
  import BatchPanel from "$lib/components/input/BatchPanel.svelte";

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
  const { state: batchState } = batchStore;

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
  let batchMode = $state(false);

  // Component refs
  let outputPanelRef = $state<OutputPanel>();

  // Voice clone local state
  let referenceAudioBlob = $state<Blob | null>(null);
  let referenceAudioUrl = $state<string | null>(null);

  // Whisper transcription state
  let isTranscribing = $state(false);
  let transcriptionError = $state<string | null>(null);
  let translationText = $state<string | null>(null);
  let translationError = $state<string | null>(null);
  let isTranslatingText = $state(false);
  let textTranslationError = $state<string | null>(null);

  // Save notification state
  let saveNotification = $state<{ message: string; type: 'success' | 'error' } | null>(null);
  let saveNotificationTimer: ReturnType<typeof setTimeout> | null = null;

  // Local text/language state for binding
  let localText = $state(ttsState.text);
  let localLanguage = $state(ttsState.language);
  let localSpeaker = $state<string>(ttsState.speaker);
  let localInstruction = $state(ttsState.instruction);
  let localReferenceText = $state(ttsState.referenceText);
  let localVoiceDescription = $state(ttsState.voiceDescription);
  let localSeed = $state<number | null>(ttsState.seed);

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
  // "checking-models" means the server is up and API-ready — treat as startup complete.
  // The Tauri sidecar event reliably fires this phase; HTTP polling may lag behind.
  const isStartupComplete = $derived(
    appState.startup.phase === "ready" || appState.startup.phase === "checking-models"
  );
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
  const batchModeEnabled = $derived(settingsStore.state.enableBatchMode);

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

  $effect(() => {
    localSeed = ttsState.seed;
  });

  $effect(() => {
    if (!batchModeEnabled && batchMode) {
      batchMode = false;
    }
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
      const accessToken = await invoke<string>("get_tts_access_token");
      ttsClient.setAccessToken(accessToken);
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

          // Ensure serverConnected is set before proceeding
          if (!ttsState.serverConnected) {
            await ttsStore.checkServerHealth();
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

          // "checking-models" means the server is up and waiting for model load —
          // this is a valid startup-complete state (server is usable).
          if (statusPhase === "ready" || statusPhase === "checking-models") {
            if (healthInterval) {
              clearInterval(healthInterval);
              healthInterval = null;
            }

            // Ensure UI reflects ready state
            if (statusPhase === "checking-models") {
              appStore.setStartupPhase("ready", "Server connected");
              appStore.setStartupProgress(100);
            }

            await ttsStore.refreshModelStatus();

            // Auto-load the recommended model if none is loaded
            if (settingsStore.state.autoLoadModel && !ttsState.modelLoaded) {
              const recommended = getRecommendedModel(ttsState.mode);
              ttsStore.loadModel(recommended);
            }
          }
        } catch (pollErr) {
          // Server not ready yet — log for diagnostics
          console.debug("[health-poll] waiting for server:", pollErr);
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

  /** Next free "Voice N" label, so saved voices get a name you can recognise. */
  function nextVoiceName(): string {
    const used = libraryStore.saved
      .map(i => /^Voice (\d+)$/.exec(i.name)?.[1])
      .filter((n): n is string => Boolean(n))
      .map(Number);
    return `Voice ${used.length ? Math.max(...used) + 1 : 1}`;
  }

  function buildLibraryItem(): import('$lib/stores/libraryStore.svelte').LibraryItem {
    const isClone = ttsState.mode === 'voice-clone';
    return {
      id: crypto.randomUUID(),
      type: isClone ? 'clone' : ttsState.mode === 'voice-design' ? 'design' : 'audio',
      name: ttsState.text.slice(0, 30) + (ttsState.text.length > 30 ? '...' : ''),
      audioUrl: ttsState.audioUrl!,
      createdAt: new Date(),
      metadata: {
        speaker: ttsState.speaker,
        language: ttsState.language,
        referenceText: ttsState.referenceText || undefined,
        voiceDescription: ttsState.voiceDescription || undefined,
        modelId: ttsState.modelId ?? undefined,
        // Low-quality clones carry no transcript; restoring one must not then
        // demand a reference text the user never supplied.
        lowQualityMode: isClone ? ttsState.cloneLowQualityMode : undefined,
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

  function showSaveNotification(message: string, type: 'success' | 'error') {
    if (saveNotificationTimer) clearTimeout(saveNotificationTimer);
    saveNotification = { message, type };
    saveNotificationTimer = setTimeout(() => {
      saveNotification = null;
    }, 3000);
  }

  async function handleSave() {
    if (ttsState.audioBlob && ttsState.audioUrl) {
      try {
        // Voice Clone saves carry their reference recording so the voice can be
        // reused. Use ttsState.referenceAudio — it is the WAV-converted File;
        // referenceAudioBlob may still be WebM/Opus straight from the mic.
        const referenceBlob =
          ttsState.mode === 'voice-clone' ? (ttsState.referenceAudio ?? undefined) : undefined;
        // A saved clone is kept to be reused as a voice, so name it after the
        // voice — not the sentence it happened to say. Renameable from the
        // Library. Applied only on save: Recent entries stay text-named so
        // successive unsaved takes remain distinguishable.
        const item = buildLibraryItem();
        const result = await libraryStore.saveToLibrary(
          referenceBlob ? { ...item, name: nextVoiceName() } : item,
          ttsState.audioBlob,
          referenceBlob
        );
        if (result.ok) {
          showSaveNotification('Saved to Library', 'success');
        } else {
          showSaveNotification(`Save failed: ${result.error}`, 'error');
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        showSaveNotification(`Save failed: ${msg}`, 'error');
      }
    } else {
      showSaveNotification('No audio to save — generate first', 'error');
    }
  }

  function handleExport() {
    ttsStore.downloadAudio();
  }

  // Renaming a library item. Until now the Library's Edit control was wired to
  // an `onEdit` prop the drawer never passed, so a default name was permanent.
  let renameTarget = $state<{ id: string; name: string } | null>(null);

  function startRename(id: string) {
    const item =
      libraryStore.saved.find(i => i.id === id) ?? libraryStore.recent.find(i => i.id === id);
    if (item) renameTarget = { id, name: item.name };
  }

  async function commitRename() {
    if (!renameTarget) return;
    const name = renameTarget.name.trim();
    if (name) await libraryStore.updateItem(renameTarget.id, { name });
    renameTarget = null;
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

  async function handleReferenceAudioChange(blob: Blob, url: string) {
    referenceAudioBlob = blob;
    referenceAudioUrl = url;
    translationText = null;
    translationError = null;

    // Convert to WAV for the TTS server (WebView2 records WebM/Opus, model expects WAV)
    let audioFile: File;
    if (blob.type && !blob.type.includes('wav')) {
      try {
        const wavBlob = await convertBlobToWav(blob);
        audioFile = new File([wavBlob], 'reference.wav', { type: 'audio/wav' });
      } catch (e) {
        console.warn('[audio] WAV conversion failed, sending original format:', e);
        audioFile = new File([blob], 'reference.wav', { type: blob.type });
      }
    } else {
      audioFile = new File([blob], 'reference.wav', { type: 'audio/wav' });
    }
    ttsStore.setReferenceAudio(audioFile);
  }

  /** Convert an audio Blob (WebM/Opus, etc.) to WAV using the Web Audio API. */
  async function convertBlobToWav(blob: Blob): Promise<Blob> {
    const arrayBuffer = await blob.arrayBuffer();
    const audioCtx = new AudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    await audioCtx.close();

    // Encode AudioBuffer to WAV
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;
    const bytesPerSample = 2; // 16-bit PCM
    const dataSize = length * numChannels * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // WAV header
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // chunk size
    view.setUint16(20, 1, true);  // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
    view.setUint16(32, numChannels * bytesPerSample, true);
    view.setUint16(34, bytesPerSample * 8, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    // Interleave channels and write 16-bit PCM samples
    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(ch)[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        offset += 2;
      }
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  function handleLanguageChange(language: string) {
    localLanguage = language;
    ttsStore.setLanguage(language);
    textTranslationError = null;
  }

  function handleTextChange(text: string) {
    localText = text;
    ttsStore.setText(text);
    textTranslationError = null;
  }

  /** Notice shown after a saved voice moves the app into Voice Clone mode. */
  let voiceProfileNotice = $state<string | null>(null);
  let voiceProfileNoticeTimer: ReturnType<typeof setTimeout> | null = null;

  function showVoiceProfileNotice(message: string) {
    if (voiceProfileNoticeTimer) clearTimeout(voiceProfileNoticeTimer);
    voiceProfileNotice = message;
    voiceProfileNoticeTimer = setTimeout(() => { voiceProfileNotice = null; }, 6000);
  }

  /**
   * Load a saved cloned voice for reuse. Qwen can only render an arbitrary
   * voice in Voice Clone mode, so this switches modes and restores the
   * reference recording and transcript the clone was made from. Text the user
   * already typed is preserved.
   */
  async function applyVoiceProfile(id: string): Promise<boolean> {
    const item =
      libraryStore.saved.find(i => i.id === id) ?? libraryStore.recent.find(i => i.id === id);
    if (!item) return false;

    // hasReferenceAudio lives in index.json but the bytes live on disk; the two
    // can diverge if the file was removed. Say so rather than doing nothing.
    const referenceBlob = await libraryStore.getReferenceBlob(id);
    if (!referenceBlob) {
      showVoiceProfileNotice(
        `"${item.name}" has no stored reference audio, so it can't be reused as a voice.`
      );
      return false;
    }

    ttsStore.setMode('voice-clone');
    // Release the previous reference preview before replacing it — picking
    // voices repeatedly would otherwise leak an object URL per click.
    if (referenceAudioUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(referenceAudioUrl);
    }
    await handleReferenceAudioChange(referenceBlob, URL.createObjectURL(referenceBlob));

    ttsStore.setCloneLowQualityMode(item.metadata?.lowQualityMode ?? false);

    const transcript = item.metadata?.referenceText ?? '';
    localReferenceText = transcript;
    ttsStore.setReferenceText(transcript);

    if (item.metadata?.language) {
      handleLanguageChange(item.metadata.language);
    }

    showVoiceProfileNotice(`Loaded "${item.name}" in Voice Clone mode.`);
    return true;
  }

  function handleSpeakerChange(speaker: string, isPreset: boolean) {
    if (!isPreset) {
      // A saved clone, not a preset: its id is not a speaker. Load it as a
      // voice profile and leave the preset selection untouched.
      void applyVoiceProfile(speaker);
      return;
    }
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

  async function handleAutoTranscribe() {
    if (!referenceAudioBlob) return;
    isTranscribing = true;
    transcriptionError = null;
    translationError = null;
    translationText = null;
    try {
      // Auto-load Whisper if not loaded
      const status = await ttsClient.whisperStatus();
      if (!status.loaded) {
        await ttsClient.loadWhisper("base");
      }
      const file = new File([referenceAudioBlob], "reference.wav", { type: referenceAudioBlob.type || "audio/wav" });
      const transcriptResult = await ttsClient.transcribe(file, { task: "transcribe" });
      localReferenceText = transcriptResult.text;
      ttsStore.setReferenceText(transcriptResult.text);

      if (settingsStore.state.enableWhisper) {
        try {
          const translated = await ttsClient.transcribe(file, { task: "translate" });
          translationText = translated.text;
        } catch (translateErr) {
          translationError = translateErr instanceof Error
            ? translateErr.message
            : "Translation failed";
        }
      }
    } catch (e) {
      transcriptionError = e instanceof Error ? e.message : "Transcription failed";
    } finally {
      isTranscribing = false;
    }
  }

  async function handleTranslateInputText() {
    if (!settingsStore.state.enableTranslation) return;

    if (!localText.trim()) {
      textTranslationError = "Enter text to translate";
      return;
    }

    if (localLanguage === "Auto") {
      textTranslationError = "Select a target language first";
      return;
    }

    isTranslatingText = true;
    textTranslationError = null;
    try {
      const translationStatus = await ttsClient.translationStatus();
      if (!translationStatus.loaded) {
        textTranslationError = "Translation model is not loaded. Open Settings > Optional Features > Translation helpers and click Load Model.";
        return;
      }

      const result = await ttsClient.translateText(localText, localLanguage, "auto");
      localText = result.text;
      ttsStore.setText(result.text);
    } catch (e) {
      textTranslationError = e instanceof Error ? e.message : "Text translation failed";
    } finally {
      isTranslatingText = false;
    }
  }

  function handleUseTranslationAsText() {
    if (!translationText) return;
    localText = translationText;
    ttsStore.setText(translationText);
  }

  function handleDescriptionChange(description: string) {
    localVoiceDescription = description;
    ttsStore.setVoiceDescription(description);
  }

  function handleSeedChange(seed: number | null) {
    localSeed = seed;
    ttsStore.setSeed(seed);
  }

  async function handleBatchFilesAdded(files: FileList | File[]) {
    await batchStore.addFiles(files);
  }

  function handleBatchFileRemove(id: string) {
    batchStore.removeFile(id);
  }

  function handleBatchFilenameChange(id: string, value: string) {
    batchStore.updateOutputFilename(id, value);
  }

  async function encodeFileToBase64(file: File): Promise<string> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const chunkSize = 0x8000;
    let binary = "";
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
  }

  async function handleStartBatch() {
    batchStore.setError(null);

    if (!modelSupportsMode(ttsState.modelId, ttsState.mode)) {
      const recommended = getRecommendedModel(ttsState.mode);
      const label = MODEL_OPTIONS.find((model) => model.id === recommended)?.label ?? recommended;
      batchStore.setError(`Current model does not support ${ttsState.mode}. Load ${label} first.`);
      return;
    }

    if (batchState.files.length === 0) {
      batchStore.setError("Add at least one text file before processing.");
      return;
    }

    const format = settingsStore.state.exportFormat || "wav";
    const request: BatchRequest = {
      mode: ttsState.mode,
      language: localLanguage.toLowerCase(),
      format,
      seed: localSeed,
      sample_rate: format === "wav" ? settingsStore.state.wavSampleRate : null,
      bit_depth: format === "wav" ? settingsStore.state.wavBitDepth : 16,
      items: batchState.files.map((file) => ({
        text: file.text,
        output_filename: file.outputFilename,
      })),
    };

    if (ttsState.mode === "custom-voice") {
      request.speaker = localSpeaker;
      request.instruction = localInstruction;
      request.stable_lead_in = settingsStore.state.stableCustomVoiceLeadIn;
    } else if (ttsState.mode === "voice-design") {
      request.voice_description = localVoiceDescription;
      request.stable_lead_in = settingsStore.state.stableVoiceDesignLeadIn;
      if (!localVoiceDescription.trim()) {
        batchStore.setError("Voice description is required for Voice Design batch mode.");
        return;
      }
    } else if (ttsState.mode === "voice-clone") {
      const referenceAudio = ttsState.referenceAudio;
      if (!referenceAudio) {
        batchStore.setError("Reference audio is required for Voice Clone batch mode.");
        return;
      }
      request.reference_audio_base64 = await encodeFileToBase64(referenceAudio);
      request.reference_text = localReferenceText;
      request.x_vector_only_mode = ttsState.cloneLowQualityMode;
      if (!ttsState.cloneLowQualityMode && !localReferenceText.trim()) {
        batchStore.setError("Reference transcript is required unless low-quality mode is enabled.");
        return;
      }
    }

    await batchStore.startBatch(request);
  }

  function handleCancelBatch() {
    batchStore.cancelBatch();
  }

  function handleBatchModeToggle() {
    if (!batchModeEnabled) {
      batchMode = false;
      return;
    }
    batchMode = !batchMode;
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
    statusDetail={ttsState.isGenerating ? `${elapsedTime.toFixed(1)}s` : undefined}
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

  <!-- Voice Profile Notice -->
  {#if voiceProfileNotice}
    <div class="px-4 py-2 bg-[var(--color-accent)]/10 border-b border-[var(--color-accent)]/30">
      <div class="flex items-center justify-between max-w-4xl mx-auto">
        <span class="text-sm text-[var(--color-accent)]">{voiceProfileNotice}</span>
        <button
          onclick={() => voiceProfileNotice = null}
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
      <div class="space-y-4">
        {#if batchModeEnabled}
          <div class="flex items-center justify-between rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] p-3">
            <div>
              <p class="text-sm font-medium text-[var(--color-text-primary)]">Batch mode</p>
              <p class="text-xs text-[var(--color-text-muted)]">Use queued text files with your current voice configuration.</p>
            </div>
            <button
              class="relative w-11 h-6 rounded-full transition-colors {batchMode ? 'bg-[var(--color-accent-cyan)]' : 'bg-[var(--color-bg-hover)]'}"
              role="switch"
              aria-checked={batchMode}
              aria-label="Toggle batch mode"
              onclick={handleBatchModeToggle}
            >
              <span
                class="absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform {batchMode ? 'translate-x-5' : ''}"
              ></span>
            </button>
          </div>
        {/if}

        {#if batchModeEnabled && batchMode}
          <BatchPanel
            files={batchState.files}
            isProcessing={batchState.isProcessing}
            progress={batchState.progress}
            resultsCount={batchState.results.length}
            error={batchState.error}
            onAddFiles={handleBatchFilesAdded}
            onRemoveFile={handleBatchFileRemove}
            onOutputFilenameChange={handleBatchFilenameChange}
            onStart={handleStartBatch}
            onCancel={handleCancelBatch}
            onDownload={() => batchStore.downloadResults()}
          />
        {:else if ttsState.mode === 'custom-voice'}
          <CustomVoicePanel
            bind:text={localText}
            bind:language={localLanguage}
            bind:speaker={localSpeaker}
            bind:instruction={localInstruction}
            bind:seed={localSeed}
            hasTranslation={settingsStore.state.enableTranslation}
            {isTranslatingText}
            {textTranslationError}
            modelSupported={customVoiceModelSupported}
            modelLoading={ttsState.isLoadingModel}
            recommendedModelLabel={recommendedCustomModelLabel}
            currentModelId={ttsState.modelId}
            isGenerating={ttsState.isGenerating}
            {elapsedTime}
            onGenerate={handleGenerate}
            onTextChange={handleTextChange}
            onLanguageChange={handleLanguageChange}
            onSpeakerChange={handleSpeakerChange}
            onInstructionChange={handleInstructionChange}
            onSeedChange={handleSeedChange}
            onTranslateText={handleTranslateInputText}
            onLoadModel={handleLoadCustomVoiceModel}
          />
        {:else if ttsState.mode === 'voice-clone'}
          <VoiceClonePanel
            bind:text={localText}
            bind:language={localLanguage}
            bind:referenceText={localReferenceText}
            bind:seed={localSeed}
            {referenceAudioUrl}
            {referenceAudioBlob}
            modelSupported={voiceCloneModelSupported}
            modelLoading={ttsState.isLoadingModel}
            recommendedModelLabel={recommendedCloneModelLabel}
            recommendedModelHint={recommendedCloneHint}
            isGenerating={ttsState.isGenerating}
            {elapsedTime}
            hasWhisper={settingsStore.state.enableWhisper}
            hasTranslation={settingsStore.state.enableWhisper}
            canTranslateText={settingsStore.state.enableTranslation}
            {isTranscribing}
            {transcriptionError}
            {translationText}
            {translationError}
            {isTranslatingText}
            {textTranslationError}
            onGenerate={handleGenerate}
            onTextChange={handleTextChange}
            onLanguageChange={handleLanguageChange}
            onReferenceTextChange={handleReferenceTextChange}
            onReferenceAudioChange={handleReferenceAudioChange}
            onAutoTranscribe={handleAutoTranscribe}
            onUseTranslation={handleUseTranslationAsText}
            onTranslateText={handleTranslateInputText}
            onLowQualityModeChange={handleCloneQualityChange}
            onSeedChange={handleSeedChange}
            onLoadModel={handleLoadVoiceCloneModel}
          />
        {:else if ttsState.mode === 'voice-design'}
          <VoiceDesignPanel
            bind:text={localText}
            bind:language={localLanguage}
            bind:voiceDescription={localVoiceDescription}
            bind:seed={localSeed}
            hasTranslation={settingsStore.state.enableTranslation}
            {isTranslatingText}
            {textTranslationError}
            isGenerating={ttsState.isGenerating}
            {elapsedTime}
            modelLoaded={voiceDesignModelLoaded}
            modelLoading={ttsState.isLoadingModel}
            recommendedModelLabel={recommendedDesignModelLabel}
            onGenerate={handleGenerate}
            onLoadModel={handleLoadVoiceDesignModel}
            onTextChange={handleTextChange}
            onLanguageChange={handleLanguageChange}
            onDescriptionChange={handleDescriptionChange}
            onSeedChange={handleSeedChange}
            onTranslateText={handleTranslateInputText}
          />
        {/if}
      </div>
    {/snippet}

    {#snippet outputPanel()}
      {#if batchModeEnabled && batchMode}
        <div class="h-full flex flex-col justify-center">
          <div class="max-w-xl mx-auto w-full rounded-xl border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] p-6 space-y-4">
            <div>
              <h3 class="text-lg font-semibold text-[var(--color-text-primary)]">Batch Progress</h3>
              <p class="text-sm text-[var(--color-text-muted)] mt-1">
                {batchState.progress.completed}/{batchState.progress.total} completed
              </p>
            </div>

            <div class="h-2 rounded-full bg-[var(--color-bg-surface)] overflow-hidden">
              <div
                class="h-full bg-[var(--color-accent)] transition-all duration-300"
                style={`width: ${
                  batchState.progress.total > 0
                    ? Math.round((batchState.progress.completed / batchState.progress.total) * 100)
                    : 0
                }%`}
              ></div>
            </div>

            {#if batchState.progress.current_item}
              <p class="text-sm text-[var(--color-text-secondary)] truncate" title={batchState.progress.current_item}>
                Current: {batchState.progress.current_item}
              </p>
            {/if}

            <div class="flex items-center gap-2">
              <span class="inline-flex px-2 py-1 rounded-full text-xs bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] uppercase">
                {batchState.progress.status}
              </span>
              {#if batchState.results.length > 0}
                <button
                  class="px-3 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)]"
                  onclick={() => batchStore.downloadResults()}
                >
                  Download ZIP
                </button>
              {/if}
            </div>
          </div>
        </div>
      {:else}
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
      {/if}
    {/snippet}
  </Workspace>

  <!-- Save Notification Toast -->
  {#if saveNotification}
    <div
      class="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-lg transition-all
        {saveNotification.type === 'success'
          ? 'bg-emerald-500/90 text-white'
          : 'bg-red-500/90 text-white'}"
    >
      {saveNotification.message}
    </div>
  {/if}

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
  onUseVoice={async (id) => {
    const item = libraryStore.saved.find(i => i.id === id) ?? libraryStore.recent.find(i => i.id === id);
    if (!item) { libraryOpen = false; return; }

    // A clone that kept its reference recording is a reusable voice; load it as
    // one. Anything else just restores the settings it was generated with.
    if (item.type === 'clone' && await applyVoiceProfile(id)) {
      libraryOpen = false;
      return;
    }

    // Set mode from item type
    const modeMap = { clone: 'voice-clone', design: 'voice-design', audio: 'custom-voice' } as const;
    ttsStore.setMode(modeMap[item.type]);

    // Restore metadata. Only presets are valid speakers — a clone's stored
    // speaker may be a library id from before this was guarded.
    if (item.metadata?.speaker && PRESET_SPEAKERS.includes(item.metadata.speaker as Speaker)) {
      ttsStore.setSpeaker(item.metadata.speaker as Speaker);
    }
    if (item.metadata?.language) ttsStore.setLanguage(item.metadata.language);
    if (item.metadata?.voiceDescription) ttsStore.setVoiceDescription(item.metadata.voiceDescription);
    if (item.metadata?.referenceText) ttsStore.setReferenceText(item.metadata.referenceText);

    // Restore text from item name (truncated, but best we have)
    ttsStore.setText(item.name.replace(/\.\.\.$/,''));

    libraryOpen = false;
  }}
  onEditItem={startRename}
/>

<!-- Rename a library item -->
{#if renameTarget}
  <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
    <div class="w-80 rounded-xl bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] p-4 space-y-3">
      <p class="text-sm font-medium text-[var(--color-text-primary)]">Rename</p>
      <!-- svelte-ignore a11y_autofocus -->
      <input
        autofocus
        bind:value={renameTarget.name}
        onkeydown={(e) => {
          if (e.key === 'Enter') commitRename();
          if (e.key === 'Escape') renameTarget = null;
        }}
        class="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
      />
      <div class="flex justify-end gap-2">
        <button
          class="px-3 py-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          onclick={() => renameTarget = null}
        >
          Cancel
        </button>
        <button
          class="px-3 py-1.5 text-sm rounded-lg bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]"
          onclick={commitRename}
        >
          Save
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- Debug Console -->
<DebugConsole />

<!-- Settings Panel -->
<SettingsPanel />

<!-- Help Panel -->
<HelpPanel />
