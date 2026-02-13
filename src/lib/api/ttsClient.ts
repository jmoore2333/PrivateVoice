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
  stable_lead_in?: boolean;
  seed?: number | null;
  sample_rate?: number | null;
  bit_depth?: number;
}

export interface VoiceDesignRequest {
  text: string;
  voice_description: string;
  language?: string;
  format?: string;
  stable_lead_in?: boolean;
  seed?: number | null;
  sample_rate?: number | null;
  bit_depth?: number;
}

export interface VoiceCloneRequestOptions {
  xVectorOnly?: boolean;
  language?: string;
  format?: string;
  seed?: number | null;
  sample_rate?: number | null;
  bit_depth?: number;
}

export interface BatchItem {
  text: string;
  output_filename: string;
}

export interface BatchRequest {
  mode: "custom-voice" | "voice-clone" | "voice-design";
  language?: string;
  format?: string;
  mp3_bitrate?: number;
  seed?: number | null;
  sample_rate?: number | null;
  bit_depth?: number;
  speaker?: string;
  instruction?: string;
  voice_description?: string;
  stable_lead_in?: boolean;
  reference_text?: string;
  reference_audio_base64?: string | null;
  x_vector_only_mode?: boolean;
  items: BatchItem[];
}

export interface BatchProgress {
  total: number;
  completed: number;
  current_item: string;
  status: string;
}

export interface WhisperStatus {
  loaded: boolean;
  model_size: string | null;
  device: string;
}

export interface WhisperModelInfo {
  size: string;
  parameters: string;
  download_size_mb: number;
}

export interface TranslationStatus {
  loaded: boolean;
  model_key: string | null;
  model_id: string | null;
  device: string;
}

export interface TranslationModelInfo {
  key: string;
  label: string;
  model_id: string;
  parameters: string;
  download_size_mb: number;
}

export interface TranscriptionResult {
  text: string;
  language: string;
  confidence: number;
  duration_seconds: number;
}

export type TranscriptionTask = "transcribe" | "translate";

export interface TranslateTextResult {
  text: string;
  source_language: string;
  target_language: string;
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
  private authToken: string | null = null;
  private _abortController: AbortController | null = null;

  constructor(baseUrl: string = BASE_URL) {
    this.baseUrl = baseUrl;
  }

  setAccessToken(token: string | null): void {
    const trimmed = token?.trim();
    this.authToken = trimmed ? trimmed : null;
  }

  private async request(path: string, init: RequestInit = {}): Promise<Response> {
    if (!this.authToken) {
      if (Object.keys(init).length === 0) {
        return fetch(`${this.baseUrl}${path}`);
      }
      return fetch(`${this.baseUrl}${path}`, init);
    }

    const headers = new Headers(init.headers);
    headers.set("X-API-Key", this.authToken);
    return fetch(`${this.baseUrl}${path}`, { ...init, headers });
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
    const res = await this.request("/health");
    if (!res.ok) throw new Error("Server not available");
    return res.json();
  }

  async getStartupStatus(): Promise<StartupStatus> {
    const res = await this.request("/startup-status");
    if (!res.ok) {
      const error = new Error("Failed to get startup status") as Error & { status?: number };
      error.status = res.status;
      throw error;
    }
    return res.json();
  }

  async getDownloadProgress(): Promise<DownloadProgress> {
    const res = await this.request("/download-progress");
    if (!res.ok) throw new Error("Failed to get download progress");
    return res.json();
  }

  async getModelStatus(): Promise<ModelStatus> {
    const res = await this.request("/model-status");
    if (!res.ok) throw new Error("Failed to get model status");
    return res.json();
  }

  // ============================================================================
  // Debug & System Info
  // ============================================================================

  async getSystemInfo(): Promise<SystemInfo> {
    const res = await this.request("/system-info");
    if (!res.ok) throw new Error("Failed to get system info");
    return res.json();
  }

  async getLogs(count: number = 100, level?: string): Promise<LogEntry[]> {
    const params = new URLSearchParams({ count: count.toString() });
    if (level) params.append("level", level);

    const res = await this.request(`/logs?${params}`);
    if (!res.ok) throw new Error("Failed to get logs");
    return res.json();
  }

  // ============================================================================
  // Speaker & Voice Info
  // ============================================================================

  async getSpeakers(): Promise<string[]> {
    const res = await this.request("/speakers");
    if (!res.ok) throw new Error("Failed to get speakers");
    const data = await res.json();
    return data.speakers;
  }

  async getSpeakersInfo(): Promise<SpeakerInfo[]> {
    const res = await this.request("/speakers-info");
    if (!res.ok) throw new Error("Failed to get speaker info");
    return res.json();
  }

  async getLanguages(): Promise<string[]> {
    const res = await this.request("/languages");
    if (!res.ok) throw new Error("Failed to get languages");
    const data = await res.json();
    return data.languages;
  }

  // ============================================================================
  // Model Management
  // ============================================================================

