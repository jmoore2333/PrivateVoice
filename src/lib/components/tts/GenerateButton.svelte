<script lang="ts">
  interface Props {
    disabled?: boolean;
    isGenerating?: boolean;
    onclick?: () => void;
  }

  let {
    disabled = false,
    isGenerating = false,
    onclick,
  }: Props = $props();
</script>

<button
  {onclick}
  disabled={disabled || isGenerating}
  class="group relative w-full py-4 px-6 rounded-xl font-medium text-base
    transition-all duration-300 overflow-hidden
    disabled:opacity-50 disabled:cursor-not-allowed
    {isGenerating
      ? 'bg-[var(--color-bg-elevated)] border border-[var(--color-accent-amber)]'
      : 'bg-gradient-to-r from-[var(--color-accent-cyan)] to-[#00b8e6] text-[var(--color-bg-deep)] hover:shadow-[0_0_30px_rgba(0,212,255,0.4)] hover:scale-[1.02] active:scale-[0.98]'}"
>
  <!-- Animated background for generating state -->
  {#if isGenerating}
    <div class="absolute inset-0 overflow-hidden">
      <div
        class="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--color-accent-amber-glow)] to-transparent animate-shimmer"
        style="animation: shimmer 2s infinite;"
      ></div>
    </div>
  {/if}

  <span class="relative flex items-center justify-center gap-3">
    {#if isGenerating}
      <!-- Waveform animation -->
      <div class="flex items-center gap-1 h-5">
        {#each [0, 1, 2, 3, 4] as i}
          <div
            class="w-1 bg-[var(--color-accent-amber)] rounded-full"
            style="height: 100%; animation: waveform 0.8s ease-in-out infinite; animation-delay: {i * 0.1}s;"
          ></div>
        {/each}
      </div>
      <span class="text-[var(--color-accent-amber)]">Generating...</span>
    {:else}
      <!-- Microphone icon -->
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
        />
      </svg>
      Generate Speech
    {/if}
  </span>
</button>

<style>
  @keyframes waveform {
    0%, 100% {
      transform: scaleY(0.4);
    }
    50% {
      transform: scaleY(1);
    }
  }

  @keyframes shimmer {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(100%);
    }
  }

  .animate-shimmer {
    animation: shimmer 2s infinite;
  }
</style>
