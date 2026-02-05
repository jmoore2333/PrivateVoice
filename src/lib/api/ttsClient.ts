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
  language?: string;
  format?: string;
}

export interface VoiceDesignRequest {
  text: string;
  voice_description: string;
  language?: string;
  format?: string;
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

const GENERATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

class TTSClient {
  private baseUrl: string;
  private _abortController: AbortController | null = null;

  constructor(baseUrl: string = BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /** Create a signal for generation requests with timeout + manual abort. */
  private createGenerationSignal(): AbortSignal {
    this._abortController = new AbortController();
    const timeoutId = setTimeout(() => this._abortController?.abort("Generation timed out"), GENERATION_TIMEOUT_MS);
    // Clear timeout when signal aborts (manual or timeout)
    this._abortController.signal.addEventListener("abort", () => clearTimeout(timeoutId), { once: true });
    return this._abortController.signal;
  }

  /** Abort the current generation request. */
  abortGeneration(): void {
    this._abortController?.abort("Generation cancelled");
    this._abortController = null;
  }

  get isGenerating(): boolean {
    return this._abortController !== null;
  }

  private async readErrorMessage(res: Response, fallback: string): Promise<string> {
    try {
      const data = await res.json();
      const detail = (data as { detail?: unknown })?.detail;
      if (typeof detail === "string") return detail;
      if (Array.isArray(detail)) {
        const messages = detail
          .map((item) => {
            if (!item) return null;
            if (typeof item === "string") return item;
            if (typeof item === "object" && "msg" in item) {
              const msg = (item as { msg?: string }).msg;
              return msg ?? null;
            }
            return null;
          })
          .filter(Boolean);
        if (messages.length) return messages.join("; ");
      }
      if (detail && typeof detail === "object") {
        const obj = detail as Record<string, unknown>;
        if (typeof obj.message === "string") return obj.message;
        if (typeof obj.msg === "string") return obj.msg;
        return JSON.stringify(detail);
      }
      if (detail) return String(detail);
      return fallback;
    } catch {
      return fallback;
    }
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
    if (!res.ok) {
      const error = new Error("Failed to get startup status") as Error & { status?: number };
      error.status = res.status;
      throw error;
    }
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
      throw new Error(await this.readErrorMessage(res, "Failed to load model"));
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
    const signal = this.createGenerationSignal();
    try {
      const res = await fetch(`${this.baseUrl}/generate/custom-voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal,
      });
      if (!res.ok) {
        throw new Error(await this.readErrorMessage(res, "Failed to generate audio"));
      }
      return res.blob();
    } finally {
      this._abortController = null;
    }
  }

  async generateVoiceClone(
    text: string,
    referenceText: string,
    referenceAudio: File,
    options?: { xVectorOnly?: boolean; language?: string; format?: string }
  ): Promise<Blob> {
    const signal = this.createGenerationSignal();
    const formData = new FormData();
    formData.append("text", text);
    formData.append("reference_text", referenceText ?? "");
    formData.append("reference_audio", referenceAudio);
    formData.append("x_vector_only_mode", options?.xVectorOnly ? "true" : "false");
    if (options?.language) formData.append("language", options.language);
    if (options?.format) formData.append("format", options.format);

    try {
      const res = await fetch(`${this.baseUrl}/generate/voice-clone`, {
        method: "POST",
        body: formData,
        signal,
      });
      if (!res.ok) {
        throw new Error(await this.readErrorMessage(res, "Failed to generate audio"));
      }
      return res.blob();
    } finally {
      this._abortController = null;
    }
  }

  async generateVoiceDesign(request: VoiceDesignRequest): Promise<Blob> {
    const signal = this.createGenerationSignal();
    try {
      const res = await fetch(`${this.baseUrl}/generate/voice-design`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal,
      });
      if (!res.ok) {
        throw new Error(await this.readErrorMessage(res, "Failed to generate audio"));
      }
      return res.blob();
    } finally {
      this._abortController = null;
    }
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async shutdown(): Promise<void> {
    await fetch(`${this.baseUrl}/shutdown`, { method: "POST" });
  }
}

export const ttsClient = new TTSClient();
