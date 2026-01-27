<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    variant?: "primary" | "secondary" | "ghost";
    size?: "sm" | "md" | "lg";
    disabled?: boolean;
    loading?: boolean;
    onclick?: () => void;
    children: Snippet;
    class?: string;
  }

  let {
    variant = "primary",
    size = "md",
    disabled = false,
    loading = false,
    onclick,
    children,
    class: className = "",
  }: Props = $props();

  const baseClasses =
    "inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-cyan)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-deep)]";

  const variantClasses = {
    primary:
      "bg-[var(--color-accent-cyan)] text-[var(--color-bg-deep)] hover:brightness-110 hover:shadow-[0_0_20px_rgba(0,212,255,0.4)] active:scale-[0.98]",
    secondary:
      "bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border border-[var(--color-border-default)] hover:bg-[var(--color-bg-hover)] hover:border-[var(--color-border-strong)] active:scale-[0.98]",
    ghost:
      "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]",
  };

  const sizeClasses = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };
</script>

<button
  {onclick}
  disabled={disabled || loading}
  class="{baseClasses} {variantClasses[variant]} {sizeClasses[size]} {className}"
>
  {#if loading}
    <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle
        class="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        stroke-width="3"
      />
      <path
        class="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  {/if}
  {@render children()}
</button>
