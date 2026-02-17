/**
 * Settings store with persistence via localStorage (Tauri plugin-store for production).
 */

export interface Settings {
  theme: "light" | "dark" | "system";
  defaultModel: string;
  defaultProvider: "qwen3" | "chatterbox";
  defaultModelKey: string;
  enableAdvancedProviders: boolean;
  defaultSpeaker: string;
  autoLoadModel: boolean;
  showWaveform: boolean;
  showDebugOnStartup: boolean;
  stableCustomVoiceLeadIn: boolean;
  stableVoiceDesignLeadIn: boolean;
  // Audio settings
  exportFolder: string;
  exportFormat: "wav" | "mp3";
  wavSampleRate: number | null;
  wavBitDepth: 16 | 24 | 32;
  wavChannels: 1 | 2;
  // Library settings
  recentCacheSize: number;
  // Optional features
  enableWhisper: boolean;
  enableTranslation: boolean;
  enableBatchMode: boolean;
  // Chatterbox advanced controls
  chatterboxPreset: "stable" | "balanced" | "expressive";
  chatterboxTemperature: number;
  chatterboxTopP: number;
  chatterboxTopK: number;
  chatterboxMinP: number;
  chatterboxRepetitionPenalty: number;
  chatterboxCfgWeight: number;
  chatterboxExaggeration: number;
  chatterboxNormLoudness: boolean;
  chatterboxLanguageId: string;
  // Onboarding
  hasCompletedOnboarding: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  theme: "dark",
  defaultModel: "0.6b",
  defaultProvider: "qwen3",
  defaultModelKey: "0.6b",
  enableAdvancedProviders: false,
  defaultSpeaker: "aiden",
  autoLoadModel: true,
  showWaveform: true,
  showDebugOnStartup: false,
  stableCustomVoiceLeadIn: true,
  stableVoiceDesignLeadIn: true,
  // Audio settings
  exportFolder: "~/Documents/PrivateVoice",
  exportFormat: "wav",
  wavSampleRate: null,
  wavBitDepth: 16,
  wavChannels: 1,
  // Library settings
  recentCacheSize: 10,
  // Optional features
  enableWhisper: false,
  enableTranslation: false,
  enableBatchMode: false,
  chatterboxPreset: "balanced",
  chatterboxTemperature: 0.8,
  chatterboxTopP: 0.95,
  chatterboxTopK: 1000,
  chatterboxMinP: 0.05,
  chatterboxRepetitionPenalty: 1.2,
  chatterboxCfgWeight: 0.5,
  chatterboxExaggeration: 0.5,
  chatterboxNormLoudness: true,
  chatterboxLanguageId: "en",
  // Onboarding
  hasCompletedOnboarding: false,
};

const STORAGE_KEY = "privatevoice-settings";

const MODEL_ID_TO_PROVIDER_KEY: Record<string, { provider: Settings["defaultProvider"]; modelKey: string }> = {
  "0.6b": { provider: "qwen3", modelKey: "0.6b" },
  "1.7b": { provider: "qwen3", modelKey: "1.7b" },
  "0.6b-base": { provider: "qwen3", modelKey: "0.6b-base" },
  "1.7b-base": { provider: "qwen3", modelKey: "1.7b-base" },
  "1.7b-design": { provider: "qwen3", modelKey: "1.7b-design" },
  "cb-turbo": { provider: "chatterbox", modelKey: "turbo" },
  "cb-original": { provider: "chatterbox", modelKey: "original" },
  "cb-multilingual": { provider: "chatterbox", modelKey: "multilingual" },
  // Accept provider-native keys in legacy fields as a defensive migration path.
  turbo: { provider: "chatterbox", modelKey: "turbo" },
  original: { provider: "chatterbox", modelKey: "original" },
  multilingual: { provider: "chatterbox", modelKey: "multilingual" },
};

const PROVIDER_KEY_TO_MODEL_ID: Record<string, string> = Object.fromEntries(
  Object.entries(MODEL_ID_TO_PROVIDER_KEY).map(([modelId, info]) => [
    `${info.provider}:${info.modelKey}`,
    modelId.startsWith("cb-") || info.provider === "qwen3" ? modelId : `cb-${info.modelKey}`,
  ])
);

function migrateSettings(raw: Partial<Settings>): Settings {
  const merged: Settings = { ...DEFAULT_SETTINGS, ...raw };
  const legacyModel = typeof raw.defaultModel === "string" ? raw.defaultModel : merged.defaultModel;
  const legacyMapped = MODEL_ID_TO_PROVIDER_KEY[legacyModel];

  if (!raw.defaultProvider || !raw.defaultModelKey) {
    if (legacyMapped) {
      merged.defaultProvider = legacyMapped.provider;
      merged.defaultModelKey = legacyMapped.modelKey;
    }
  }

  const modelId = PROVIDER_KEY_TO_MODEL_ID[`${merged.defaultProvider}:${merged.defaultModelKey}`];
  if (modelId) {
    merged.defaultModel = modelId;
  } else if (!MODEL_ID_TO_PROVIDER_KEY[merged.defaultModel]) {
    merged.defaultModel = DEFAULT_SETTINGS.defaultModel;
    merged.defaultProvider = DEFAULT_SETTINGS.defaultProvider;
    merged.defaultModelKey = DEFAULT_SETTINGS.defaultModelKey;
  }

  return merged;
}

function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return migrateSettings(JSON.parse(stored) as Partial<Settings>);
    }
  } catch (e) {
    console.warn("Failed to load settings:", e);
  }
  return DEFAULT_SETTINGS;
}

function createSettingsStore() {
  let state = $state<Settings>(loadSettings());
  let isOpen = $state(false);

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
