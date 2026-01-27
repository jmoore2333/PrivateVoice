# PrivateVoice UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the existing Qwen3-TTS stub UI into PrivateVoice - a polished, production-ready personal voice studio.

**Architecture:** Unified workspace with three modes sharing common layout. Left panel for input, right panel for output with waveform visualization. Voice library as drawer overlay. Svelte 5 with runes, wavesurfer.js for audio visualization.

**Tech Stack:** Svelte 5, TypeScript, Tailwind CSS 4, wavesurfer.js, Tauri 2, Vitest for unit/component tests, Playwright for E2E tests

**Design Reference:** `docs/plans/2026-01-27-privatevoice-ui-design.md`

---

## Phase 1: Foundation

### Task 1.1: Set Up Vitest Testing Framework

**Files:**
- Create: `vitest.config.ts`
- Create: `src/lib/test-utils.ts`
- Modify: `package.json`

**Step 1: Install test dependencies**

Run:
```bash
pnpm add -D vitest @testing-library/svelte @testing-library/jest-dom jsdom @sveltejs/vite-plugin-svelte
```

**Step 2: Create vitest config**

Create `vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte({ hot: !process.env.VITEST })],
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/lib/test-utils.ts'],
  },
});
```

**Step 3: Create test utilities**

Create `src/lib/test-utils.ts`:
```typescript
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Tauri APIs for testing
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
  emit: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
  Command: {
    sidecar: vi.fn(),
  },
}));
```

**Step 4: Add test script to package.json**

Add to scripts section:
```json
"test": "vitest",
"test:run": "vitest run"
```

**Step 5: Verify setup with placeholder test**

Create `src/lib/stores/appStore.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';

describe('Test setup', () => {
  it('vitest is working', () => {
    expect(true).toBe(true);
  });
});
```

Run: `pnpm test:run`
Expected: PASS

**Step 6: Commit**

```bash
git add -A && git commit -m "chore: set up Vitest testing framework"
```

---

### Task 1.2: Install and Configure wavesurfer.js

**Files:**
- Modify: `package.json`
- Create: `src/lib/audio/wavesurfer.ts`

**Step 1: Install wavesurfer.js**

Run:
```bash
pnpm add wavesurfer.js
```

**Step 2: Create wavesurfer wrapper module**

Create `src/lib/audio/wavesurfer.ts`:
```typescript
import WaveSurfer from 'wavesurfer.js';
import RecordPlugin from 'wavesurfer.js/dist/plugins/record.esm.js';

export interface WaveSurferOptions {
  container: HTMLElement;
  waveColor?: string;
  progressColor?: string;
  height?: number;
  barWidth?: number;
  barGap?: number;
  barRadius?: number;
}

const defaultOptions: Partial<WaveSurferOptions> = {
  waveColor: '#4a9eff',
  progressColor: '#2563eb',
  height: 80,
  barWidth: 2,
  barGap: 1,
  barRadius: 2,
};

export function createWaveSurfer(options: WaveSurferOptions): WaveSurfer {
  return WaveSurfer.create({
    ...defaultOptions,
    ...options,
  });
}

export function createRecorder(wavesurfer: WaveSurfer) {
  return wavesurfer.registerPlugin(RecordPlugin.create({
    scrollingWaveform: false,
    renderRecordedAudio: true,
  }));
}

export { WaveSurfer, RecordPlugin };
```

**Step 3: Verify import works**

Create `src/lib/audio/wavesurfer.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { createWaveSurfer, WaveSurfer } from './wavesurfer';

describe('wavesurfer wrapper', () => {
  it('exports WaveSurfer class', () => {
    expect(WaveSurfer).toBeDefined();
  });

  it('createWaveSurfer is a function', () => {
    expect(typeof createWaveSurfer).toBe('function');
  });
});
```

Run: `pnpm test:run`
Expected: PASS

**Step 4: Commit**

```bash
git add -A && git commit -m "feat: add wavesurfer.js with wrapper module"
```

---

### Task 1.3: Update Color Theme for PrivateVoice

**Files:**
- Modify: `src/app.css`

**Step 1: Update CSS variables to match design spec**

Replace the @theme section in `src/app.css` with:
```css
@theme {
  /* Background hierarchy */
  --color-bg-deep: #0d0d0d;
  --color-bg-surface: #1a1a1a;
  --color-bg-elevated: #242424;
  --color-bg-hover: #2a2a2a;

  /* Text hierarchy */
  --color-text-primary: #ffffff;
  --color-text-secondary: #888888;
  --color-text-muted: #666666;

  /* Borders */
  --color-border-subtle: #2a2a2a;
  --color-border-default: #3a3a3a;
  --color-border-strong: #4a4a4a;

  /* Accent - muted electric blue */
  --color-accent: #4a9eff;
  --color-accent-hover: #6ab0ff;
  --color-accent-muted: rgba(74, 158, 255, 0.2);

  /* Semantic colors */
  --color-success: #4ade80;
  --color-warning: #fbbf24;
  --color-error: #f87171;

  /* Typography */
  --font-display: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-body: 'SF Pro Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'SF Mono', 'JetBrains Mono', monospace;
}
```

**Step 2: Add light mode variables**

Add after the @theme block:
```css
@media (prefers-color-scheme: light) {
  :root:not(.dark) {
    --color-bg-deep: #fafafa;
    --color-bg-surface: #ffffff;
    --color-bg-elevated: #ffffff;
    --color-bg-hover: #f0f0f0;
    --color-text-primary: #1a1a1a;
    --color-text-secondary: #666666;
    --color-text-muted: #888888;
    --color-border-subtle: #e0e0e0;
    --color-border-default: #d0d0d0;
    --color-border-strong: #c0c0c0;
  }
}

.dark {
  --color-bg-deep: #0d0d0d;
  --color-bg-surface: #1a1a1a;
  --color-bg-elevated: #242424;
  --color-bg-hover: #2a2a2a;
  --color-text-primary: #ffffff;
  --color-text-secondary: #888888;
  --color-text-muted: #666666;
  --color-border-subtle: #2a2a2a;
  --color-border-default: #3a3a3a;
  --color-border-strong: #4a4a4a;
}
```

**Step 3: Verify app still renders**

Run: `pnpm dev`
Expected: App loads without CSS errors

**Step 4: Commit**

```bash
git add src/app.css && git commit -m "style: update color theme for PrivateVoice design"
```

---

### Task 1.4: Create Voice Library Store

**Files:**
- Create: `src/lib/stores/libraryStore.svelte.ts`
- Create: `src/lib/stores/libraryStore.test.ts`

**Step 1: Write failing test for library store**

