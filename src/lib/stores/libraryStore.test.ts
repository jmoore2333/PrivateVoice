import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

// ──────────────────────────────────────────────────────────────────────────────
// Mock @tauri-apps/plugin-fs BEFORE importing the store
// ──────────────────────────────────────────────────────────────────────────────

// In-memory filesystem for Tauri FS mock
let mockFs: Record<string, string | Uint8Array> = {};
let tauriAvailable = false;

const fsMock = {
  BaseDirectory: { AppData: 1 },
  exists: vi.fn(async (path: string) => {
    return path in mockFs;
  }),
  mkdir: vi.fn(async () => {}),
  readTextFile: vi.fn(async (path: string) => {
    if (path in mockFs) return mockFs[path] as string;
    throw new Error(`File not found: ${path}`);
  }),
  writeTextFile: vi.fn(async (path: string, content: string) => {
    mockFs[path] = content;
  }),
  readFile: vi.fn(async (path: string) => {
    if (path in mockFs) return mockFs[path] as Uint8Array;
    throw new Error(`File not found: ${path}`);
  }),
  writeFile: vi.fn(async (path: string, data: Uint8Array) => {
    mockFs[path] = data;
  }),
  remove: vi.fn(async (path: string) => {
    delete mockFs[path];
  }),
};

vi.mock('@tauri-apps/plugin-fs', () => {
  const guard = <T extends (...a: never[]) => unknown>(fn: T) =>
    ((...args: Parameters<T>) => {
      if (!tauriAvailable) throw new Error('Not in Tauri');
      return fn(...args);
    }) as T;

  return {
    get BaseDirectory() { return fsMock.BaseDirectory; },
    exists: guard(fsMock.exists),
    mkdir: guard(fsMock.mkdir),
    readTextFile: guard(fsMock.readTextFile),
    writeTextFile: guard(fsMock.writeTextFile),
    readFile: guard(fsMock.readFile),
    writeFile: guard(fsMock.writeFile),
    remove: guard(fsMock.remove),
  };
});

// Mock URL.createObjectURL / revokeObjectURL
const createdUrls: string[] = [];
const revokedUrls: string[] = [];
globalThis.URL.createObjectURL = vi.fn((blob: Blob) => {
  const url = `blob:mock-${createdUrls.length}`;
  createdUrls.push(url);
  return url;
});
globalThis.URL.revokeObjectURL = vi.fn((url: string) => {
  revokedUrls.push(url);
});

// ──────────────────────────────────────────────────────────────────────────────
// Import the store AFTER mocks are set up
// ──────────────────────────────────────────────────────────────────────────────

import { libraryStore } from './libraryStore.svelte';
import type { LibraryItem } from './libraryStore.svelte';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id: overrides.id ?? `item-${Date.now()}-${Math.random()}`,
    type: 'audio',
    name: 'Test Clip',
    audioUrl: 'blob:test',
    createdAt: new Date('2025-01-15T10:00:00Z'),
    ...overrides,
  };
}

