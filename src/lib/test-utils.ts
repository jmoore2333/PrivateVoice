import '@testing-library/jest-dom';
import { vi } from 'vitest';

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
