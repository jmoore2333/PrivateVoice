<script lang="ts">
  interface Tab {
    id: string;
    label: string;
    icon?: string;
  }

  interface Props {
    tabs: Tab[];
    activeTab: string;
    onchange?: (tabId: string) => void;
    class?: string;
  }

  let {
    tabs,
    activeTab,
    onchange,
    class: className = "",
  }: Props = $props();
</script>

<div
  class="flex gap-1 p-1 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] {className}"
  role="tablist"
>
  {#each tabs as tab}
    <button
      role="tab"
      aria-selected={activeTab === tab.id}
      onclick={() => onchange?.(tab.id)}
      class="relative flex-1 px-4 py-2 text-sm font-medium rounded-md transition-all duration-200
        {activeTab === tab.id
          ? 'text-[var(--color-text-primary)] bg-[var(--color-bg-elevated)] shadow-md'
          : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]'}"
    >
      {#if activeTab === tab.id}
        <span
          class="absolute inset-x-0 -bottom-1 h-0.5 bg-[var(--color-accent-cyan)] rounded-full"
          style="box-shadow: 0 0 8px var(--color-accent-cyan);"
        ></span>
      {/if}
      {tab.label}
    </button>
  {/each}
</div>
