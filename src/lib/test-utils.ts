import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock localStorage for testing
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Mock Tauri APIs for testing
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
  Command: {
    sidecar: vi.fn(),
  },
}));

// Mock WaveSurfer for testing
vi.mock('$lib/audio/wavesurfer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('$lib/audio/wavesurfer')>();
  return {
    ...actual,
    createWaveSurfer: vi.fn(() => ({
      on: vi.fn(),
      load: vi.fn(),
      play: vi.fn(),
      pause: vi.fn(),
      stop: vi.fn(),
      playPause: vi.fn(),
      getDuration: vi.fn(() => 0),
      destroy: vi.fn(),
    })),
  };
});
