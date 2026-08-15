<script lang="ts">
  import TextInput from './TextInput.svelte';
  import LanguageSelector from './LanguageSelector.svelte';
  import AudioRecorder from './AudioRecorder.svelte';
  import SeedControls from './SeedControls.svelte';
  import { helpStore } from '$lib/stores/helpStore.svelte';
  const transcriptId = "voice-clone-transcript";

  interface Props {
    text: string;
    language: string;
    referenceText: string;
    seed: number | null;
    referenceAudioUrl: string | null;
    referenceAudioBlob: Blob | null;
    isGenerating: boolean;
    elapsedTime?: number;
    hasWhisper: boolean;
    hasTranslation?: boolean;
    canTranslateText?: boolean;
    isTranscribing?: boolean;
    transcriptionError?: string | null;
    translationText?: string | null;
    translationError?: string | null;
    isTranslatingText?: boolean;
    textTranslationError?: string | null;
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
    onUseTranslation?: () => void;
    onTranslateText?: () => void;
    onLowQualityModeChange?: (enabled: boolean) => void;
    onSeedChange?: (seed: number | null) => void;
    onLoadModel?: () => void;
  }

  let {
    text = $bindable(),
    language = $bindable(),
    referenceText = $bindable(),
    seed = $bindable(),
    referenceAudioUrl,
    referenceAudioBlob,
    isGenerating,
    elapsedTime = 0,
    hasWhisper = false,
    hasTranslation = false,
    canTranslateText = false,
    isTranscribing = false,
    transcriptionError = null,
    translationText = null,
    translationError = null,
    isTranslatingText = false,
    textTranslationError = null,
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
    onUseTranslation,
    onTranslateText,
    onLowQualityModeChange,
    onSeedChange,
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

  <!-- Step 1: Reference Audio -->
  <div class="space-y-2">
    <div class="flex items-center gap-2">
      <span class="flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold {referenceAudioBlob ? 'bg-[var(--color-success)]/20 text-[var(--color-success)]' : 'bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]'}">1</span>
      <span class="text-sm font-medium text-[var(--color-text-primary)]">Reference Audio</span>
    </div>
    <AudioRecorder
      restoredAudioUrl={referenceAudioUrl}
      onRecordingComplete={(blob, url) => onReferenceAudioChange?.(blob, url)}
      onImport={(file) => {
        const url = URL.createObjectURL(file);
        file.arrayBuffer().then(buffer => {
          const blob = new Blob([buffer], { type: file.type });
          onReferenceAudioChange?.(blob, url);
        });
      }}
    />
  </div>

  <!-- Step 2: Transcript -->
  <div class="space-y-2">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <span class="flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold {lowQualityMode || referenceText.trim() ? 'bg-[var(--color-success)]/20 text-[var(--color-success)]' : 'bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]'}">2</span>
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
          class="text-xs text-[var(--color-accent)] hover:underline disabled:opacity-50 disabled:no-underline flex items-center gap-1"
          onclick={onAutoTranscribe}
          disabled={isTranscribing}
        >
          {#if isTranscribing}
            <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
            Transcribing...
          {:else}
            Auto-transcribe
          {/if}
        </button>
      {/if}
    </div>

    <textarea
      id={transcriptId}
      bind:value={referenceText}
      oninput={(e) => onReferenceTextChange?.((e.target as HTMLTextAreaElement).value)}
      placeholder="Enter the exact words spoken in the reference audio..."
      rows={3}
      disabled={lowQualityMode || isTranscribing}
      class="w-full px-4 py-3 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors resize-none disabled:opacity-50"
    ></textarea>

    {#if transcriptionError}
      <p class="text-xs text-[var(--color-error)]">{transcriptionError}</p>
    {/if}

    {#if hasTranslation}
      <div class="p-3 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)]">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
              Translation (English)
            </p>
            <p class="text-xs text-[var(--color-text-muted)] mt-1">
              Optional helper generated locally by Whisper.
            </p>
          </div>
          {#if translationText && onUseTranslation}
            <button
              class="text-xs text-[var(--color-accent)] hover:underline"
              onclick={onUseTranslation}
            >
              Use as text
            </button>
          {/if}
        </div>

        {#if translationText}
          <p class="text-sm text-[var(--color-text-primary)] mt-2 whitespace-pre-wrap">{translationText}</p>
        {:else if isTranscribing}
          <p class="text-sm text-[var(--color-text-muted)] mt-2">Generating translation...</p>
        {:else}
          <p class="text-sm text-[var(--color-text-muted)] mt-2">Run Auto-transcribe to generate translation.</p>
        {/if}

        {#if translationError}
          <p class="text-xs text-[var(--color-error)] mt-2">{translationError}</p>
        {/if}
      </div>
    {/if}

    <label class="flex items-start gap-2 text-sm text-[var(--color-text-muted)]">
      <input
        type="checkbox"
        bind:checked={lowQualityMode}
        onchange={() => onLowQualityModeChange?.(lowQualityMode)}
        class="rounded border-[var(--color-border-default)] mt-0.5"
      />
      <span>
        Low-quality mode
        <span class="block text-xs text-[var(--color-text-muted)]">Uses x-vector only. No transcript needed, but voice match is less accurate.</span>
      </span>
    </label>
  </div>

  <hr class="border-[var(--color-border-subtle)]" />

  <!-- Step 3: Text to generate -->
  <div class="flex items-center gap-2 -mb-4">
    <span class="flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold {text.trim() ? 'bg-[var(--color-success)]/20 text-[var(--color-success)]' : 'bg-[var(--color-bg-hover)] text-[var(--color-text-muted)]'}">3</span>
    <span class="text-sm font-medium text-[var(--color-text-primary)]">Text to generate</span>
  </div>

  <TextInput
    bind:value={text}
    onInput={onTextChange}
    label=""
    placeholder="Enter the text you want the cloned voice to speak..."
    maxLength={2000}
  />

  {#if canTranslateText}
    <div class="space-y-1">
      <button
        class="text-xs text-[var(--color-accent)] hover:underline disabled:opacity-50 disabled:no-underline"
        disabled={isTranslatingText || !text.trim() || language === 'Auto'}
        onclick={onTranslateText}
      >
        {isTranslatingText ? 'Translating text...' : `Translate text to ${language}`}
      </button>
      {#if textTranslationError}
        <p class="text-xs text-[var(--color-error)]">{textTranslationError}</p>
      {/if}
      {#if language === 'Auto'}
        <p class="text-xs text-[var(--color-text-muted)]">Select a target language to translate text.</p>
      {/if}
    </div>
  {/if}

  <LanguageSelector
    bind:value={language}
    onSelect={onLanguageChange}
  />

  <SeedControls
    bind:seed={seed}
    {onSeedChange}
  />

  <!-- Generate Button -->
  <button
    class="w-full py-3 rounded-lg bg-[var(--color-accent)] text-white font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    disabled={!canGenerate || isGenerating || modelLoading}
    onclick={onGenerate}
  >
    {isGenerating ? `Generating... ${elapsedTime.toFixed(1)}s` : 'Generate'}
  </button>
</div>