function makeBlob(): Blob {
  // Minimal WAV-like blob for testing
  return new Blob([new Uint8Array([0x52, 0x49, 0x46, 0x46])], { type: 'audio/wav' });
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests — localStorage fallback (default, no Tauri)
// ──────────────────────────────────────────────────────────────────────────────

describe('libraryStore (localStorage fallback)', () => {
  beforeEach(async () => {
    tauriAvailable = false;
    mockFs = {};
    createdUrls.length = 0;
    revokedUrls.length = 0;
    vi.clearAllMocks();
    await libraryStore.clearAll();
  });

  it('starts with empty recent and saved lists', () => {
    expect(libraryStore.recent).toEqual([]);
    expect(libraryStore.saved).toEqual([]);
  });

  it('reports initialized after init completes', () => {
    expect(libraryStore.initialized).toBe(true);
  });

  // ── Recent cache ────────────────────────────────────────────────────────

  it('adds item to recent cache', () => {
    libraryStore.addToRecent(makeItem({ id: '1' }));
    expect(libraryStore.recent.length).toBe(1);
    expect(libraryStore.recent[0].id).toBe('1');
  });

  it('prepends new items to recent (most recent first)', () => {
    libraryStore.addToRecent(makeItem({ id: 'a', name: 'First' }));
    libraryStore.addToRecent(makeItem({ id: 'b', name: 'Second' }));
    expect(libraryStore.recent[0].id).toBe('b');
    expect(libraryStore.recent[1].id).toBe('a');
  });

  it('limits recent cache to maxRecent items', () => {
    for (let i = 0; i < 15; i++) {
      libraryStore.addToRecent(makeItem({ id: String(i), name: `Clip ${i}` }));
    }
    expect(libraryStore.recent.length).toBe(10); // MAX_RECENT_DEFAULT
  });

  it('respects setMaxRecent and trims existing items', () => {
    for (let i = 0; i < 8; i++) {
      libraryStore.addToRecent(makeItem({ id: String(i) }));
    }
    expect(libraryStore.recent.length).toBe(8);

    libraryStore.setMaxRecent(5);
    expect(libraryStore.maxRecent).toBe(5);
    expect(libraryStore.recent.length).toBe(5);
  });

  it('clearRecent empties list and revokes blob URLs', () => {
    libraryStore.addToRecent(makeItem({ id: '1', audioUrl: 'blob:url1' }));
    libraryStore.addToRecent(makeItem({ id: '2', audioUrl: 'blob:url2' }));
    libraryStore.clearRecent();
    expect(libraryStore.recent.length).toBe(0);
    expect(revokedUrls).toContain('blob:url1');
    expect(revokedUrls).toContain('blob:url2');
  });

  it('clearRecent skips non-blob URLs', () => {
    libraryStore.addToRecent(makeItem({ id: '1', audioUrl: '' }));
    libraryStore.clearRecent();
    expect(revokedUrls.length).toBe(0);
  });

  // ── Saved library ──────────────────────────────────────────────────────

  it('saves item to library', async () => {
    await libraryStore.saveToLibrary(makeItem({ id: '1', type: 'clone', name: 'My Voice' }));
    expect(libraryStore.saved.length).toBe(1);
    expect(libraryStore.saved[0].name).toBe('My Voice');
  });

  it('prepends saved items (newest first)', async () => {
    await libraryStore.saveToLibrary(makeItem({ id: '1', name: 'First' }));
    await libraryStore.saveToLibrary(makeItem({ id: '2', name: 'Second' }));
    expect(libraryStore.saved[0].id).toBe('2');
    expect(libraryStore.saved[1].id).toBe('1');
  });

  it('removes item from library', async () => {
    await libraryStore.saveToLibrary(makeItem({ id: '1' }));
    expect(libraryStore.saved.length).toBe(1);
    await libraryStore.removeFromLibrary('1');
    expect(libraryStore.saved.length).toBe(0);
  });

  it('removeFromLibrary revokes blob URLs', async () => {
    await libraryStore.saveToLibrary(makeItem({ id: '1', audioUrl: 'blob:saved-url' }));
    await libraryStore.removeFromLibrary('1');
    expect(revokedUrls).toContain('blob:saved-url');
  });

  it('removeFromLibrary is safe for non-existent IDs', async () => {
    await libraryStore.removeFromLibrary('nonexistent');
    expect(libraryStore.saved.length).toBe(0);
  });

  it('updates item in library', async () => {
    await libraryStore.saveToLibrary(makeItem({ id: '1', name: 'Original' }));
    await libraryStore.updateItem('1', { name: 'Updated' });
    expect(libraryStore.saved[0].name).toBe('Updated');
  });

  it('updateItem preserves other fields', async () => {
    await libraryStore.saveToLibrary(makeItem({
      id: '1',
      name: 'Original',
      type: 'clone',
      comment: 'test comment',
    }));
    await libraryStore.updateItem('1', { name: 'Updated' });
    expect(libraryStore.saved[0].type).toBe('clone');
    expect(libraryStore.saved[0].comment).toBe('test comment');
  });

  it('updateItem is no-op for non-existent IDs', async () => {
    await libraryStore.saveToLibrary(makeItem({ id: '1', name: 'Original' }));
    await libraryStore.updateItem('nonexistent', { name: 'Updated' });
    expect(libraryStore.saved[0].name).toBe('Original');
  });

  // ── clearAll ───────────────────────────────────────────────────────────

  it('clearAll removes all recent and saved items', async () => {
    libraryStore.addToRecent(makeItem({ id: 'r1' }));
    await libraryStore.saveToLibrary(makeItem({ id: 's1' }));
    await libraryStore.clearAll();
    expect(libraryStore.recent.length).toBe(0);
    expect(libraryStore.saved.length).toBe(0);
  });

  it('clearAll revokes all blob URLs from both recent and saved', async () => {
    libraryStore.addToRecent(makeItem({ id: 'r1', audioUrl: 'blob:recent' }));
    await libraryStore.saveToLibrary(makeItem({ id: 's1', audioUrl: 'blob:saved' }));
    await libraryStore.clearAll();
    expect(revokedUrls).toContain('blob:recent');
    expect(revokedUrls).toContain('blob:saved');
  });

  it('clearAll removes localStorage entry', async () => {
    await libraryStore.saveToLibrary(makeItem({ id: '1' }));
    expect(localStorage.getItem('privatevoice-library')).not.toBeNull();
    await libraryStore.clearAll();
    expect(localStorage.getItem('privatevoice-library')).toBeNull();
  });

  // ── localStorage persistence ───────────────────────────────────────────

  it('persists metadata to localStorage (not audioUrl)', async () => {
    await libraryStore.saveToLibrary(makeItem({
      id: 'persist-1',
      name: 'Persisted',
      audioUrl: 'blob:should-not-persist',
      metadata: { speaker: 'aiden' },
    }));

    const stored = JSON.parse(localStorage.getItem('privatevoice-library')!);
    expect(stored.saved).toHaveLength(1);
    expect(stored.saved[0].id).toBe('persist-1');
    expect(stored.saved[0].name).toBe('Persisted');
    // audioUrl should be stripped from persisted data
    expect(stored.saved[0].audioUrl).toBeUndefined();
    // createdAt should be ISO string
    expect(typeof stored.saved[0].createdAt).toBe('string');
    // metadata preserved
    expect(stored.saved[0].metadata.speaker).toBe('aiden');
  });

  // ── Metadata fields ────────────────────────────────────────────────────

  it('preserves all metadata fields through save/retrieve', async () => {
    await libraryStore.saveToLibrary(makeItem({
      id: 'meta-1',
      type: 'design',
      name: 'Designed Voice',
      comment: 'Great for narration',
      tags: ['warm', 'male'],
      metadata: {
        speaker: 'ryan',
        language: 'en',
        voiceDescription: 'A warm male voice',
        modelId: '1.7b-design',
      },
    }));

    const item = libraryStore.saved[0];
    expect(item.comment).toBe('Great for narration');
    expect(item.tags).toEqual(['warm', 'male']);
    expect(item.metadata?.speaker).toBe('ryan');
    expect(item.metadata?.voiceDescription).toBe('A warm male voice');
    expect(item.metadata?.modelId).toBe('1.7b-design');
  });

  it('handles items with all three types', async () => {
    await libraryStore.saveToLibrary(makeItem({ id: '1', type: 'audio' }));
    await libraryStore.saveToLibrary(makeItem({ id: '2', type: 'clone' }));
    await libraryStore.saveToLibrary(makeItem({ id: '3', type: 'design' }));

    expect(libraryStore.saved.map(i => i.type)).toEqual(['design', 'clone', 'audio']);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests — reference audio (what makes a saved clone reusable as a voice)
// ──────────────────────────────────────────────────────────────────────────────

describe('libraryStore reference audio', () => {
  beforeEach(async () => {
    tauriAvailable = false;
    mockFs = {};
    createdUrls.length = 0;
    revokedUrls.length = 0;
    vi.clearAllMocks();
    await libraryStore.clearAll();
  });

  it('marks a clone saved with reference audio as reusable', async () => {
    const reference = makeBlob();

    const result = await libraryStore.saveToLibrary(
      makeItem({ id: 'ref-1', type: 'clone', name: 'Voice 1' }),
      undefined,
      reference
    );

    expect(result.ok).toBe(true);
    const saved = libraryStore.saved.find(i => i.id === 'ref-1');
    expect(saved?.metadata?.hasReferenceAudio).toBe(true);
    expect(saved?.referenceAudioUrl).toBeTruthy();
  });

  it('returns the stored reference blob for reuse', async () => {
    const reference = makeBlob();
    await libraryStore.saveToLibrary(
      makeItem({ id: 'ref-1', type: 'clone' }),
      undefined,
      reference
    );

    const roundTripped = await libraryStore.getReferenceBlob('ref-1');
    expect(roundTripped).toBe(reference);
  });

  it('leaves a clone saved without reference audio unusable as a voice', async () => {
    await libraryStore.saveToLibrary(makeItem({ id: 'ref-2', type: 'clone' }));

    const saved = libraryStore.saved.find(i => i.id === 'ref-2');
    expect(saved?.metadata?.hasReferenceAudio).toBeFalsy();
    expect(await libraryStore.getReferenceBlob('ref-2')).toBeNull();
  });

  it('preserves existing metadata when recording the reference flag', async () => {
    await libraryStore.saveToLibrary(
      makeItem({
        id: 'ref-3',
        type: 'clone',
        metadata: { referenceText: 'Testing, testing.', lowQualityMode: true },
      }),
      undefined,
      makeBlob()
    );

    const saved = libraryStore.saved.find(i => i.id === 'ref-3');
    expect(saved?.metadata?.referenceText).toBe('Testing, testing.');
    expect(saved?.metadata?.lowQualityMode).toBe(true);
    expect(saved?.metadata?.hasReferenceAudio).toBe(true);
  });

  it('drops the reference when the item is removed', async () => {
    await libraryStore.saveToLibrary(
      makeItem({ id: 'ref-4', type: 'clone' }),
      undefined,
      makeBlob()
    );
    const savedUrl = libraryStore.saved.find(i => i.id === 'ref-4')?.referenceAudioUrl;

    await libraryStore.removeFromLibrary('ref-4');

    expect(await libraryStore.getReferenceBlob('ref-4')).toBeNull();
    expect(revokedUrls).toContain(savedUrl);
  });

  it('never writes the reference object URL into persisted metadata', async () => {
    await libraryStore.saveToLibrary(
      makeItem({ id: 'ref-5', type: 'clone' }),
      undefined,
      makeBlob()
    );

    const stored = JSON.parse(localStorage.getItem('privatevoice-library') ?? '{}');
    expect(stored.saved[0].referenceAudioUrl).toBeUndefined();
    expect(stored.saved[0].audioUrl).toBeUndefined();
    expect(stored.saved[0].metadata.hasReferenceAudio).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests — Tauri FS path (mocked)
// ──────────────────────────────────────────────────────────────────────────────

describe('libraryStore (Tauri FS mocked)', () => {
  // Since libraryStore is a singleton that already initialized with localStorage,
  // we test the underlying Tauri FS functions indirectly through the mock behavior.
  // The init() ran once on module load; these tests verify the FS mock contract.

  beforeEach(() => {
    tauriAvailable = true;
    mockFs = {};
    createdUrls.length = 0;
    revokedUrls.length = 0;
    vi.clearAllMocks();
  });

  it('mock FS exists returns false for missing files', async () => {
    expect(await fsMock.exists('nonexistent')).toBe(false);
  });

  it('mock FS write and read cycle works for text files', async () => {
    const items = [{ id: '1', type: 'audio', name: 'Test', createdAt: '2025-01-15T10:00:00.000Z' }];
    await fsMock.writeTextFile('library/index.json', JSON.stringify(items));
    expect(await fsMock.exists('library/index.json')).toBe(true);

    const content = await fsMock.readTextFile('library/index.json');
    const parsed = JSON.parse(content as string);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('1');
  });

  it('mock FS write and read cycle works for binary files', async () => {
    const data = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
    await fsMock.writeFile('library/test.wav', data);
    expect(await fsMock.exists('library/test.wav')).toBe(true);

    const read = await fsMock.readFile('library/test.wav');
    expect(read).toEqual(data);
  });

  it('mock FS remove deletes files', async () => {
    await fsMock.writeTextFile('library/test.txt', 'hello');
    expect(await fsMock.exists('library/test.txt')).toBe(true);
    await fsMock.remove('library/test.txt');
    expect(await fsMock.exists('library/test.txt')).toBe(false);
  });

  it('mock FS readTextFile throws for missing files', async () => {
    await expect(fsMock.readTextFile('nonexistent')).rejects.toThrow();
  });

  it('mock FS readFile throws for missing files', async () => {
    await expect(fsMock.readFile('nonexistent')).rejects.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Tests — Edge cases and robustness
// ──────────────────────────────────────────────────────────────────────────────

describe('libraryStore edge cases', () => {
  beforeEach(async () => {
    tauriAvailable = false;
    mockFs = {};
    createdUrls.length = 0;
    revokedUrls.length = 0;
    vi.clearAllMocks();
    await libraryStore.clearAll();
  });

  it('handles rapid sequential saves', async () => {
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(libraryStore.saveToLibrary(makeItem({ id: `rapid-${i}` })));
    }
    await Promise.all(promises);
    expect(libraryStore.saved.length).toBe(5);
  });

  it('handles save then immediate remove', async () => {
    await libraryStore.saveToLibrary(makeItem({ id: 'quick' }));
    await libraryStore.removeFromLibrary('quick');
    expect(libraryStore.saved.length).toBe(0);
  });

  it('handles empty name in item', async () => {
    await libraryStore.saveToLibrary(makeItem({ id: 'empty-name', name: '' }));
    expect(libraryStore.saved[0].name).toBe('');
  });

  it('handles very long name in item', async () => {
    const longName = 'A'.repeat(1000);
    await libraryStore.saveToLibrary(makeItem({ id: 'long-name', name: longName }));
    expect(libraryStore.saved[0].name).toBe(longName);
  });

  it('handles special characters in name', async () => {
    const specialName = 'Voice <script>alert("xss")</script> & "quotes"';
    await libraryStore.saveToLibrary(makeItem({ id: 'special', name: specialName }));
    expect(libraryStore.saved[0].name).toBe(specialName);
  });

  it('handles multiple updates to same item', async () => {
    await libraryStore.saveToLibrary(makeItem({ id: '1', name: 'v1' }));
    await libraryStore.updateItem('1', { name: 'v2' });
    await libraryStore.updateItem('1', { name: 'v3' });
    await libraryStore.updateItem('1', { comment: 'added comment' });
    expect(libraryStore.saved[0].name).toBe('v3');
    expect(libraryStore.saved[0].comment).toBe('added comment');
  });

  it('adding to recent at maxRecent keeps only newest items', () => {
    libraryStore.setMaxRecent(3);
    libraryStore.addToRecent(makeItem({ id: '1', name: 'oldest' }));
    libraryStore.addToRecent(makeItem({ id: '2', name: 'middle' }));
    libraryStore.addToRecent(makeItem({ id: '3', name: 'newer' }));
    libraryStore.addToRecent(makeItem({ id: '4', name: 'newest' }));

    expect(libraryStore.recent.length).toBe(3);
    expect(libraryStore.recent[0].name).toBe('newest');
    expect(libraryStore.recent[2].name).toBe('middle');
    // 'oldest' should have been evicted
    expect(libraryStore.recent.find(i => i.name === 'oldest')).toBeUndefined();
  });

  it('createdAt is preserved as Date object', async () => {
    const date = new Date('2025-06-15T12:30:00Z');
    await libraryStore.saveToLibrary(makeItem({ id: '1', createdAt: date }));
    expect(libraryStore.saved[0].createdAt).toBeInstanceOf(Date);
    expect(libraryStore.saved[0].createdAt.toISOString()).toBe('2025-06-15T12:30:00.000Z');
  });

  it('handles items with optional fields undefined', async () => {
    await libraryStore.saveToLibrary({
      id: 'minimal',
      type: 'audio',
      name: 'Minimal',
      audioUrl: 'blob:test',
      createdAt: new Date(),
      // comment, tags, metadata all undefined
    });
    expect(libraryStore.saved[0].comment).toBeUndefined();
    expect(libraryStore.saved[0].tags).toBeUndefined();
    expect(libraryStore.saved[0].metadata).toBeUndefined();
  });
});
