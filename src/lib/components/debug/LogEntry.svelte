<script lang="ts">
  interface Props {
    level: string;
    message: string;
    timestamp: string;
  }

  let { level, message, timestamp }: Props = $props();

  const levelColors: Record<string, string> = {
    DEBUG: "text-neutral-400",
    INFO: "text-blue-400",
    WARNING: "text-amber-400",
    ERROR: "text-red-400",
    WARN: "text-amber-400",
  };

  const levelBadgeColors: Record<string, string> = {
    DEBUG: "bg-neutral-700 text-neutral-300",
    INFO: "bg-blue-900/50 text-blue-300",
    WARNING: "bg-amber-900/50 text-amber-300",
    ERROR: "bg-red-900/50 text-red-300",
    WARN: "bg-amber-900/50 text-amber-300",
  };

  const normalizedLevel = $derived(level.toUpperCase());
  const colorClass = $derived(levelColors[normalizedLevel] ?? "text-neutral-400");
  const badgeClass = $derived(levelBadgeColors[normalizedLevel] ?? "bg-neutral-700 text-neutral-300");

  function formatTime(ts: string): string {
    try {
      const date = new Date(ts);
      return date.toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    } catch {
      return ts.slice(11, 19);
    }
  }
</script>

<div class="flex items-start gap-2 py-1 px-2 hover:bg-neutral-800/50 font-mono text-xs">
  <span class="text-neutral-500 flex-shrink-0">{formatTime(timestamp)}</span>
  <span class="px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 {badgeClass}">
    {normalizedLevel.slice(0, 4)}
  </span>
  <span class="{colorClass} break-all">{message}</span>
</div>