Create `src/lib/stores/libraryStore.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { libraryStore } from './libraryStore.svelte';

describe('libraryStore', () => {
  beforeEach(() => {
    libraryStore.clearAll();
  });

  it('starts with empty recent and saved lists', () => {
    expect(libraryStore.recent).toEqual([]);
    expect(libraryStore.saved).toEqual([]);
  });

  it('adds item to recent cache', () => {
    libraryStore.addToRecent({
      id: '1',
      type: 'audio',
      name: 'Test clip',
      audioUrl: 'blob:test',
      createdAt: new Date(),
    });
    expect(libraryStore.recent.length).toBe(1);
  });

  it('limits recent cache to maxRecent items', () => {
    for (let i = 0; i < 15; i++) {
      libraryStore.addToRecent({
        id: String(i),
        type: 'audio',
        name: `Clip ${i}`,
        audioUrl: 'blob:test',
        createdAt: new Date(),
      });
    }
    expect(libraryStore.recent.length).toBe(10);
  });

  it('saves item to library', () => {
    libraryStore.saveToLibrary({
      id: '1',
      type: 'clone',
      name: 'My Voice',
      audioUrl: 'blob:test',
      createdAt: new Date(),
      metadata: { referenceText: 'Hello' },
    });
    expect(libraryStore.saved.length).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test:run src/lib/stores/libraryStore.test.ts`
Expected: FAIL - module not found

**Step 3: Implement library store**

Create `src/lib/stores/libraryStore.svelte.ts`:
```typescript
import { browser } from '$app/environment';

export type LibraryItemType = 'audio' | 'clone' | 'design';

export interface LibraryItem {
  id: string;
  type: LibraryItemType;
  name: string;
  audioUrl: string;
  createdAt: Date;
  comment?: string;
  tags?: string[];
  metadata?: {
    speaker?: string;
    language?: string;
    referenceText?: string;
    voiceDescription?: string;
    modelId?: string;
  };
}

const STORAGE_KEY = 'privatevoice-library';
const MAX_RECENT_DEFAULT = 10;

function createLibraryStore() {
  let recent = $state<LibraryItem[]>([]);
  let saved = $state<LibraryItem[]>([]);
  let maxRecent = $state(MAX_RECENT_DEFAULT);

  // Load from localStorage on init
  if (browser) {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const data = JSON.parse(stored);
        saved = data.saved || [];
      } catch (e) {
        console.error('Failed to load library:', e);
      }
    }
  }

  function persist() {
    if (browser) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ saved }));
    }
  }

  return {
    get recent() { return recent; },
    get saved() { return saved; },
    get maxRecent() { return maxRecent; },

    setMaxRecent(value: number) {
      maxRecent = value;
      while (recent.length > maxRecent) {
        recent.pop();
      }
    },

    addToRecent(item: LibraryItem) {
      recent = [item, ...recent.slice(0, maxRecent - 1)];
    },

    saveToLibrary(item: LibraryItem) {
      saved = [item, ...saved];
      persist();
    },

    removeFromLibrary(id: string) {
      saved = saved.filter(item => item.id !== id);
      persist();
    },

    updateItem(id: string, updates: Partial<LibraryItem>) {
      saved = saved.map(item =>
        item.id === id ? { ...item, ...updates } : item
      );
      persist();
    },

    clearRecent() {
      recent = [];
    },

    clearAll() {
      recent = [];
      saved = [];
      if (browser) {
        localStorage.removeItem(STORAGE_KEY);
      }
    },
  };
}

export const libraryStore = createLibraryStore();
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test:run src/lib/stores/libraryStore.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: add voice library store with two-tier storage"
```

---

## Phase 2: Core Layout Components

### Task 2.1: Create Header Component

**Files:**
- Create: `src/lib/components/layout/Header.svelte`
- Create: `src/lib/components/layout/Header.test.ts`

**Step 1: Write failing test**

Create `src/lib/components/layout/Header.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Header from './Header.svelte';

describe('Header', () => {
  it('renders mode selector buttons', () => {
    render(Header, {
      props: {
        currentMode: 'custom-voice',
        modelId: '1.7b',
        status: 'ready'
      }
    });

    expect(screen.getByText('Custom Voice')).toBeInTheDocument();
    expect(screen.getByText('Voice Clone')).toBeInTheDocument();
    expect(screen.getByText('Voice Design')).toBeInTheDocument();
  });

  it('shows model indicator', () => {
    render(Header, {
      props: {
        currentMode: 'custom-voice',
        modelId: '1.7b',
        status: 'ready'
      }
    });

    expect(screen.getByText(/1.7b/i)).toBeInTheDocument();
  });

  it('shows status badge', () => {
    render(Header, {
      props: {
        currentMode: 'custom-voice',
        modelId: '1.7b',
        status: 'ready'
      }
    });

    expect(screen.getByText(/ready/i)).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test:run src/lib/components/layout/Header.test.ts`
Expected: FAIL - component not found

**Step 3: Implement Header component**

Create `src/lib/components/layout/Header.svelte`:
```svelte
<script lang="ts">
  import type { TtsMode } from '$lib/stores/ttsStore.svelte';

  interface Props {
    currentMode: TtsMode;
    modelId: string | null;
    status: 'ready' | 'generating' | 'downloading' | 'loading' | 'error';
    statusDetail?: string;
    onModeChange?: (mode: TtsMode) => void;
    onSettingsClick?: () => void;
    onHelpClick?: () => void;
  }

  let {
    currentMode,
    modelId,
    status,
    statusDetail,
    onModeChange,
    onSettingsClick,
    onHelpClick
  }: Props = $props();

  const modes: { id: TtsMode; label: string; requiresModel?: string }[] = [
    { id: 'custom-voice', label: 'Custom Voice' },
    { id: 'voice-clone', label: 'Voice Clone' },
    { id: 'voice-design', label: 'Voice Design', requiresModel: '1.7b-design' },
  ];

  const statusColors = {
    ready: 'bg-green-500',
    generating: 'bg-amber-500',
    downloading: 'bg-blue-500',
    loading: 'bg-blue-500',
    error: 'bg-red-500',
  };

  const statusLabels = {
    ready: 'Ready',
    generating: 'Generating...',
    downloading: 'Downloading...',
    loading: 'Loading...',
    error: 'Error',
  };
</script>

<header class="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-surface)]">
  <!-- Mode Selector -->
  <nav class="flex gap-1 bg-[var(--color-bg-deep)] rounded-lg p-1">
    {#each modes as mode}
      <button
        class="px-4 py-2 rounded-md text-sm font-medium transition-colors
          {currentMode === mode.id
            ? 'bg-[var(--color-accent)] text-white'
            : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]'}"
        onclick={() => onModeChange?.(mode.id)}
      >
        {mode.label}
      </button>
    {/each}
  </nav>

  <!-- Right section: Model, Status, Actions -->
  <div class="flex items-center gap-4">
    <!-- Model Indicator -->
    {#if modelId}
      <div class="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
        <span>Model:</span>
        <span class="font-mono text-[var(--color-text-primary)]">{modelId}</span>
      </div>
    {/if}

    <!-- Status Badge -->
    <div class="flex items-center gap-2">
      <span class="w-2 h-2 rounded-full {statusColors[status]} animate-pulse"></span>
      <span class="text-sm text-[var(--color-text-secondary)]">
        {statusLabels[status]}
        {#if statusDetail}
          <span class="text-[var(--color-text-muted)]">({statusDetail})</span>
        {/if}
      </span>
    </div>

    <!-- Action Buttons -->
    <div class="flex items-center gap-2">
      <button
        class="p-2 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
        onclick={onHelpClick}
        aria-label="Help"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
      <button
        class="p-2 rounded-lg text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] transition-colors"
        onclick={onSettingsClick}
        aria-label="Settings"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
    </div>
  </div>
</header>
```

