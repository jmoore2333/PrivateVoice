<script lang="ts">
  import TextInput from './TextInput.svelte';
  import LanguageSelector from './LanguageSelector.svelte';

  interface Props {
    text: string;
    language: string;
    voiceDescription: string;
    isGenerating: boolean;
    modelLoaded: boolean;
    modelLoading: boolean;
    onGenerate: () => void;
    onLoadModel: () => void;
    onTextChange?: (text: string) => void;
    onLanguageChange?: (lang: string) => void;
    onDescriptionChange?: (description: string) => void;
  }

  let {
    text = $bindable(),
    language = $bindable(),
    voiceDescription = $bindable(),
    isGenerating,
    modelLoaded,
    modelLoading,
    onGenerate,
    onLoadModel,
    onTextChange,
    onLanguageChange,
    onDescriptionChange,
  }: Props = $props();

  const canGenerate = $derived(
    text.trim() && voiceDescription.trim() && modelLoaded
  );
</script>

<div class="space-y-6">
  <!-- Model Warning -->
  {#if !modelLoaded}
    <div class="p-4 rounded-lg bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/30">
      <div class="flex items-start gap-3">
        <svg class="w-5 h-5 text-[var(--color-warning)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <div class="flex-1">
          <p class="text-sm font-medium text-[var(--color-warning)]">
            Requires 1.7B-Design model
          </p>
          <p class="text-xs text-[var(--color-text-muted)] mt-1">
            Voice Design requires a specific model that supports voice generation from descriptions.
          </p>
          <button
            class="mt-2 text-sm text-[var(--color-accent)] hover:underline disabled:opacity-50"
            disabled={modelLoading}
            onclick={onLoadModel}
          >
            {modelLoading ? 'Loading model...' : 'Load required model'}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Voice Description -->
  <div class="space-y-2">
    <div class="flex items-center gap-2">
      <label class="block text-sm font-medium text-[var(--color-text-primary)]">
        Voice description
      </label>
      <button
        class="w-4 h-4 rounded-full bg-[var(--color-bg-hover)] text-[var(--color-text-muted)] text-xs"
        title="Describe the voice you want to create: gender, age, tone, accent, emotion, etc."
      >
        ?
      </button>
    </div>

    <textarea
      bind:value={voiceDescription}
      oninput={(e) => onDescriptionChange?.((e.target as HTMLTextAreaElement).value)}
      placeholder="e.g., Warm baritone male voice, slight British accent, calm and reassuring tone, sounds like a nature documentary narrator..."
      rows={4}
      class="w-full px-4 py-3 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors resize-none"
    ></textarea>

    <p class="text-xs text-[var(--color-text-muted)]">
      Tip: Be specific about gender, age, accent, emotion, and speaking style.
    </p>
  </div>

  <hr class="border-[var(--color-border-subtle)]" />

  <!-- Target Text -->
  <TextInput
    bind:value={text}
    onInput={onTextChange}
    label="Text to generate"
    placeholder="Enter the text you want the designed voice to speak..."
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
