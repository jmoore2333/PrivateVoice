<script lang="ts">
  import TextInput from './TextInput.svelte';
  import LanguageSelector from './LanguageSelector.svelte';
  import AudioRecorder from './AudioRecorder.svelte';
  import { helpStore } from '$lib/stores/helpStore.svelte';
  const transcriptId = "voice-clone-transcript";

  interface Props {
    text: string;
    language: string;
    referenceText: string;
    referenceAudioUrl: string | null;
    referenceAudioBlob: Blob | null;
    isGenerating: boolean;
    hasWhisper: boolean;
    modelSupported?: boolean;
    modelLoading?: boolean;
    recommendedModelLabel?: string;
    recommendedModelHint?: string;
    onGenerate: () => void;
    onTextChange?: (text: string) => void;
    onLanguageChange?: (lang: string) => void;
    onReferenceTextChange?: (text: string) => void;
    onReferenceAudioChange?: (blob: Blob, url: string) => void;
    onAutoTranscribe?: () => void;
    onLowQualityModeChange?: (enabled: boolean) => void;
    onLoadModel?: () => void;
  }

  let {
    text = $bindable(),
    language = $bindable(),
    referenceText = $bindable(),
    referenceAudioUrl,
    referenceAudioBlob,
    isGenerating,
    hasWhisper = false,
    modelSupported = true,
    modelLoading = false,
    recommendedModelLabel = "0.6B Base",
    recommendedModelHint = "",
    onGenerate,
    onTextChange,
    onLanguageChange,
    onReferenceTextChange,
    onReferenceAudioChange,
    onAutoTranscribe,
    onLowQualityModeChange,
    onLoadModel,
  }: Props = $props();

  let lowQualityMode = $state(false);

  const canGenerate = $derived(
    !!modelSupported &&
    text.trim() &&
    referenceAudioBlob &&
    (lowQualityMode || referenceText.trim())
  );
</script>

<div class="space-y-6">
  {#if !modelSupported}
    <div class="p-4 rounded-lg bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/30">
      <div class="flex items-start gap-3">
        <svg class="w-5 h-5 text-[var(--color-warning)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div class="flex-1">
          <p class="text-sm font-medium text-[var(--color-warning)]">
            Requires a Base model for Voice Clone
          </p>
          <p class="text-xs text-[var(--color-text-muted)] mt-1">
            Voice Clone only works with the Base models (0.6B Base or 1.7B Base).
            {#if recommendedModelHint}
              <span class="block mt-1">{recommendedModelHint}</span>
            {/if}
          </p>
          {#if onLoadModel}
            <button
              class="mt-2 text-sm text-[var(--color-accent)] hover:underline disabled:opacity-50"
              disabled={modelLoading}
              onclick={onLoadModel}
            >
              {modelLoading ? 'Loading model...' : `Load ${recommendedModelLabel}`}
            </button>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- Reference Audio Section -->
  <AudioRecorder
    onRecordingComplete={(blob, url) => onReferenceAudioChange?.(blob, url)}
    onImport={(file) => {
      const url = URL.createObjectURL(file);
      // Convert file to blob for consistency
      file.arrayBuffer().then(buffer => {
        const blob = new Blob([buffer], { type: file.type });
        onReferenceAudioChange?.(blob, url);
      });
    }}
  />

  <!-- Transcript Section -->
  <div class="space-y-2">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <label
          class="block text-sm font-medium text-[var(--color-text-primary)]"
          for={transcriptId}
        >
          Transcript of reference
        </label>
        <button
          class="w-4 h-4 rounded-full bg-[var(--color-bg-hover)] text-[var(--color-text-muted)] text-xs"
          title="Enter exactly what is said in the reference audio"
          onclick={() => helpStore.open('voice-clone')}
        >
          ?
        </button>
      </div>

      {#if hasWhisper && referenceAudioBlob}
        <button
          class="text-xs text-[var(--color-accent)] hover:underline"
          onclick={onAutoTranscribe}
        >
          Auto-transcribe
        </button>
      {/if}
    </div>

    <textarea
      id={transcriptId}
      bind:value={referenceText}
      oninput={(e) => onReferenceTextChange?.((e.target as HTMLTextAreaElement).value)}
      placeholder="Enter the exact words spoken in the reference audio..."
      rows={3}
      disabled={lowQualityMode}
      class="w-full px-4 py-3 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors resize-none disabled:opacity-50"
    ></textarea>

    <label class="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
      <input
        type="checkbox"
        bind:checked={lowQualityMode}
        onchange={() => onLowQualityModeChange?.(lowQualityMode)}
        class="rounded border-[var(--color-border-default)]"
      />
      Low-quality mode (no transcript required)
    </label>
  </div>

  <hr class="border-[var(--color-border-subtle)]" />

  <!-- Target Text Section -->
  <TextInput
    bind:value={text}
    onInput={onTextChange}
    label="Text to generate"
    placeholder="Enter the text you want the cloned voice to speak..."
    maxLength={2000}
  />

  <LanguageSelector
    bind:value={language}
    onSelect={onLanguageChange}
  />

  <!-- Generate Button -->
  <button
    class="w-full py-3 rounded-lg bg-[var(--color-accent)] text-white font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    disabled={!canGenerate || isGenerating || modelLoading}
    onclick={onGenerate}
  >
    {isGenerating ? 'Generating...' : 'Generate'}
  </button>
</div>
