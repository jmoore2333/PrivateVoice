<script lang="ts">
  interface Speaker {
    id: string;
    name: string;
    description?: string;
    language?: string;
  }

  interface Props {
    speakers: Speaker[];
    selectedSpeaker: string;
    onchange?: (speakerId: string) => void;
    class?: string;
  }

  let {
    speakers,
    selectedSpeaker,
    onchange,
    class: className = "",
  }: Props = $props();

  let isOpen = $state(false);
  let searchQuery = $state("");

  const filteredSpeakers = $derived(
    speakers.filter((s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const currentSpeaker = $derived(
    speakers.find((s) => s.id === selectedSpeaker)
  );

  function handleSelect(speakerId: string) {
    onchange?.(speakerId);
    isOpen = false;
    searchQuery = "";
  }
</script>

<div class="relative {className}">
  <span class="block text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider mb-1.5">
    Speaker
  </span>

  <!-- Trigger Button -->
  <button
    onclick={() => (isOpen = !isOpen)}
    class="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left
      bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)]
      hover:border-[var(--color-border-strong)]
      focus:outline-none focus:border-[var(--color-accent-cyan)] focus:ring-1 focus:ring-[var(--color-accent-cyan)]
      transition-all duration-200"
  >
    <div class="flex items-center gap-3">
      <!-- Avatar -->
      <div
        class="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-mono font-bold
          bg-gradient-to-br from-[var(--color-accent-cyan-glow)] to-[var(--color-bg-hover)]
          text-[var(--color-accent-cyan)] border border-[var(--color-border-default)]"
      >
        {currentSpeaker?.name.slice(0, 2).toUpperCase() ?? "??"}
      </div>
      <div class="flex flex-col">
        <span class="text-sm font-medium text-[var(--color-text-primary)]">
          {currentSpeaker?.name ?? "Select speaker"}
        </span>
        {#if currentSpeaker?.language}
          <span class="text-xs text-[var(--color-text-muted)]">
            {currentSpeaker.language}
          </span>
        {/if}
      </div>
    </div>
    <svg
      class="w-4 h-4 text-[var(--color-text-muted)] transition-transform duration-200 {isOpen
        ? 'rotate-180'
        : ''}"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  <!-- Dropdown -->
  {#if isOpen}
    <div
      class="absolute z-50 w-full mt-2 py-2 rounded-xl
        bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)]
        shadow-lg animate-slide-down"
    >
      <!-- Search -->
      <div class="px-3 pb-2">
        <input
          type="text"
          placeholder="Search speakers..."
          bind:value={searchQuery}
          class="w-full px-3 py-2 text-sm rounded-lg
            bg-[var(--color-bg-surface)] text-[var(--color-text-primary)]
            border border-[var(--color-border-subtle)]
            placeholder:text-[var(--color-text-muted)]
            focus:outline-none focus:border-[var(--color-accent-cyan)]"
        />
      </div>

      <!-- Options -->
      <div class="max-h-64 overflow-y-auto">
        {#each filteredSpeakers as speaker}
          <button
            onclick={() => handleSelect(speaker.id)}
            class="w-full flex items-center gap-3 px-3 py-2 text-left
              hover:bg-[var(--color-bg-hover)] transition-colors
              {speaker.id === selectedSpeaker ? 'bg-[var(--color-bg-hover)]' : ''}"
          >
            <!-- Avatar -->
            <div
              class="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-mono font-bold
                {speaker.id === selectedSpeaker
                  ? 'bg-[var(--color-accent-cyan-glow)] text-[var(--color-accent-cyan)]'
                  : 'bg-[var(--color-bg-surface)] text-[var(--color-text-muted)]'}
                border border-[var(--color-border-subtle)]"
            >
              {speaker.name.slice(0, 2).toUpperCase()}
            </div>
            <div class="flex flex-col flex-1 min-w-0">
              <span class="text-sm font-medium text-[var(--color-text-primary)]">
                {speaker.name}
              </span>
              {#if speaker.description}
                <span class="text-xs text-[var(--color-text-muted)] truncate">
                  {speaker.description}
                </span>
              {/if}
            </div>
            {#if speaker.id === selectedSpeaker}
              <svg class="w-4 h-4 text-[var(--color-accent-cyan)]" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
              </svg>
            {/if}
          </button>
        {:else}
          <div class="px-3 py-4 text-center text-sm text-[var(--color-text-muted)]">
            No speakers found
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<!-- Click outside to close -->
{#if isOpen}
  <button
    class="fixed inset-0 z-40"
    onclick={() => (isOpen = false)}
    aria-label="Close speaker dropdown"
  ></button>
{/if}
