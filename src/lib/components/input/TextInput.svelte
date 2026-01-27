<script lang="ts">
  interface Props {
    value: string;
    label?: string;
    placeholder?: string;
    rows?: number;
    maxLength?: number;
    onInput?: (value: string) => void;
  }

  let {
    value = $bindable(),
    label = 'Text to generate',
    placeholder = 'Enter text here...',
    rows = 6,
    maxLength,
    onInput,
  }: Props = $props();

  const textareaId = `textarea-${Math.random().toString(36).slice(2, 9)}`;

  function handleInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    value = target.value;
    onInput?.(value);
  }
</script>

<div class="space-y-2">
  {#if label}
    <label for={textareaId} class="block text-sm font-medium text-[var(--color-text-primary)]">
      {label}
    </label>
  {/if}

  <textarea
    id={textareaId}
    {value}
    {placeholder}
    {rows}
    maxlength={maxLength}
    oninput={handleInput}
    class="w-full px-4 py-3 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors resize-none"
  ></textarea>

  <div class="flex justify-between text-xs text-[var(--color-text-muted)]">
    <span>{value.length} characters</span>
    {#if maxLength}
      <span>{maxLength - value.length} remaining</span>
    {/if}
  </div>
</div>
