import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('$lib/api/ttsClient', () => {
  class GenerationCancelledError extends Error {
    constructor(message = 'Generation cancelled') {
      super(message);
      this.name = 'GenerationCancelledError';
    }
  }
  return {
    ttsClient: {
      generateBatch: vi.fn(),
      getBatchProgress: vi.fn(),
      cancelBatch: vi.fn(),
      abortGeneration: vi.fn(),
    },
    GenerationCancelledError,
    isCancellation: (e: unknown) => (e as Error)?.name === 'GenerationCancelledError',
  };
});

const REQUEST = {
  mode: 'voice-clone' as const,
  items: [{ text: 'one', output_filename: 'one.wav' }],
};

function idleProgress(overrides = {}) {
  return { total: 1, completed: 0, current_item: 'one.wav', status: 'running', ...overrides };
}

/** Wire generateBatch to stay pending until abortGeneration rejects it, like a real fetch. */
async function wireAbortableBatch() {
  const { ttsClient, GenerationCancelledError } = await import('$lib/api/ttsClient');
  let rejectBatch: (reason: unknown) => void = () => {};
  vi.mocked(ttsClient.generateBatch).mockImplementation(
    () => new Promise<Blob>((_resolve, reject) => { rejectBatch = reject; })
  );
  vi.mocked(ttsClient.abortGeneration).mockImplementation(() => {
    rejectBatch(new GenerationCancelledError());
  });
  return ttsClient;
}

/**
 * A File the store can actually read.
 *
 * jsdom's File does not implement `.text()`, which is the only File API
 * addFiles() uses, so a real `new File([...])` throws here.
 */
function makeTextFile(name: string, content: string): File {
  const file = new File([content], name, { type: 'text/plain' });
  Object.defineProperty(file, 'text', { value: async () => content });
  return file;
}

async function queueOneFile() {
  const { batchStore } = await import('./batchStore.svelte');
  await batchStore.addFiles([makeTextFile('one.txt', 'hello')]);
  return batchStore;
}

