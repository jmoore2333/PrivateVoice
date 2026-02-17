/**
 * TTS application state store using Svelte 5 runes.
 */

import {
  ttsClient,
  type ProviderId,
  type Speaker,
  type ModelCatalogEntry,
  PRESET_SPEAKERS,
} from "$lib/api/ttsClient";
import { settingsStore } from "./settingsStore.svelte";

export type TTSMode = "custom-voice" | "voice-clone" | "voice-design";

export interface ModelOption {
  id: string;
  provider: ProviderId;
  modelKey: string;
  label: string;
  description: string;
  modes: TTSMode[];
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "0.6b",
    provider: "qwen3",
    modelKey: "0.6b",
    label: "Qwen 0.6B Custom",
    description: "Fast, Custom Voice",
    modes: ["custom-voice"],
  },
  {
    id: "1.7b",
    provider: "qwen3",
    modelKey: "1.7b",
    label: "Qwen 1.7B Custom",
    description: "Higher quality, Custom Voice",
    modes: ["custom-voice"],
  },
  {
    id: "0.6b-base",
    provider: "qwen3",
    modelKey: "0.6b-base",
    label: "Qwen 0.6B Base",
    description: "Voice Clone (fast)",
    modes: ["voice-clone"],
  },
  {
    id: "1.7b-base",
    provider: "qwen3",
    modelKey: "1.7b-base",
    label: "Qwen 1.7B Base",
    description: "Voice Clone (quality)",
    modes: ["voice-clone"],
  },
  {
    id: "1.7b-design",
    provider: "qwen3",
    modelKey: "1.7b-design",
    label: "Qwen 1.7B Design",
    description: "Voice Design",
    modes: ["voice-design"],
  },
  {
    id: "cb-turbo",
    provider: "chatterbox",
    modelKey: "turbo",
    label: "Chatterbox Turbo",
    description: "English, low-latency, tag-aware",
    modes: ["custom-voice", "voice-clone"],
  },
  {
    id: "cb-original",
    provider: "chatterbox",
    modelKey: "original",
    label: "Chatterbox Original",
    description: "English expressive model",
    modes: ["custom-voice", "voice-clone"],
  },
  {
    id: "cb-multilingual",
    provider: "chatterbox",
    modelKey: "multilingual",
    label: "Chatterbox Multilingual",
    description: "23+ languages",
    modes: ["custom-voice", "voice-clone"],
  },
];

const MODEL_BY_ID = new Map(MODEL_OPTIONS.map((m) => [m.id, m]));
const MODEL_BY_PROVIDER_KEY = new Map(MODEL_OPTIONS.map((m) => [`${m.provider}:${m.modelKey}`, m]));
const RUNTIME_MODEL_CAPABILITIES = new Map<string, TTSMode[]>();
let runtimeCatalogLoaded = false;

function syncCatalogCapabilities(entries: ModelCatalogEntry[]): void {
  RUNTIME_MODEL_CAPABILITIES.clear();
  for (const entry of entries) {
    const model = MODEL_BY_PROVIDER_KEY.get(`${entry.provider}:${entry.model_key}`);
    if (!model) continue;
    const modes = entry.capabilities.filter((cap): cap is TTSMode =>
      cap === "custom-voice" || cap === "voice-clone" || cap === "voice-design"
    );
    if (modes.length > 0) {
      RUNTIME_MODEL_CAPABILITIES.set(model.id, modes);
    }
  }
}

// Model compatibility matrix (exported for existing tests/UI usage)
const MODEL_CAPABILITIES: Record<string, TTSMode[]> = Object.fromEntries(
  MODEL_OPTIONS.map((m) => [m.id, m.modes])
);

function getRecommendedModelForProvider(mode: TTSMode, provider: ProviderId): string {
  const preferredOrder: Record<ProviderId, string[]> = {
    qwen3: ["0.6b", "1.7b", "0.6b-base", "1.7b-base", "1.7b-design"],
    chatterbox: ["cb-turbo", "cb-original", "cb-multilingual"],
  };

  for (const modelId of preferredOrder[provider]) {
    const model = MODEL_BY_ID.get(modelId);
    if (model?.modes.includes(mode)) return modelId;
  }

  // Fallback to a Qwen-safe default
  return mode === "voice-design" ? "1.7b-design" : mode === "voice-clone" ? "0.6b-base" : "0.6b";
}

// Get the recommended model for a mode (legacy export remains Qwen-first)
function getRecommendedModel(mode: TTSMode): string {
  return getRecommendedModelForProvider(mode, "qwen3");
}

