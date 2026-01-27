<script lang="ts">
  interface Props {
    value: string;
    label?: string;
    placeholder?: string;
    rows?: number;
    disabled?: boolean;
    oninput?: (value: string) => void;
    class?: string;
  }

  let {
    value,
    label,
    placeholder = "",
    rows = 4,
    disabled = false,
    oninput,
    class: className = "",
  }: Props = $props();

  const inputId = $derived(`textarea-${Math.random().toString(36).slice(2, 9)}`);

  function handleInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    oninput?.(target.value);
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
  <textarea
    id={inputId}
    {value}
    {placeholder}
    {rows}
    {disabled}
    oninput={handleInput}
    class="w-full px-3 py-2.5 text-sm rounded-lg resize-none
      bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]
      border border-[var(--color-border-default)]
      placeholder:text-[var(--color-text-muted)]
      hover:border-[var(--color-border-strong)]
      focus:outline-none focus:border-[var(--color-accent-cyan)] focus:ring-1 focus:ring-[var(--color-accent-cyan)]
      disabled:opacity-50 disabled:cursor-not-allowed
      transition-all duration-200"
  ></textarea>
</div>
