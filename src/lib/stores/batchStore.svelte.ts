import { ttsClient, type BatchProgress, type BatchRequest } from "$lib/api/ttsClient";
import { settingsStore } from "./settingsStore.svelte";

export interface BatchFile {
  id: string;
  name: string;
  text: string;
  outputFilename: string;
}

export interface BatchResult {
  outputFilename: string;
}

export interface BatchState {
  files: BatchFile[];
  isProcessing: boolean;
  progress: BatchProgress;
  results: BatchResult[];
  zipBlob: Blob | null;
  error: string | null;
}

const EMPTY_PROGRESS: BatchProgress = {
  total: 0,
  completed: 0,
  current_item: "",
  status: "idle",
};

function createBatchStore() {
  let state = $state<BatchState>({
    files: [],
    isProcessing: false,
    progress: { ...EMPTY_PROGRESS },
    results: [],
    zipBlob: null,
    error: null,
  });

  let progressTimer: ReturnType<typeof setInterval> | null = null;

  function makeId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function sanitizeOutputFilename(input: string): string {
    const safe = input
      .replace(/\.[^/.]+$/, "")
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return safe || "output";
  }

  async function addFiles(input: FileList | File[]) {
    const files = Array.from(input);
    const added: BatchFile[] = [];

    for (const file of files) {
      const text = await file.text();
      if (!text.trim()) continue;
      const base = sanitizeOutputFilename(file.name || "output");
      added.push({
        id: makeId(),
        name: file.name,
        text,
        outputFilename: `${base}.wav`,
      });
    }

    state.files = [...state.files, ...added];
    if (added.length === 0) {
      state.error = "No valid text files were added.";
    } else {
      state.error = null;
    }
  }

  function removeFile(id: string) {
    state.files = state.files.filter((file) => file.id !== id);
  }

  function updateOutputFilename(id: string, value: string) {
    state.files = state.files.map((file) =>
      file.id === id ? { ...file, outputFilename: value } : file
    );
  }

  function clearFiles() {
    state.files = [];
    state.results = [];
    state.zipBlob = null;
    state.progress = { ...EMPTY_PROGRESS };
    state.error = null;
  }

  function setError(message: string | null) {
    state.error = message;
  }

  function stopPolling() {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
  }

  function startPolling() {
    stopPolling();
    progressTimer = setInterval(async () => {
      try {
        const progress = await ttsClient.getBatchProgress();
        state.progress = progress;
      } catch {
        // Ignore polling failures during generation.
      }
    }, 500);
  }

  async function startBatch(request: BatchRequest) {
    if (state.files.length === 0) {
      state.error = "Add at least one text file to start batch processing.";
      return;
    }

    state.isProcessing = true;
    state.error = null;
    state.results = [];
    state.zipBlob = null;
    state.progress = {
      total: request.items.length,
      completed: 0,
      current_item: "",
      status: "running",
    };

    startPolling();
    try {
      const zipBlob = await ttsClient.generateBatch(request);
      state.zipBlob = zipBlob;
      state.results = request.items.map((item) => ({ outputFilename: item.output_filename }));
      try {
        state.progress = await ttsClient.getBatchProgress();
      } catch {
        state.progress = {
          total: request.items.length,
          completed: request.items.length,
          current_item: "",
          status: "completed",
        };
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        state.progress = { ...state.progress, status: "cancelled" };
      } else {
        state.error = e instanceof Error ? e.message : "Batch generation failed";
        state.progress = { ...state.progress, status: "error" };
      }
    } finally {
      stopPolling();
      state.isProcessing = false;
    }
  }

  async function cancelBatch() {
    try {
      await ttsClient.cancelBatch();
    } catch {
      // Best-effort cancellation request.
    }
    ttsClient.abortGeneration();
    state.progress = { ...state.progress, status: "cancelling" };
  }

  async function downloadResults() {
    if (!state.zipBlob) return;

    const now = new Date();
    const datestamp = now.toISOString().slice(0, 10);
    const timestamp = now.toTimeString().slice(0, 8).replace(/:/g, "");
    const filename = `PrivateVoice_Batch_${datestamp}_${timestamp}.zip`;

    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeFile } = await import("@tauri-apps/plugin-fs");

      const defaultPath = settingsStore.state.exportFolder
        ? `${settingsStore.state.exportFolder}/${filename}`
        : filename;

      const filePath = await save({
        defaultPath,
        filters: [{ name: "ZIP Archive", extensions: ["zip"] }],
      });

      if (filePath) {
        const arrayBuffer = await state.zipBlob.arrayBuffer();
        await writeFile(filePath, new Uint8Array(arrayBuffer));
      }
      return;
    } catch {
      // Not in Tauri or plugin unavailable — fall back to browser download.
    }

    const url = URL.createObjectURL(state.zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return {
    get state() {
      return state;
    },
    addFiles,
    removeFile,
    updateOutputFilename,
    clearFiles,
    setError,
    startBatch,
    cancelBatch,
    downloadResults,
  };
}

export const batchStore = createBatchStore();