**Step 4: Run tests**

Run: `pnpm test:run src/lib/components/layout/Header.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add -A && git commit -m "feat: add Header component with mode selector and status"
```

---

### Task 2.2: Create Workspace Layout Component

**Files:**
- Create: `src/lib/components/layout/Workspace.svelte`

**Step 1: Create the two-column workspace layout**

Create `src/lib/components/layout/Workspace.svelte`:
```svelte
<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    inputPanel: Snippet;
    outputPanel: Snippet;
  }

  let { inputPanel, outputPanel }: Props = $props();
</script>

<div class="flex-1 flex overflow-hidden">
  <!-- Input Zone (Left) -->
  <div class="w-1/2 border-r border-[var(--color-border-subtle)] overflow-y-auto p-6">
    {@render inputPanel()}
  </div>

  <!-- Output Zone (Right) -->
  <div class="w-1/2 overflow-y-auto p-6 bg-[var(--color-bg-deep)]">
    {@render outputPanel()}
  </div>
</div>
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: add Workspace two-column layout component"
```

---

### Task 2.3: Create Waveform Player Component

**Files:**
- Create: `src/lib/components/audio/WaveformPlayer.svelte`

**Step 1: Create waveform player with wavesurfer.js**

Create `src/lib/components/audio/WaveformPlayer.svelte`:
```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createWaveSurfer, type WaveSurferOptions } from '$lib/audio/wavesurfer';
  import type WaveSurfer from 'wavesurfer.js';

  interface Props {
    audioUrl?: string;
    height?: number;
    waveColor?: string;
    progressColor?: string;
    onReady?: () => void;
    onPlay?: () => void;
    onPause?: () => void;
    onFinish?: () => void;
  }

  let {
    audioUrl,
    height = 80,
    waveColor = '#4a9eff',
    progressColor = '#2563eb',
    onReady,
    onPlay,
    onPause,
    onFinish,
  }: Props = $props();

  let container: HTMLDivElement;
  let wavesurfer: WaveSurfer | null = null;
  let isPlaying = $state(false);
  let currentTime = $state(0);
  let duration = $state(0);

  onMount(() => {
    wavesurfer = createWaveSurfer({
      container,
      height,
      waveColor,
      progressColor,
    });

    wavesurfer.on('ready', () => {
      duration = wavesurfer!.getDuration();
      onReady?.();
    });

    wavesurfer.on('play', () => {
      isPlaying = true;
      onPlay?.();
    });

    wavesurfer.on('pause', () => {
      isPlaying = false;
      onPause?.();
    });

    wavesurfer.on('finish', () => {
      isPlaying = false;
      onFinish?.();
    });

    wavesurfer.on('timeupdate', (time) => {
      currentTime = time;
    });

    if (audioUrl) {
      wavesurfer.load(audioUrl);
    }
  });

  onDestroy(() => {
    wavesurfer?.destroy();
  });

  $effect(() => {
    if (wavesurfer && audioUrl) {
      wavesurfer.load(audioUrl);
    }
  });

  function togglePlay() {
    wavesurfer?.playPause();
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  export function play() { wavesurfer?.play(); }
  export function pause() { wavesurfer?.pause(); }
  export function stop() { wavesurfer?.stop(); }
</script>

<div class="space-y-3">
  <!-- Waveform container -->
  <div
    bind:this={container}
    class="rounded-lg overflow-hidden bg-[var(--color-bg-elevated)]"
  ></div>

  <!-- Controls -->
  <div class="flex items-center gap-4">
    <button
      class="w-10 h-10 flex items-center justify-center rounded-full bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors"
      onclick={togglePlay}
      disabled={!audioUrl}
    >
      {#if isPlaying}
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
        </svg>
      {:else}
        <svg class="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z"/>
        </svg>
      {/if}
    </button>

    <div class="flex-1 h-1 bg-[var(--color-bg-hover)] rounded-full overflow-hidden">
      <div
        class="h-full bg-[var(--color-accent)] transition-all"
        style="width: {duration > 0 ? (currentTime / duration) * 100 : 0}%"
      ></div>
    </div>

    <span class="text-sm text-[var(--color-text-secondary)] font-mono min-w-[80px] text-right">
      {formatTime(currentTime)} / {formatTime(duration)}
    </span>
  </div>
</div>
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: add WaveformPlayer component with wavesurfer.js"
```

---

### Task 2.4: Create Output Panel Component

**Files:**
- Create: `src/lib/components/output/OutputPanel.svelte`

**Step 1: Create output panel with states**

Create `src/lib/components/output/OutputPanel.svelte`:
```svelte
<script lang="ts">
  import WaveformPlayer from '$lib/components/audio/WaveformPlayer.svelte';

  interface Props {
    audioUrl?: string;
    isGenerating?: boolean;
    elapsedTime?: number;
    generatingText?: string;
    onRegenerate?: () => void;
    onSave?: () => void;
    onExport?: () => void;
    suggestion?: { message: string; action: () => void; actionLabel: string } | null;
  }

  let {
    audioUrl,
    isGenerating = false,
    elapsedTime = 0,
    generatingText,
    onRegenerate,
    onSave,
    onExport,
    suggestion,
  }: Props = $props();

  let showSuggestion = $state(true);

  function dismissSuggestion() {
    showSuggestion = false;
  }
</script>

<div class="h-full flex flex-col">
  {#if isGenerating}
    <!-- Generating State -->
    <div class="flex-1 flex flex-col items-center justify-center text-center">
      <div class="w-12 h-12 border-4 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin mb-4"></div>
      <p class="text-lg text-[var(--color-text-primary)] mb-2">Generating...</p>
      <p class="text-2xl font-mono text-[var(--color-accent)]">{elapsedTime.toFixed(1)}s</p>
      {#if generatingText}
        <p class="mt-4 text-sm text-[var(--color-text-muted)] max-w-md truncate">
          "{generatingText}"
        </p>
      {/if}
    </div>

  {:else if audioUrl}
    <!-- Playback State -->
    <div class="flex-1 flex flex-col">
      <div class="flex-1 flex items-center">
        <div class="w-full">
          <WaveformPlayer {audioUrl} height={120} />
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="flex gap-3 mt-6">
        <button
          class="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] transition-colors"
          onclick={onRegenerate}
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Regenerate
        </button>

        <button
          class="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] transition-colors"
          onclick={onSave}
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg>
          Save
        </button>

        <button
          class="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors"
          onclick={onExport}
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Export
        </button>
      </div>

      <!-- Contextual Suggestion -->
      {#if suggestion && showSuggestion}
        <div class="mt-4 p-3 rounded-lg bg-[var(--color-accent-muted)] border border-[var(--color-accent)] flex items-center justify-between">
          <span class="text-sm text-[var(--color-text-primary)]">
            💡 {suggestion.message}
          </span>
          <div class="flex gap-2">
            <button
              class="text-sm text-[var(--color-accent)] hover:underline"
              onclick={suggestion.action}
            >
              {suggestion.actionLabel}
            </button>
            <button
              class="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
              onclick={dismissSuggestion}
            >
              Dismiss
            </button>
          </div>
        </div>
      {/if}
    </div>

  {:else}
    <!-- Empty State -->
    <div class="flex-1 flex flex-col items-center justify-center text-center">
      <div class="w-24 h-16 rounded-lg bg-[var(--color-bg-elevated)] mb-4 flex items-center justify-center">
        <svg class="w-8 h-8 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      </div>
      <p class="text-[var(--color-text-muted)]">Generate audio to preview</p>
    </div>
  {/if}
</div>
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: add OutputPanel with empty, generating, and playback states"
```

