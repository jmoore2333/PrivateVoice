/**
 * Voice Library Store - Two-tier storage for voice generations.
 *
 * Recent cache: Last N generations in memory (blob URLs, session-only)
 * Persistent library: Saved items stored as files via Tauri FS plugin
 *   - Audio: {appData}/library/{id}.wav
 *   - Index: {appData}/library/index.json
 *   - Falls back to localStorage when Tauri is unavailable (dev mode)
 */

export type LibraryItemType = 'audio' | 'clone' | 'design';

export interface LibraryItemMetadata {
  speaker?: string;
  language?: string;
  referenceText?: string;
  voiceDescription?: string;
  modelId?: string;
}

export interface LibraryItem {
  id: string;
  type: LibraryItemType;
  name: string;
  audioUrl: string;
  createdAt: Date;
  comment?: string;
  tags?: string[];
  metadata?: LibraryItemMetadata;
}

// Serialized form for index.json (no audioUrl, dates as ISO strings)
interface StoredItem {
  id: string;
  type: LibraryItemType;
  name: string;
  createdAt: string;
  comment?: string;
  tags?: string[];
  metadata?: LibraryItemMetadata;
}

const STORAGE_KEY = 'privatevoice-library';
const LIBRARY_DIR = 'library';
const INDEX_FILE = 'library/index.json';
const MAX_RECENT_DEFAULT = 10;

// Tauri FS helpers - dynamically imported to avoid breaking non-Tauri environments
async function getTauriFs() {
  try {
    const fs = await import('@tauri-apps/plugin-fs');
    // Verify the module actually has the functions we need (not just a stub)
    if (typeof fs.exists === 'function' && typeof fs.mkdir === 'function') {
      return fs;
    }
  } catch {
    // Not in Tauri environment
  }
  return null;
}

async function initLibraryDir(): Promise<boolean> {
  const fs = await getTauriFs();
  if (!fs) return false;

  try {
    const dirExists = await fs.exists(LIBRARY_DIR, { baseDir: fs.BaseDirectory.AppData });
    if (!dirExists) {
      await fs.mkdir(LIBRARY_DIR, { baseDir: fs.BaseDirectory.AppData, recursive: true });
    }
    return true;
  } catch {
    // Tauri runtime not available (e.g., in tests or dev browser mode)
    return false;
  }
}

async function readIndex(): Promise<StoredItem[]> {
  const fs = await getTauriFs();
  if (!fs) return [];

  try {
    const indexExists = await fs.exists(INDEX_FILE, { baseDir: fs.BaseDirectory.AppData });
    if (!indexExists) return [];

    const content = await fs.readTextFile(INDEX_FILE, { baseDir: fs.BaseDirectory.AppData });
    const data = JSON.parse(content);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('Failed to read library index:', e);
    return [];
  }
}

async function writeIndex(items: StoredItem[]): Promise<void> {
  const fs = await getTauriFs();
  if (!fs) return;

  try {
    await fs.writeTextFile(INDEX_FILE, JSON.stringify(items, null, 2), {
      baseDir: fs.BaseDirectory.AppData,
    });
  } catch (e) {
    console.error('Failed to write library index:', e);
  }
}

async function writeAudioFile(id: string, blob: Blob): Promise<void> {
  const fs = await getTauriFs();
  if (!fs) return;

  try {
    const arrayBuffer = await blob.arrayBuffer();
    await fs.writeFile(`${LIBRARY_DIR}/${id}.wav`, new Uint8Array(arrayBuffer), {
      baseDir: fs.BaseDirectory.AppData,
    });
  } catch (e) {
    console.error(`Failed to write audio file ${id}:`, e);
    throw e; // Re-throw so saveToLibrary knows the write failed
  }
}

async function readAudioFile(id: string): Promise<string | null> {
  const fs = await getTauriFs();
  if (!fs) return null;

  try {
    const filePath = `${LIBRARY_DIR}/${id}.wav`;
    const fileExists = await fs.exists(filePath, { baseDir: fs.BaseDirectory.AppData });
    if (!fileExists) return null;

    const data = await fs.readFile(filePath, { baseDir: fs.BaseDirectory.AppData });
    const blob = new Blob([data], { type: 'audio/wav' });
    return URL.createObjectURL(blob);
  } catch (e) {
    console.error(`Failed to read audio file ${id}:`, e);
    return null;
  }
}

async function removeAudioFile(id: string): Promise<void> {
  const fs = await getTauriFs();
  if (!fs) return;

  try {
    const filePath = `${LIBRARY_DIR}/${id}.wav`;
    const fileExists = await fs.exists(filePath, { baseDir: fs.BaseDirectory.AppData });
    if (fileExists) {
      await fs.remove(filePath, { baseDir: fs.BaseDirectory.AppData });
    }
  } catch (e) {
    console.error(`Failed to remove audio file ${id}:`, e);
  }
}

