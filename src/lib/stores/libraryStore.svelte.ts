/**
 * Voice Library Store - Two-tier storage for voice generations.
 *
 * Recent cache: Last N generations, auto-rotates (oldest dropped when full)
 * Persistent library: Explicitly saved items, persisted to localStorage
 */

export type LibraryItemType = 'audio' | 'clone' | 'design';

export interface LibraryItem {
  id: string;
  type: LibraryItemType;
  name: string;
  audioUrl: string;
  createdAt: Date;
  comment?: string;
  tags?: string[];
  metadata?: {
    speaker?: string;
    language?: string;
    referenceText?: string;
    voiceDescription?: string;
    modelId?: string;
  };
}

const STORAGE_KEY = 'privatevoice-library';
const MAX_RECENT_DEFAULT = 10;

function createLibraryStore() {
  let recent = $state<LibraryItem[]>([]);
  let saved = $state<LibraryItem[]>([]);
  let maxRecent = $state(MAX_RECENT_DEFAULT);

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

  // Load from localStorage on init (only in browser)
  const storage = getStorage();
  if (storage) {
    const stored = storage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        saved = (data.saved || []).map((item: LibraryItem) => ({
          ...item,
          createdAt: new Date(item.createdAt)
        }));
      } catch (e) {
        console.error('Failed to load library:', e);
      }
    }
  }

  function persist() {
    const storage = getStorage();
    if (storage) {
      storage.setItem(STORAGE_KEY, JSON.stringify({ saved }));
    }
  }

  return {
    get recent() { return recent; },
    get saved() { return saved; },
    get maxRecent() { return maxRecent; },

    setMaxRecent(value: number) {
      maxRecent = value;
      while (recent.length > maxRecent) {
        recent.pop();
      }
    },

    addToRecent(item: LibraryItem) {
      recent = [item, ...recent.slice(0, maxRecent - 1)];
    },

    saveToLibrary(item: LibraryItem) {
      saved = [item, ...saved];
      persist();
    },

    removeFromLibrary(id: string) {
      saved = saved.filter(item => item.id !== id);
      persist();
    },

    updateItem(id: string, updates: Partial<LibraryItem>) {
      saved = saved.map(item =>
        item.id === id ? { ...item, ...updates } : item
      );
      persist();
    },

    clearRecent() {
      recent = [];
    },

    clearAll() {
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
