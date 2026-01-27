/**
 * Settings store with persistence via localStorage (Tauri plugin-store for production).
 */

export interface Settings {
  theme: "light" | "dark" | "system";
  defaultModel: string;
  defaultSpeaker: string;
  autoLoadModel: boolean;
  showWaveform: boolean;
  showDebugOnStartup: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  defaultModel: "0.6b",
  defaultSpeaker: "Aiden",
  autoLoadModel: false,
  showWaveform: true,
  showDebugOnStartup: false,
};

const STORAGE_KEY = "qwen3-tts-settings";

function createSettingsStore() {
  let state = $state<Settings>(loadSettings());
  let isOpen = $state(false);

  function loadSettings(): Settings {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.warn("Failed to load settings:", e);
    }
    return DEFAULT_SETTINGS;
  }

  function saveSettings() {
    if (typeof window === "undefined") return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Failed to save settings:", e);
    }
  }

  function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    state = { ...state, [key]: value };
    saveSettings();

    // Apply theme immediately
    if (key === "theme") {
      applyTheme(value as Settings["theme"]);
    }
  }

  function applyTheme(theme: Settings["theme"]) {
    if (typeof window === "undefined") return;

    const root = document.documentElement;
    if (theme === "system") {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", prefersDark);
    } else {
      root.classList.toggle("dark", theme === "dark");
    }
  }

  function resetToDefaults() {
    state = { ...DEFAULT_SETTINGS };
    saveSettings();
    applyTheme(state.theme);
  }

  function open() {
    isOpen = true;
  }

  function close() {
    isOpen = false;
  }

  function toggle() {
    isOpen = !isOpen;
  }

  // Apply theme on initialization
  if (typeof window !== "undefined") {
    applyTheme(state.theme);
  }

  return {
    get state() {
      return state;
    },
    get isOpen() {
      return isOpen;
    },
    updateSetting,
    resetToDefaults,
    open,
    close,
    toggle,
  };
}

export const settingsStore = createSettingsStore();
