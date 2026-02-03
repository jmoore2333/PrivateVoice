/**
 * TTS application state store using Svelte 5 runes.
 */

import { ttsClient, type ModelStatus, type Speaker, PRESET_SPEAKERS } from "$lib/api/ttsClient";
import { settingsStore } from "./settingsStore.svelte";

export type TTSMode = "custom-voice" | "voice-clone" | "voice-design";

// Model compatibility matrix
const MODEL_CAPABILITIES: Record<string, TTSMode[]> = {
  "0.6b": ["custom-voice", "voice-clone"],
  "1.7b": ["custom-voice", "voice-clone"],
  "1.7b-design": ["voice-design"],
};

// Get the recommended model for a mode
function getRecommendedModel(mode: TTSMode): string {
  switch (mode) {
    case "voice-design":
      return "1.7b-design";
    case "custom-voice":
    case "voice-clone":
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
  speaker: Speaker;
  instruction: string;
  voiceDescription: string;

  // Voice clone
  referenceAudio: File | null;
  referenceText: string;

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
    speaker: "aiden",
    instruction: "",
    voiceDescription: "",
    referenceAudio: null,
    referenceText: "",
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
      const modeName = state.mode.replace("-", " ");
      state.error = `Current model doesn't support ${modeName}. Please load the ${recommended.toUpperCase()} model.`;
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

      switch (state.mode) {
        case "custom-voice":
          blob = await ttsClient.generateCustomVoice({
            text: state.text,
            speaker: state.speaker,
            instruction: state.instruction,
          });
          break;

        case "voice-clone":
          if (!state.referenceAudio) {
            throw new Error("Please upload a reference audio file");
          }
          if (!state.referenceText.trim()) {
            throw new Error("Please enter the reference text");
          }
          blob = await ttsClient.generateVoiceClone(
            state.text,
            state.referenceText,
            state.referenceAudio
          );
          break;

        case "voice-design":
          if (!state.voiceDescription.trim()) {
            throw new Error("Please enter a voice description");
          }
          blob = await ttsClient.generateVoiceDesign({
            text: state.text,
            voice_description: state.voiceDescription,
          });
          break;
      }

      state.audioBlob = blob;
      state.audioUrl = URL.createObjectURL(blob);
    } catch (e) {
      state.error = e instanceof Error ? e.message : "Generation failed";
    } finally {
      state.isGenerating = false;
    }
  }

  function setMode(mode: TTSMode) {
    state.mode = mode;
  }

  function setText(text: string) {
    state.text = text;
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

  function setReferenceAudio(file: File | null) {
    state.referenceAudio = file;
  }

  function setReferenceText(text: string) {
    state.referenceText = text;
  }

  function clearError() {
    state.error = null;
  }

  function downloadAudio() {
    if (!state.audioBlob) return;

    // Generate filename: PrivateVoice_ModeName_YYYY-MM-DD_HHMMSS.format
    const modeNames: Record<TTSMode, string> = {
      "custom-voice": "CustomVoice",
      "voice-clone": "VoiceClone",
      "voice-design": "VoiceDesign",
    };
    const modeName = modeNames[state.mode];
    const now = new Date();
    const datestamp = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const timestamp = now.toTimeString().slice(0, 8).replace(/:/g, ""); // HHMMSS

    // Get format from settings (currently only WAV is supported by backend)
    const format = settingsStore.state.exportFormat || "wav";
    const filename = `PrivateVoice_${modeName}_${datestamp}_${timestamp}.${format}`;

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
    setMode,
    setText,
    setSpeaker,
    setInstruction,
    setVoiceDescription,
    setReferenceAudio,
    setReferenceText,
    clearError,
    downloadAudio,
  };
}

export const ttsStore = createTTSStore();

// Export helpers for UI compatibility checks
export { MODEL_CAPABILITIES, getRecommendedModel, modelSupportsMode };
