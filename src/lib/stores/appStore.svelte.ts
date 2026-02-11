/**
 * Application state store for startup, downloads, and UI state.
 */

export type StartupPhase =
  | "initializing"
  | "setup-detecting-hardware"
  | "setup-checking-disk"
  | "setup-copying-source"
  | "setup-installing-python"
  | "setup-creating-venv"
  | "setup-installing-deps"
  | "setup-verifying"
  | "setup-complete"
  | "starting-server"
  | "checking-models"
  | "downloading"
  | "loading-model"
  | "ready"
  | "error";

/** Whether a phase is part of the first-run setup wizard. */
export function isSetupPhase(phase: StartupPhase): boolean {
  return phase.startsWith("setup-");
}

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

// Progress percentages for each phase.
// On first run, setup phases occupy 0–70%, server phases 70–100%.
// On subsequent runs, setup phases are skipped entirely.
const PHASE_PROGRESS: Record<StartupPhase, [number, number]> = {
  initializing: [0, 2],
  "setup-detecting-hardware": [2, 5],
  "setup-checking-disk": [5, 6],
  "setup-copying-source": [6, 8],
  "setup-installing-python": [8, 18],
  "setup-creating-venv": [18, 22],
  "setup-installing-deps": [22, 65],
  "setup-verifying": [65, 68],
  "setup-complete": [68, 70],
  "starting-server": [70, 78],
  "checking-models": [78, 82],
  downloading: [82, 94],
  "loading-model": [94, 98],
  ready: [100, 100],
  error: [0, 0],
};

const PHASE_MESSAGES: Record<StartupPhase, string> = {
  initializing: "Starting Python environment...",
  "setup-detecting-hardware": "Detecting hardware (GPU/CPU)...",
  "setup-checking-disk": "Checking available disk space...",
  "setup-copying-source": "Copying Python source files...",
  "setup-installing-python": "Installing Python 3.11...",
  "setup-creating-venv": "Creating virtual environment...",
  "setup-installing-deps": "Installing dependencies (this may take a few minutes)...",
  "setup-verifying": "Verifying Python environment...",
  "setup-complete": "Setup complete!",
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