  async loadModel(modelId: string = "0.6b"): Promise<void> {
    const res = await this.request("/load-model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model_id: modelId }),
    });
    if (!res.ok) {
      throw new Error(await this.readErrorMessage(res, "Failed to load model"));
    }
  }

  async unloadModel(): Promise<void> {
    const res = await this.request("/unload-model", {
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
      const res = await this.request("/generate/custom-voice", {
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
    options?: VoiceCloneRequestOptions
  ): Promise<Blob> {
    const signal = this.createGenerationSignal();
    const formData = new FormData();
    formData.append("text", text);
    formData.append("reference_text", referenceText ?? "");
    formData.append("reference_audio", referenceAudio);
    formData.append("x_vector_only_mode", options?.xVectorOnly ? "true" : "false");
    if (options?.language) formData.append("language", options.language);
    if (options?.format) formData.append("format", options.format);
    if (typeof options?.seed === "number") formData.append("seed", options.seed.toString());
    if (typeof options?.sample_rate === "number") {
      formData.append("sample_rate", options.sample_rate.toString());
    }
    if (typeof options?.bit_depth === "number") {
      formData.append("bit_depth", options.bit_depth.toString());
    }

    try {
      const res = await this.request("/generate/voice-clone", {
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
      const res = await this.request("/generate/voice-design", {
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

  async generateBatch(request: BatchRequest): Promise<Blob> {
    const signal = this.createGenerationSignal();
    try {
      const res = await this.request("/generate/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal,
      });
      if (!res.ok) {
        throw new Error(await this.readErrorMessage(res, "Failed to generate batch"));
      }
      return res.blob();
    } finally {
      this._abortController = null;
    }
  }

  async getBatchProgress(): Promise<BatchProgress> {
    const res = await this.request("/batch-progress");
    if (!res.ok) throw new Error("Failed to get batch progress");
    return res.json();
  }

  async cancelBatch(): Promise<void> {
    const res = await this.request("/cancel-generation", { method: "POST" });
    if (!res.ok) throw new Error("Failed to cancel batch");
  }

  // ============================================================================
  // Whisper Transcription
  // ============================================================================

  async whisperStatus(): Promise<WhisperStatus> {
    const res = await this.request("/whisper-status");
    if (!res.ok) throw new Error("Failed to get Whisper status");
    return res.json();
  }

  async whisperModels(): Promise<WhisperModelInfo[]> {
    const res = await this.request("/whisper-models");
    if (!res.ok) throw new Error("Failed to get Whisper models");
    return res.json();
  }

  async loadWhisper(modelSize: string = "base"): Promise<void> {
    const res = await this.request("/load-whisper", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model_size: modelSize }),
    });
    if (!res.ok) {
      throw new Error(await this.readErrorMessage(res, "Failed to load Whisper model"));
    }
  }

  async unloadWhisper(): Promise<void> {
    const res = await this.request("/unload-whisper", {
      method: "POST",
    });
    if (!res.ok) throw new Error("Failed to unload Whisper model");
  }

  async translationStatus(): Promise<TranslationStatus> {
    const res = await this.request("/translation-status");
    if (!res.ok) throw new Error("Failed to get translation status");
    return res.json();
  }

  async translationModels(): Promise<TranslationModelInfo[]> {
    const res = await this.request("/translation-models");
    if (!res.ok) throw new Error("Failed to get translation models");
    return res.json();
  }

  async loadTranslation(modelKey: string = "nllb-600m"): Promise<void> {
    const res = await this.request("/load-translation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model_key: modelKey }),
    });
    if (!res.ok) {
      throw new Error(await this.readErrorMessage(res, "Failed to load translation model"));
    }
  }

  async unloadTranslation(): Promise<void> {
    const res = await this.request("/unload-translation", {
      method: "POST",
    });
    if (!res.ok) throw new Error("Failed to unload translation model");
  }

  async transcribe(
    audioFile: File | Blob,
    options?: { task?: TranscriptionTask },
  ): Promise<TranscriptionResult> {
    const formData = new FormData();
    const file = audioFile instanceof File
      ? audioFile
      : new File([audioFile], "audio.wav", { type: audioFile.type || "audio/wav" });
    formData.append("audio", file);
    if (options?.task) {
      formData.append("task", options.task);
    }

    const res = await this.request("/transcribe", {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      throw new Error(await this.readErrorMessage(res, "Failed to transcribe audio"));
    }
    return res.json();
  }

  async translateText(
    text: string,
    targetLanguage: string,
    sourceLanguage: string = "auto",
  ): Promise<TranslateTextResult> {
    const res = await this.request("/translate-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        target_language: targetLanguage,
        source_language: sourceLanguage,
      }),
    });
    if (!res.ok) {
      throw new Error(await this.readErrorMessage(res, "Failed to translate text"));
    }
    return res.json();
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async shutdown(): Promise<void> {
    await this.request("/shutdown", { method: "POST" });
  }
}

export const ttsClient = new TTSClient();
