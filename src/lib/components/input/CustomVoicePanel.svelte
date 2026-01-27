<script lang="ts">
  import TextInput from './TextInput.svelte';
  import LanguageSelector from './LanguageSelector.svelte';
  import VoiceSelector from './VoiceSelector.svelte';

  interface Props {
    text: string;
    language: string;
    speaker: string;
    instruction: string;
    isGenerating: boolean;
    onGenerate: () => void;
    onTextChange?: (text: string) => void;
    onLanguageChange?: (lang: string) => void;
    onSpeakerChange?: (speaker: string, isPreset: boolean) => void;
    onInstructionChange?: (instruction: string) => void;
  }

  let {
    text = $bindable(),
    language = $bindable(),
    speaker = $bindable(),
    instruction = $bindable(),
    isGenerating,
    onGenerate,
    onTextChange,
    onLanguageChange,
    onSpeakerChange,
    onInstructionChange,
  }: Props = $props();
</script>

<div class="space-y-6">
  <TextInput
    bind:value={text}
    onInput={onTextChange}
    placeholder="Enter the text you want to generate as speech..."
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
      <label class="block text-sm font-medium text-[var(--color-text-primary)]">
        Style instructions
      </label>
      <span class="text-xs text-[var(--color-text-muted)]">(optional)</span>
      <button
        class="w-4 h-4 rounded-full bg-[var(--color-bg-hover)] text-[var(--color-text-muted)] text-xs hover:bg-[var(--color-bg-elevated)]"
        title="Describe how the voice should sound: emotion, pace, emphasis, etc."
      >
        ?
      </button>
    </div>

    <textarea
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
    disabled={!text.trim() || isGenerating}
    onclick={onGenerate}
  >
    {isGenerating ? 'Generating...' : 'Generate'}
  </button>
</div>
