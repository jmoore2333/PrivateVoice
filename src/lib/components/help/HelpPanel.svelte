<script lang="ts">
  import { helpStore } from '$lib/stores/helpStore.svelte';
  import SpeakerGallery from './SpeakerGallery.svelte';

  // Collapsible sections
  let expandedSections = $state<Set<string>>(new Set(['getting-started', 'keyboard']));

  function toggleSection(id: string) {
    if (expandedSections.has(id)) {
      expandedSections.delete(id);
    } else {
      expandedSections.add(id);
    }
    expandedSections = new Set(expandedSections); // trigger reactivity
  }

  const sections = [
    {
      id: 'getting-started',
      title: 'Getting Started',
      content: `PrivateVoice is a personal voice studio that runs entirely on your machine. No cloud services, no subscriptions - just powerful TTS capabilities at your fingertips.

Three modes to explore:
  - Custom Voice - Use preset speakers with optional style instructions
  - Voice Clone - Clone any voice from a short audio sample
  - Voice Design - Create new voices from natural language descriptions`
    },
    {
      id: 'voice-guides',
      title: 'Voice Guides',
      content: null, // Special: will render SpeakerGallery
      subsections: [
        { title: 'Custom Voice', text: 'Choose from 9 preset speakers, each with unique characteristics. Add style instructions to adjust tone, pace, and emotion.' },
        { title: 'Voice Clone', text: 'Record or upload 5-30 seconds of clear audio with minimal background noise. Provide an accurate transcript for best results.' },
        { title: 'Voice Design', text: 'Describe the voice you want: gender, age, accent, emotion, speaking style. The AI will generate a unique voice matching your description.' },
      ]
    },
    {
      id: 'system-requirements',
      title: 'System Requirements',
      content: `Recommended: Apple Silicon Mac (M1/M2/M3/M4) with 16GB+ RAM

Supported platforms:
  - macOS (Apple Silicon) - Uses MPS for GPU acceleration
  - macOS (Intel) - CPU only, slower
  - Linux/Windows (NVIDIA) - CUDA support planned
  - Linux/Windows (no GPU) - CPU only, slower

Memory requirements:
  - 0.6B model: ~8GB RAM
  - 1.7B model: ~12GB RAM`
    },
    {
      id: 'tips',
      title: 'Tips & Tricks',
      content: `Design to Clone workflow: Use Voice Design to create a unique voice, then record yourself imitating it, then use Voice Clone to refine it.

Style instructions that work:
  - "Speak slowly and warmly"
  - "Excited, with emphasis on key words"
  - "Calm, like a meditation guide"

Getting the best quality:
  - Use the 1.7B model for important work
  - Keep text under 500 characters for best results
  - For Voice Clone, provide accurate transcripts`
    },
    {
      id: 'keyboard',
      title: 'Keyboard Shortcuts',
      content: `Playback:
  - Space - Play/pause audio

Generation:
  - Cmd/Ctrl + Enter - Generate
  - Cmd/Ctrl + S - Save to library

Navigation:
  - Cmd/Ctrl + 1/2/3 - Switch modes
  - Escape - Close panels`
    },
  ];
</script>

{#if helpStore.isOpen}
  <!-- Backdrop -->
  <button
    class="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
    onclick={() => helpStore.close()}
    aria-label="Close help"
  ></button>

  <!-- Panel -->
  <div class="fixed inset-y-0 right-0 w-full max-w-lg z-50 bg-[var(--color-bg-surface)] border-l border-[var(--color-border-default)] shadow-2xl overflow-y-auto animate-slide-left">
    <!-- Header -->
    <div class="sticky top-0 flex items-center justify-between p-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
      <h2 class="text-lg font-semibold text-[var(--color-text-primary)]">Help</h2>
      <button
        onclick={() => helpStore.close()}
        class="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
        aria-label="Close help"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Content -->
    <div class="p-4 space-y-2">
      {#each sections as section}
        <div class="rounded-lg border border-[var(--color-border-subtle)] overflow-hidden">
          <button
            class="w-full flex items-center justify-between p-4 text-left hover:bg-[var(--color-bg-hover)] transition-colors"
            onclick={() => toggleSection(section.id)}
          >
            <span class="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wider">
              {section.title}
            </span>
            <svg
              class="w-4 h-4 text-[var(--color-text-muted)] transition-transform {expandedSections.has(section.id) ? 'rotate-180' : ''}"
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {#if expandedSections.has(section.id)}
            <div class="px-4 pb-4 text-sm text-[var(--color-text-secondary)] whitespace-pre-line">
              {#if section.id === 'voice-guides'}
                <SpeakerGallery />
                {#each section.subsections ?? [] as sub}
                  <div class="mt-4">
                    <h4 class="font-medium text-[var(--color-text-primary)] mb-1">{sub.title}</h4>
                    <p>{sub.text}</p>
                  </div>
                {/each}
              {:else}
                {section.content}
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  @keyframes slide-left {
    from {
      transform: translateX(100%);
    }
    to {
      transform: translateX(0);
    }
  }

  .animate-slide-left {
    animation: slide-left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
</style>