---

## Phase 3: Input Panel Components

### Task 3.1: Create Text Input Component

**Files:**
- Create: `src/lib/components/input/TextInput.svelte`

**Step 1: Create text input with character count**

Create `src/lib/components/input/TextInput.svelte`:
```svelte
<script lang="ts">
  interface Props {
    value: string;
    label?: string;
    placeholder?: string;
    rows?: number;
    maxLength?: number;
    onInput?: (value: string) => void;
  }

  let {
    value = $bindable(),
    label = 'Text to generate',
    placeholder = 'Enter text here...',
    rows = 6,
    maxLength,
    onInput,
  }: Props = $props();

  function handleInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    value = target.value;
    onInput?.(value);
  }
</script>

<div class="space-y-2">
  {#if label}
    <label class="block text-sm font-medium text-[var(--color-text-primary)]">
      {label}
    </label>
  {/if}

  <textarea
    {value}
    {placeholder}
    {rows}
    maxlength={maxLength}
    oninput={handleInput}
    class="w-full px-4 py-3 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors resize-none"
  ></textarea>

  <div class="flex justify-between text-xs text-[var(--color-text-muted)]">
    <span>{value.length} characters</span>
    {#if maxLength}
      <span>{maxLength - value.length} remaining</span>
    {/if}
  </div>
</div>
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: add TextInput component with character count"
```

---

### Task 3.2: Create Language Selector Component

**Files:**
- Create: `src/lib/components/input/LanguageSelector.svelte`

**Step 1: Create language selector**

Create `src/lib/components/input/LanguageSelector.svelte`:
```svelte
<script lang="ts">
  interface Props {
    value: string;
    onSelect?: (language: string) => void;
  }

  let { value = $bindable(), onSelect }: Props = $props();

  const languages = [
    { code: 'English', label: 'English' },
    { code: 'Chinese', label: 'Chinese (中文)' },
    { code: 'Japanese', label: 'Japanese (日本語)' },
    { code: 'Korean', label: 'Korean (한국어)' },
    { code: 'German', label: 'German (Deutsch)' },
    { code: 'French', label: 'French (Français)' },
    { code: 'Russian', label: 'Russian (Русский)' },
    { code: 'Portuguese', label: 'Portuguese (Português)' },
    { code: 'Spanish', label: 'Spanish (Español)' },
    { code: 'Italian', label: 'Italian (Italiano)' },
    { code: 'Auto', label: 'Auto-detect' },
  ];

  function handleChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    value = target.value;
    onSelect?.(value);
  }
</script>

<div class="space-y-2">
  <label class="block text-sm font-medium text-[var(--color-text-primary)]">
    Language
  </label>

  <select
    {value}
    onchange={handleChange}
    class="w-full px-4 py-2.5 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors cursor-pointer"
  >
    {#each languages as lang}
      <option value={lang.code}>{lang.label}</option>
    {/each}
  </select>
</div>
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: add LanguageSelector component"
```

---

### Task 3.3: Create Voice Selector Component

**Files:**
- Create: `src/lib/components/input/VoiceSelector.svelte`

**Step 1: Create voice selector with preset and saved voices**

Create `src/lib/components/input/VoiceSelector.svelte`:
```svelte
<script lang="ts">
  import { libraryStore, type LibraryItem } from '$lib/stores/libraryStore.svelte';

  interface Props {
    value: string;
    onSelect?: (voiceId: string, isPreset: boolean) => void;
  }

  let { value = $bindable(), onSelect }: Props = $props();

  let viewMode = $state<'preset' | 'saved'>('preset');

  const presetVoices = [
    { id: 'aiden', name: 'Aiden', description: 'Sunny American male', accent: 'English' },
    { id: 'ryan', name: 'Ryan', description: 'Dynamic male, strong rhythm', accent: 'English' },
    { id: 'vivian', name: 'Vivian', description: 'Bright young female', accent: 'Chinese' },
    { id: 'serena', name: 'Serena', description: 'Warm, gentle female', accent: 'Chinese' },
    { id: 'dylan', name: 'Dylan', description: 'Youthful Beijing male', accent: 'Chinese (Beijing)' },
    { id: 'eric', name: 'Eric', description: 'Lively Chengdu male', accent: 'Chinese (Sichuan)' },
    { id: 'uncle_fu', name: 'Uncle Fu', description: 'Seasoned male, mellow', accent: 'Chinese' },
    { id: 'ono_anna', name: 'Ono Anna', description: 'Playful Japanese female', accent: 'Japanese' },
    { id: 'sohee', name: 'Sohee', description: 'Warm Korean female', accent: 'Korean' },
  ];

  const savedVoices = $derived(
    libraryStore.saved.filter(item => item.type === 'clone')
  );

  function selectVoice(id: string, isPreset: boolean) {
    value = id;
    onSelect?.(id, isPreset);
  }
</script>

<div class="space-y-3">
  <div class="flex items-center justify-between">
    <label class="block text-sm font-medium text-[var(--color-text-primary)]">
      Voice
    </label>

    <div class="flex gap-1 bg-[var(--color-bg-deep)] rounded-md p-0.5">
      <button
        class="px-3 py-1 text-xs rounded {viewMode === 'preset' ? 'bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'}"
        onclick={() => viewMode = 'preset'}
      >
        Preset
      </button>
      <button
        class="px-3 py-1 text-xs rounded {viewMode === 'saved' ? 'bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'}"
        onclick={() => viewMode = 'saved'}
      >
        Saved ({savedVoices.length})
      </button>
    </div>
  </div>

  <div class="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
    {#if viewMode === 'preset'}
      {#each presetVoices as voice}
        <button
          class="p-3 rounded-lg text-left border transition-colors
            {value === voice.id
              ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)]'
              : 'border-[var(--color-border-subtle)] hover:border-[var(--color-border-default)] bg-[var(--color-bg-elevated)]'}"
          onclick={() => selectVoice(voice.id, true)}
        >
          <div class="font-medium text-sm text-[var(--color-text-primary)]">{voice.name}</div>
          <div class="text-xs text-[var(--color-text-muted)] truncate">{voice.description}</div>
          <div class="text-xs text-[var(--color-accent)] mt-1">{voice.accent}</div>
        </button>
      {/each}
    {:else if savedVoices.length > 0}
      {#each savedVoices as voice}
        <button
          class="p-3 rounded-lg text-left border transition-colors
            {value === voice.id
              ? 'border-[var(--color-accent)] bg-[var(--color-accent-muted)]'
              : 'border-[var(--color-border-subtle)] hover:border-[var(--color-border-default)] bg-[var(--color-bg-elevated)]'}"
          onclick={() => selectVoice(voice.id, false)}
        >
          <div class="font-medium text-sm text-[var(--color-text-primary)]">{voice.name}</div>
          {#if voice.comment}
            <div class="text-xs text-[var(--color-text-muted)] truncate">{voice.comment}</div>
          {/if}
        </button>
      {/each}
    {:else}
      <div class="col-span-2 py-8 text-center text-[var(--color-text-muted)] text-sm">
        No saved voices yet. Clone a voice to save it here.
      </div>
    {/if}
  </div>
</div>
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: add VoiceSelector with preset and saved voice tabs"
```

