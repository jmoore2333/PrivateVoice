<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    variant?: "default" | "elevated" | "glass";
    padding?: "none" | "sm" | "md" | "lg";
    children: Snippet;
    class?: string;
  }

  let {
    variant = "default",
    padding = "md",
    children,
    class: className = "",
  }: Props = $props();

  const variantClasses = {
    default: "bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)]",
    elevated: "bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] shadow-lg",
    glass: "glass",
  };

  const paddingClasses = {
    none: "",
    sm: "p-3",
    md: "p-5",
    lg: "p-6",
  };
</script>

<div
  class="rounded-xl {variantClasses[variant]} {paddingClasses[padding]} {className}"
>
  {@render children()}
</div>