// Check if a model supports a mode
function modelSupportsMode(modelId: string | null, mode: TTSMode): boolean {
  if (!modelId) return false;
  const runtimeModes = RUNTIME_MODEL_CAPABILITIES.get(modelId);
  if (runtimeModes) return runtimeModes.includes(mode);
  const model = MODEL_BY_ID.get(modelId);
  return model?.modes.includes(mode) ?? false;
}

function isChatterboxModel(modelId: string | null): boolean {
  if (!modelId) return false;
  const model = MODEL_BY_ID.get(modelId);
  return model?.provider === "chatterbox";
}

function inferProviderFromModelId(modelId: string | null): ProviderId {
  if (!modelId) return "qwen3";
  return isChatterboxModel(modelId) ? "chatterbox" : "qwen3";
}

function inferModelId(provider: ProviderId | null | undefined, modelKey: string | null | undefined, modelId: string | null): string | null {
  if (modelId) return modelId;
  if (!provider || !modelKey) return null;
  return MODEL_BY_PROVIDER_KEY.get(`${provider}:${modelKey}`)?.id ?? null;
}

function getChatterboxAdvancedPayload() {
  const state = settingsStore.state as typeof settingsStore.state & {
    chatterboxPreset?: "stable" | "balanced" | "expressive";
    chatterboxTemperature?: number;
    chatterboxTopP?: number;
    chatterboxTopK?: number;
    chatterboxMinP?: number;
    chatterboxRepetitionPenalty?: number;
    chatterboxCfgWeight?: number;
    chatterboxExaggeration?: number;
    chatterboxNormLoudness?: boolean;
    chatterboxLanguageId?: string;
  };

  return {
    preset: state.chatterboxPreset ?? "balanced",
    temperature: state.chatterboxTemperature ?? 0.8,
    top_p: state.chatterboxTopP ?? 0.95,
    top_k: state.chatterboxTopK ?? 1000,
    min_p: state.chatterboxMinP ?? 0.05,
    repetition_penalty: state.chatterboxRepetitionPenalty ?? 1.2,
    cfg_weight: state.chatterboxCfgWeight ?? 0.5,
    exaggeration: state.chatterboxExaggeration ?? 0.5,
    norm_loudness: state.chatterboxNormLoudness ?? true,
    language_id: state.chatterboxLanguageId ?? "en",
  };
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function ensureProviderRuntime(provider: ProviderId): Promise<void> {
  if (provider !== "chatterbox") return;

  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<{ installed?: boolean; restart_required?: boolean; message?: string }>(
      "ensure_provider_runtime",
      { provider }
    );

    if (result?.restart_required) {
      const shouldRestart = window.confirm(
        result.message ??
          "Chatterbox runtime was installed and PrivateVoice needs to restart the backend sidecar. Restart now?"
      );
      if (!shouldRestart) {
        throw new Error("Chatterbox runtime installed. Restart required before loading the model.");
      }
      await invoke("start_tts_server");
    }
  } catch (e) {
    // In browser/non-tauri tests this command won't exist — fail open.
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("not allowed") || message.includes("command") || message.includes("Unknown")) {
      return;
    }
    throw e;
  }
}

export interface TTSState {
  // Server state
  serverConnected: boolean;
  modelLoaded: boolean;
  modelId: string | null;
  modelProvider: ProviderId | null;
  modelKey: string | null;
  device: string | null;

  // UI state
  mode: TTSMode;
  text: string;
  language: string;
  speaker: Speaker;
  instruction: string;
  voiceDescription: string;
  seed: number | null;

  // Voice clone
  referenceAudio: File | null;
  referenceText: string;
  cloneLowQualityMode: boolean;

  // Audio output
  audioUrl: string | null;
  audioBlob: Blob | null;

  // Loading states
  isGenerating: boolean;
  isLoadingModel: boolean;
  error: string | null;
}