---

### Task 3.4: Create Audio Recorder Component

**Files:**
- Create: `src/lib/components/input/AudioRecorder.svelte`

**Step 1: Create audio recorder with live waveform**

Create `src/lib/components/input/AudioRecorder.svelte`:
```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import WaveSurfer from 'wavesurfer.js';
  import RecordPlugin from 'wavesurfer.js/dist/plugins/record.esm.js';

  interface Props {
    onRecordingComplete?: (blob: Blob, url: string) => void;
    onImport?: (file: File) => void;
  }

  let { onRecordingComplete, onImport }: Props = $props();

  let container: HTMLDivElement;
  let wavesurfer: WaveSurfer | null = null;
  let recorder: RecordPlugin | null = null;
  let isRecording = $state(false);
  let hasRecording = $state(false);
  let recordedUrl = $state<string | null>(null);
  let recordingTime = $state(0);
  let recordingInterval: number | null = null;

  onMount(() => {
    wavesurfer = WaveSurfer.create({
      container,
      waveColor: '#4a9eff',
      progressColor: '#2563eb',
      height: 60,
      barWidth: 2,
      barGap: 1,
    });

    recorder = wavesurfer.registerPlugin(RecordPlugin.create({
      scrollingWaveform: false,
      renderRecordedAudio: true,
    }));

    recorder.on('record-end', (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      recordedUrl = url;
      hasRecording = true;
      onRecordingComplete?.(blob, url);
    });
  });

  onDestroy(() => {
    if (recordingInterval) clearInterval(recordingInterval);
    wavesurfer?.destroy();
  });

  async function startRecording() {
    if (!recorder) return;

    isRecording = true;
    recordingTime = 0;
    hasRecording = false;

    recordingInterval = setInterval(() => {
      recordingTime += 0.1;
    }, 100) as unknown as number;

    await recorder.startRecording();
  }

  function stopRecording() {
    if (!recorder) return;

    isRecording = false;
    if (recordingInterval) {
      clearInterval(recordingInterval);
      recordingInterval = null;
    }

    recorder.stopRecording();
  }

  function handleFileImport(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      recordedUrl = url;
      hasRecording = true;
      wavesurfer?.load(url);
      onImport?.(file);
    }
  }

  function clearRecording() {
    hasRecording = false;
    recordedUrl = null;
    wavesurfer?.empty();
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
</script>

<div class="space-y-3">
  <label class="block text-sm font-medium text-[var(--color-text-primary)]">
    Reference Audio
  </label>

  <!-- Waveform display -->
  <div
    bind:this={container}
    class="rounded-lg overflow-hidden bg-[var(--color-bg-elevated)] min-h-[60px]"
  ></div>

  <!-- Controls -->
  <div class="flex items-center gap-3">
    {#if isRecording}
      <button
        class="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors"
        onclick={stopRecording}
      >
        <span class="w-3 h-3 rounded-sm bg-white"></span>
        Stop ({formatTime(recordingTime)})
      </button>
    {:else}
      <button
        class="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] transition-colors"
        onclick={startRecording}
      >
        <span class="w-3 h-3 rounded-full bg-red-500"></span>
        Record
      </button>
    {/if}

    <label class="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-strong)] transition-colors cursor-pointer">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
      Import
      <input
        type="file"
        accept="audio/*"
        class="hidden"
        onchange={handleFileImport}
      />
    </label>

    {#if hasRecording}
      <button
        class="px-3 py-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-colors"
        onclick={clearRecording}
      >
        Clear
      </button>
    {/if}
  </div>
</div>
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: add AudioRecorder with live waveform and import"
```

---

### Task 3.5: Create Custom Voice Input Panel

**Files:**
- Create: `src/lib/components/input/CustomVoicePanel.svelte`

**Step 1: Create custom voice mode input panel**

Create `src/lib/components/input/CustomVoicePanel.svelte`:
```svelte
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
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: add CustomVoicePanel input component"
```

---

### Task 3.6: Create Voice Clone Input Panel

**Files:**
- Create: `src/lib/components/input/VoiceClonePanel.svelte`

**Step 1: Create voice clone mode input panel**

Create `src/lib/components/input/VoiceClonePanel.svelte`:
```svelte
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
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: add VoiceClonePanel input component"
```

---

### Task 3.7: Create Voice Design Input Panel

**Files:**
- Create: `src/lib/components/input/VoiceDesignPanel.svelte`

**Step 1: Create voice design mode input panel**

Create `src/lib/components/input/VoiceDesignPanel.svelte`:
```svelte
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
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: add VoiceDesignPanel input component"
```

---

## Phase 4: Voice Library UI

### Task 4.1: Create Library Item Component

**Files:**
- Create: `src/lib/components/library/LibraryItem.svelte`

**Step 1: Create SoundCloud-style library item**

