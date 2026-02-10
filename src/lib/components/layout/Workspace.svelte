<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    inputPanel: Snippet;
    outputPanel: Snippet;
  }

  let { inputPanel, outputPanel }: Props = $props();
</script>

<div class="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
  <!-- Input Zone (Left panel — scrollable) -->
  <div class="md:w-[380px] md:min-w-[320px] md:max-w-[440px] md:flex-shrink-0 border-b md:border-b-0 md:border-r border-[var(--color-border-subtle)] overflow-y-auto p-4 md:p-5">
    {@render inputPanel()}
  </div>

  <!-- Output Zone (Right panel — fills remaining space) -->
  <div class="flex-1 min-w-0 min-h-0 overflow-y-auto p-4 md:p-5 bg-[var(--color-bg-deep)]">
    {@render outputPanel()}
  </div>
</div>