function createTTSStore() {
  let state = $state<TTSState>({
    serverConnected: false,
    modelLoaded: false,
    modelId: null,
    modelProvider: null,
    modelKey: null,
    device: null,
    mode: "custom-voice",
    text: "",
    language: "English",
    speaker: "aiden",
    instruction: "",
    voiceDescription: "",
    seed: null,
    referenceAudio: null,
    referenceText: "",
    cloneLowQualityMode: false,
    audioUrl: null,
    audioBlob: null,
    isGenerating: false,
    isLoadingModel: false,
    error: null,
  });

  async function checkServerHealth() {
    try {
      await ttsClient.health();
      state.serverConnected = true;
      if (!runtimeCatalogLoaded) {
        try {
          const catalog = await ttsClient.getModelCatalog();
          syncCatalogCapabilities(catalog);
          runtimeCatalogLoaded = true;
        } catch {
          // Fallback to static compatibility map.
        }
      }
      await refreshModelStatus();
    } catch {
      state.serverConnected = false;
      state.modelLoaded = false;
    }
  }

  async function refreshModelStatus() {
    try {
      const status = await ttsClient.getModelStatus();
      state.modelLoaded = status.loaded;
      state.modelProvider = status.provider ?? inferProviderFromModelId(status.model_id);
      state.modelKey = status.model_key ?? status.model_id;
      state.modelId = inferModelId(state.modelProvider, state.modelKey, status.model_id);
      state.device = status.device;
    } catch {
      state.modelLoaded = false;
    }
  }

  async function loadModel(modelId: string = "0.6b") {
    state.isLoadingModel = true;
    state.error = null;
    try {
      const option = MODEL_BY_ID.get(modelId);
      if (option) {
        await ensureProviderRuntime(option.provider);
        if (option.provider === "qwen3") {
          await ttsClient.loadModel({ model_id: option.modelKey });
        } else {
          await ttsClient.loadModel({ provider: option.provider, model_key: option.modelKey });
        }
      } else {
        await ttsClient.loadModel({ model_id: modelId });
      }
      await refreshModelStatus();
    } catch (e) {
      state.error = e instanceof Error ? e.message : "Failed to load model";
    } finally {
      state.isLoadingModel = false;
    }
  }

  async function generate() {
    if (!state.text.trim()) {
      state.error = "Please enter some text";
      return;
    }

    // Check model compatibility with current mode
    if (!modelSupportsMode(state.modelId, state.mode)) {
      const activeProvider = state.modelProvider ?? "qwen3";
      const fallbackProvider =
        activeProvider === "chatterbox" && state.mode === "voice-design" ? "qwen3" : activeProvider;
      const recommended = getRecommendedModelForProvider(state.mode, fallbackProvider);
      const recommendedLabel = MODEL_BY_ID.get(recommended)?.label ?? recommended.toUpperCase();
      const modeName = state.mode.replace("-", " ");
      state.error = `Current model doesn't support ${modeName}. Please load ${recommendedLabel}.`;
      return;
    }

    state.isGenerating = true;
    state.error = null;

    // Clear previous audio
    if (state.audioUrl) {
      URL.revokeObjectURL(state.audioUrl);
      state.audioUrl = null;
    }

    try {
      const language = state.language.toLowerCase();
      const format = settingsStore.state.exportFormat || "wav";
      const sampleRate = format === "wav" ? settingsStore.state.wavSampleRate : null;
      const bitDepth = format === "wav" ? settingsStore.state.wavBitDepth : 16;

      const provider = state.modelProvider ?? inferProviderFromModelId(state.modelId);
      const modelKey = state.modelKey;

      const payload: {
        mode: TTSMode;
        provider?: ProviderId;
        model_key?: string;
        text: string;
        language: string;
        speaker: string;
        instruction: string;
        voice_description: string;
        reference_text: string;
        x_vector_only_mode: boolean;
        reference_audio_base64: string | null;
        format: string;
        stable_lead_in: boolean;
        seed: number | null;
        sample_rate: number | null;
        bit_depth: number;
        advanced?: Record<string, unknown>;
      } = {
        mode: state.mode,
        provider,
        model_key: modelKey ?? undefined,
        text: state.text,
        language,
        speaker: state.speaker.trim().split(/\s+/)[0],
        instruction: state.instruction,
        voice_description: state.voiceDescription,
        reference_text: state.referenceText,
        x_vector_only_mode: state.cloneLowQualityMode,
        reference_audio_base64: null,
        format,
        stable_lead_in:
          state.mode === "voice-design"
            ? settingsStore.state.stableVoiceDesignLeadIn
            : settingsStore.state.stableCustomVoiceLeadIn,
        seed: state.seed,
        sample_rate: sampleRate,
        bit_depth: bitDepth,
      };

      if (state.mode === "custom-voice") {
        if (provider === "qwen3") {
          const speakerId = payload.speaker;
          if (!PRESET_SPEAKERS.includes(speakerId as Speaker)) {
            throw new Error(`Unknown speaker: ${speakerId}`);
          }
        }
      } else if (state.mode === "voice-clone") {
        if (!state.referenceAudio) {
          throw new Error("Please upload a reference audio file");
        }
        if (provider === "qwen3" && !state.cloneLowQualityMode && !state.referenceText.trim()) {
          throw new Error("Please enter the reference text");
        }
        payload.reference_audio_base64 = await fileToBase64(state.referenceAudio);
      } else if (state.mode === "voice-design") {
        if (!state.voiceDescription.trim()) {
          throw new Error("Please enter a voice description");
        }
      }

      if (provider === "chatterbox") {
        payload.advanced = getChatterboxAdvancedPayload();
      }

      const blob = await ttsClient.generateSpeech(payload);
      state.audioBlob = blob;
      state.audioUrl = URL.createObjectURL(blob);
    } catch (e) {
      // Don't show error for user-initiated cancellation
      if (e instanceof DOMException && e.name === "AbortError") {
        console.debug("[generate] AbortError (cancelled):", (e as DOMException).message);
      } else {
        const msg = e instanceof Error ? e.message : "Generation failed";
        console.error("[generate] Error:", e);
        state.error = msg;
      }
    } finally {
      state.isGenerating = false;
    }
  }

  function abortGeneration() {
    ttsClient.abortGeneration();
  }

  function setMode(mode: TTSMode) {
    state.mode = mode;

    // Clear output from previous mode
    if (state.audioUrl) {
      URL.revokeObjectURL(state.audioUrl);
      state.audioUrl = null;
    }
    state.audioBlob = null;
    state.error = null;
  }

  function setText(text: string) {
    state.text = text;
  }

  function setLanguage(language: string) {
    state.language = language;
  }

  function setSpeaker(speaker: Speaker) {
    state.speaker = speaker;
  }

  function setInstruction(instruction: string) {
    state.instruction = instruction;
  }

  function setVoiceDescription(description: string) {
    state.voiceDescription = description;
  }

  function setSeed(seed: number | null) {
    state.seed = seed;
  }

  function setReferenceAudio(file: File | null) {
    state.referenceAudio = file;
  }

  function setReferenceText(text: string) {
    state.referenceText = text;
  }

  function setCloneLowQualityMode(enabled: boolean) {
    state.cloneLowQualityMode = enabled;
  }

  function clearError() {
    state.error = null;
  }

  function generateFilename(): string {
    const modeNames: Record<TTSMode, string> = {
      "custom-voice": "CustomVoice",
      "voice-clone": "VoiceClone",
      "voice-design": "VoiceDesign",
    };
    const modeName = modeNames[state.mode];
    const now = new Date();
    const datestamp = now.toISOString().slice(0, 10);
    const timestamp = now.toTimeString().slice(0, 8).replace(/:/g, "");
    const format = settingsStore.state.exportFormat || "wav";
    return `PrivateVoice_${modeName}_${datestamp}_${timestamp}.${format}`;
  }

  async function downloadAudio() {
    if (!state.audioBlob) return;

    const filename = generateFilename();

    // Try native save dialog (Tauri)
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeFile } = await import("@tauri-apps/plugin-fs");

      const defaultPath = settingsStore.state.exportFolder
        ? `${settingsStore.state.exportFolder}/${filename}`
        : filename;

      const format = settingsStore.state.exportFormat || "wav";
      const filterName = format === "mp3" ? "MP3 Audio" : "WAV Audio";
      const filePath = await save({
        defaultPath,
        filters: [{ name: filterName, extensions: [format] }],
      });

      if (filePath) {
        const arrayBuffer = await state.audioBlob.arrayBuffer();
        await writeFile(filePath, new Uint8Array(arrayBuffer));
      }
      return;
    } catch {
      // Not in Tauri or plugin unavailable — fall back to browser download
    }

    // Browser fallback
    const a = document.createElement("a");
    a.href = state.audioUrl!;
    a.download = filename;
    a.click();
  }

  return {
    get state() {
      return state;
    },
    checkServerHealth,
    refreshModelStatus,
    loadModel,
    generate,
    abortGeneration,
    setMode,
    setText,
    setLanguage,
    setSpeaker,
    setInstruction,
    setVoiceDescription,
    setSeed,
    setReferenceAudio,
    setReferenceText,
    setCloneLowQualityMode,
    clearError,
    downloadAudio,
  };
}

export const ttsStore = createTTSStore();

// Export helpers for UI compatibility checks
export { MODEL_CAPABILITIES, getRecommendedModel, modelSupportsMode };
