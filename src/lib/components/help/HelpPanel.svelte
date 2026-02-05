<script lang="ts">
  import { helpStore } from '$lib/stores/helpStore.svelte';
  import SpeakerGallery from './SpeakerGallery.svelte';

  // Collapsible sections
  let expandedSections = $state<Set<string>>(new Set(['getting-started', 'model-list']));
  let sectionRefs: Record<string, HTMLDivElement> = {};

  function toggleSection(id: string) {
    if (expandedSections.has(id)) {
      expandedSections.delete(id);
    } else {
      expandedSections.add(id);
    }
    expandedSections = new Set(expandedSections); // trigger reactivity
  }

  function registerSection(node: HTMLDivElement, id: string) {
    sectionRefs[id] = node;
    if (helpStore.isOpen && helpStore.targetSection === id) {
      setTimeout(() => {
        node.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 0);
    }
    return {
      destroy() {
        if (sectionRefs[id] === node) {
          delete sectionRefs[id];
        }
      }
    };
  }

  $effect(() => {
    if (!helpStore.isOpen || !helpStore.targetSection) return;
    const id = helpStore.targetSection;
    if (!expandedSections.has(id)) {
      expandedSections = new Set([...expandedSections, id]);
    }
    const target = sectionRefs[id];
    if (target) {
      setTimeout(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 0);
    }
  });

  const supportedLanguages = [
    'Chinese',
    'English',
    'Japanese',
    'Korean',
    'German',
    'French',
    'Russian',
    'Portuguese',
    'Spanish',
    'Italian',
  ];

  const modelGroups = [
    {
      title: '1.7B Models',
      rows: [
        {
          model: 'Qwen3-TTS-12Hz-1.7B-VoiceDesign',
          features: 'Voice design from description',
          languages: '10 languages',
          streaming: 'Yes',
          instruction: 'Yes',
        },
        {
          model: 'Qwen3-TTS-12Hz-1.7B-CustomVoice',
          features: 'Preset timbres with instruction control',
          languages: '10 languages',
          streaming: 'Yes',
          instruction: 'Yes',
        },
        {
          model: 'Qwen3-TTS-12Hz-1.7B-Base',
          features: '3-second rapid voice clone, base for fine-tuning',
          languages: '10 languages',
          streaming: 'Yes',
          instruction: 'No',
        },
      ],
    },
    {
      title: '0.6B Models',
      rows: [
        {
          model: 'Qwen3-TTS-12Hz-0.6B-CustomVoice',
          features: 'Preset timbres (fast, lightweight)',
          languages: '10 languages',
          streaming: 'Yes',
          instruction: 'Limited',
        },
        {
          model: 'Qwen3-TTS-12Hz-0.6B-Base',
          features: '3-second rapid voice clone, base for fine-tuning',
          languages: '10 languages',
          streaming: 'Yes',
          instruction: 'No',
        },
      ],
    },
  ];

  const keyFeatures = [
    'Powerful speech representation via the Qwen3-TTS-Tokenizer-12Hz.',
    'Universal end-to-end architecture with discrete multi-codebook LM.',
    'Dual-track hybrid streaming for low-latency generation.',
    'Instruction-driven control over timbre, emotion, and prosody.',
  ];

  const performanceHighlights = [
    'Voice Design: reported to outperform closed-source baselines on InstructTTS-Eval.',
    'Voice Control: reported WER 2.34% with strong style control fidelity.',
    'Voice Clone: reported average WER 1.835 and speaker similarity 0.789 across 10 languages.',
    'Cross-lingual cloning reported to exceed prior open-source baselines.',
  ];

  const tokenizerHighlights = [
    'PESQ: 3.21 (wideband), 3.68 (narrowband).',
    'STOI: 0.96.',
    'UTMOS: 4.16.',
    'Speaker similarity: 0.95.',
  ];

  const examplePrompts = [
    {
      label: 'Voice Design (English)',
      text: 'A relaxed, naturally expressive male voice in his late twenties with a warm, conversational tone and clear articulation.',
    },
    {
      label: 'Voice Design (Character)',
      text: 'Older gentleman, early 60s, confident and authoritative, slightly gravelly texture, measured pace.',
    },
    {
      label: 'Instruction Control',
      text: 'Speak with a very sad, tearful voice. Keep the pace slow and the volume low.',
    },
    {
      label: 'Instruction Control (Energy)',
      text: 'Fast-paced delivery, bright tone, excited and upbeat with clear emphasis on key words.',
    },
  ];

  type Section = {
    id: string;
    title: string;
    type: 'text' | 'models' | 'voice-guides' | 'examples' | 'timbres' | 'advanced' | 'performance' | 'tokenizer';
    content?: string;
    subsections?: { title: string; text: string }[];
  };

  const sections: Section[] = [
    {
      id: 'getting-started',
      title: 'Getting Started',
      type: 'text',
      content: `PrivateVoice is a personal voice studio that runs entirely on your machine. No cloud services, no subscriptions - just powerful TTS capabilities at your fingertips.

Three modes to explore:
  - Custom Voice - Use preset speakers with optional style instructions
  - Voice Clone - Clone any voice from a short audio sample
  - Voice Design - Create new voices from natural language descriptions

Model mapping:
  - Custom Voice uses CustomVoice models
  - Voice Clone uses Base models
  - Voice Design uses the VoiceDesign model`
    },
    {
      id: 'model-list',
      title: 'Model List',
      type: 'models',
    },
    {
      id: 'custom-voice',
      title: 'Custom Voice',
      type: 'voice-guides',
      subsections: [
        { title: 'Preset timbres', text: 'Choose from 9 preset speakers spanning English, Chinese, Japanese, and Korean. Each timbre has distinct age, gender, and dialect characteristics.' },
        { title: 'Instruction control', text: 'Style instructions control tone, emotion, pace, and emphasis. Instruction control is strongest on the 1.7B CustomVoice model; 0.6B CustomVoice is faster but less expressive.' },
        { title: 'Best results', text: 'Keep instructions concise and direct. Combine 2-3 attributes (emotion + pace + texture) for consistent output.' },
      ]
    },
    {
      id: 'voice-clone',
      title: 'Voice Clone',
      type: 'voice-guides',
      subsections: [
        { title: 'Base models required', text: 'Voice Clone requires a Base model (0.6B Base or 1.7B Base). Import or record 5-15 seconds of clean audio for best results.' },
        { title: 'Transcript matters', text: 'Provide an accurate transcript when possible. Low-quality mode can run without a transcript but gives less stable results.' },
        { title: 'Audio tips', text: 'Use a quiet room, consistent volume, and avoid overlapping speech or music.' },
      ]
    },
    {
      id: 'voice-design',
      title: 'Voice Design',
      type: 'voice-guides',
      subsections: [
        { title: 'VoiceDesign model required', text: 'Voice Design needs the 1.7B VoiceDesign model.' },
        { title: 'Describe the voice', text: 'Include age, gender, accent, emotion, pacing, and texture. The more specific you are, the closer the result.' },
        { title: 'Iterate quickly', text: 'Use short texts for fast iteration, then generate longer passages once the style is dialed in.' },
      ]
    },
    {
      id: 'examples',
      title: 'Example Prompts & Instructions',
      type: 'examples',
    },
    {
      id: 'timbres',
      title: 'Preset Timbres',
      type: 'timbres',
    },
    {
      id: 'advanced',
      title: 'Advanced: Architecture & Features',
      type: 'advanced',
    },
    {
      id: 'performance',
      title: 'Advanced: Performance Highlights',
      type: 'performance',
    },
    {
      id: 'tokenizer',
      title: 'Advanced: Tokenizer Metrics',
      type: 'tokenizer',
    },
    {
      id: 'system-requirements',
      title: 'System Requirements',
      type: 'text',
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
      type: 'text',
      content: `Design-to-clone workflow: Use Voice Design to create a unique voice, record yourself imitating it, then use Voice Clone to refine it.

Getting the best quality:
  - Use the 1.7B models for important work
  - Keep text under 500 characters for best results
  - For Voice Clone, provide accurate transcripts when possible`
    },
    {
      id: 'troubleshooting',
      title: 'Troubleshooting',
      type: 'text',
      content: `Slow first launch? The Python environment and models are unpacked on first run. This can take several minutes.

Mic recording not available in dev mode? Use a production build on macOS to access microphone APIs.

Model download stuck? Check your network; models can be 1.2-3.4GB.

Streaming note: The models support streaming, but the app currently uses non-streaming generation.`
    },
    {
      id: 'keyboard',
      title: 'Keyboard Shortcuts',
      type: 'text',
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
        <div class="rounded-lg border border-[var(--color-border-subtle)] overflow-hidden" use:registerSection={section.id}>
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
            <div class="px-4 pb-4 text-sm text-[var(--color-text-secondary)] whitespace-pre-line space-y-3">
              {#if section.type === 'models'}
                <div class="text-xs text-[var(--color-text-muted)]">
                  Supported languages: {supportedLanguages.join(', ')}. Streaming support is a model capability; this app currently uses non-streaming generation.
                </div>
                {#each modelGroups as group}
                  <div class="space-y-2">
                    <div class="text-xs font-semibold text-[var(--color-text-primary)] uppercase tracking-wider">{group.title}</div>
                    <div class="overflow-x-auto">
                      <table class="min-w-full text-xs border-separate border-spacing-0">
                        <thead>
                          <tr class="text-left text-[var(--color-text-muted)]">
                            <th class="py-2 pr-3">Model</th>
                            <th class="py-2 pr-3">Features</th>
                            <th class="py-2 pr-3">Languages</th>
                            <th class="py-2 pr-3">Streaming</th>
                            <th class="py-2">Instruction</th>
                          </tr>
                        </thead>
                        <tbody>
                          {#each group.rows as row}
                            <tr class="border-t border-[var(--color-border-subtle)]">
                              <td class="py-2 pr-3 text-[var(--color-text-primary)]">{row.model}</td>
                              <td class="py-2 pr-3">{row.features}</td>
                              <td class="py-2 pr-3">{row.languages}</td>
                              <td class="py-2 pr-3">{row.streaming}</td>
                              <td class="py-2">{row.instruction}</td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                    </div>
                  </div>
                {/each}
              {:else if section.type === 'voice-guides'}
                {#each section.subsections ?? [] as sub}
                  <div>
                    <h4 class="font-medium text-[var(--color-text-primary)] mb-1">{sub.title}</h4>
                    <p>{sub.text}</p>
                  </div>
                {/each}
              {:else if section.type === 'examples'}
                <div class="space-y-3">
                  {#each examplePrompts as example}
                    <div class="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] p-3">
                      <div class="text-xs font-semibold text-[var(--color-text-primary)] mb-1">{example.label}</div>
                      <div class="text-xs text-[var(--color-text-secondary)]">{example.text}</div>
                    </div>
                  {/each}
                </div>
              {:else if section.type === 'timbres'}
                <SpeakerGallery />
              {:else if section.type === 'advanced'}
                <div class="space-y-2">
                  <div class="text-xs text-[var(--color-text-muted)]">
                    Highlights reported by the Qwen3-TTS release notes.
                  </div>
                  <ul class="list-disc pl-5 space-y-1">
                    {#each keyFeatures as feature}
                      <li>{feature}</li>
                    {/each}
                  </ul>
                </div>
              {:else if section.type === 'performance'}
                <div class="space-y-2">
                  <div class="text-xs text-[var(--color-text-muted)]">Reported evaluation highlights.</div>
                  <ul class="list-disc pl-5 space-y-1">
                    {#each performanceHighlights as item}
                      <li>{item}</li>
                    {/each}
                  </ul>
                </div>
              {:else if section.type === 'tokenizer'}
                <div class="space-y-2">
                  <div class="text-xs text-[var(--color-text-muted)]">Reported tokenizer reconstruction metrics.</div>
                  <ul class="list-disc pl-5 space-y-1">
                    {#each tokenizerHighlights as item}
                      <li>{item}</li>
                    {/each}
                  </ul>
                </div>
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
