import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

describe('Settings Store', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('has correct default values', async () => {
    // Import fresh module
    vi.resetModules();
    const { settingsStore } = await import('./settingsStore.svelte');

    // Verify default model
    expect(settingsStore.state.defaultModel).toBe('0.6b');

    // Verify auto-load is enabled by default
    expect(settingsStore.state.autoLoadModel).toBe(true);

    // Verify onboarding not completed by default
    expect(settingsStore.state.hasCompletedOnboarding).toBe(false);
  });

  it('can update defaultModel setting', async () => {
    vi.resetModules();
    const { settingsStore } = await import('./settingsStore.svelte');

    settingsStore.updateSetting('defaultModel', '1.7b');
    expect(settingsStore.state.defaultModel).toBe('1.7b');

    // Verify localStorage was called
    expect(localStorageMock.setItem).toHaveBeenCalled();
  });

  it('can update autoLoadModel setting', async () => {
    vi.resetModules();
    const { settingsStore } = await import('./settingsStore.svelte');

    settingsStore.updateSetting('autoLoadModel', false);
    expect(settingsStore.state.autoLoadModel).toBe(false);
  });

  it('can update optional translation setting', async () => {
    vi.resetModules();
    const { settingsStore } = await import('./settingsStore.svelte');

    settingsStore.updateSetting('enableTranslation', true);
    expect(settingsStore.state.enableTranslation).toBe(true);
  });

  it('can complete onboarding with selected model', async () => {
    vi.resetModules();
    const { settingsStore } = await import('./settingsStore.svelte');

    // Simulate onboarding completion
    settingsStore.updateSetting('defaultModel', '1.7b-design');
    settingsStore.updateSetting('autoLoadModel', true);
    settingsStore.updateSetting('hasCompletedOnboarding', true);

    expect(settingsStore.state.defaultModel).toBe('1.7b-design');
    expect(settingsStore.state.autoLoadModel).toBe(true);
    expect(settingsStore.state.hasCompletedOnboarding).toBe(true);
  });

  it('loads persisted settings from localStorage', async () => {
    // Pre-populate localStorage with saved settings
    const savedSettings = {
      defaultModel: '1.7b',
      autoLoadModel: true,
      hasCompletedOnboarding: true,
      theme: 'dark',
      defaultSpeaker: 'serena',
    };
    localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(savedSettings));

    vi.resetModules();
    const { settingsStore } = await import('./settingsStore.svelte');

    expect(settingsStore.state.defaultModel).toBe('1.7b');
    expect(settingsStore.state.hasCompletedOnboarding).toBe(true);
    expect(settingsStore.state.defaultSpeaker).toBe('serena');
  });

  it('can reset to defaults', async () => {
    vi.resetModules();
    const { settingsStore } = await import('./settingsStore.svelte');

    // Change some settings
    settingsStore.updateSetting('defaultModel', '1.7b');
    settingsStore.updateSetting('hasCompletedOnboarding', true);

    // Reset
    settingsStore.resetToDefaults();

    // Verify back to defaults
    expect(settingsStore.state.defaultModel).toBe('0.6b');
    expect(settingsStore.state.hasCompletedOnboarding).toBe(false);
    expect(settingsStore.state.autoLoadModel).toBe(true);
  });
});
