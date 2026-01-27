<script lang="ts">
  import type { SystemInfo } from "$lib/api/ttsClient";

  interface Props {
    info: SystemInfo | null;
  }

  let { info }: Props = $props();

  function formatGB(gb: number): string {
    return gb.toFixed(1) + " GB";
  }
</script>

{#if info}
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
  <div class="text-xs text-neutral-500 italic">Loading system info...</div>
{/if}