Create `src/lib/components/library/LibraryItem.svelte`:
```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import WaveSurfer from 'wavesurfer.js';
  import type { LibraryItem as LibraryItemType } from '$lib/stores/libraryStore.svelte';

  interface Props {
    item: LibraryItemType;
    onPlay?: () => void;
    onEdit?: () => void;
    onExport?: () => void;
    onUse?: () => void;
    onDelete?: () => void;
  }

  let { item, onPlay, onEdit, onExport, onUse, onDelete }: Props = $props();

  let container: HTMLDivElement;
  let wavesurfer: WaveSurfer | null = null;
  let isPlaying = $state(false);
  let showMenu = $state(false);

  const typeLabels = {
    audio: 'Audio',
    clone: 'Clone',
    design: 'Design',
  };

  const typeColors = {
    audio: 'bg-blue-500/20 text-blue-400',
    clone: 'bg-green-500/20 text-green-400',
    design: 'bg-purple-500/20 text-purple-400',
  };

  onMount(() => {
    wavesurfer = WaveSurfer.create({
      container,
      waveColor: '#4a4a4a',
      progressColor: '#4a9eff',
      height: 32,
      barWidth: 2,
      barGap: 1,
      cursorWidth: 0,
    });

    wavesurfer.on('play', () => isPlaying = true);
    wavesurfer.on('pause', () => isPlaying = false);
    wavesurfer.on('finish', () => isPlaying = false);

    if (item.audioUrl) {
      wavesurfer.load(item.audioUrl);
    }
  });

  onDestroy(() => {
    wavesurfer?.destroy();
  });

  function togglePlay() {
    wavesurfer?.playPause();
    onPlay?.();
  }

  function formatDate(date: Date): string {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  }
</script>

<div class="group p-3 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] hover:border-[var(--color-border-default)] transition-colors">
  <div class="flex items-center gap-3">
    <!-- Play Button -->
    <button
      class="w-8 h-8 flex items-center justify-center rounded-full bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors flex-shrink-0"
      onclick={togglePlay}
    >
      {#if isPlaying}
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
        </svg>
      {:else}
        <svg class="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z"/>
        </svg>
      {/if}
    </button>

    <!-- Waveform -->
    <div bind:this={container} class="flex-1 min-w-0"></div>

    <!-- Info -->
    <div class="flex-shrink-0 text-right min-w-[120px]">
      <div class="font-medium text-sm text-[var(--color-text-primary)] truncate">
        {item.name}
      </div>
      <div class="flex items-center justify-end gap-2 mt-1">
        <span class="text-xs px-2 py-0.5 rounded {typeColors[item.type]}">
          {typeLabels[item.type]}
        </span>
        <span class="text-xs text-[var(--color-text-muted)]">
          {formatDate(item.createdAt)}
        </span>
      </div>
    </div>

    <!-- Menu -->
    <div class="relative">
      <button
        class="p-1.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] opacity-0 group-hover:opacity-100 transition-opacity"
        onclick={() => showMenu = !showMenu}
      >
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
        </svg>
      </button>

      {#if showMenu}
        <div class="absolute right-0 top-full mt-1 w-40 py-1 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] shadow-lg z-10">
          <button
            class="w-full px-3 py-2 text-left text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
            onclick={() => { onEdit?.(); showMenu = false; }}
          >
            Edit
          </button>
          <button
            class="w-full px-3 py-2 text-left text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
            onclick={() => { onExport?.(); showMenu = false; }}
          >
            Export
          </button>
          {#if item.type === 'clone'}
            <button
              class="w-full px-3 py-2 text-left text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
              onclick={() => { onUse?.(); showMenu = false; }}
            >
              Use in Custom Voice
            </button>
          {/if}
          <hr class="my-1 border-[var(--color-border-subtle)]" />
          <button
            class="w-full px-3 py-2 text-left text-sm text-[var(--color-error)] hover:bg-[var(--color-bg-hover)]"
            onclick={() => { onDelete?.(); showMenu = false; }}
          >
            Delete
          </button>
        </div>
      {/if}
    </div>
  </div>

  {#if item.comment}
    <p class="mt-2 text-xs text-[var(--color-text-muted)] truncate pl-11">
      {item.comment}
    </p>
  {/if}
</div>
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: add LibraryItem component with SoundCloud-style layout"
```

---

### Task 4.2: Create Library Drawer Component

**Files:**
- Create: `src/lib/components/library/LibraryDrawer.svelte`

**Step 1: Create library drawer**

Create `src/lib/components/library/LibraryDrawer.svelte`:
```svelte
<script lang="ts">
  import { libraryStore } from '$lib/stores/libraryStore.svelte';
  import LibraryItem from './LibraryItem.svelte';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    onUseVoice?: (voiceId: string) => void;
  }

  let { isOpen, onClose, onUseVoice }: Props = $props();

  let activeTab = $state<'recent' | 'voices' | 'audio'>('recent');
  let searchQuery = $state('');

  const recentItems = $derived(libraryStore.recent);
  const savedVoices = $derived(
    libraryStore.saved.filter(item => item.type === 'clone' || item.type === 'design')
  );
  const savedAudio = $derived(
    libraryStore.saved.filter(item => item.type === 'audio')
  );

  const filteredItems = $derived(() => {
    let items = activeTab === 'recent' ? recentItems
      : activeTab === 'voices' ? savedVoices
      : savedAudio;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      items = items.filter(item =>
        item.name.toLowerCase().includes(query) ||
        item.comment?.toLowerCase().includes(query) ||
        item.tags?.some(tag => tag.toLowerCase().includes(query))
      );
    }

    return items;
  });
</script>

{#if isOpen}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 bg-black/50 z-40"
    onclick={onClose}
  ></div>

  <!-- Drawer -->
  <div class="fixed inset-x-0 bottom-0 h-[70vh] bg-[var(--color-bg-surface)] border-t border-[var(--color-border-default)] rounded-t-2xl z-50 flex flex-col animate-slideUp">
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-subtle)]">
      <h2 class="text-lg font-semibold text-[var(--color-text-primary)]">Voice Library</h2>
      <button
        class="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
        onclick={onClose}
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Tabs and Search -->
    <div class="flex items-center justify-between px-6 py-3 border-b border-[var(--color-border-subtle)]">
      <div class="flex gap-1 bg-[var(--color-bg-deep)] rounded-lg p-1">
        <button
          class="px-4 py-1.5 text-sm rounded-md transition-colors
            {activeTab === 'recent' ? 'bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'}"
          onclick={() => activeTab = 'recent'}
        >
          Recent
        </button>
        <button
          class="px-4 py-1.5 text-sm rounded-md transition-colors
            {activeTab === 'voices' ? 'bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'}"
          onclick={() => activeTab = 'voices'}
        >
          Saved Voices ({savedVoices.length})
        </button>
        <button
          class="px-4 py-1.5 text-sm rounded-md transition-colors
            {activeTab === 'audio' ? 'bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'}"
          onclick={() => activeTab = 'audio'}
        >
          Audio ({savedAudio.length})
        </button>
      </div>

      <div class="relative">
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Search..."
          class="w-48 pl-9 pr-4 py-2 rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]"
        />
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-6">
      {#if filteredItems().length > 0}
        <div class="space-y-2">
          {#each filteredItems() as item (item.id)}
            <LibraryItem
              {item}
              onUse={() => onUseVoice?.(item.id)}
              onDelete={() => libraryStore.removeFromLibrary(item.id)}
            />
          {/each}
        </div>
      {:else}
        <div class="flex flex-col items-center justify-center h-full text-center">
          <svg class="w-12 h-12 text-[var(--color-text-muted)] mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
          <p class="text-[var(--color-text-muted)]">
            {#if searchQuery}
              No items match your search
            {:else if activeTab === 'recent'}
              No recent generations yet
            {:else if activeTab === 'voices'}
              No saved voices yet
            {:else}
              No saved audio yet
            {/if}
          </p>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  @keyframes slideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  .animate-slideUp {
    animation: slideUp 0.3s ease-out;
  }
</style>
```

