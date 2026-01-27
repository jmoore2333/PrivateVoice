<script lang="ts">
  interface Props {
    status: "connected" | "connecting" | "error" | "idle";
    label?: string;
    class?: string;
  }

  let {
    status,
    label,
    class: className = "",
  }: Props = $props();

  const statusConfig = {
    connected: {
      color: "led-green",
      defaultLabel: "Connected",
    },
    connecting: {
      color: "led-amber",
      defaultLabel: "Connecting...",
    },
    error: {
      color: "led-red",
      defaultLabel: "Error",
    },
    idle: {
      color: "led-cyan",
      defaultLabel: "Idle",
    },
  };

  const config = $derived(statusConfig[status]);
  const displayLabel = $derived(label ?? config.defaultLabel);
</script>

<div class="flex items-center gap-2 {className}">
  <span
    class="led {config.color} {status === 'connecting' ? 'animate-pulse-soft' : ''}"
  ></span>
  <span class="text-xs font-medium text-[var(--color-text-secondary)]">
    {displayLabel}
  </span>
</div>