function createLibraryStore() {
  let recent = $state<LibraryItem[]>([]);
  let saved = $state<LibraryItem[]>([]);
  let maxRecent = $state(MAX_RECENT_DEFAULT);
  let useTauriFs = $state(false);
  let initialized = $state(false);

  // Helper to safely access localStorage
  function getStorage(): Storage | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage;
      }
    } catch {
      // localStorage not available (e.g., in tests or restricted environments)
    }
    return null;
  }

  // Load saved items from localStorage (fallback)
  function loadFromLocalStorage() {
    const storage = getStorage();
    if (storage) {
      const stored = storage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const data = JSON.parse(stored);
          saved = (data.saved || []).map((item: StoredItem) => ({
            ...item,
            audioUrl: '', // Audio URLs don't survive restart in localStorage mode
            createdAt: new Date(item.createdAt),
          }));
        } catch (e) {
          console.error('Failed to load library from localStorage:', e);
        }
      }
    }
  }

  // Persist to localStorage (fallback — metadata only, no audio)
  function persistToLocalStorage() {
    const storage = getStorage();
    if (storage) {
      const stripped: StoredItem[] = saved.map(({ audioUrl: _url, createdAt, ...rest }) => ({
        ...rest,
        createdAt: createdAt.toISOString(),
      }));
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify({ saved: stripped }));
      } catch (e) {
        console.warn('Library save to localStorage failed (storage full?):', e);
      }
    }
  }

  // Initialize: try Tauri FS, fallback to localStorage
  async function init() {
    if (initialized) return;

    const tauriAvailable = await initLibraryDir();
    useTauriFs = tauriAvailable;

    if (tauriAvailable) {
      const storedItems = await readIndex();
      const loadedItems: LibraryItem[] = [];

      let skippedCount = 0;
      for (const stored of storedItems) {
        const audioUrl = await readAudioFile(stored.id);
        if (audioUrl) {
          loadedItems.push({
            ...stored,
            audioUrl,
            createdAt: new Date(stored.createdAt),
          });
        } else {
          skippedCount++;
          console.warn(`Library item "${stored.name || stored.id}" has missing audio file, skipping`);
        }
      }
      if (skippedCount > 0) {
        console.warn(`${skippedCount} library item(s) skipped due to missing audio files`);
      }

      saved = loadedItems;
    } else {
      loadFromLocalStorage();
    }

    initialized = true;
  }

  // Persist saved items (Tauri FS or localStorage)
  async function persist() {
    if (useTauriFs) {
      const index: StoredItem[] = saved.map(({ audioUrl: _url, createdAt, ...rest }) => ({
        ...rest,
        createdAt: createdAt.toISOString(),
      }));
      await writeIndex(index);
    } else {
      persistToLocalStorage();
    }
  }

  // Start initialization
  init();

  return {
    get recent() { return recent; },
    get saved() { return saved; },
    get maxRecent() { return maxRecent; },
    get initialized() { return initialized; },

    setMaxRecent(value: number) {
      maxRecent = value;
      while (recent.length > maxRecent) {
        recent.pop();
      }
    },

    addToRecent(item: LibraryItem) {
      recent = [item, ...recent.slice(0, maxRecent - 1)];
    },

    async saveToLibrary(item: LibraryItem, audioBlob?: Blob): Promise<boolean> {
      if (useTauriFs && audioBlob) {
        // Write audio file first, then update index. If audio write fails,
        // we don't update the index (prevents orphaned metadata).
        try {
          await writeAudioFile(item.id, audioBlob);
        } catch {
          console.error(`Failed to save audio for ${item.id}, skipping library save`);
          return false;
        }
        // Re-read from file to get a persistent URL
        const persistentUrl = await readAudioFile(item.id);
        if (persistentUrl) {
          item = { ...item, audioUrl: persistentUrl };
        }
      }
      saved = [item, ...saved];
      await persist();
      return true;
    },

    async removeFromLibrary(id: string) {
      // Revoke blob URL to free memory
      const item = saved.find(i => i.id === id);
      if (item?.audioUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(item.audioUrl);
      }
      if (useTauriFs) {
        await removeAudioFile(id);
      }
      saved = saved.filter(item => item.id !== id);
      await persist();
    },

    async updateItem(id: string, updates: Partial<LibraryItem>) {
      saved = saved.map(item =>
        item.id === id ? { ...item, ...updates } : item
      );
      await persist();
    },

    clearRecent() {
      for (const item of recent) {
        if (item.audioUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(item.audioUrl);
        }
      }
      recent = [];
    },

    async clearAll() {
      for (const item of [...recent, ...saved]) {
        if (item.audioUrl?.startsWith('blob:')) {
          URL.revokeObjectURL(item.audioUrl);
        }
      }

      if (useTauriFs) {
        for (const item of saved) {
          await removeAudioFile(item.id);
        }
        await writeIndex([]);
      }

      recent = [];
      saved = [];

      const storage = getStorage();
      if (storage) {
        storage.removeItem(STORAGE_KEY);
      }
    },
  };
}

export const libraryStore = createLibraryStore();
