<script lang="ts">
  import ProgressBar from "$lib/components/ui/ProgressBar.svelte";
  import type { StartupPhase } from "$lib/stores/appStore.svelte";
  import { isSetupPhase } from "$lib/stores/appStore.svelte";

  interface Props {
    phase: StartupPhase;
    message: string;
    progress: number;
  }

  let { phase, message, progress }: Props = $props();

  const phaseLabels: Record<StartupPhase, string> = {
    initializing: "Initializing",
    "setup-detecting-hardware": "Detecting Hardware",
    "setup-checking-disk": "Checking Disk Space",
    "setup-copying-source": "Copying Files",
    "setup-installing-python": "Installing Python",
    "setup-creating-venv": "Creating Environment",
    "setup-installing-deps": "Installing Dependencies",
    "setup-verifying": "Verifying Setup",
    "setup-complete": "Setup Complete",
    "starting-server": "Starting Server",
    "checking-models": "Checking Models",
    downloading: "Downloading",
    "loading-model": "Loading Model",
    ready: "Ready",
    error: "Error",
  };

  function getPhaseConfig(p: StartupPhase) {
    const configs: Record<string, { color: string; bgColor: string }> = {
      error: {
        color: "var(--color-accent-red)",
        bgColor: "var(--color-accent-red-glow)",
      },
      ready: {
        color: "var(--color-accent-green)",
        bgColor: "var(--color-accent-green-glow)",
      },
      downloading: {
        color: "var(--color-accent-amber)",
        bgColor: "var(--color-accent-amber-glow)",
      },
    };
    // Use amber accent for all setup phases to distinguish from normal startup
    if (isSetupPhase(p)) {
      return {
        color: "var(--color-accent-amber)",
        bgColor: "var(--color-accent-amber-glow)",
      };
    }
    return configs[p] ?? {
      color: "var(--color-accent-cyan)",
      bgColor: "var(--color-accent-cyan-glow)",
    };
  }

  const isSetup = $derived(isSetupPhase(phase));
  const phaseConfig = $derived(getPhaseConfig(phase));
</script>

<div class="w-full max-w-md">
  <!-- Phase indicator -->
  <div class="flex items-center gap-4 mb-5">
    <div
      class="w-12 h-12 rounded-xl flex items-center justify-center
        border border-[var(--color-border-default)]
        transition-colors duration-300"
      style="background: {phaseConfig.bgColor}; color: {phaseConfig.color};"
    >
      {#if phase === "ready"}
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
      {:else if phase === "error"}
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      {:else if phase === "downloading" || phase === "setup-installing-deps"}
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      {:else if phase === "loading-model"}
        <svg class="w-6 h-6 animate-pulse-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      {:else if phase === "setup-complete"}
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
        </svg>
      {:else if isSetup}
        <!-- Wrench icon for setup phases -->
        <svg class="w-6 h-6 animate-pulse-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      {:else}
        <!-- Spinning gear -->
        <svg class="w-6 h-6 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      {/if}
    </div>

    <div class="flex-1">
      <p class="text-sm font-semibold text-[var(--color-text-primary)]">
        {phaseLabels[phase] ?? phase}
      </p>
      <p class="text-sm text-[var(--color-text-secondary)]">
        {message}
      </p>
    </div>
  </div>

  <!-- Progress bar -->
  {#if phase !== "error"}
    <ProgressBar value={progress} showLabel variant="gradient" />
  {:else}
    <div class="h-1.5 rounded-full bg-[var(--color-accent-red-glow)]">
      <div class="h-full rounded-full bg-[var(--color-accent-red)]" style="width: 100%;"></div>
    </div>
  {/if}
</div>
