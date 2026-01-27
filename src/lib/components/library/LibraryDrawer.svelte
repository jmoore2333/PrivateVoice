<script lang="ts">
  import { libraryStore } from '$lib/stores/libraryStore.svelte';
  import LibraryItem from './LibraryItem.svelte';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    onUseVoice?: (voiceId: string) => void;
  }

  let { isOpen, onClose, onUseVoice }: Props = $props();

  let activeTab = $state<'recent' | 'voices' | 'audio'>('recent');
  let searchQuery = $state('');

  const recentItems = $derived(libraryStore.recent);
  const savedVoices = $derived(
    libraryStore.saved.filter(item => item.type === 'clone' || item.type === 'design')
  );
  const savedAudio = $derived(
    libraryStore.saved.filter(item => item.type === 'audio')
  );

  const filteredItems = $derived(() => {
    let items = activeTab === 'recent' ? recentItems
      : activeTab === 'voices' ? savedVoices
      : savedAudio;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(item =>
        item.name.toLowerCase().includes(query) ||
        item.comment?.toLowerCase().includes(query) ||
        item.tags?.some(tag => tag.toLowerCase().includes(query))
      );
    }

    return items;
  });
</script>

{#if isOpen}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 bg-black/50 z-40"
    role="button"
    tabindex="-1"
    aria-label="Close drawer"
    onclick={onClose}
    onkeydown={(e) => e.key === 'Escape' && onClose()}
  ></div>

  <!-- Drawer -->
  <div class="fixed inset-x-0 bottom-0 h-[70vh] bg-[var(--color-bg-surface)] border-t border-[var(--color-border-default)] rounded-t-2xl z-50 flex flex-col animate-slideUp">
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-subtle)]">
      <h2 class="text-lg font-semibold text-[var(--color-text-primary)]">Voice Library</h2>
      <button
        class="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
        onclick={onClose}
        aria-label="Close drawer"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Tabs and Search -->
    <div class="flex items-center justify-between px-6 py-3 border-b border-[var(--color-border-subtle)]">
      <div class="flex gap-1 bg-[var(--color-bg-deep)] rounded-lg p-1">
        <button
          class="px-4 py-1.5 text-sm rounded-md transition-colors
            {activeTab === 'recent' ? 'bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'}"
          onclick={() => activeTab = 'recent'}
        >
          Recent
        </button>
        <button
          class="px-4 py-1.5 text-sm rounded-md transition-colors
            {activeTab === 'voices' ? 'bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'}"
          onclick={() => activeTab = 'voices'}
        >
          Saved Voices ({savedVoices.length})
        </button>
        <button
          class="px-4 py-1.5 text-sm rounded-md transition-colors
            {activeTab === 'audio' ? 'bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'}"
          onclick={() => activeTab = 'audio'}
        >
          Audio ({savedAudio.length})
        </button>
      </div>

      <div class="relative">
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search..."
          class="w-48 pl-9 pr-4 py-2 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
        />
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-6">
      {#if filteredItems().length > 0}
        <div class="space-y-2">
          {#each filteredItems() as item (item.id)}
            <LibraryItem
              {item}
              onUse={() => onUseVoice?.(item.id)}
              onDelete={() => libraryStore.removeFromLibrary(item.id)}
            />
          {/each}
        </div>
      {:else}
        <div class="flex flex-col items-center justify-center h-full text-center">
          <svg class="w-12 h-12 text-[var(--color-text-muted)] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          <p class="text-[var(--color-text-muted)]">
            {#if searchQuery}
              No items match your search
            {:else if activeTab === 'recent'}
              No recent generations yet
            {:else if activeTab === 'voices'}
              No saved voices yet
            {:else}
              No saved audio yet
            {/if}
          </p>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  @keyframes slideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  .animate-slideUp {
    animation: slideUp 0.3s ease-out;
  }
</style>
