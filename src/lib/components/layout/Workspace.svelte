<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    inputPanel: Snippet;
    outputPanel: Snippet;
  }

  let { inputPanel, outputPanel }: Props = $props();
</script>

<div class="flex-1 flex flex-col lg:flex-row overflow-hidden">
  <!-- Input Zone (Left on desktop, Top on mobile) -->
  <div class="flex-1 lg:w-1/2 lg:flex-none border-b lg:border-b-0 lg:border-r border-[var(--color-border-subtle)] overflow-y-auto p-4 lg:p-6">
    {@render inputPanel()}
  </div>

  <!-- Output Zone (Right on desktop, Bottom on mobile) -->
  <div class="flex-1 lg:w-1/2 lg:flex-none overflow-y-auto p-4 lg:p-6 bg-[var(--color-bg-deep)]">
    {@render outputPanel()}
  </div>
</div>
