<script lang="ts">
  import { libraryStore } from '$lib/stores/libraryStore.svelte';

  interface Props {
    value: string;
    onSelect?: (voiceId: string, isPreset: boolean) => void;
  }

  let { value = $bindable(), onSelect }: Props = $props();

  let viewMode = $state<'preset' | 'saved'>('preset');

  const presetVoices = [
    { id: 'aiden', name: 'Aiden', description: 'Sunny American male', accent: 'English' },
    { id: 'ryan', name: 'Ryan', description: 'Dynamic male, strong rhythm', accent: 'English' },
    { id: 'vivian', name: 'Vivian', description: 'Bright young female', accent: 'Chinese' },
    { id: 'serena', name: 'Serena', description: 'Warm, gentle female', accent: 'Chinese' },
    { id: 'dylan', name: 'Dylan', description: 'Youthful Beijing male', accent: 'Chinese (Beijing)' },
    { id: 'eric', name: 'Eric', description: 'Lively Chengdu male', accent: 'Chinese (Sichuan)' },
    { id: 'uncle_fu', name: 'Uncle Fu', description: 'Seasoned male, mellow', accent: 'Chinese' },
    { id: 'ono_anna', name: 'Ono Anna', description: 'Playful Japanese female', accent: 'Japanese' },
    { id: 'sohee', name: 'Sohee', description: 'Warm Korean female', accent: 'Korean' },
  ];

  const savedVoices = $derived(
    libraryStore.saved.filter(item => item.type === 'clone')
  );

  function selectVoice(id: string, isPreset: boolean) {
    value = id;
    onSelect?.(id, isPreset);
  }
</script>

<div class="space-y-3">
  <div class="flex items-center justify-between">
    <label class="block text-sm font-medium text-[var(--color-text-primary)]">
      Voice
    </label>

    <div class="flex gap-1 bg-[var(--color-bg-deep)] rounded-md p-0.5">
      <button
        class="px-3 py-1 text-xs rounded transition-colors {viewMode === 'preset' ? 'bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'}"
        onclick={() => viewMode = 'preset'}
      >
        Preset
      </button>
      <button
        class="px-3 py-1 text-xs rounded transition-colors {viewMode === 'saved' ? 'bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'}"
        onclick={() => viewMode = 'saved'}
      >
        Saved ({savedVoices.length})
      </button>
    </div>
  </div>

  <div class="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
    {#if viewMode === 'preset'}
      {#each presetVoices as voice}
        <button
          class="p-3 rounded-lg text-left border transition-colors
            {value === voice.id
              ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)]'
              : 'border-[var(--color-border-subtle)] hover:border-[var(--color-border-default)] bg-[var(--color-bg-elevated)]'}"
          onclick={() => selectVoice(voice.id, true)}
        >
          <div class="font-medium text-sm text-[var(--color-text-primary)]">{voice.name}</div>
          <div class="text-xs text-[var(--color-text-muted)] truncate">{voice.description}</div>
          <div class="text-xs text-[var(--color-accent)] mt-1">{voice.accent}</div>
        </button>
      {/each}
    {:else if savedVoices.length > 0}
      {#each savedVoices as voice}
        <button
          class="p-3 rounded-lg text-left border transition-colors
            {value === voice.id
              ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)]'
              : 'border-[var(--color-border-subtle)] hover:border-[var(--color-border-default)] bg-[var(--color-bg-elevated)]'}"
          onclick={() => selectVoice(voice.id, false)}
        >
          <div class="font-medium text-sm text-[var(--color-text-primary)]">{voice.name}</div>
          {#if voice.comment}
            <div class="text-xs text-[var(--color-text-muted)] truncate">{voice.comment}</div>
          {/if}
        </button>
      {/each}
    {:else}
      <div class="col-span-2 py-8 text-center text-[var(--color-text-muted)] text-sm">
        No saved voices yet. Clone a voice to save it here.
      </div>
    {/if}
  </div>
</div>
