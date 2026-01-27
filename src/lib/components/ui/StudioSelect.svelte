<script lang="ts">
  interface Option {
    value: string;
    label: string;
    description?: string;
  }

  interface Props {
    value: string;
    options: Option[];
    label?: string;
    disabled?: boolean;
    onchange?: (value: string) => void;
    class?: string;
  }

  let {
    value,
    options,
    label,
    disabled = false,
    onchange,
    class: className = "",
  }: Props = $props();

  const inputId = $derived(`select-${Math.random().toString(36).slice(2, 9)}`);

  function handleChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    onchange?.(target.value);
  }
</script>

<div class="flex flex-col gap-1.5 {className}">
  {#if label}
    <label
      for={inputId}
      class="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wider"
    >
      {label}
    </label>
  {/if}
  <div class="relative">
    <select
      id={inputId}
      {value}
      {disabled}
      onchange={handleChange}
      class="w-full appearance-none px-3 py-2 pr-10 text-sm rounded-lg
        bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]
        border border-[var(--color-border-default)]
        hover:border-[var(--color-border-strong)]
        focus:outline-none focus:border-[var(--color-accent-cyan)] focus:ring-1 focus:ring-[var(--color-accent-cyan)]
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-all duration-200 cursor-pointer"
    >
      {#each options as opt}
        <option value={opt.value}>
          {opt.label}{opt.description ? ` — ${opt.description}` : ""}
        </option>
      {/each}
    </select>
    <!-- Custom chevron -->
    <div class="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-[var(--color-text-muted)]">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  </div>
</div>
