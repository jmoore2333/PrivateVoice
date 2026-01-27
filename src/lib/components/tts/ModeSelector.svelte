<script lang="ts">
  type Mode = "custom-voice" | "voice-clone" | "voice-design";

  interface Props {
    mode: Mode;
    onchange?: (mode: Mode) => void;
  }

  let { mode, onchange }: Props = $props();

  const modes: Array<{ id: Mode; label: string; icon: string; desc: string }> = [
    {
      id: "custom-voice",
      label: "Custom Voice",
      icon: "M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z",
      desc: "Use preset speakers with optional style instructions",
    },
    {
      id: "voice-clone",
      label: "Voice Clone",
      icon: "M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z",
      desc: "Clone a voice from reference audio",
    },
    {
      id: "voice-design",
      label: "Voice Design",
      icon: "M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z",
      desc: "Design a voice from text description",
    },
  ];
</script>

<div class="grid grid-cols-3 gap-3">
  {#each modes as m}
    <button
      onclick={() => onchange?.(m.id)}
      class="group relative flex flex-col items-center gap-2 p-4 rounded-xl transition-all duration-200
        {mode === m.id
          ? 'bg-[var(--color-bg-elevated)] border-2 border-[var(--color-accent-cyan)] shadow-[0_0_20px_rgba(0,212,255,0.15)]'
          : 'bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] hover:bg-[var(--color-bg-elevated)] hover:border-[var(--color-border-default)]'}"
    >
      <!-- Icon -->
      <div
        class="w-10 h-10 flex items-center justify-center rounded-lg transition-colors
          {mode === m.id
            ? 'bg-[var(--color-accent-cyan-glow)] text-[var(--color-accent-cyan)]'
            : 'bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] group-hover:text-[var(--color-text-primary)]'}"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d={m.icon} />
        </svg>
      </div>

      <!-- Label -->
      <span
        class="text-sm font-medium transition-colors
          {mode === m.id ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)]'}"
      >
        {m.label}
      </span>

      <!-- Active indicator -->
      {#if mode === m.id}
        <div
          class="absolute -bottom-px left-1/2 -translate-x-1/2 w-12 h-0.5 rounded-full bg-[var(--color-accent-cyan)]"
          style="box-shadow: 0 0 10px var(--color-accent-cyan);"
        ></div>
      {/if}
    </button>
  {/each}
</div>
