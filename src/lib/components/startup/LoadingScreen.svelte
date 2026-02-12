<script lang="ts">
  import { onDestroy } from "svelte";
  import StartupProgress from "./StartupProgress.svelte";
  import DownloadProgress from "./DownloadProgress.svelte";
  import StudioButton from "$lib/components/ui/StudioButton.svelte";
  import { debugStore } from "$lib/stores/debugStore.svelte";
  import type { StartupPhase } from "$lib/stores/appStore.svelte";
  import { isSetupPhase } from "$lib/stores/appStore.svelte";

  interface Props {
    phase: StartupPhase;
    message: string;
    progress: number;
    download?: {
      status: string;
      fileName: string;
      bytesDownloaded: number;
      bytesTotal: number;
      speedMbps: number;
      eta: number;
    } | null;
    onRetry?: () => void;
  }

  let { phase, message, progress, download = null, onRetry }: Props = $props();

  const isDownloading = $derived(download?.status === "downloading");
  const isError = $derived(phase === "error");
  const isSetup = $derived(isSetupPhase(phase));
  let showDetails = $state(false);
  let showRawLogs = $state(true);
  let logsInterval: ReturnType<typeof setInterval> | null = null;

  const recentLogs = $derived.by(() => {
    const logs = showRawLogs ? debugStore.state.logs : debugStore.state.logs.filter((log) => {
      const message = (log.message ?? "").toLowerCase();
      return !(
        message.includes("get /health") ||
        message.includes("get /startup-status") ||
        message.includes("get /model-status") ||
        message.includes("get /download-progress") ||
        message.includes("options /generate")
      );
    });
    return logs.slice(-12);
  });

  $effect(() => {
    if (showDetails) {
      debugStore.fetchLogs(200, false);
      if (!debugStore.state.systemInfo && !debugStore.state.isLoadingSystemInfo) {
        debugStore.fetchSystemInfo();
      }
      if (!logsInterval) {
        logsInterval = setInterval(() => {
          debugStore.fetchLogs(200, false);
        }, 2000);
      }
    } else if (logsInterval) {
      clearInterval(logsInterval);
      logsInterval = null;
    }
  });

  onDestroy(() => {
    if (logsInterval) {
      clearInterval(logsInterval);
      logsInterval = null;
    }
  });
</script>

<div
  class="fixed inset-0 z-50 flex flex-col items-center justify-center noise"
  style="background:
    radial-gradient(ellipse 80% 60% at 50% 30%, rgba(0, 212, 255, 0.12), transparent),
    radial-gradient(ellipse 60% 40% at 20% 80%, rgba(255, 179, 71, 0.06), transparent),
    var(--color-bg-deep);"
>
  <!-- Animated background grid -->
  <div class="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
    <div
      class="absolute inset-0"
      style="background-image:
        linear-gradient(rgba(0, 212, 255, 0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0, 212, 255, 0.03) 1px, transparent 1px);
        background-size: 50px 50px;"
    ></div>
  </div>

  <!-- Logo / App name -->
  <div class="mb-10 text-center animate-fade-in">
    <div class="relative mb-6">
      <!-- Glowing ring -->
      <div
        class="absolute inset-0 w-24 h-24 mx-auto rounded-full animate-glow"
        style="background: radial-gradient(circle, var(--color-accent-cyan-glow) 0%, transparent 70%);"
      ></div>

      <!-- Icon container -->
      <div
        class="relative w-24 h-24 mx-auto rounded-2xl flex items-center justify-center
          bg-gradient-to-br from-[var(--color-bg-elevated)] to-[var(--color-bg-surface)]
          border border-[var(--color-border-default)]
          shadow-lg"
      >
        <!-- Waveform icon -->
        <svg
          class="w-12 h-12 text-[var(--color-accent-cyan)]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z"
          />
        </svg>
      </div>
    </div>

    <h1 class="text-3xl font-bold text-[var(--color-text-primary)] mb-2 tracking-tight">
      PrivateVoice
    </h1>
    <p class="text-sm text-[var(--color-text-secondary)] font-mono">
      Local text-to-speech powered by Qwen3-TTS
    </p>
  </div>

  <!-- Progress section -->
  <div class="animate-slide-up stagger-2">
    <StartupProgress {phase} {message} {progress} />
  </div>

  <!-- First-run setup info panel -->
  {#if isSetup}
    <div class="mt-4 w-full max-w-md p-3 rounded-lg border border-[var(--color-accent-amber)]/30 bg-[var(--color-accent-amber)]/5 text-center">
      <p class="text-xs font-medium text-[var(--color-accent-amber)] mb-1">
        One-time setup
      </p>
      <p class="text-xs text-[var(--color-text-muted)]">
        Setting up the Python environment and installing dependencies.
        Subsequent launches will be instant.
      </p>
    </div>
  {:else}
    <p class="mt-3 text-xs text-[var(--color-text-muted)] font-mono">
      First launch can take several minutes while the Python environment initializes and models download.
    </p>
  {/if}

  <!-- Download progress (shown during model download) -->
  {#if isDownloading && download}
    <div class="mt-6 animate-slide-up stagger-3">
      <DownloadProgress
        fileName={download.fileName}
        bytesDownloaded={download.bytesDownloaded}
        bytesTotal={download.bytesTotal}
        speedMbps={download.speedMbps}
        eta={download.eta}
      />
    </div>
  {/if}

  <!-- Error state -->
  {#if isError && onRetry}
    <div class="mt-8 animate-slide-up">
      <StudioButton variant="primary" onclick={onRetry}>
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Retry
      </StudioButton>
    </div>
  {/if}

  <div class="mt-6 animate-slide-up">
    <button
      class="text-xs text-[var(--color-accent)] hover:underline"
      onclick={() => showDetails = !showDetails}
    >
      {showDetails ? "Hide startup details" : "Show startup details"}
    </button>
  </div>

  {#if showDetails}
    <div class="mt-4 w-full max-w-xl p-4 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] text-xs">
      <div class="flex items-center justify-between mb-2">
        <span class="text-[var(--color-text-secondary)] font-medium">Startup Details</span>
        {#if debugStore.state.systemInfo}
          <span class="text-[var(--color-text-muted)]">
            {debugStore.state.systemInfo.device_name} • {debugStore.state.systemInfo.memory_total_gb.toFixed(1)} GB
          </span>
        {/if}
      </div>
      <div class="mb-2 flex items-center justify-between">
        <span class="text-[var(--color-text-muted)]">Live console output</span>
        <button
          class="text-[var(--color-accent)] hover:underline"
          onclick={() => showRawLogs = !showRawLogs}
        >
          {showRawLogs ? "Show filtered" : "Show raw"}
        </button>
      </div>
      {#if recentLogs.length === 0}
        <p class="text-[var(--color-text-muted)]">Waiting for startup logs…</p>
      {:else}
        <div class="space-y-1 max-h-40 overflow-y-auto">
          {#each recentLogs as log}
            <div class="font-mono text-[var(--color-text-muted)]">
              {log.timestamp.split("T")[1]?.slice(0, 8) ?? log.timestamp} {log.level} {log.message}
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Footer -->
  <div class="absolute bottom-6 text-center">
    <p class="text-xs text-[var(--color-text-muted)] font-mono">
      PrivateVoice v1.0.0 • Powered by Qwen3-TTS
    </p>
  </div>
</div>
