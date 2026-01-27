/**
 * Application state store for startup, downloads, and UI state.
 */

export type StartupPhase =
  | "initializing"
  | "starting-server"
  | "checking-models"
  | "downloading"
  | "loading-model"
  | "ready"
  | "error";

export interface StartupProgress {
  phase: StartupPhase;
  message: string;
  progress: number; // 0-100
}

export interface DownloadProgress {
  status: "idle" | "downloading" | "complete" | "error";
  fileName: string;
  bytesDownloaded: number;
  bytesTotal: number;
  speedMbps: number;
  eta: number; // seconds remaining
}

export interface AppState {
  // Startup state
  startup: StartupProgress;
  download: DownloadProgress;

  // UI toggles
  showDebugConsole: boolean;
  showSettings: boolean;
  showHelp: boolean;
  showVoiceLibrary: boolean;

  // Theme
  theme: "light" | "dark" | "system";
}

// Progress percentages for each phase
const PHASE_PROGRESS: Record<StartupPhase, [number, number]> = {
  initializing: [0, 5],
  "starting-server": [5, 15],
  "checking-models": [15, 20],
  downloading: [20, 85],
  "loading-model": [85, 95],
  ready: [100, 100],
  error: [0, 0],
};

const PHASE_MESSAGES: Record<StartupPhase, string> = {
  initializing: "Starting Python environment...",
  "starting-server": "Starting TTS server...",
  "checking-models": "Checking model cache...",
  downloading: "Downloading model from HuggingFace...",
  "loading-model": "Loading model into memory...",
  ready: "Ready to generate",
  error: "An error occurred",
};

function createAppStore() {
  let state = $state<AppState>({
    startup: {
      phase: "initializing",
      message: PHASE_MESSAGES.initializing,
      progress: 0,
    },
    download: {
      status: "idle",
      fileName: "",
      bytesDownloaded: 0,
      bytesTotal: 0,
      speedMbps: 0,
      eta: 0,
    },
    showDebugConsole: false,
    showSettings: false,
    showHelp: false,
    showVoiceLibrary: false,
    theme: "system",
  });

  function setStartupPhase(phase: StartupPhase, customMessage?: string) {
    const [minProgress, maxProgress] = PHASE_PROGRESS[phase];
    state.startup = {
      phase,
      message: customMessage ?? PHASE_MESSAGES[phase],
      progress: minProgress,
    };
  }

  function setStartupProgress(progress: number, message?: string) {
    const [minProgress, maxProgress] = PHASE_PROGRESS[state.startup.phase];
    // Map progress (0-100) to the phase's progress range
    const phaseProgress = minProgress + (progress / 100) * (maxProgress - minProgress);

    state.startup = {
      ...state.startup,
      progress: Math.min(phaseProgress, maxProgress),
      ...(message && { message }),
    };
  }

  function setStartupError(message: string) {
    state.startup = {
      phase: "error",
      message,
      progress: 0,
    };
  }

  function updateDownloadProgress(download: Partial<DownloadProgress>) {
    state.download = {
      ...state.download,
      ...download,
    };

    // If downloading, also update startup progress
    if (download.status === "downloading" && download.bytesTotal && download.bytesTotal > 0) {
      const downloadPercent = (download.bytesDownloaded ?? 0) / download.bytesTotal * 100;
      setStartupProgress(downloadPercent);
    }
  }

  function resetDownload() {
    state.download = {
      status: "idle",
      fileName: "",
      bytesDownloaded: 0,
      bytesTotal: 0,
      speedMbps: 0,
      eta: 0,
    };
  }

  function toggleDebugConsole() {
    state.showDebugConsole = !state.showDebugConsole;
  }

  function toggleSettings() {
    state.showSettings = !state.showSettings;
  }

  function toggleHelp() {
    state.showHelp = !state.showHelp;
  }

  function toggleVoiceLibrary() {
    state.showVoiceLibrary = !state.showVoiceLibrary;
  }

  function setTheme(theme: "light" | "dark" | "system") {
    state.theme = theme;
  }

  function isStartupComplete() {
    return state.startup.phase === "ready";
  }

  function isStartupError() {
    return state.startup.phase === "error";
  }

  return {
    get state() {
      return state;
    },
    setStartupPhase,
    setStartupProgress,
    setStartupError,
    updateDownloadProgress,
    resetDownload,
    toggleDebugConsole,
    toggleSettings,
    toggleHelp,
    toggleVoiceLibrary,
    setTheme,
    isStartupComplete,
    isStartupError,
  };
}

export const appStore = createAppStore();
