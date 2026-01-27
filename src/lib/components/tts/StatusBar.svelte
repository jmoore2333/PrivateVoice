<script lang="ts">
  import StatusIndicator from "$lib/components/ui/StatusIndicator.svelte";
  import StudioSelect from "$lib/components/ui/StudioSelect.svelte";
  import StudioButton from "$lib/components/ui/StudioButton.svelte";

  interface Model {
    id: string;
    name: string;
    description: string;
  }

  interface Props {
    serverConnected: boolean;
    modelLoaded: boolean;
    modelId: string | null | undefined;
    device: string | null;
    isLoadingModel: boolean;
    models: Model[];
    selectedModelId: string;
    onModelChange?: (modelId: string) => void;
    onLoadModel?: () => void;
  }

  let {
    serverConnected,
    modelLoaded,
    modelId,
    device,
    isLoadingModel,
    models,
    selectedModelId,
    onModelChange,
    onLoadModel,
  }: Props = $props();

  const modelOptions = $derived(
    models.map((m) => ({
      value: m.id,
      label: m.name,
      description: m.description,
    }))
  );

  const connectionStatus = $derived(
    serverConnected ? "connected" : "connecting"
  );
</script>

<div
  class="flex items-center justify-between p-4 rounded-xl
    bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)]"
>
  <!-- Left: Connection Status -->
  <div class="flex items-center gap-4">
    <StatusIndicator
      status={connectionStatus}
      label={serverConnected ? "Server Online" : "Connecting..."}
    />

    {#if modelLoaded && modelId}
      <div class="flex items-center gap-2 px-3 py-1 rounded-md bg-[var(--color-bg-elevated)]">
        <span class="text-xs font-mono text-[var(--color-accent-cyan)]">
          {modelId}
        </span>
        <span class="text-[var(--color-text-muted)]">•</span>
        <span class="text-xs text-[var(--color-text-secondary)]">
          {device ?? "Unknown"}
        </span>
      </div>
    {/if}
  </div>

  <!-- Right: Model Selection -->
  {#if serverConnected}
    <div class="flex items-center gap-3">
      <StudioSelect
        value={selectedModelId}
        options={modelOptions}
        disabled={isLoadingModel}
        onchange={onModelChange}
        class="w-56"
      />
      <StudioButton
        variant="secondary"
        size="sm"
        disabled={isLoadingModel}
        loading={isLoadingModel}
        onclick={onLoadModel}
      >
        {#if isLoadingModel}
          Loading
        {:else if modelLoaded && modelId === selectedModelId}
          Reload
        {:else}
          Load
        {/if}
      </StudioButton>
    </div>
  {/if}
</div>