**Step 2: Commit**

```bash
git add -A && git commit -m "feat: add LibraryDrawer component with tabs and search"
```

---

## Phase 5: Main App Integration

### Task 5.1: Create New Main Page

**Files:**
- Modify: `src/routes/+page.svelte`

**Step 1: Rewrite main page with new layout**

This is a larger task. Replace the contents of `src/routes/+page.svelte` with the new unified workspace layout integrating all components.

Due to the size, this will be implemented in the execution phase with proper testing.

**Key integration points:**
- Import Header, Workspace, OutputPanel, LibraryDrawer
- Import mode-specific input panels
- Connect to existing ttsStore and appStore
- Wire up generation flow through ttsClient
- Handle mode switching and model auto-loading

**Step 2: Commit**

```bash
git add src/routes/+page.svelte && git commit -m "feat: integrate new PrivateVoice workspace layout"
```

---

## Phase 6: Settings and Help

### Task 6.1: Update Settings Panel

**Files:**
- Modify: `src/lib/components/settings/SettingsPanel.svelte`

Add new sections per design document:
- System (GPU detection, memory)
- Audio (mic, speaker, export folder)
- Library (cache size, comparison)
- Optional Features (Whisper, translation)
- About (links, version)

### Task 6.2: Create Help Panel

**Files:**
- Create: `src/lib/components/help/HelpPanel.svelte`
- Create: `src/lib/components/help/SpeakerGallery.svelte`

---

## Phase 7: Polish

### Task 7.1: Add Keyboard Shortcuts

**Files:**
- Create: `src/lib/hooks/useKeyboardShortcuts.ts`

Implement:
- Space: Play/pause
- Cmd/Ctrl+Enter: Generate
- Cmd/Ctrl+S: Save to library
- Cmd/Ctrl+1/2/3: Switch modes
- Escape: Close drawers

### Task 7.2: Add First-Run Experience

**Files:**
- Create: `src/lib/components/onboarding/Welcome.svelte`

Show on first launch:
- Welcome message
- Model selection
- Download progress

### Task 7.3: Final Visual Polish

- Verify all transitions are smooth (150-200ms)
- Ensure dark/light mode works correctly
- Test responsive behavior at different sizes
- Add loading skeletons where needed

---

## Phase 8: Testing Infrastructure

Establish comprehensive testing to ensure stability during future development.

### Task 8.1: Configure Playwright for E2E Testing

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/example.spec.ts`
- Modify: `package.json`

**Step 1: Install Playwright**

Run:
```bash
pnpm add -D @playwright/test
npx playwright install
```

**Step 2: Create Playwright config**

Create `playwright.config.ts`:
```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:1420',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:1420',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
```

**Step 3: Create E2E test directory and example test**

Create `e2e/example.spec.ts`:
```typescript
import { test, expect } from '@playwright/test';

test.describe('PrivateVoice App', () => {
  test('loads the main page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/PrivateVoice|Qwen3-TTS/);
  });

  test('shows mode selector with three modes', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Custom Voice')).toBeVisible();
    await expect(page.getByText('Voice Clone')).toBeVisible();
    await expect(page.getByText('Voice Design')).toBeVisible();
  });

  test('can switch between modes', async ({ page }) => {
    await page.goto('/');

    // Click Voice Clone mode
    await page.getByText('Voice Clone').click();
    await expect(page.getByText('Reference Audio')).toBeVisible();

    // Click Voice Design mode
    await page.getByText('Voice Design').click();
    await expect(page.getByText('Voice description')).toBeVisible();

    // Click Custom Voice mode
    await page.getByText('Custom Voice').click();
    await expect(page.getByText('Style instructions')).toBeVisible();
  });
});
```

**Step 4: Add E2E test scripts to package.json**

Add to scripts:
```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui",
"test:e2e:headed": "playwright test --headed"
```

**Step 5: Run E2E tests to verify setup**

Run: `pnpm test:e2e`
Expected: Tests pass (or skip gracefully if backend not running)

**Step 6: Commit**

```bash
git add -A && git commit -m "test: add Playwright E2E testing infrastructure"
```

---

### Task 8.2: Add Component Test Coverage

**Files:**
- Create: `src/lib/components/layout/Header.test.ts` (if not exists)
- Create: `src/lib/components/audio/WaveformPlayer.test.ts`
- Create: `src/lib/components/input/TextInput.test.ts`
- Create: `src/lib/components/output/OutputPanel.test.ts`

**Step 1: Write Header component tests**

Create/update `src/lib/components/layout/Header.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import Header from './Header.svelte';

describe('Header', () => {
  const defaultProps = {
    currentMode: 'custom-voice' as const,
    modelId: '1.7b',
    status: 'ready' as const,
  };

  it('renders all three mode buttons', () => {
    render(Header, { props: defaultProps });

    expect(screen.getByText('Custom Voice')).toBeInTheDocument();
    expect(screen.getByText('Voice Clone')).toBeInTheDocument();
    expect(screen.getByText('Voice Design')).toBeInTheDocument();
  });

  it('highlights current mode', () => {
    render(Header, { props: defaultProps });

    const customVoiceBtn = screen.getByText('Custom Voice');
    expect(customVoiceBtn.className).toContain('bg-');
  });

  it('calls onModeChange when mode button clicked', async () => {
    const onModeChange = vi.fn();
    render(Header, { props: { ...defaultProps, onModeChange } });

    await fireEvent.click(screen.getByText('Voice Clone'));
    expect(onModeChange).toHaveBeenCalledWith('voice-clone');
  });

  it('displays model indicator', () => {
    render(Header, { props: defaultProps });
    expect(screen.getByText('1.7b')).toBeInTheDocument();
  });

  it('displays status badge', () => {
    render(Header, { props: defaultProps });
    expect(screen.getByText(/ready/i)).toBeInTheDocument();
  });

  it('shows generating status with detail', () => {
    render(Header, {
      props: {
        ...defaultProps,
        status: 'generating',
        statusDetail: '12.3s'
      }
    });
    expect(screen.getByText(/generating/i)).toBeInTheDocument();
    expect(screen.getByText(/12.3s/)).toBeInTheDocument();
  });
});
```

**Step 2: Write TextInput component tests**

Create `src/lib/components/input/TextInput.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import TextInput from './TextInput.svelte';

