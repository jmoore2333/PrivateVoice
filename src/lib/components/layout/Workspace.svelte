<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    inputPanel: Snippet;
    outputPanel: Snippet;
  }

  let { inputPanel, outputPanel }: Props = $props();
</script>

<div class="flex-1 flex overflow-hidden">
  <!-- Input Zone (Left) -->
  <div class="w-1/2 border-r border-[var(--color-border-subtle)] overflow-y-auto p-6">
    {@render inputPanel()}
  </div>

  <!-- Output Zone (Right) -->
  <div class="w-1/2 overflow-y-auto p-6 bg-[var(--color-bg-deep)]">
    {@render outputPanel()}
  </div>
</div>
