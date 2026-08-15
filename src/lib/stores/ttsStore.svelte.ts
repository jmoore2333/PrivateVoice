/**
 * TTS application state store using Svelte 5 runes.
 */

import {
  ttsClient,
  isCancellation,
  GenerationTimeoutError,
  type Speaker,
  PRESET_SPEAKERS,
} from "$lib/api/ttsClient";
import { settingsStore } from "./settingsStore.svelte";

export type TTSMode = "custom-voice" | "voice-clone" | "voice-design";

// Model compatibility matrix
const MODEL_CAPABILITIES: Record<string, TTSMode[]> = {
  "0.6b": ["custom-voice"],
  "1.7b": ["custom-voice"],
  "0.6b-base": ["voice-clone"],
  "1.7b-base": ["voice-clone"],
  "1.7b-design": ["voice-design"],
};

export interface ModelOption {
  id: string;
  label: string;
  description: string;
  modes: TTSMode[];
}

export const MODEL_OPTIONS: ModelOption[] = [
  { id: "0.6b", label: "0.6B Custom", description: "Fast, Custom Voice", modes: ["custom-voice"] },
  { id: "1.7b", label: "1.7B Custom", description: "Quality, Custom Voice", modes: ["custom-voice"] },
  { id: "0.6b-base", label: "0.6B Base", description: "Voice Clone (fast)", modes: ["voice-clone"] },
  { id: "1.7b-base", label: "1.7B Base", description: "Voice Clone (quality)", modes: ["voice-clone"] },
  { id: "1.7b-design", label: "1.7B Design", description: "Voice Design", modes: ["voice-design"] },
];

// Get the recommended model for a mode
function getRecommendedModel(mode: TTSMode): string {
  switch (mode) {
    case "voice-design":
      return "1.7b-design";
    case "voice-clone":
      return "0.6b-base";
    case "custom-voice":
    default:
      return "0.6b";
  }
}

// Check if a model supports a mode
function modelSupportsMode(modelId: string | null, mode: TTSMode): boolean {
  if (!modelId) return false;
  const capabilities = MODEL_CAPABILITIES[modelId];
  return capabilities?.includes(mode) ?? false;
}

export interface TTSState {
  // Server state
  serverConnected: boolean;
  modelLoaded: boolean;
  modelId: string | null;
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
      state.modelId = status.model_id;
      state.device = status.device;
    } catch {
      state.modelLoaded = false;
    }
  }

  async function loadModel(modelId: string = "0.6b") {
    state.isLoadingModel = true;
    state.error = null;
    try {
      await ttsClient.loadModel(modelId);
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
      const recommended = getRecommendedModel(state.mode);
      const recommendedLabel =
        MODEL_OPTIONS.find((model) => model.id === recommended)?.label ??
        recommended.toUpperCase();
      const modeName = state.mode.replace("-", " ");
      state.error = `Current model doesn't support ${modeName}. Please load the ${recommendedLabel} model.`;
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
      let blob: Blob;
      const language = state.language.toLowerCase();
      const format = settingsStore.state.exportFormat || "wav";
      const sampleRate = format === "wav" ? settingsStore.state.wavSampleRate : null;
      const bitDepth = format === "wav" ? settingsStore.state.wavBitDepth : 16;

      switch (state.mode) {
        case "custom-voice":
          const speakerId = state.speaker.trim().split(/\s+/)[0];
          // Preset speakers are the only voices Custom Voice can render. A
          // non-preset value means a saved clone leaked in from the Voice
          // picker, so point the user at the mode that can actually use it.
          if (!PRESET_SPEAKERS.includes(speakerId as Speaker)) {
            throw new Error(
              "That saved voice can't be used in Custom Voice. Pick it under Voice → Saved to load it in Voice Clone mode."
            );
          }
          blob = await ttsClient.generateCustomVoice({
            text: state.text,
            speaker: speakerId,
            instruction: state.instruction,
            language,
            format,
            stable_lead_in: settingsStore.state.stableCustomVoiceLeadIn,
            seed: state.seed,
            sample_rate: sampleRate,
            bit_depth: bitDepth,
          });
          break;

        case "voice-clone":
          if (!state.referenceAudio) {
            throw new Error("Please upload a reference audio file");
          }
          if (!state.cloneLowQualityMode && !state.referenceText.trim()) {
            throw new Error("Please enter the reference text");
          }
          blob = await ttsClient.generateVoiceClone(
            state.text,
            state.referenceText,
            state.referenceAudio,
            {
              xVectorOnly: state.cloneLowQualityMode,
              language,
              format,
              seed: state.seed,
              sample_rate: sampleRate,
              bit_depth: bitDepth,
            }
          );
          break;

        case "voice-design":
          if (!state.voiceDescription.trim()) {
            throw new Error("Please enter a voice description");
          }
          blob = await ttsClient.generateVoiceDesign({
            text: state.text,
            voice_description: state.voiceDescription,
            language,
            format,
            stable_lead_in: settingsStore.state.stableVoiceDesignLeadIn,
            seed: state.seed,
            sample_rate: sampleRate,
            bit_depth: bitDepth,
          });
          break;
      }

      state.audioBlob = blob;
      state.audioUrl = URL.createObjectURL(blob);
    } catch (e) {
      if (isCancellation(e)) {
        // User-initiated stop. Issue #13: the old check only matched a
        // DOMException, but the client aborted with a string, so cancelling
        // raised a false "Generation failed" banner every time.
        console.debug("[generate] cancelled by user");
      } else if (e instanceof GenerationTimeoutError) {
        state.error = `${e.message}. Try shorter text, or a smaller model — CPU-only machines are much slower.`;
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
