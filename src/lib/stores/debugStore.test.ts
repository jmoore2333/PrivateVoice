import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock ttsClient
vi.mock('$lib/api/ttsClient', () => ({
  ttsClient: {
    getSystemInfo: vi.fn(),
    getLogs: vi.fn(),
  },
}));

describe('Debug Store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('has correct initial state', async () => {
    const { debugStore } = await import('./debugStore.svelte');

    expect(debugStore.state.isVisible).toBe(false);
    expect(debugStore.state.isLoading).toBe(false);
    expect(debugStore.state.isLoadingSystemInfo).toBe(false);
    expect(debugStore.state.systemInfo).toBeNull();
    expect(debugStore.state.systemInfoError).toBeNull();
    expect(debugStore.state.logs).toEqual([]);
    expect(debugStore.state.filter).toBe('ALL');
    expect(debugStore.state.autoScroll).toBe(true);
  });

  it('can toggle visibility', async () => {
    const { debugStore } = await import('./debugStore.svelte');
    const { ttsClient } = await import('$lib/api/ttsClient');

    // Mock successful responses
    vi.mocked(ttsClient.getLogs).mockResolvedValue([]);
    vi.mocked(ttsClient.getSystemInfo).mockResolvedValue({
      python_version: '3.11.0',
      torch_version: '2.0.0',
      device: 'mps',
      device_name: 'Apple Silicon (MPS)',
      memory_total_gb: 16,
      memory_available_gb: 8,
      cache_dir: '~/.cache/huggingface',
    });

    expect(debugStore.state.isVisible).toBe(false);

    debugStore.toggleVisibility();
    expect(debugStore.state.isVisible).toBe(true);

    debugStore.toggleVisibility();
    expect(debugStore.state.isVisible).toBe(false);
  });

  it('can add logs', async () => {
    const { debugStore } = await import('./debugStore.svelte');

    debugStore.addLog({
      level: 'INFO',
      message: 'Test message',
      timestamp: '2024-01-01T00:00:00Z',
    });

    expect(debugStore.state.logs).toHaveLength(1);
    expect(debugStore.state.logs[0].message).toBe('Test message');
    expect(debugStore.state.logs[0].level).toBe('INFO');
  });

  it('can clear logs', async () => {
    const { debugStore } = await import('./debugStore.svelte');

    debugStore.addLog({
      level: 'INFO',
      message: 'Test message',
      timestamp: '2024-01-01T00:00:00Z',
    });

    expect(debugStore.state.logs).toHaveLength(1);

    debugStore.clearLogs();
    expect(debugStore.state.logs).toHaveLength(0);
  });

  it('can filter logs by level', async () => {
    const { debugStore } = await import('./debugStore.svelte');

    debugStore.addLog({ level: 'DEBUG', message: 'Debug msg', timestamp: '2024-01-01T00:00:00Z' });
    debugStore.addLog({ level: 'INFO', message: 'Info msg', timestamp: '2024-01-01T00:00:01Z' });
    debugStore.addLog({ level: 'ERROR', message: 'Error msg', timestamp: '2024-01-01T00:00:02Z' });

    expect(debugStore.state.logs).toHaveLength(3);

    // Set filter to ERROR only
    debugStore.setFilter('ERROR');
    expect(debugStore.filteredLogs).toHaveLength(1);
    expect(debugStore.filteredLogs[0].message).toBe('Error msg');

    // Set filter to INFO (includes INFO, WARNING, ERROR)
    debugStore.setFilter('INFO');
    expect(debugStore.filteredLogs).toHaveLength(2);

    // Reset to ALL
    debugStore.setFilter('ALL');
    expect(debugStore.filteredLogs).toHaveLength(3);
  });

  it('sets loading state during fetchSystemInfo', async () => {
    const { debugStore } = await import('./debugStore.svelte');
    const { ttsClient } = await import('$lib/api/ttsClient');

    // Mock slow response
    vi.mocked(ttsClient.getSystemInfo).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                python_version: '3.11.0',
                torch_version: '2.0.0',
                device: 'mps',
                device_name: 'Apple Silicon (MPS)',
                memory_total_gb: 16,
                memory_available_gb: 8,
                cache_dir: '~/.cache/huggingface',
              }),
            100,
          ),
        ),
    );

    expect(debugStore.state.isLoadingSystemInfo).toBe(false);

    const fetchPromise = debugStore.fetchSystemInfo();
    expect(debugStore.state.isLoadingSystemInfo).toBe(true);

    await fetchPromise;
    expect(debugStore.state.isLoadingSystemInfo).toBe(false);
    expect(debugStore.state.systemInfo).not.toBeNull();
    expect(debugStore.state.systemInfoError).toBeNull();
  });

  it('sets error state when fetchSystemInfo fails', async () => {
    const { debugStore } = await import('./debugStore.svelte');
    const { ttsClient } = await import('$lib/api/ttsClient');

    vi.mocked(ttsClient.getSystemInfo).mockRejectedValue(new Error('Server not available'));

    await debugStore.fetchSystemInfo();

    expect(debugStore.state.isLoadingSystemInfo).toBe(false);
    expect(debugStore.state.systemInfo).toBeNull();
    expect(debugStore.state.systemInfoError).toBe('Server not available');
  });
});
