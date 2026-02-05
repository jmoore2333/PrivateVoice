import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock ttsClient before importing the store (must be hoisted)
vi.mock("$lib/api/ttsClient", () => {
  return {
    ttsClient: {
      health: vi.fn(),
      getModelStatus: vi.fn(),
      loadModel: vi.fn(),
      generateCustomVoice: vi.fn(),
      generateVoiceClone: vi.fn(),
      generateVoiceDesign: vi.fn(),
      abortGeneration: vi.fn(),
    },
    PRESET_SPEAKERS: [
      "aiden",
      "dylan",
      "eric",
      "ono_anna",
      "ryan",
      "serena",
      "sohee",
      "uncle_fu",
      "vivian",
    ] as const,
  };
});

// Import after mock setup
import { ttsStore, MODEL_OPTIONS, MODEL_CAPABILITIES, getRecommendedModel, modelSupportsMode } from "./ttsStore.svelte";
import { ttsClient } from "$lib/api/ttsClient";
import type { TTSMode } from "./ttsStore.svelte";

// Stub URL.createObjectURL and URL.revokeObjectURL for jsdom
globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-url");
globalThis.URL.revokeObjectURL = vi.fn();

describe("ttsStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset store state to defaults between tests
    ttsStore.setMode("custom-voice");
    ttsStore.setText("");
    ttsStore.setLanguage("English");
    ttsStore.setSpeaker("aiden");
    ttsStore.setInstruction("");
    ttsStore.setVoiceDescription("");
    ttsStore.setReferenceAudio(null);
    ttsStore.setReferenceText("");
    ttsStore.setCloneLowQualityMode(false);
    ttsStore.clearError();
  });

  // ==========================================================================
  // 1. Initial state values
  // ==========================================================================
  describe("initial state", () => {
    it("has correct default server state", () => {
      // Note: since ttsStore is a singleton, serverConnected may have been
      // mutated by prior tests. We test the shape and type of the fields.
      expect(ttsStore.state).toHaveProperty("serverConnected");
      expect(ttsStore.state).toHaveProperty("modelLoaded");
      expect(ttsStore.state).toHaveProperty("modelId");
      expect(ttsStore.state).toHaveProperty("device");
    });

    it("has correct default UI state after reset", () => {
      expect(ttsStore.state.mode).toBe("custom-voice");
      expect(ttsStore.state.text).toBe("");
      expect(ttsStore.state.language).toBe("English");
      expect(ttsStore.state.speaker).toBe("aiden");
      expect(ttsStore.state.instruction).toBe("");
      expect(ttsStore.state.voiceDescription).toBe("");
    });

    it("has correct default voice clone state", () => {
      expect(ttsStore.state.referenceAudio).toBeNull();
      expect(ttsStore.state.referenceText).toBe("");
      expect(ttsStore.state.cloneLowQualityMode).toBe(false);
    });

    it("has correct default audio output state", () => {
      expect(ttsStore.state.audioUrl).toBeNull();
      expect(ttsStore.state.audioBlob).toBeNull();
    });

    it("has correct default loading states", () => {
      expect(ttsStore.state.isGenerating).toBe(false);
      expect(ttsStore.state.isLoadingModel).toBe(false);
      expect(ttsStore.state.error).toBeNull();
    });
  });

  // ==========================================================================
  // 2. generate() validation
  // ==========================================================================
  describe("generate() validation", () => {
    it("shows error when text is empty", async () => {
      ttsStore.setText("");
      await ttsStore.generate();
      expect(ttsStore.state.error).toBe("Please enter some text");
      expect(ttsStore.state.isGenerating).toBe(false);
    });

    it("shows error when text is only whitespace", async () => {
      ttsStore.setText("   \n\t  ");
      await ttsStore.generate();
      expect(ttsStore.state.error).toBe("Please enter some text");
    });

    it("shows error when model does not support current mode (custom-voice with base model)", async () => {
      ttsStore.setText("Hello world");
      ttsStore.setMode("custom-voice");

      // Simulate a base model loaded (only supports voice-clone)
      // We need to set modelId on the state via checkServerHealth or loadModel
      vi.mocked(ttsClient.getModelStatus).mockResolvedValue({
        loaded: true,
        model_id: "0.6b-base",
        device: "mps",
        memory: { device: "mps", total_gb: 16, available_gb: 8 },
      });
      vi.mocked(ttsClient.health).mockResolvedValue({ status: "ok", version: "1.0" });
      await ttsStore.checkServerHealth();

      await ttsStore.generate();
      expect(ttsStore.state.error).toContain("doesn't support custom voice");
      expect(ttsStore.state.error).toContain("0.6B Custom");
    });

    it("shows error when model does not support voice-clone mode", async () => {
      ttsStore.setText("Hello world");
      ttsStore.setMode("voice-clone");

      // Load a custom-voice model
      vi.mocked(ttsClient.getModelStatus).mockResolvedValue({
        loaded: true,
        model_id: "0.6b",
        device: "mps",
        memory: { device: "mps", total_gb: 16, available_gb: 8 },
      });
      vi.mocked(ttsClient.health).mockResolvedValue({ status: "ok", version: "1.0" });
      await ttsStore.checkServerHealth();

      await ttsStore.generate();
      expect(ttsStore.state.error).toContain("doesn't support voice clone");
      expect(ttsStore.state.error).toContain("0.6B Base");
    });

    it("shows error when model does not support voice-design mode", async () => {
      ttsStore.setText("Hello world");
      ttsStore.setMode("voice-design");

      vi.mocked(ttsClient.getModelStatus).mockResolvedValue({
        loaded: true,
        model_id: "1.7b",
        device: "mps",
        memory: { device: "mps", total_gb: 16, available_gb: 8 },
      });
      vi.mocked(ttsClient.health).mockResolvedValue({ status: "ok", version: "1.0" });
      await ttsStore.checkServerHealth();

      await ttsStore.generate();
      expect(ttsStore.state.error).toContain("doesn't support voice design");
      expect(ttsStore.state.error).toContain("1.7B Design");
    });

    it("shows error when no model is loaded (modelId is null)", async () => {
      ttsStore.setText("Hello world");

      // Simulate no model loaded
      vi.mocked(ttsClient.getModelStatus).mockResolvedValue({
        loaded: false,
        model_id: null,
        device: null,
        memory: { device: "mps", total_gb: 16, available_gb: 8 },
      });
      vi.mocked(ttsClient.health).mockResolvedValue({ status: "ok", version: "1.0" });
      await ttsStore.checkServerHealth();

      await ttsStore.generate();
      expect(ttsStore.state.error).toContain("doesn't support");
    });

    it("shows error when voice-clone has no reference audio", async () => {
      ttsStore.setText("Hello world");
      ttsStore.setMode("voice-clone");
      ttsStore.setReferenceAudio(null);
      ttsStore.setReferenceText("Reference transcript");

      // Load a compatible model
      vi.mocked(ttsClient.getModelStatus).mockResolvedValue({
        loaded: true,
        model_id: "0.6b-base",
        device: "mps",
        memory: { device: "mps", total_gb: 16, available_gb: 8 },
      });
      vi.mocked(ttsClient.health).mockResolvedValue({ status: "ok", version: "1.0" });
      await ttsStore.checkServerHealth();

      vi.mocked(ttsClient.generateVoiceClone).mockRejectedValue(
        new Error("Please upload a reference audio file")
      );

      await ttsStore.generate();
      expect(ttsStore.state.error).toBe("Please upload a reference audio file");
      expect(ttsStore.state.isGenerating).toBe(false);
    });

    it("shows error when voice-clone has no reference text (high quality mode)", async () => {
      ttsStore.setText("Hello world");
      ttsStore.setMode("voice-clone");
      ttsStore.setReferenceAudio(new File(["audio"], "test.wav", { type: "audio/wav" }));
      ttsStore.setReferenceText("");
      ttsStore.setCloneLowQualityMode(false);

      // Load a compatible model
      vi.mocked(ttsClient.getModelStatus).mockResolvedValue({
        loaded: true,
        model_id: "0.6b-base",
        device: "mps",
        memory: { device: "mps", total_gb: 16, available_gb: 8 },
      });
      vi.mocked(ttsClient.health).mockResolvedValue({ status: "ok", version: "1.0" });
      await ttsStore.checkServerHealth();

      await ttsStore.generate();
      expect(ttsStore.state.error).toBe("Please enter the reference text");
      expect(ttsStore.state.isGenerating).toBe(false);
    });

    it("shows error when voice-design has empty description", async () => {
      ttsStore.setText("Hello world");
      ttsStore.setMode("voice-design");
      ttsStore.setVoiceDescription("");

      // Load design model
      vi.mocked(ttsClient.getModelStatus).mockResolvedValue({
        loaded: true,
        model_id: "1.7b-design",
        device: "mps",
        memory: { device: "mps", total_gb: 16, available_gb: 8 },
      });
      vi.mocked(ttsClient.health).mockResolvedValue({ status: "ok", version: "1.0" });
      await ttsStore.checkServerHealth();

      await ttsStore.generate();
      expect(ttsStore.state.error).toBe("Please enter a voice description");
      expect(ttsStore.state.isGenerating).toBe(false);
    });
  });

  // ==========================================================================
  // generate() success paths
  // ==========================================================================
  describe("generate() success paths", () => {
    it("generates custom voice audio successfully", async () => {
      const mockBlob = new Blob(["audio-data"], { type: "audio/wav" });

      // Setup: compatible model loaded
      vi.mocked(ttsClient.getModelStatus).mockResolvedValue({
        loaded: true,
        model_id: "0.6b",
        device: "mps",
        memory: { device: "mps", total_gb: 16, available_gb: 8 },
      });
      vi.mocked(ttsClient.health).mockResolvedValue({ status: "ok", version: "1.0" });
      await ttsStore.checkServerHealth();

      vi.mocked(ttsClient.generateCustomVoice).mockResolvedValue(mockBlob);

      ttsStore.setText("Hello world");
      ttsStore.setSpeaker("aiden");
      await ttsStore.generate();

      expect(ttsStore.state.error).toBeNull();
      expect(ttsStore.state.isGenerating).toBe(false);
      expect(ttsStore.state.audioBlob).toBe(mockBlob);
      expect(ttsStore.state.audioUrl).toBe("blob:mock-url");
      expect(ttsClient.generateCustomVoice).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "Hello world",
          speaker: "aiden",
          language: "english",
        })
      );
    });

    it("generates voice clone audio successfully (low quality mode bypasses reference text)", async () => {
      const mockBlob = new Blob(["cloned-audio"], { type: "audio/wav" });
      const refFile = new File(["ref-audio"], "reference.wav", { type: "audio/wav" });

      vi.mocked(ttsClient.getModelStatus).mockResolvedValue({
        loaded: true,
        model_id: "0.6b-base",
        device: "mps",
        memory: { device: "mps", total_gb: 16, available_gb: 8 },
      });
      vi.mocked(ttsClient.health).mockResolvedValue({ status: "ok", version: "1.0" });
      await ttsStore.checkServerHealth();

      vi.mocked(ttsClient.generateVoiceClone).mockResolvedValue(mockBlob);

      ttsStore.setMode("voice-clone");
      ttsStore.setText("Clone this");
      ttsStore.setReferenceAudio(refFile);
      ttsStore.setReferenceText(""); // Empty text but low quality mode
      ttsStore.setCloneLowQualityMode(true);

      await ttsStore.generate();

      expect(ttsStore.state.error).toBeNull();
      expect(ttsStore.state.audioBlob).toBe(mockBlob);
      expect(ttsClient.generateVoiceClone).toHaveBeenCalledWith(
        "Clone this",
        "",
        refFile,
        expect.objectContaining({ xVectorOnly: true })
      );
    });

    it("generates voice design audio successfully", async () => {
      const mockBlob = new Blob(["designed-audio"], { type: "audio/wav" });

      vi.mocked(ttsClient.getModelStatus).mockResolvedValue({
        loaded: true,
        model_id: "1.7b-design",
        device: "mps",
        memory: { device: "mps", total_gb: 16, available_gb: 8 },
      });
      vi.mocked(ttsClient.health).mockResolvedValue({ status: "ok", version: "1.0" });
      await ttsStore.checkServerHealth();

      vi.mocked(ttsClient.generateVoiceDesign).mockResolvedValue(mockBlob);

      ttsStore.setMode("voice-design");
      ttsStore.setText("Designed speech");
      ttsStore.setVoiceDescription("A warm, deep male voice");

      await ttsStore.generate();

      expect(ttsStore.state.error).toBeNull();
      expect(ttsStore.state.audioBlob).toBe(mockBlob);
      expect(ttsClient.generateVoiceDesign).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "Designed speech",
          voice_description: "A warm, deep male voice",
          language: "english",
        })
      );
    });

    it("clears previous audio URL before generating", async () => {
      const blob1 = new Blob(["audio-1"], { type: "audio/wav" });
      const blob2 = new Blob(["audio-2"], { type: "audio/wav" });

      vi.mocked(ttsClient.getModelStatus).mockResolvedValue({
        loaded: true,
        model_id: "0.6b",
        device: "mps",
        memory: { device: "mps", total_gb: 16, available_gb: 8 },
      });
      vi.mocked(ttsClient.health).mockResolvedValue({ status: "ok", version: "1.0" });
      await ttsStore.checkServerHealth();

      vi.mocked(ttsClient.generateCustomVoice).mockResolvedValue(blob1);
      ttsStore.setText("First");
      await ttsStore.generate();

      // Now generate again
      vi.mocked(ttsClient.generateCustomVoice).mockResolvedValue(blob2);
      ttsStore.setText("Second");
      await ttsStore.generate();

      expect(URL.revokeObjectURL).toHaveBeenCalled();
      expect(ttsStore.state.audioBlob).toBe(blob2);
    });

    it("does not show error for AbortError", async () => {
      vi.mocked(ttsClient.getModelStatus).mockResolvedValue({
        loaded: true,
        model_id: "0.6b",
        device: "mps",
        memory: { device: "mps", total_gb: 16, available_gb: 8 },
      });
      vi.mocked(ttsClient.health).mockResolvedValue({ status: "ok", version: "1.0" });
      await ttsStore.checkServerHealth();

      const abortError = new DOMException("Aborted", "AbortError");
      vi.mocked(ttsClient.generateCustomVoice).mockRejectedValue(abortError);

      ttsStore.setText("Hello");
      await ttsStore.generate();

      expect(ttsStore.state.error).toBeNull();
      expect(ttsStore.state.isGenerating).toBe(false);
    });
  });

  // ==========================================================================
  // 3. setMode() behavior
  // ==========================================================================
  describe("setMode()", () => {
    it("changes the current mode", () => {
      ttsStore.setMode("voice-clone");
      expect(ttsStore.state.mode).toBe("voice-clone");
    });

    it("clears audioUrl when switching modes", async () => {
      // Simulate having audio output
      const mockBlob = new Blob(["audio"], { type: "audio/wav" });
      vi.mocked(ttsClient.getModelStatus).mockResolvedValue({
        loaded: true,
        model_id: "0.6b",
        device: "mps",
        memory: { device: "mps", total_gb: 16, available_gb: 8 },
      });
      vi.mocked(ttsClient.health).mockResolvedValue({ status: "ok", version: "1.0" });
      await ttsStore.checkServerHealth();

      vi.mocked(ttsClient.generateCustomVoice).mockResolvedValue(mockBlob);
      ttsStore.setText("Hello");
      await ttsStore.generate();
      expect(ttsStore.state.audioUrl).not.toBeNull();

      ttsStore.setMode("voice-clone");
      expect(ttsStore.state.audioUrl).toBeNull();
    });

    it("clears audioBlob when switching modes", async () => {
      const mockBlob = new Blob(["audio"], { type: "audio/wav" });
      vi.mocked(ttsClient.getModelStatus).mockResolvedValue({
        loaded: true,
        model_id: "0.6b",
        device: "mps",
        memory: { device: "mps", total_gb: 16, available_gb: 8 },
      });
      vi.mocked(ttsClient.health).mockResolvedValue({ status: "ok", version: "1.0" });
      await ttsStore.checkServerHealth();

      vi.mocked(ttsClient.generateCustomVoice).mockResolvedValue(mockBlob);
      ttsStore.setText("Hello");
      await ttsStore.generate();
      expect(ttsStore.state.audioBlob).not.toBeNull();

      ttsStore.setMode("voice-design");
      expect(ttsStore.state.audioBlob).toBeNull();
    });

    it("clears error when switching modes", async () => {
      // Trigger an error
      ttsStore.setText("");
      await ttsStore.generate();
      expect(ttsStore.state.error).not.toBeNull();

      ttsStore.setMode("voice-clone");
      expect(ttsStore.state.error).toBeNull();
    });

    it("revokes old audioUrl object URL on mode switch", async () => {
      const mockBlob = new Blob(["audio"], { type: "audio/wav" });
      vi.mocked(ttsClient.getModelStatus).mockResolvedValue({
        loaded: true,
        model_id: "0.6b",
        device: "mps",
        memory: { device: "mps", total_gb: 16, available_gb: 8 },
      });
      vi.mocked(ttsClient.health).mockResolvedValue({ status: "ok", version: "1.0" });
      await ttsStore.checkServerHealth();

      vi.mocked(ttsClient.generateCustomVoice).mockResolvedValue(mockBlob);
      ttsStore.setText("Hello");
      await ttsStore.generate();

      vi.mocked(URL.revokeObjectURL).mockClear();
      ttsStore.setMode("voice-clone");
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
    });
  });

  // ==========================================================================
  // 4. modelSupportsMode() compatibility checks
  // ==========================================================================
  describe("modelSupportsMode()", () => {
    it("returns true for 0.6b with custom-voice", () => {
      expect(modelSupportsMode("0.6b", "custom-voice")).toBe(true);
    });

    it("returns true for 1.7b with custom-voice", () => {
      expect(modelSupportsMode("1.7b", "custom-voice")).toBe(true);
    });

    it("returns false for 0.6b with voice-clone", () => {
      expect(modelSupportsMode("0.6b", "voice-clone")).toBe(false);
    });

    it("returns false for 0.6b with voice-design", () => {
      expect(modelSupportsMode("0.6b", "voice-design")).toBe(false);
    });

    it("returns true for 0.6b-base with voice-clone", () => {
      expect(modelSupportsMode("0.6b-base", "voice-clone")).toBe(true);
    });

    it("returns true for 1.7b-base with voice-clone", () => {
      expect(modelSupportsMode("1.7b-base", "voice-clone")).toBe(true);
    });

    it("returns false for 0.6b-base with custom-voice", () => {
      expect(modelSupportsMode("0.6b-base", "custom-voice")).toBe(false);
    });

    it("returns true for 1.7b-design with voice-design", () => {
      expect(modelSupportsMode("1.7b-design", "voice-design")).toBe(true);
    });

    it("returns false for 1.7b-design with custom-voice", () => {
      expect(modelSupportsMode("1.7b-design", "custom-voice")).toBe(false);
    });

    it("returns false for 1.7b-design with voice-clone", () => {
      expect(modelSupportsMode("1.7b-design", "voice-clone")).toBe(false);
    });

    it("returns false for null modelId", () => {
      expect(modelSupportsMode(null, "custom-voice")).toBe(false);
    });

    it("returns false for unknown modelId", () => {
      expect(modelSupportsMode("unknown-model", "custom-voice")).toBe(false);
    });

    it("returns false for empty string modelId", () => {
      expect(modelSupportsMode("", "custom-voice")).toBe(false);
    });
  });

  // ==========================================================================
  // 5. getRecommendedModel() returns correct models for each mode
  // ==========================================================================
  describe("getRecommendedModel()", () => {
    it("returns 0.6b for custom-voice mode", () => {
      expect(getRecommendedModel("custom-voice")).toBe("0.6b");
    });

    it("returns 0.6b-base for voice-clone mode", () => {
      expect(getRecommendedModel("voice-clone")).toBe("0.6b-base");
    });

    it("returns 1.7b-design for voice-design mode", () => {
      expect(getRecommendedModel("voice-design")).toBe("1.7b-design");
    });

    it("recommended model always supports its mode", () => {
      const modes: TTSMode[] = ["custom-voice", "voice-clone", "voice-design"];
      for (const mode of modes) {
        const recommended = getRecommendedModel(mode);
        expect(modelSupportsMode(recommended, mode)).toBe(true);
      }
    });
  });

  // ==========================================================================
  // 6. setText(), setLanguage(), setSpeaker() update state correctly
  // ==========================================================================
  describe("setText()", () => {
    it("updates text state", () => {
      ttsStore.setText("Hello world");
      expect(ttsStore.state.text).toBe("Hello world");
    });

    it("updates to empty string", () => {
      ttsStore.setText("Something");
      ttsStore.setText("");
      expect(ttsStore.state.text).toBe("");
    });

    it("handles special characters", () => {
      ttsStore.setText("Hello! @#$%^&*() 你好");
      expect(ttsStore.state.text).toBe("Hello! @#$%^&*() 你好");
    });
  });

  describe("setLanguage()", () => {
    it("updates language state", () => {
      ttsStore.setLanguage("Chinese");
      expect(ttsStore.state.language).toBe("Chinese");
    });

    it("updates to different languages", () => {
      ttsStore.setLanguage("Japanese");
      expect(ttsStore.state.language).toBe("Japanese");
      ttsStore.setLanguage("Korean");
      expect(ttsStore.state.language).toBe("Korean");
    });
  });

  describe("setSpeaker()", () => {
    it("updates speaker state", () => {
      ttsStore.setSpeaker("serena");
      expect(ttsStore.state.speaker).toBe("serena");
    });

    it("can set all preset speakers", () => {
      const speakers = ["aiden", "dylan", "eric", "ono_anna", "ryan", "serena", "sohee", "uncle_fu", "vivian"] as const;
      for (const speaker of speakers) {
        ttsStore.setSpeaker(speaker);
        expect(ttsStore.state.speaker).toBe(speaker);
      }
    });
  });

  describe("setInstruction()", () => {
    it("updates instruction state", () => {
      ttsStore.setInstruction("Speak slowly and clearly");
      expect(ttsStore.state.instruction).toBe("Speak slowly and clearly");
    });
  });

  describe("setVoiceDescription()", () => {
    it("updates voiceDescription state", () => {
      ttsStore.setVoiceDescription("A warm, deep male voice");
      expect(ttsStore.state.voiceDescription).toBe("A warm, deep male voice");
    });
  });

  describe("setReferenceAudio()", () => {
    it("updates referenceAudio with a file", () => {
      const file = new File(["audio-data"], "test.wav", { type: "audio/wav" });
      ttsStore.setReferenceAudio(file);
      expect(ttsStore.state.referenceAudio).toBe(file);
    });

    it("clears referenceAudio with null", () => {
      const file = new File(["audio-data"], "test.wav", { type: "audio/wav" });
      ttsStore.setReferenceAudio(file);
      ttsStore.setReferenceAudio(null);
      expect(ttsStore.state.referenceAudio).toBeNull();
    });
  });

  describe("setReferenceText()", () => {
    it("updates referenceText state", () => {
      ttsStore.setReferenceText("The reference transcript");
      expect(ttsStore.state.referenceText).toBe("The reference transcript");
    });
  });

  describe("setCloneLowQualityMode()", () => {
    it("enables low quality mode", () => {
      ttsStore.setCloneLowQualityMode(true);
      expect(ttsStore.state.cloneLowQualityMode).toBe(true);
    });

    it("disables low quality mode", () => {
      ttsStore.setCloneLowQualityMode(true);
      ttsStore.setCloneLowQualityMode(false);
      expect(ttsStore.state.cloneLowQualityMode).toBe(false);
    });
  });

  describe("clearError()", () => {
    it("clears error state", async () => {
      ttsStore.setText("");
      await ttsStore.generate();
      expect(ttsStore.state.error).not.toBeNull();
      ttsStore.clearError();
      expect(ttsStore.state.error).toBeNull();
    });
  });

  // ==========================================================================
  // 7. MODEL_OPTIONS and MODEL_CAPABILITIES have consistent data
  // ==========================================================================
  describe("MODEL_OPTIONS and MODEL_CAPABILITIES consistency", () => {
    it("every MODEL_OPTIONS entry has a corresponding MODEL_CAPABILITIES entry", () => {
      for (const option of MODEL_OPTIONS) {
        expect(MODEL_CAPABILITIES).toHaveProperty(option.id);
      }
    });

    it("every MODEL_CAPABILITIES key appears in MODEL_OPTIONS", () => {
      const optionIds = MODEL_OPTIONS.map((o) => o.id);
      for (const key of Object.keys(MODEL_CAPABILITIES)) {
        expect(optionIds).toContain(key);
      }
    });

    it("MODEL_OPTIONS modes match MODEL_CAPABILITIES for each model", () => {
      for (const option of MODEL_OPTIONS) {
        const capabilities = MODEL_CAPABILITIES[option.id];
        expect(option.modes).toEqual(capabilities);
      }
    });

    it("MODEL_OPTIONS has entries for all three modes", () => {
      const allModes = MODEL_OPTIONS.flatMap((o) => o.modes);
      expect(allModes).toContain("custom-voice");
      expect(allModes).toContain("voice-clone");
      expect(allModes).toContain("voice-design");
    });

    it("MODEL_OPTIONS has at least one entry per mode", () => {
      const modes: TTSMode[] = ["custom-voice", "voice-clone", "voice-design"];
      for (const mode of modes) {
        const modelsForMode = MODEL_OPTIONS.filter((o) => o.modes.includes(mode));
        expect(modelsForMode.length).toBeGreaterThanOrEqual(1);
      }
    });

    it("every MODEL_OPTIONS entry has a non-empty label and description", () => {
      for (const option of MODEL_OPTIONS) {
        expect(option.label.length).toBeGreaterThan(0);
        expect(option.description.length).toBeGreaterThan(0);
      }
    });

    it("MODEL_OPTIONS ids are unique", () => {
      const ids = MODEL_OPTIONS.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  // ==========================================================================
  // Server health & model loading
  // ==========================================================================
  describe("checkServerHealth()", () => {
    it("sets serverConnected to true on success", async () => {
      vi.mocked(ttsClient.health).mockResolvedValue({ status: "ok", version: "1.0" });
      vi.mocked(ttsClient.getModelStatus).mockResolvedValue({
        loaded: false,
        model_id: null,
        device: null,
        memory: { device: "mps", total_gb: 16, available_gb: 8 },
      });
      await ttsStore.checkServerHealth();
      expect(ttsStore.state.serverConnected).toBe(true);
    });

    it("sets serverConnected to false on failure", async () => {
      vi.mocked(ttsClient.health).mockRejectedValue(new Error("Connection refused"));
      await ttsStore.checkServerHealth();
      expect(ttsStore.state.serverConnected).toBe(false);
      expect(ttsStore.state.modelLoaded).toBe(false);
    });

    it("refreshes model status after successful health check", async () => {
      vi.mocked(ttsClient.health).mockResolvedValue({ status: "ok", version: "1.0" });
      vi.mocked(ttsClient.getModelStatus).mockResolvedValue({
        loaded: true,
        model_id: "1.7b",
        device: "mps",
        memory: { device: "mps", total_gb: 16, available_gb: 8 },
      });
      await ttsStore.checkServerHealth();
      expect(ttsStore.state.modelLoaded).toBe(true);
      expect(ttsStore.state.modelId).toBe("1.7b");
      expect(ttsStore.state.device).toBe("mps");
    });
  });

  describe("loadModel()", () => {
    it("sets isLoadingModel during loading", async () => {
      let resolveLoad: () => void;
      const loadPromise = new Promise<void>((resolve) => {
        resolveLoad = resolve;
      });

      vi.mocked(ttsClient.loadModel).mockReturnValue(loadPromise);
      vi.mocked(ttsClient.getModelStatus).mockResolvedValue({
        loaded: true,
        model_id: "0.6b",
        device: "mps",
        memory: { device: "mps", total_gb: 16, available_gb: 8 },
      });

      const promise = ttsStore.loadModel("0.6b");
      // isLoadingModel is set synchronously before the await
      expect(ttsStore.state.isLoadingModel).toBe(true);

      resolveLoad!();
      await promise;

      expect(ttsStore.state.isLoadingModel).toBe(false);
    });

    it("sets error when loading fails", async () => {
      vi.mocked(ttsClient.loadModel).mockRejectedValue(new Error("Out of memory"));
      await ttsStore.loadModel("1.7b");
      expect(ttsStore.state.error).toBe("Out of memory");
      expect(ttsStore.state.isLoadingModel).toBe(false);
    });

    it("clears error before loading", async () => {
      // First create an error
      ttsStore.setText("");
      await ttsStore.generate();
      expect(ttsStore.state.error).not.toBeNull();

      // Now load model (even if it fails, error should first be cleared then set to new error)
      vi.mocked(ttsClient.loadModel).mockResolvedValue();
      vi.mocked(ttsClient.getModelStatus).mockResolvedValue({
        loaded: true,
        model_id: "0.6b",
        device: "mps",
        memory: { device: "mps", total_gb: 16, available_gb: 8 },
      });
      await ttsStore.loadModel("0.6b");
      expect(ttsStore.state.error).toBeNull();
    });
  });

  // ==========================================================================
  // abortGeneration()
  // ==========================================================================
  describe("abortGeneration()", () => {
    it("calls ttsClient.abortGeneration", () => {
      ttsStore.abortGeneration();
      expect(ttsClient.abortGeneration).toHaveBeenCalled();
    });
  });
});
