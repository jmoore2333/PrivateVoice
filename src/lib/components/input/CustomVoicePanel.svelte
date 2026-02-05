<script lang="ts">
  import TextInput from './TextInput.svelte';
  import LanguageSelector from './LanguageSelector.svelte';
  import VoiceSelector from './VoiceSelector.svelte';
  import { helpStore } from '$lib/stores/helpStore.svelte';
  const instructionId = "custom-voice-instructions";

  interface Props {
    text: string;
    language: string;
    speaker: string;
    instruction: string;
    isGenerating: boolean;
    modelSupported?: boolean;
    modelLoading?: boolean;
    recommendedModelLabel?: string;
    onGenerate: () => void;
    onTextChange?: (text: string) => void;
    onLanguageChange?: (lang: string) => void;
    onSpeakerChange?: (speaker: string, isPreset: boolean) => void;
    onInstructionChange?: (instruction: string) => void;
    onLoadModel?: () => void;
  }

  let {
    text = $bindable(),
    language = $bindable(),
    speaker = $bindable(),
    instruction = $bindable(),
    isGenerating,
    modelSupported = true,
    modelLoading = false,
    recommendedModelLabel = "0.6B Custom",
    onGenerate,
    onTextChange,
    onLanguageChange,
    onSpeakerChange,
    onInstructionChange,
    onLoadModel,
  }: Props = $props();
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
            Requires a Custom Voice model
          </p>
          <p class="text-xs text-[var(--color-text-muted)] mt-1">
            Custom Voice works with the Custom models (0.6B Custom or 1.7B Custom).
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

  <TextInput
    bind:value={text}
    onInput={onTextChange}
    placeholder="Enter the text you want to generate as speech..."
    maxLength={2000}
  />

  <div class="grid grid-cols-2 gap-4">
    <LanguageSelector
      bind:value={language}
      onSelect={onLanguageChange}
    />

    <div></div>
  </div>

  <VoiceSelector
    bind:value={speaker}
    onSelect={onSpeakerChange}
  />

  <!-- Style Instructions -->
  <div class="space-y-2">
    <div class="flex items-center gap-2">
      <label
        class="block text-sm font-medium text-[var(--color-text-primary)]"
        for={instructionId}
      >
        Style instructions
      </label>
      <span class="text-xs text-[var(--color-text-muted)]">(optional)</span>
      <button
        class="w-4 h-4 rounded-full bg-[var(--color-bg-hover)] text-[var(--color-text-muted)] text-xs hover:bg-[var(--color-bg-elevated)]"
        title="Describe how the voice should sound: emotion, pace, emphasis, etc."
        onclick={() => helpStore.open('custom-voice')}
      >
        ?
      </button>
    </div>

    <textarea
      id={instructionId}
      bind:value={instruction}
      oninput={(e) => onInstructionChange?.((e.target as HTMLTextAreaElement).value)}
      placeholder="e.g., Speak warmly and slowly, with emphasis on key words..."
      rows={2}
      class="w-full px-4 py-3 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors resize-none text-sm"
    ></textarea>
  </div>

  <!-- Generate Button -->
  <button
    class="w-full py-3 rounded-lg bg-[var(--color-accent)] text-white font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    disabled={!text.trim() || isGenerating || modelLoading || !modelSupported}
    onclick={onGenerate}
  >
    {isGenerating ? 'Generating...' : 'Generate'}
  </button>
</div>
