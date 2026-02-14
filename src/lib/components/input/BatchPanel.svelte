<script lang="ts">
  import type { BatchProgress } from "$lib/api/ttsClient";
  import type { BatchFile } from "$lib/stores/batchStore.svelte";

  interface Props {
    files: BatchFile[];
    isProcessing: boolean;
    progress: BatchProgress;
    resultsCount: number;
    error?: string | null;
    onAddFiles?: (files: FileList | File[]) => void;
    onRemoveFile?: (id: string) => void;
    onOutputFilenameChange?: (id: string, value: string) => void;
    onStart?: () => void;
    onCancel?: () => void;
    onDownload?: () => void;
  }

  let {
    files = [],
    isProcessing = false,
    progress,
    resultsCount = 0,
    error = null,
    onAddFiles,
    onRemoveFile,
    onOutputFilenameChange,
    onStart,
    onCancel,
    onDownload,
  }: Props = $props();

  let dragActive = $state(false);
  let fileInput = $state<HTMLInputElement | null>(null);

  const completionPct = $derived(
    progress.total > 0 ? Math.min(100, Math.round((progress.completed / progress.total) * 100)) : 0
  );

  function openPicker() {
    fileInput?.click();
  }

  function handlePickedFiles(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      onAddFiles?.(target.files);
      target.value = "";
    }
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    dragActive = true;
  }

  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    dragActive = false;
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    dragActive = false;
    if (event.dataTransfer?.files?.length) {
      onAddFiles?.(event.dataTransfer.files);
    }
  }

  function handleDropZoneKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPicker();
    }
  }
</script>

<div class="space-y-4">
  <div>
    <h3 class="text-sm font-semibold text-[var(--color-text-primary)]">Batch Processing</h3>
    <p class="text-xs text-[var(--color-text-muted)] mt-1">
      Add `.txt` files and generate one audio output per file using current voice settings.
    </p>
  </div>

  <input
    bind:this={fileInput}
    type="file"
    accept=".txt,text/plain"
    multiple
    class="hidden"
    onchange={handlePickedFiles}
  />

  <div
    class="p-4 rounded-lg border-2 border-dashed transition-colors
      {dragActive
        ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10'
        : 'border-[var(--color-border-default)] bg-[var(--color-bg-elevated)]'}"
    role="button"
    tabindex="0"
    aria-label="Drop text files or browse"
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    ondrop={handleDrop}
    onkeydown={handleDropZoneKeydown}
  >
    <p class="text-sm text-[var(--color-text-secondary)]">
      Drag and drop text files here, or
      <button
        class="ml-1 text-[var(--color-accent)] hover:underline"
        onclick={openPicker}
      >
        browse files
      </button>
    </p>
  </div>

  {#if error}
    <p class="text-xs text-[var(--color-error)]">{error}</p>
  {/if}

  <div class="space-y-3 max-h-[360px] overflow-y-auto pr-1">
    {#if files.length === 0}
      <div class="p-3 rounded-lg bg-[var(--color-bg-elevated)] text-sm text-[var(--color-text-muted)]">
        No files queued.
      </div>
    {:else}
      {#each files as file}
        <div class="p-3 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] space-y-2">
          <div class="flex items-center justify-between gap-2">
            <p class="text-sm font-medium text-[var(--color-text-primary)] truncate" title={file.name}>
              {file.name}
            </p>
            <button
              class="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-error)]"
              onclick={() => onRemoveFile?.(file.id)}
              disabled={isProcessing}
            >
              Remove
            </button>
          </div>

          <input
            type="text"
            value={file.outputFilename}
            class="w-full px-2.5 py-2 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-default)] text-xs text-[var(--color-text-primary)]"
            oninput={(event) => onOutputFilenameChange?.(file.id, (event.target as HTMLInputElement).value)}
            disabled={isProcessing}
          />

          <p class="text-xs text-[var(--color-text-muted)] line-clamp-3 whitespace-pre-wrap">
            {file.text}
          </p>
        </div>
      {/each}
    {/if}
  </div>

  {#if isProcessing || progress.status === "completed" || progress.status === "error" || progress.status === "cancelled" || progress.status === "cancelling"}
    <div class="p-3 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-sm text-[var(--color-text-secondary)]">
          {progress.completed}/{progress.total} completed
        </span>
        <span class="text-xs text-[var(--color-text-muted)] uppercase">{progress.status}</span>
      </div>
      <div class="h-2 rounded-full bg-[var(--color-bg-surface)] overflow-hidden">
        <div
          class="h-full bg-[var(--color-accent)] transition-all duration-300"
          style={`width: ${completionPct}%`}
        ></div>
      </div>
      {#if progress.current_item}
        <p class="text-xs text-[var(--color-text-muted)] truncate" title={progress.current_item}>
          Current: {progress.current_item}
        </p>
      {/if}
    </div>
  {/if}

  <div class="flex items-center gap-2">
    <button
      class="px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
      onclick={onStart}
      disabled={isProcessing || files.length === 0}
    >
      Process All
    </button>

    <button
      class="px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] disabled:opacity-50"
      onclick={onCancel}
      disabled={!isProcessing}
    >
      Cancel
    </button>

    <button
      class="px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] disabled:opacity-50 disabled:cursor-not-allowed"
      onclick={onDownload}
      disabled={resultsCount === 0}
    >
      Download ZIP
    </button>
  </div>
</div>
