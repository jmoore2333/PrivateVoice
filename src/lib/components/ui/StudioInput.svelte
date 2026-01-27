<script lang="ts">
  interface Props {
    value: string;
    type?: "text" | "email" | "password";
    label?: string;
    placeholder?: string;
    disabled?: boolean;
    oninput?: (value: string) => void;
    class?: string;
  }

  let {
    value,
    type = "text",
    label,
    placeholder = "",
    disabled = false,
    oninput,
    class: className = "",
  }: Props = $props();

  const inputId = $derived(`input-${Math.random().toString(36).slice(2, 9)}`);

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
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
  <input
    id={inputId}
    {type}
    {value}
    {placeholder}
    {disabled}
    oninput={handleInput}
    class="w-full px-3 py-2 text-sm rounded-lg
      bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]
      border border-[var(--color-border-default)]
      placeholder:text-[var(--color-text-muted)]
      hover:border-[var(--color-border-strong)]
      focus:outline-none focus:border-[var(--color-accent-cyan)] focus:ring-1 focus:ring-[var(--color-accent-cyan)]
      disabled:opacity-50 disabled:cursor-not-allowed
      transition-all duration-200"
  />
</div>
