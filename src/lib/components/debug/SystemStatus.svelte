<script lang="ts">
  import type { SystemInfo } from "$lib/api/ttsClient";

  interface Props {
    info: SystemInfo | null;
    isLoading?: boolean;
    error?: string | null;
    onRetry?: () => void;
  }

  let { info, isLoading = false, error = null, onRetry }: Props = $props();

  function formatGB(gb: number): string {
    return gb.toFixed(1) + " GB";
  }
</script>

{#if isLoading}
  <div class="text-xs text-neutral-500 italic flex items-center gap-2">
    <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
    Loading system info...
  </div>
{:else if error}
  <div class="text-xs text-red-400 flex items-center gap-2">
    <span>Failed to load: {error}</span>
    {#if onRetry}
      <button onclick={onRetry} class="text-blue-400 hover:text-blue-300 underline">Retry</button>
    {/if}
  </div>
{:else if info}
  <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-xs font-mono">
    <div class="flex justify-between">
      <span class="text-neutral-500">Python:</span>
      <span class="text-neutral-300">{info.python_version}</span>
    </div>
    <div class="flex justify-between">
      <span class="text-neutral-500">PyTorch:</span>
      <span class="text-neutral-300">{info.torch_version}</span>
    </div>
    <div class="flex justify-between">
      <span class="text-neutral-500">Device:</span>
      <span class="text-neutral-300">{info.device_name}</span>
    </div>
    <div class="flex justify-between">
      <span class="text-neutral-500">Memory:</span>
      <span class="text-neutral-300">
        {formatGB(info.memory_available_gb)} / {formatGB(info.memory_total_gb)}
      </span>
    </div>
    <div class="col-span-2 flex justify-between">
      <span class="text-neutral-500">Cache:</span>
      <span class="text-neutral-400 truncate ml-2" title={info.cache_dir}>
        {info.cache_dir}
      </span>
    </div>
  </div>
{:else}
  <div class="text-xs text-neutral-500 italic flex items-center gap-2">
    <span>No system info available</span>
    {#if onRetry}
      <button onclick={onRetry} class="text-blue-400 hover:text-blue-300 underline">Load</button>
    {/if}
  </div>
{/if}
