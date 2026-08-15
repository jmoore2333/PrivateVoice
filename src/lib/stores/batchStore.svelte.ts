import {
  ttsClient,
  isCancellation,
  type BatchProgress,
  type BatchRequest,
} from "$lib/api/ttsClient";
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

const POLL_INTERVAL_MS = 500;

/**
 * How long the server may report zero progress before the client gives up.
 *
 * Issue #13: a fixed total budget cannot suit both a 2-item batch and a 50-item
 * one. Liveness is the right signal — the progress poll already runs, so a
 * batch is healthy for as long as `completed` or `current_item` keeps moving.
 *
 * Deliberately generous. The server streams nothing until the whole ZIP is
 * built, so tripping this discards every item already generated — a false
 * positive is destructive, while a late true positive merely delays an outcome
 * the user is going to get anyway. The window must therefore clear the SLOWEST
 * plausible single item, not the average: the issue reporter saw ~5 minutes per
 * item, and a full 2,000-character item on a CPU-only machine can run several
 * times that.
 */
export const BATCH_STALL_TIMEOUT_MS = 30 * 60 * 1000;

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
  let lastProgressAt = 0;
  let lastProgressKey = "";
  let stalledOut = false;

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

  /** Identity of a progress snapshot — changes whenever the server moves forward. */
  function progressKey(progress: BatchProgress): string {
    return `${progress.completed}|${progress.current_item}|${progress.status}`;
  }

  function handleStall() {
    stalledOut = true;
    // Abort FIRST. abortGeneration is local and synchronous, so it guarantees
    // generateBatch rejects and the `finally` runs (clearing this interval).
    // Awaiting the network call first would mean a hung /cancel-generation
    // leaves the batch pending forever — the exact hang this watchdog exists
    // to end. The two are independent requests; cancelBatch is best-effort
    // courtesy so the server stops burning CPU (issue #13: 25 minutes of it).
    ttsClient.abortGeneration();
    void ttsClient.cancelBatch().catch(() => {
      // Best-effort — we are giving up either way.
    });
  }

  function startPolling() {
    stopPolling();
    lastProgressAt = Date.now();
    lastProgressKey = "";
    stalledOut = false;
    let pollInFlight = false;

    progressTimer = setInterval(() => {
      if (stalledOut) return;

      // Staleness is judged on the CLIENT tick, never behind an await. A server
      // that accepts connections but never answers (generation runs via
      // asyncio.to_thread, so a native hang blocks the event loop) would leave
      // an awaited poll pending forever — and with no total timeout any more,
      // the batch would hang indefinitely. The tick always fires; the poll is
      // merely how we learn about progress.
      if (Date.now() - lastProgressAt >= BATCH_STALL_TIMEOUT_MS) {
        handleStall();
        return;
      }

      // Never stack polls against an unresponsive server.
      if (pollInFlight) return;
      pollInFlight = true;

      void ttsClient
        .getBatchProgress()
        .then((progress) => {
          state.progress = progress;
          const key = progressKey(progress);
          if (key !== lastProgressKey) {
            lastProgressKey = key;
            lastProgressAt = Date.now();
          }
          // A poll that succeeds but reports no movement is NOT progress:
          // lastProgressAt stays put and the deadline keeps running.
        })
        .catch(() => {
          // A failed poll is not progress either. Deliberately does not touch
          // lastProgressAt, so a server that stops answering still stalls out.
        })
        .finally(() => {
          pollInFlight = false;
        });
    }, POLL_INTERVAL_MS);
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
      if (stalledOut) {
        const minutes = Math.round(BATCH_STALL_TIMEOUT_MS / 60000);
        // Do NOT imply the completed items were kept. The server builds the ZIP
        // only after the last item, so stopping early discards all of them —
        // saying "N of M finished" would read as N files delivered.
        state.error =
          `Batch stopped: the server reported no progress for ${minutes} minutes ` +
          `(it had reached ${state.progress.completed} of ${state.progress.total}). ` +
          `No files were saved — a batch is only downloadable once every item finishes. ` +
          `Try a smaller batch or shorter files.`;
        state.progress = { ...state.progress, status: "error" };
      } else if (isCancellation(e)) {
        state.progress = { ...state.progress, status: "cancelled" };
      } else {
        // Issue #13: an abort reason that was a plain string fell through both
        // branches and produced a bare "Batch generation failed" with no cause.
        state.error = e instanceof Error ? e.message : String(e) || "Batch generation failed";
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