describe('TextInput', () => {
  it('renders with label', () => {
    render(TextInput, { props: { value: '', label: 'Test Label' } });
    expect(screen.getByText('Test Label')).toBeInTheDocument();
  });

  it('displays character count', () => {
    render(TextInput, { props: { value: 'Hello' } });
    expect(screen.getByText('5 characters')).toBeInTheDocument();
  });

  it('shows remaining when maxLength set', () => {
    render(TextInput, { props: { value: 'Hello', maxLength: 100 } });
    expect(screen.getByText('95 remaining')).toBeInTheDocument();
  });

  it('calls onInput when typing', async () => {
    const onInput = vi.fn();
    render(TextInput, { props: { value: '', onInput } });

    const textarea = screen.getByRole('textbox');
    await fireEvent.input(textarea, { target: { value: 'test' } });

    expect(onInput).toHaveBeenCalledWith('test');
  });
});
```

**Step 3: Write OutputPanel component tests**

Create `src/lib/components/output/OutputPanel.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import OutputPanel from './OutputPanel.svelte';

describe('OutputPanel', () => {
  it('shows empty state when no audio', () => {
    render(OutputPanel, { props: {} });
    expect(screen.getByText(/generate audio to preview/i)).toBeInTheDocument();
  });

  it('shows generating state with elapsed time', () => {
    render(OutputPanel, {
      props: {
        isGenerating: true,
        elapsedTime: 5.2,
        generatingText: 'Hello world'
      }
    });

    expect(screen.getByText(/generating/i)).toBeInTheDocument();
    expect(screen.getByText('5.2s')).toBeInTheDocument();
    expect(screen.getByText(/"Hello world"/)).toBeInTheDocument();
  });

  it('shows action buttons when audio available', () => {
    render(OutputPanel, {
      props: { audioUrl: 'blob:test' }
    });

    expect(screen.getByText('Regenerate')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('Export')).toBeInTheDocument();
  });

  it('shows contextual suggestion when provided', () => {
    render(OutputPanel, {
      props: {
        audioUrl: 'blob:test',
        suggestion: {
          message: 'Save as clonable voice?',
          action: vi.fn(),
          actionLabel: 'Save'
        }
      }
    });

    expect(screen.getByText(/save as clonable voice/i)).toBeInTheDocument();
  });
});
```

**Step 4: Run all component tests**

Run: `pnpm test:run`
Expected: All tests pass

**Step 5: Commit**

```bash
git add -A && git commit -m "test: add component test coverage for core components"
```

---

### Task 8.3: Set Up GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

**Step 1: Create CI workflow**

Create `.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install

      - name: Type check
        run: pnpm check

  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install

      - name: Run unit tests
        run: pnpm test:run

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        if: always()
        with:
          files: ./coverage/lcov.info
          fail_ci_if_error: false

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run E2E tests
        run: pnpm test:e2e

      - name: Upload Playwright report
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install

      - name: Build frontend
        run: pnpm build
```

**Step 2: Add coverage config to vitest**

Update `vitest.config.ts` to add coverage:
```typescript
import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte({ hot: !process.env.VITEST })],
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}'],
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/lib/test-utils.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      exclude: [
        'node_modules/',
        'src/lib/test-utils.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
      ],
    },
  },
});
```

**Step 3: Add coverage script to package.json**

Add to scripts:
```json
"test:coverage": "vitest run --coverage"
```

**Step 4: Commit**

```bash
git add -A && git commit -m "ci: add GitHub Actions workflow for CI/CD"
```

---

### Task 8.4: Add Test Automation Scripts

**Files:**
- Create: `scripts/test-all.sh`
- Modify: `package.json`

**Step 1: Create unified test script**

Create `scripts/test-all.sh`:
```bash
#!/bin/bash
set -e

echo "🧪 Running PrivateVoice Test Suite"
echo "=================================="

echo ""
echo "📋 Type checking..."
pnpm check

echo ""
echo "🔬 Running unit tests..."
pnpm test:run

echo ""
echo "🎭 Running E2E tests..."
pnpm test:e2e

echo ""
echo "✅ All tests passed!"
```

**Step 2: Make script executable**

Run:
```bash
chmod +x scripts/test-all.sh
```

**Step 3: Add comprehensive test scripts to package.json**

Update scripts section:
```json
"scripts": {
  "dev": "vite dev",
  "build": "vite build",
  "preview": "vite preview",
  "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
  "check:watch": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json --watch",
  "test": "vitest",
  "test:run": "vitest run",
  "test:coverage": "vitest run --coverage",
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui",
  "test:e2e:headed": "playwright test --headed",
  "test:all": "./scripts/test-all.sh",
  "tauri": "tauri"
}
```

**Step 4: Commit**

```bash
git add -A && git commit -m "chore: add unified test automation scripts"
```

---

### Task 8.5: Add Pre-commit Hooks (Optional)

**Files:**
- Create: `.husky/pre-commit`
- Modify: `package.json`

**Step 1: Install husky and lint-staged**

Run:
```bash
pnpm add -D husky lint-staged
npx husky init
```

**Step 2: Configure pre-commit hook**

Create `.husky/pre-commit`:
```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

pnpm lint-staged
```

**Step 3: Add lint-staged config to package.json**

Add to package.json:
```json
"lint-staged": {
  "*.{ts,svelte}": [
    "svelte-check --tsconfig ./tsconfig.json"
  ],
  "*.test.ts": [
    "vitest related --run"
  ]
}
```

**Step 4: Commit**

```bash
git add -A && git commit -m "chore: add pre-commit hooks with husky"
```

---

## Summary

**Total Tasks:** 30+ (Phases 1-4 detailed, Phases 5-8 outlined)

**Estimated Implementation Order:**
1. Foundation (testing, wavesurfer, theme, library store)
2. Core layout (Header, Workspace, Waveform, Output)
3. Input panels (all three modes)
4. Voice Library (item, drawer)
5. Main integration
6. Settings/Help
7. Polish
8. Testing infrastructure (E2E, coverage, CI/CD, automation)

**Key Dependencies:**
- wavesurfer.js must be installed before audio components
- Library store must exist before library UI
- All input panels needed before main integration
- Phase 8 can run in parallel with Phase 7 (polish)

**Testing Coverage Goals:**
- Unit tests: Core stores, utility functions, component logic
- Component tests: All interactive components with user events
- E2E tests: Critical user flows (mode switching, generation, library)
- CI: Automated on every PR and push to main
