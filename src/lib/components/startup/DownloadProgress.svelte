<script lang="ts">
  import ProgressBar from "$lib/components/ui/ProgressBar.svelte";

  interface Props {
    fileName: string;
    bytesDownloaded: number;
    bytesTotal: number;
    speedMbps: number;
    eta: number;
  }

  let { fileName, bytesDownloaded, bytesTotal, speedMbps, eta }: Props = $props();

  function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  function formatEta(seconds: number): string {
    if (seconds <= 0 || !isFinite(seconds)) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  const percentage = $derived(bytesTotal > 0 ? (bytesDownloaded / bytesTotal) * 100 : 0);
</script>

<div class="w-full max-w-md bg-white dark:bg-neutral-800 rounded-lg p-4 border border-neutral-200 dark:border-neutral-700">
  <!-- File name -->
  <div class="flex items-center gap-2 mb-3">
    <svg
      class="w-5 h-5 text-blue-500 dark:text-blue-400 flex-shrink-0"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
      />
    </svg>
    <span class="text-sm font-medium text-neutral-700 dark:text-neutral-300 truncate">
      {fileName || "Downloading model..."}
    </span>
  </div>

  <!-- Progress bar -->
  <ProgressBar value={percentage} class="mb-3" />

  <!-- Stats -->
  <div class="flex justify-between text-xs text-neutral-500 dark:text-neutral-400">
    <span>
      {formatBytes(bytesDownloaded)} / {formatBytes(bytesTotal)}
    </span>
    <span class="flex items-center gap-3">
      <span>{speedMbps.toFixed(1)} Mbps</span>
      <span>ETA: {formatEta(eta)}</span>
    </span>
  </div>
</div>
