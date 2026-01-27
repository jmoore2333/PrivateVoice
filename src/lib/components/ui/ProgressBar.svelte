<script lang="ts">
  interface Props {
    value: number;
    max?: number;
    showLabel?: boolean;
    variant?: "default" | "gradient";
    class?: string;
  }

  let {
    value,
    max = 100,
    showLabel = false,
    variant = "default",
    class: className = "",
  }: Props = $props();

  const percentage = $derived(Math.min(100, Math.max(0, (value / max) * 100)));
</script>

<div class="w-full {className}">
  <div class="flex items-center gap-3">
    <div
      class="relative flex-1 h-1.5 bg-[var(--color-bg-hover)] rounded-full overflow-hidden"
    >
      <!-- Glow effect under the bar -->
      <div
        class="absolute inset-y-0 left-0 blur-sm opacity-50"
        style="width: {percentage}%; background: var(--color-accent-cyan);"
      ></div>

      <!-- Main progress bar -->
      <div
        class="relative h-full rounded-full transition-all duration-300 ease-out
          {variant === 'gradient'
            ? 'bg-gradient-to-r from-[var(--color-accent-cyan)] to-[var(--color-accent-amber)]'
            : 'bg-[var(--color-accent-cyan)]'}"
        style="width: {percentage}%;"
      ></div>
    </div>

    {#if showLabel}
      <span class="text-xs font-mono text-[var(--color-text-secondary)] tabular-nums min-w-[3ch]">
        {Math.round(percentage)}%
      </span>
    {/if}
  </div>
</div>
