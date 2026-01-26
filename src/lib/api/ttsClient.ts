/**
 * HTTP client for the TTS sidecar server.
 */

const BASE_URL = "http://127.0.0.1:8765";

export interface HealthResponse {
  status: string;
  version: string;
}

export interface ModelStatus {
  loaded: boolean;
  model_id: string | null;
  device: string | null;
  memory: {
    device: string;
    total_gb: number;
    available_gb: number;
  };
}

export interface CustomVoiceRequest {
  text: string;
  speaker: string;
  instruction?: string;
}

export interface VoiceDesignRequest {
  text: string;
  voice_description: string;
}

export const PRESET_SPEAKERS = [
  "aiden",
  "dylan",
  "eric",
  "ono_anna",
  "ryan",
  "serena",
  "sohee",
  "uncle_fu",
  "vivian",
] as const;

export type Speaker = (typeof PRESET_SPEAKERS)[number];

class TTSClient {
  private baseUrl: string;

  constructor(baseUrl: string = BASE_URL) {
    this.baseUrl = baseUrl;
  }

  async health(): Promise<HealthResponse> {
    const res = await fetch(`${this.baseUrl}/health`);
    if (!res.ok) throw new Error("Server not available");
    return res.json();
  }

  async getModelStatus(): Promise<ModelStatus> {
    const res = await fetch(`${this.baseUrl}/model-status`);
    if (!res.ok) throw new Error("Failed to get model status");
    return res.json();
  }

  async loadModel(modelId: string = "0.6b"): Promise<void> {
    const res = await fetch(`${this.baseUrl}/load-model`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model_id: modelId }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Failed to load model");
    }
  }

  async unloadModel(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/unload-model`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Failed to unload model");
  }

  async generateCustomVoice(request: CustomVoiceRequest): Promise<Blob> {
    const res = await fetch(`${this.baseUrl}/generate/custom-voice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Failed to generate audio");
    }
    return res.blob();
  }

  async generateVoiceClone(
    text: string,
    referenceText: string,
    referenceAudio: File
  ): Promise<Blob> {
    const formData = new FormData();
    formData.append("text", text);
    formData.append("reference_text", referenceText);
    formData.append("reference_audio", referenceAudio);

    const res = await fetch(`${this.baseUrl}/generate/voice-clone`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Failed to generate audio");
    }
    return res.blob();
  }

  async generateVoiceDesign(request: VoiceDesignRequest): Promise<Blob> {
    const res = await fetch(`${this.baseUrl}/generate/voice-design`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || "Failed to generate audio");
    }
    return res.blob();
  }

  async shutdown(): Promise<void> {
    await fetch(`${this.baseUrl}/shutdown`, { method: "POST" });
  }
}

export const ttsClient = new TTSClient();
