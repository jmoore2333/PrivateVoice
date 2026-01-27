<script lang="ts">
  import TextInput from './TextInput.svelte';
  import LanguageSelector from './LanguageSelector.svelte';
  import AudioRecorder from './AudioRecorder.svelte';

  interface Props {
    text: string;
    language: string;
    referenceText: string;
    referenceAudioUrl: string | null;
    referenceAudioBlob: Blob | null;
    isGenerating: boolean;
    hasWhisper: boolean;
    onGenerate: () => void;
    onTextChange?: (text: string) => void;
    onLanguageChange?: (lang: string) => void;
    onReferenceTextChange?: (text: string) => void;
    onReferenceAudioChange?: (blob: Blob, url: string) => void;
    onAutoTranscribe?: () => void;
  }

  let {
    text = $bindable(),
    language = $bindable(),
    referenceText = $bindable(),
    referenceAudioUrl,
    referenceAudioBlob,
    isGenerating,
    hasWhisper = false,
    onGenerate,
    onTextChange,
    onLanguageChange,
    onReferenceTextChange,
    onReferenceAudioChange,
    onAutoTranscribe,
  }: Props = $props();

  let lowQualityMode = $state(false);

  const canGenerate = $derived(
    text.trim() &&
    referenceAudioBlob &&
    (lowQualityMode || referenceText.trim())
  );
</script>

<div class="space-y-6">
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
        <label class="block text-sm font-medium text-[var(--color-text-primary)]">
          Transcript of reference
        </label>
        <button
          class="w-4 h-4 rounded-full bg-[var(--color-bg-hover)] text-[var(--color-text-muted)] text-xs"
          title="Enter exactly what is said in the reference audio"
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
  />

  <LanguageSelector
    bind:value={language}
    onSelect={onLanguageChange}
  />

  <!-- Generate Button -->
  <button
    class="w-full py-3 rounded-lg bg-[var(--color-accent)] text-white font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    disabled={!canGenerate || isGenerating}
    onclick={onGenerate}
  >
    {isGenerating ? 'Generating...' : 'Generate'}
  </button>
</div>
