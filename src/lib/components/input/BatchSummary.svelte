<script lang="ts">
  import type { TTSMode } from '$lib/stores/ttsStore.svelte';

  /**
   * Read-only statement of what a batch run will actually send.
   *
   * Issue #13 asked "how do I know which settings it uses for batch mode?".
   * Some of the answer lives in the voice panel and some in Settings, so this
   * card gathers the whole effective request in one place. Presentation only —
   * it reads no stores, so it stays trivially testable.
   */
  interface Props {
    mode: TTSMode;
    /** Capability decisions key off the id, never off the display label. */
    modelId: string | null;
    modelLabel: string;
    speaker?: string;
    instruction?: string;
    voiceDescription?: string;
    referenceAudioName?: string | null;
    lowQualityMode?: boolean;
    language: string;
    format: string;
    sampleRate: number | null;
    bitDepth: number;
    seed: number | null;
  }

  let {
    mode,
    modelId,
    modelLabel,
    speaker = '',
    instruction = '',
    voiceDescription = '',
    referenceAudioName = null,
    lowQualityMode = false,
    language,
    format,
    sampleRate,
    bitDepth,
    seed,
  }: Props = $props();

  const modeLabels: Record<TTSMode, string> = {
    'custom-voice': 'Custom Voice',
    'voice-clone': 'Voice Clone',
    'voice-design': 'Voice Design',
  };

  // Only the 1.7B CustomVoice model acts on instructions. qwen_tts discards
  // them outright on 0.6B (`if tts_model_size in "0b6": instruct = None`), so
  // saying so is more honest than showing text that will have no effect.
  // Matches CustomVoicePanel's `supportsInstructions` check, on id not label.
  const instructionIgnored = $derived(
    mode === 'custom-voice' && instruction.trim().length > 0 && modelId !== '1.7b'
  );

  const audioLine = $derived(
    format === 'mp3'
      ? 'MP3 · 192 kbps'
      : `WAV · ${bitDepth}-bit · ${
          sampleRate ? `${(sampleRate / 1000).toFixed(sampleRate % 1000 === 0 ? 0 : 1)} kHz` : 'model rate'
        }`
  );

  const missingReference = $derived(mode === 'voice-clone' && !referenceAudioName);
</script>

<div class="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] p-3 space-y-2">
  <p class="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
    This batch will use
  </p>

  <dl class="space-y-1 text-xs">
    <div class="flex justify-between gap-3">
      <dt class="text-[var(--color-text-muted)]">Mode</dt>
      <dd class="text-[var(--color-text-primary)] text-right">{modeLabels[mode]}</dd>
    </div>
    <div class="flex justify-between gap-3">
      <dt class="text-[var(--color-text-muted)]">Model</dt>
      <dd class="text-[var(--color-text-primary)] text-right">{modelLabel}</dd>
    </div>

    {#if mode === 'custom-voice'}
      <div class="flex justify-between gap-3">
        <dt class="text-[var(--color-text-muted)]">Speaker</dt>
        <dd class="text-[var(--color-text-primary)] text-right">{speaker || '—'}</dd>
      </div>
      {#if instruction.trim()}
        <div class="flex justify-between gap-3">
          <dt class="text-[var(--color-text-muted)]">Style</dt>
          <dd class="text-[var(--color-text-primary)] text-right truncate max-w-[60%]" title={instruction}>
            {instruction}
          </dd>
        </div>
      {/if}
    {:else if mode === 'voice-clone'}
      <div class="flex justify-between gap-3">
        <dt class="text-[var(--color-text-muted)]">Reference</dt>
        <dd
          class="text-right {missingReference
            ? 'text-[var(--color-warning)]'
            : 'text-[var(--color-text-primary)]'}"
        >
          {referenceAudioName ?? 'No reference audio selected'}
        </dd>
      </div>
      <div class="flex justify-between gap-3">
        <dt class="text-[var(--color-text-muted)]">Transcript</dt>
        <dd class="text-[var(--color-text-primary)] text-right">
          {lowQualityMode ? 'Not used (low-quality mode)' : 'Required'}
        </dd>
      </div>
    {:else}
      <div class="flex justify-between gap-3">
        <dt class="text-[var(--color-text-muted)]">Description</dt>
        <dd class="text-[var(--color-text-primary)] text-right truncate max-w-[60%]" title={voiceDescription}>
          {voiceDescription.trim() || '—'}
        </dd>
      </div>
    {/if}

    <div class="flex justify-between gap-3">
      <dt class="text-[var(--color-text-muted)]">Language</dt>
      <dd class="text-[var(--color-text-primary)] text-right">{language}</dd>
    </div>
    <div class="flex justify-between gap-3">
      <dt class="text-[var(--color-text-muted)]">Audio</dt>
      <dd class="text-[var(--color-text-primary)] text-right">{audioLine}</dd>
    </div>
    <div class="flex justify-between gap-3">
      <dt class="text-[var(--color-text-muted)]">Seed</dt>
      <dd class="text-[var(--color-text-primary)] text-right">{seed === null ? 'Random' : seed}</dd>
    </div>
  </dl>

  {#if instructionIgnored}
    <p class="text-xs text-[var(--color-warning)]">
      This model ignores style instructions. Load 1.7B Custom to use them.
    </p>
  {/if}

  {#if missingReference}
    <p class="text-xs text-[var(--color-warning)]">
      Add reference audio above before starting the batch.
    </p>
  {/if}
</div>