describe('batchStore error reporting (issue #13)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports a user cancellation as cancelled, not as a failure', async () => {
    const batchStore = await queueOneFile();
    const { ttsClient, GenerationCancelledError } = await import('$lib/api/ttsClient');

    vi.mocked(ttsClient.getBatchProgress).mockResolvedValue(idleProgress());
    vi.mocked(ttsClient.generateBatch).mockRejectedValue(new GenerationCancelledError());

    await batchStore.startBatch(REQUEST);

    expect(batchStore.state.progress.status).toBe('cancelled');
    expect(batchStore.state.error).toBeNull();
  });

  it('surfaces a real server error message instead of a generic fallback', async () => {
    const batchStore = await queueOneFile();
    const { ttsClient } = await import('$lib/api/ttsClient');

    vi.mocked(ttsClient.getBatchProgress).mockResolvedValue(idleProgress());
    vi.mocked(ttsClient.generateBatch).mockRejectedValue(
      new Error("Loaded model '0.6b' does not support mode 'voice-clone'")
    );

    await batchStore.startBatch(REQUEST);

    expect(batchStore.state.error).toContain('does not support mode');
    expect(batchStore.state.progress.status).toBe('error');
  });

  it('stops the batch and tells the server when progress stalls', async () => {
    vi.useFakeTimers();
    const batchStore = await queueOneFile();
    const { BATCH_STALL_TIMEOUT_MS } = await import('./batchStore.svelte');
    const ttsClient = await wireAbortableBatch();

    // The server answers every poll but never advances — a genuine stall.
    vi.mocked(ttsClient.getBatchProgress).mockResolvedValue(idleProgress());
    vi.mocked(ttsClient.cancelBatch).mockResolvedValue(undefined);

    const running = batchStore.startBatch(REQUEST);
    await vi.advanceTimersByTimeAsync(BATCH_STALL_TIMEOUT_MS + 2000);
    await running;

    // The server must be told to stop — issue #13 saw it generate for 25 more minutes.
    expect(ttsClient.cancelBatch).toHaveBeenCalled();
    expect(batchStore.state.progress.status).toBe('error');
    expect(batchStore.state.error).toMatch(/no progress/i);
  });

  it('does not stall out while the server keeps making progress', async () => {
    vi.useFakeTimers();
    const batchStore = await queueOneFile();
    const { BATCH_STALL_TIMEOUT_MS } = await import('./batchStore.svelte');
    const ttsClient = await wireAbortableBatch();

    let completed = 0;
    vi.mocked(ttsClient.getBatchProgress).mockImplementation(async () =>
      idleProgress({ total: 100, completed: completed++ })
    );

    const running = batchStore.startBatch(REQUEST);
    await vi.advanceTimersByTimeAsync(BATCH_STALL_TIMEOUT_MS * 2);

    expect(ttsClient.cancelBatch).not.toHaveBeenCalled();
    expect(batchStore.state.error).toBeNull();
    expect(batchStore.state.isProcessing).toBe(true);

    // Settle the pending batch so the poll timer is cleared before the next test.
    ttsClient.abortGeneration();
    await running;
  });

  it('stalls out even when the server never answers the progress poll', async () => {
    vi.useFakeTimers();
    const batchStore = await queueOneFile();
    const { BATCH_STALL_TIMEOUT_MS } = await import('./batchStore.svelte');
    const ttsClient = await wireAbortableBatch();

    vi.mocked(ttsClient.cancelBatch).mockResolvedValue(undefined);
    // A wedged server: connections accepted, nothing ever answered. Generation
    // runs on a worker thread, so a native hang blocks the event loop and the
    // poll never settles. If staleness were only checked after a SUCCESSFUL
    // poll, this batch would hang forever now that the total timeout is gone.
    vi.mocked(ttsClient.getBatchProgress).mockImplementation(() => new Promise(() => {}));

    const running = batchStore.startBatch(REQUEST);
    await vi.advanceTimersByTimeAsync(BATCH_STALL_TIMEOUT_MS + 2000);
    await running;

    expect(batchStore.state.progress.status).toBe('error');
    expect(batchStore.state.error).toMatch(/no progress/i);
    expect(batchStore.state.isProcessing).toBe(false);
  });

  it('does not hang when the cancel request itself never returns', async () => {
    vi.useFakeTimers();
    const batchStore = await queueOneFile();
    const { BATCH_STALL_TIMEOUT_MS } = await import('./batchStore.svelte');
    const ttsClient = await wireAbortableBatch();

    vi.mocked(ttsClient.getBatchProgress).mockResolvedValue(idleProgress());
    // /cancel-generation hangs too. Awaiting it before aborting would mean the
    // abort never happens and the batch never settles — the watchdog would
    // itself hang. Aborting first makes the outcome independent of this call.
    vi.mocked(ttsClient.cancelBatch).mockImplementation(() => new Promise(() => {}));

    const running = batchStore.startBatch(REQUEST);
    await vi.advanceTimersByTimeAsync(BATCH_STALL_TIMEOUT_MS + 2000);
    await running;

    expect(batchStore.state.isProcessing).toBe(false);
    expect(batchStore.state.error).toMatch(/no progress/i);
  });

  it('tells the user nothing was saved, since a partial batch produces no files', async () => {
    vi.useFakeTimers();
    const batchStore = await queueOneFile();
    const { BATCH_STALL_TIMEOUT_MS } = await import('./batchStore.svelte');
    const ttsClient = await wireAbortableBatch();

    vi.mocked(ttsClient.cancelBatch).mockResolvedValue(undefined);
    vi.mocked(ttsClient.getBatchProgress).mockResolvedValue(
      idleProgress({ total: 10, completed: 6 })
    );

    const running = batchStore.startBatch(REQUEST);
    await vi.advanceTimersByTimeAsync(BATCH_STALL_TIMEOUT_MS + 2000);
    await running;

    // The ZIP is only built after the final item, so "6 of 10" must not be
    // phrased as though six files were delivered.
    expect(batchStore.state.error).toMatch(/no files were saved/i);
  });
});
