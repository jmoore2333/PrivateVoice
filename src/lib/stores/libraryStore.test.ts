import { describe, it, expect, beforeEach } from 'vitest';
import { libraryStore } from './libraryStore.svelte';

describe('libraryStore', () => {
  beforeEach(() => {
    libraryStore.clearAll();
  });

  it('starts with empty recent and saved lists', () => {
    expect(libraryStore.recent).toEqual([]);
    expect(libraryStore.saved).toEqual([]);
  });

  it('adds item to recent cache', () => {
    libraryStore.addToRecent({
      id: '1',
      type: 'audio',
      name: 'Test clip',
      audioUrl: 'blob:test',
      createdAt: new Date(),
    });
    expect(libraryStore.recent.length).toBe(1);
  });

  it('limits recent cache to maxRecent items', () => {
    for (let i = 0; i < 15; i++) {
      libraryStore.addToRecent({
        id: String(i),
        type: 'audio',
        name: `Clip ${i}`,
        audioUrl: 'blob:test',
        createdAt: new Date(),
      });
    }
    expect(libraryStore.recent.length).toBe(10);
  });

  it('saves item to library', () => {
    libraryStore.saveToLibrary({
      id: '1',
      type: 'clone',
      name: 'My Voice',
      audioUrl: 'blob:test',
      createdAt: new Date(),
      metadata: { referenceText: 'Hello' },
    });
    expect(libraryStore.saved.length).toBe(1);
  });

  it('removes item from library', () => {
    libraryStore.saveToLibrary({
      id: '1',
      type: 'clone',
      name: 'My Voice',
      audioUrl: 'blob:test',
      createdAt: new Date(),
    });
    libraryStore.removeFromLibrary('1');
    expect(libraryStore.saved.length).toBe(0);
  });

  it('updates item in library', () => {
    libraryStore.saveToLibrary({
      id: '1',
      type: 'clone',
      name: 'Original Name',
      audioUrl: 'blob:test',
      createdAt: new Date(),
    });
    libraryStore.updateItem('1', { name: 'Updated Name' });
    expect(libraryStore.saved[0].name).toBe('Updated Name');
  });
});
