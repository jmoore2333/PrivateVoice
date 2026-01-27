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

export interface StartupStatus {
  phase: string;
  message: string;
  progress: number;
}

export interface DownloadProgress {
  status: "idle" | "downloading" | "complete" | "error";
  file_name: string;
  bytes_downloaded: number;
  bytes_total: number;
  speed_mbps: number;
  eta: number;
}

export interface SystemInfo {
  python_version: string;
  torch_version: string;
  device: string;
  device_name: string;
  memory_total_gb: number;
  memory_available_gb: number;
  cache_dir: string;
}

export interface LogEntry {
  level: string;
  message: string;
  timestamp: string;
}

export interface SpeakerInfo {
  name: string;
  description: string;
  native_language: string;
  personality: string;
  gender: string;
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

  // ============================================================================
  // Health & Status
  // ============================================================================

  async health(): Promise<HealthResponse> {
    const res = await fetch(`${this.baseUrl}/health`);
    if (!res.ok) throw new Error("Server not available");
    return res.json();
  }

  async getStartupStatus(): Promise<StartupStatus> {
    const res = await fetch(`${this.baseUrl}/startup-status`);
    if (!res.ok) throw new Error("Failed to get startup status");
    return res.json();
  }

  async getDownloadProgress(): Promise<DownloadProgress> {
    const res = await fetch(`${this.baseUrl}/download-progress`);
    if (!res.ok) throw new Error("Failed to get download progress");
    return res.json();
  }

  async getModelStatus(): Promise<ModelStatus> {
    const res = await fetch(`${this.baseUrl}/model-status`);
    if (!res.ok) throw new Error("Failed to get model status");
    return res.json();
  }

  // ============================================================================
  // Debug & System Info
  // ============================================================================

  async getSystemInfo(): Promise<SystemInfo> {
    const res = await fetch(`${this.baseUrl}/system-info`);
    if (!res.ok) throw new Error("Failed to get system info");
    return res.json();
  }

  async getLogs(count: number = 100, level?: string): Promise<LogEntry[]> {
    const params = new URLSearchParams({ count: count.toString() });
    if (level) params.append("level", level);

    const res = await fetch(`${this.baseUrl}/logs?${params}`);
    if (!res.ok) throw new Error("Failed to get logs");
    return res.json();
  }

  // ============================================================================
  // Speaker & Voice Info
  // ============================================================================

  async getSpeakers(): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/speakers`);
    if (!res.ok) throw new Error("Failed to get speakers");
    const data = await res.json();
    return data.speakers;
  }

  async getSpeakersInfo(): Promise<SpeakerInfo[]> {
    const res = await fetch(`${this.baseUrl}/speakers-info`);
    if (!res.ok) throw new Error("Failed to get speaker info");
    return res.json();
  }

  async getLanguages(): Promise<string[]> {
    const res = await fetch(`${this.baseUrl}/languages`);
    if (!res.ok) throw new Error("Failed to get languages");
    const data = await res.json();
    return data.languages;
  }

  // ============================================================================
  // Model Management
  // ============================================================================

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

  // ============================================================================
  // Generation
  // ============================================================================

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

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async shutdown(): Promise<void> {
    await fetch(`${this.baseUrl}/shutdown`, { method: "POST" });
  }
}

export const ttsClient = new TTSClient();
