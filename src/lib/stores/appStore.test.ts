import { describe, it, expect, beforeEach } from 'vitest';
import { appStore } from './appStore.svelte';

describe('appStore', () => {
  beforeEach(() => {
    // Reset to initial state
    appStore.setStartupPhase('initializing');
    appStore.resetDownload();
  });

  describe('startup phases', () => {
    it('starts in initializing phase', () => {
      expect(appStore.state.startup.phase).toBe('initializing');
      expect(appStore.state.startup.progress).toBe(0);
      expect(appStore.isStartupComplete()).toBe(false);
      expect(appStore.isStartupError()).toBe(false);
    });

    it('transitions through startup phases with correct progress ranges', () => {
      appStore.setStartupPhase('starting-server');
      expect(appStore.state.startup.phase).toBe('starting-server');
      expect(appStore.state.startup.progress).toBe(70);

      appStore.setStartupPhase('checking-models');
      expect(appStore.state.startup.phase).toBe('checking-models');
      expect(appStore.state.startup.progress).toBe(78);

      appStore.setStartupPhase('loading-model');
      expect(appStore.state.startup.phase).toBe('loading-model');
      expect(appStore.state.startup.progress).toBe(94);

      appStore.setStartupPhase('ready');
      expect(appStore.state.startup.phase).toBe('ready');
      expect(appStore.state.startup.progress).toBe(100);
      expect(appStore.isStartupComplete()).toBe(true);
    });

    it('uses default message for phase', () => {
      appStore.setStartupPhase('downloading');
      expect(appStore.state.startup.message).toBe('Downloading model from HuggingFace...');
    });

    it('accepts custom message for phase', () => {
      appStore.setStartupPhase('downloading', 'Downloading 0.6B model...');
      expect(appStore.state.startup.message).toBe('Downloading 0.6B model...');
    });

    it('sets error state', () => {
      appStore.setStartupError('Connection failed');
      expect(appStore.state.startup.phase).toBe('error');
      expect(appStore.state.startup.message).toBe('Connection failed');
      expect(appStore.state.startup.progress).toBe(0);
      expect(appStore.isStartupError()).toBe(true);
      expect(appStore.isStartupComplete()).toBe(false);
    });

    it('maps sub-progress within phase range', () => {
      appStore.setStartupPhase('downloading'); // range: 82-94
      appStore.setStartupProgress(50); // 50% of download phase
      // 82 + (50/100) * (94-82) = 82 + 6 = 88
      expect(appStore.state.startup.progress).toBe(88);
    });

    it('clamps progress to phase maximum', () => {
      appStore.setStartupPhase('downloading'); // range: 82-94
      appStore.setStartupProgress(200); // over 100%
      expect(appStore.state.startup.progress).toBe(94);
    });
  });

  describe('download progress', () => {
    it('starts with idle download', () => {
      expect(appStore.state.download.status).toBe('idle');
      expect(appStore.state.download.bytesDownloaded).toBe(0);
    });

    it('updates download progress', () => {
      appStore.updateDownloadProgress({
        status: 'downloading',
        fileName: 'model.safetensors',
        bytesDownloaded: 500_000_000,
        bytesTotal: 1_000_000_000,
        speedMbps: 50,
        eta: 10,
      });
      expect(appStore.state.download.status).toBe('downloading');
      expect(appStore.state.download.fileName).toBe('model.safetensors');
      expect(appStore.state.download.bytesDownloaded).toBe(500_000_000);
    });

    it('updates startup progress when downloading', () => {
      appStore.setStartupPhase('downloading');
      appStore.updateDownloadProgress({
        status: 'downloading',
        bytesDownloaded: 500_000_000,
        bytesTotal: 1_000_000_000,
      });
      // 50% download maps to: 82 + (50/100) * (94-82) = 82 + 6 = 88
      expect(appStore.state.startup.progress).toBe(88);
    });

    it('resets download state', () => {
      appStore.updateDownloadProgress({ status: 'downloading', fileName: 'test.bin' });
      appStore.resetDownload();
      expect(appStore.state.download.status).toBe('idle');
      expect(appStore.state.download.fileName).toBe('');
    });
  });

  describe('UI toggles', () => {
    it('toggles debug console', () => {
      expect(appStore.state.showDebugConsole).toBe(false);
      appStore.toggleDebugConsole();
      expect(appStore.state.showDebugConsole).toBe(true);
      appStore.toggleDebugConsole();
      expect(appStore.state.showDebugConsole).toBe(false);
    });

    it('toggles settings', () => {
      expect(appStore.state.showSettings).toBe(false);
      appStore.toggleSettings();
      expect(appStore.state.showSettings).toBe(true);
    });

    it('toggles help', () => {
      expect(appStore.state.showHelp).toBe(false);
      appStore.toggleHelp();
      expect(appStore.state.showHelp).toBe(true);
    });

    it('toggles voice library', () => {
      expect(appStore.state.showVoiceLibrary).toBe(false);
      appStore.toggleVoiceLibrary();
      expect(appStore.state.showVoiceLibrary).toBe(true);
    });

    it('sets theme', () => {
      appStore.setTheme('dark');
      expect(appStore.state.theme).toBe('dark');
      appStore.setTheme('light');
      expect(appStore.state.theme).toBe('light');
    });
  });
});
