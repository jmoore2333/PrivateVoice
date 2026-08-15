# Issue #11 — "Unknown speaker in Custom Voice" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a saved cloned voice actually reusable — selecting one under **Voice → Saved** produces speech in that voice instead of the error `Unknown speaker: <uuid>`.

**Architecture:** A saved Voice Clone currently persists only its *generated output*. This plan makes the clone's **reference audio + transcript** persist alongside it, turning a saved clone into a reusable *voice profile*. Selecting a profile routes the app into Voice Clone mode with that reference restored (the only mode Qwen can synthesise an arbitrary voice in), via one shared `applyVoiceProfile()` helper used by both the Voice picker and the Library drawer. A preset-speaker guard in `ttsStore.generate()` makes the raw-UUID error structurally unreachable.

**Tech Stack:** Svelte 5 runes, TypeScript, Tauri 2 (`plugin-fs`), Vitest, Playwright.

**Spec:** This document (Background + Root Cause sections below).

---

## Background — Reported Behaviour

GitHub issue [#11](https://github.com/jmoore2333/PrivateVoice/issues/11), reporter `schattenmeister`:

> When I clone a voice and save it to the library, the save name is the Transcript of reference used.
> If I then go to Custom Voice and select the saved name of the voice clone under saved and want to render a text, I get the error message Unknown Speaker.

**Reproduced** on 2026-08-15 in the real compiled Tauri shell (`tauri dev`, WKWebView, real Python venv backend on MPS, real Tauri-FS library persistence), model `Qwen 0.6B Custom`:

```
Unknown speaker: 8f20a31f-ed04-4b85-ac66-d8d5ff03f258
```

That UUID is the `id` of the library item in `{appData}/library/index.json`. Present on `main`, on `v1.0.1`/`v1.0.2` (identical code), and on the current branch.

## Root Cause

Five links, each verified by reading the shipped code:

1. `src/lib/components/input/VoiceSelector.svelte:25-27` — the **Saved** tab lists `libraryStore.saved.filter(item => item.type === 'clone')`. Those items are *generated output clips*, not voices.
2. `src/lib/components/input/VoiceSelector.svelte:29-32` — `selectVoice(voice.id, false)` assigns the **library UUID** to the speaker binding and reports `isPreset = false`.
3. `src/routes/+page.svelte:555-558` — `handleSpeakerChange(speaker, _isPreset)` **discards `isPreset`** and calls `ttsStore.setSpeaker(speaker as Speaker)`. The `as Speaker` cast suppresses the type error that would otherwise have caught this at build time.
4. `src/lib/stores/ttsStore.svelte.ts:554-560` — `generate()` rejects any custom-voice speaker outside `PRESET_SPEAKERS` → `Unknown speaker: <uuid>`.
5. `python/tts_server/providers/qwen_provider.py:98-103` and `python/tts_server/inference.py:214-215` hold the same guard, so removing the client check would only convert the error into an HTTP 400.

**The underlying defect:** *saved voices were never implemented.* Qwen Custom Voice supports exactly the nine `PRESET_SPEAKERS`; an arbitrary voice requires **Voice Clone** mode with a Base model and a reference recording. Nothing in the app ever stored a reusable voice, so the Saved tab could never have worked.

### Collateral defects found in the same path

| # | Defect | Location |
|---|---|---|
| C1 | Saved clone is named after the *synthesised text*, truncated to 30 chars — the reporter's first complaint | `+page.svelte:406-421` |
| C2 | Library **Edit** menu item calls `onEdit`, but `LibraryDrawer` never passes it — dead control, so a name can never be corrected | `LibraryItem.svelte:148-150`, `LibraryDrawer.svelte:115` |
| C3 | Library drawer's **Use Voice** on a clone switches to Voice Clone mode and restores the transcript, but no reference audio exists — generation then fails with "Please upload a reference audio file" | `+page.svelte:1027-1045` |
| C4 | The preset guard runs only for `provider === "qwen3"`. Chatterbox's provider never reads `speaker` at all, so the same click **silently** yields Chatterbox's default voice — a wrong-output failure, worse than an error | `ttsStore.svelte.ts:555`, `chatterbox_provider.py` |
| C5 | For a clone item, `audioUrl` is the *generated output* while `metadata.referenceText` transcribes a *different*, discarded file — the two do not describe the same audio | `+page.svelte:413-419` |

## Design Decisions

- **D1 — A saved clone becomes a voice profile.** It persists the reference audio it was cloned from, plus that reference's transcript. Without reference audio an item is just a clip and is not offered as a voice.
- **D2 — Storage.** Reference audio goes to `{appData}/library/{id}.ref.wav`, beside the existing `{id}.wav`. `index.json` gains `metadata.hasReferenceAudio`. In the localStorage fallback (dev/browser) the blob still lives in memory for the session, so the feature works in-session everywhere and across restarts under Tauri — matching the existing library contract.
- **D3 — Selecting a profile switches to Voice Clone mode.** That is the only mode that can render an arbitrary voice. The user's typed text is preserved; the existing "Requires a Base model" banner handles model loading. A one-line notice explains the switch so it is not surprising.
- **D4 — Legacy items are not offered as voices.** Items saved before this change have no reference audio and never worked. They remain in the Library drawer as clips; the Saved tab's empty state explains what to do. Called out in release notes.
- **D5 — The guard covers every provider.** Fixes C4 and makes the raw-UUID message unreachable.
- **D6 — One name per item, renameable.** Clone saves default to `Voice N`; the dead Edit control becomes a working rename (fixes C1 and C2).

## Global Constraints

- Svelte 5 runes only — `$state()`, `$derived()`, `$effect()`. No `writable()`/`readable()`.
- Tailwind CSS 4 utility classes with the existing `var(--color-*)` tokens. No new CSS files.
- No new runtime dependencies, frontend or Python.
- No Python/backend changes: the backend guard is correct defence-in-depth and stays as-is.
- Existing library files must keep loading — `index.json` entries without the new fields load unchanged.
- Unit tests: Vitest, colocated `*.test.ts`. E2E: Playwright in `e2e/`.
- Pre-commit runs `svelte-check` on staged `.ts`/`.svelte`; every commit must typecheck.
- Do not bump the app version — this is a fix on top of 1.0.3.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/lib/stores/libraryStore.svelte.ts` | Two-tier library storage | Persist/read/remove `{id}.ref.wav`; `hasReferenceAudio` in metadata; `referenceAudioUrl` on in-memory items |
| `src/lib/stores/libraryStore.test.ts` | Store unit tests | Reference-audio persistence coverage |
| `src/lib/stores/ttsStore.svelte.ts` | TTS state + generate | All-provider preset guard with an actionable message |
| `src/lib/stores/ttsStore.test.ts` | Store unit tests | Guard coverage |
| `src/lib/components/input/VoiceSelector.svelte` | Voice picker | Offer only reusable profiles; honest empty state |
| `src/routes/+page.svelte` | Page wiring | `applyVoiceProfile()`; `isPreset` honoured; clone default name; save passes reference blob; rename wiring |
| `src/lib/components/library/LibraryDrawer.svelte` | Library drawer | Pass `onEdit` through |
| `e2e/library.spec.ts` | E2E | Regression test for the reported flow |

---

### Task 1: Persist the clone's reference audio

**Files:**
- Modify: `src/lib/stores/libraryStore.svelte.ts`
- Test: `src/lib/stores/libraryStore.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `LibraryItemMetadata.hasReferenceAudio?: boolean`
  - `LibraryItem.referenceAudioUrl?: string`
  - `saveToLibrary(item: LibraryItem, audioBlob?: Blob, referenceBlob?: Blob): Promise<{ ok: true } | { ok: false; error: string }>`
  - `getReferenceBlob(id: string): Promise<Blob | null>`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/stores/libraryStore.test.ts`:

```ts
describe('reference audio persistence', () => {
  it('marks an item as having reference audio and exposes its blob', async () => {
    const item = {
      id: 'ref-1',
      type: 'clone' as const,
      name: 'Voice 1',
      audioUrl: 'blob:out',
      createdAt: new Date(),
      metadata: { referenceText: 'hello there' },
    };
    const refBlob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' });

    const result = await libraryStore.saveToLibrary(item, undefined, refBlob);

    expect(result.ok).toBe(true);
    const saved = libraryStore.saved.find((i) => i.id === 'ref-1');
    expect(saved?.metadata?.hasReferenceAudio).toBe(true);
    expect(saved?.referenceAudioUrl).toBeTruthy();

    const roundTripped = await libraryStore.getReferenceBlob('ref-1');
    expect(roundTripped).toBeInstanceOf(Blob);
    expect(await roundTripped!.arrayBuffer()).toEqual(await refBlob.arrayBuffer());
  });

  it('leaves hasReferenceAudio unset when no reference blob is given', async () => {
    const item = {
      id: 'ref-2',
      type: 'clone' as const,
      name: 'Clip',
      audioUrl: 'blob:out',
      createdAt: new Date(),
    };

    await libraryStore.saveToLibrary(item);

    const saved = libraryStore.saved.find((i) => i.id === 'ref-2');
    expect(saved?.metadata?.hasReferenceAudio).toBeFalsy();
    expect(await libraryStore.getReferenceBlob('ref-2')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/stores/libraryStore.test.ts -t "reference audio persistence"`
Expected: FAIL — `saveToLibrary` ignores the third argument and `getReferenceBlob` is not a function.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/stores/libraryStore.svelte.ts`, extend the types:

```ts
export interface LibraryItemMetadata {
  speaker?: string;
  language?: string;
  referenceText?: string;
  voiceDescription?: string;
  modelId?: string;
  /** True when {id}.ref.wav exists — the item is reusable as a voice. */
  hasReferenceAudio?: boolean;
  /** Cloned with x-vector-only mode, so it has no reference transcript. */
  lowQualityMode?: boolean;
}

export interface LibraryItem {
  id: string;
  type: LibraryItemType;
  name: string;
  audioUrl: string;
  createdAt: Date;
  comment?: string;
  tags?: string[];
  metadata?: LibraryItemMetadata;
  /** Object URL for the clone's reference audio. Not persisted in index.json. */
  referenceAudioUrl?: string;
}
```

Add file helpers next to the existing audio helpers:

```ts
const refFileName = (id: string) => `${LIBRARY_DIR}/${id}.ref.wav`;

async function writeReferenceFile(id: string, blob: Blob): Promise<void> {
  const fs = await getTauriFs();
  if (!fs) return;

  const arrayBuffer = await blob.arrayBuffer();
  await fs.writeFile(refFileName(id), new Uint8Array(arrayBuffer), {
    baseDir: fs.BaseDirectory.AppData,
  });
}

async function readReferenceBlob(id: string): Promise<Blob | null> {
  const fs = await getTauriFs();
  if (!fs) return null;

  try {
    const filePath = refFileName(id);
    if (!(await fs.exists(filePath, { baseDir: fs.BaseDirectory.AppData }))) return null;
    const data = await fs.readFile(filePath, { baseDir: fs.BaseDirectory.AppData });
    return new Blob([data], { type: 'audio/wav' });
  } catch (e) {
    console.error(`Failed to read reference audio ${id}:`, e);
    return null;
  }
}

async function removeReferenceFile(id: string): Promise<void> {
  const fs = await getTauriFs();
  if (!fs) return;

  try {
    const filePath = refFileName(id);
    if (await fs.exists(filePath, { baseDir: fs.BaseDirectory.AppData })) {
      await fs.remove(filePath, { baseDir: fs.BaseDirectory.AppData });
    }
  } catch (e) {
    console.error(`Failed to remove reference audio ${id}:`, e);
  }
}
```

Inside `createLibraryStore()`, add a session-scoped blob cache above `init()`:

```ts
// Reference blobs held for the session so the feature works before/without Tauri FS.
const referenceBlobs = new Map<string, Blob>();
```

Rewrite `saveToLibrary`:

```ts
async saveToLibrary(
  item: LibraryItem,
  audioBlob?: Blob,
  referenceBlob?: Blob
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (useTauriFs && audioBlob) {
    try {
      await writeAudioFile(item.id, audioBlob);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`Failed to save audio for ${item.id}:`, msg);
      return { ok: false, error: msg };
    }
    const persistentUrl = await readAudioFile(item.id);
    if (persistentUrl) {
      item = { ...item, audioUrl: persistentUrl };
    }
  } else if (!useTauriFs) {
    console.warn('Tauri FS not available, saving metadata only');
  }

  if (referenceBlob) {
    referenceBlobs.set(item.id, referenceBlob);
    if (useTauriFs) {
      try {
        await writeReferenceFile(item.id, referenceBlob);
      } catch (e) {
        // A missing reference only costs reusability; the clip itself is saved.
        console.error(`Failed to save reference audio for ${item.id}:`, e);
      }
    }
    item = {
      ...item,
      referenceAudioUrl: URL.createObjectURL(referenceBlob),
      metadata: { ...item.metadata, hasReferenceAudio: true },
    };
  }

  saved = [item, ...saved];
  await persist();
  return { ok: true };
},

async getReferenceBlob(id: string): Promise<Blob | null> {
  const cached = referenceBlobs.get(id);
  if (cached) return cached;

  const blob = await readReferenceBlob(id);
  if (blob) referenceBlobs.set(id, blob);
  return blob;
},
```

In `init()`, restore reference URLs for saved items (inside the `if (audioUrl)` branch, before `loadedItems.push`):

```ts
const referenceBlob = stored.metadata?.hasReferenceAudio
  ? await readReferenceBlob(stored.id)
  : null;
if (referenceBlob) referenceBlobs.set(stored.id, referenceBlob);

loadedItems.push({
  ...stored,
  audioUrl,
  referenceAudioUrl: referenceBlob ? URL.createObjectURL(referenceBlob) : undefined,
  createdAt: new Date(stored.createdAt),
});
```

In `removeFromLibrary`, drop the reference too (after the existing `audioUrl` revoke):

```ts
if (item?.referenceAudioUrl?.startsWith('blob:')) {
  URL.revokeObjectURL(item.referenceAudioUrl);
}
referenceBlobs.delete(id);
if (useTauriFs) {
  await removeAudioFile(id);
  await removeReferenceFile(id);
}
```

In `clearAll`, mirror it: revoke each `referenceAudioUrl`, `await removeReferenceFile(item.id)` in the Tauri branch, and `referenceBlobs.clear()`.

`persist()` and `persistToLocalStorage()` strip `audioUrl` via destructuring — extend both to strip `referenceAudioUrl` as well so it never lands in `index.json`:

```ts
const index: StoredItem[] = saved.map(
  ({ audioUrl: _url, referenceAudioUrl: _ref, createdAt, ...rest }) => ({
    ...rest,
    createdAt: createdAt.toISOString(),
  })
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/stores/libraryStore.test.ts`
Expected: PASS — new tests green, all pre-existing library tests still green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/libraryStore.svelte.ts src/lib/stores/libraryStore.test.ts
git commit -m "feat(library): persist clone reference audio for voice reuse"
```

---

### Task 2: Guard non-preset speakers on every provider

**Files:**
- Modify: `src/lib/stores/ttsStore.svelte.ts:554-560`
- Test: `src/lib/stores/ttsStore.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `generate()` sets `state.error` to `"That saved voice can't be used in Custom Voice. Open it from Voice → Saved to load it in Voice Clone mode."` whenever a custom-voice speaker is not a preset, for any provider.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/stores/ttsStore.test.ts`:

```ts
describe('custom-voice speaker guard', () => {
  it('rejects a library id with actionable copy instead of the raw uuid', async () => {
    ttsStore.setMode('custom-voice');
    ttsStore.setText('hello world');
    ttsStore.setSpeaker('8f20a31f-ed04-4b85-ac66-d8d5ff03f258' as never);

    await ttsStore.generate();

    expect(ttsStore.state.error).toBe(
      "That saved voice can't be used in Custom Voice. Open it from Voice → Saved to load it in Voice Clone mode."
    );
    expect(ttsStore.state.error).not.toContain('8f20a31f');
  });

  it('accepts a preset speaker', async () => {
    ttsStore.setMode('custom-voice');
    ttsStore.setText('hello world');
    ttsStore.setSpeaker('aiden');

    await ttsStore.generate();

    expect(ttsStore.state.error).toBeNull();
  });
});
```

Follow the surrounding tests' existing setup for `ttsClient` mocking and a loaded `0.6b` model; reuse the same `beforeEach` helpers already in the file rather than inventing new ones.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/stores/ttsStore.test.ts -t "custom-voice speaker guard"`
Expected: FAIL — error is `Unknown speaker: 8f20a31f-ed04-4b85-ac66-d8d5ff03f258`.

- [ ] **Step 3: Write minimal implementation**

Replace the `custom-voice` branch in `generate()`:

```ts
if (state.mode === "custom-voice") {
  // Preset speakers are the only voices Custom Voice can render. A non-preset
  // value means a saved clone leaked in from the Voice picker; Chatterbox
  // ignores `speaker` entirely, so guard every provider or it silently
  // renders the wrong voice.
  if (!PRESET_SPEAKERS.includes(payload.speaker as Speaker)) {
    throw new Error(
      "That saved voice can't be used in Custom Voice. Open it from Voice → Saved to load it in Voice Clone mode."
    );
  }
} else if (state.mode === "voice-clone") {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/stores/ttsStore.test.ts`
Expected: PASS — new tests green, all pre-existing ttsStore tests still green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/ttsStore.svelte.ts src/lib/stores/ttsStore.test.ts
git commit -m "fix(tts): replace raw uuid speaker error with actionable guidance"
```

---

### Task 3: Offer only reusable voices in the picker

**Files:**
- Modify: `src/lib/components/input/VoiceSelector.svelte:25-27, 87-91`

**Interfaces:**
- Consumes: `LibraryItem.metadata.hasReferenceAudio` from Task 1.
- Produces: the Saved tab lists only items with reference audio; `onSelect(id, false)` still fires with the library id.

- [ ] **Step 1: Narrow the saved list**

```ts
  // Only clones that kept their reference audio can be re-rendered as a voice.
  // Clips saved before reference audio was persisted stay in the Library drawer.
  const savedVoices = $derived(
    libraryStore.saved.filter(
      (item) => item.type === 'clone' && item.metadata?.hasReferenceAudio
    )
  );
```

- [ ] **Step 2: Replace the empty state**

```svelte
    {:else}
      <div class="col-span-2 py-8 text-center text-[var(--color-text-muted)] text-sm">
        No reusable voices yet. Clone a voice and save it — the reference audio is
        stored so you can use the voice again.
      </div>
    {/each}
```

(keep the surrounding `{#each}`/`{:else}` structure exactly as it is; only the copy changes)

- [ ] **Step 3: Typecheck**

Run: `pnpm check`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/input/VoiceSelector.svelte
git commit -m "fix(voice-selector): only offer clones that kept reference audio"
```

---

### Task 4: Route a selected voice into Voice Clone mode

**Files:**
- Modify: `src/routes/+page.svelte:406-421` (naming + save), `:555-558` (`handleSpeakerChange`), `:1027-1045` (drawer `onUseVoice`)

**Interfaces:**
- Consumes: `libraryStore.getReferenceBlob(id)` (Task 1), `handleReferenceAudioChange(blob, url)` (existing, `+page.svelte:474`).
- Produces: `applyVoiceProfile(id: string): Promise<boolean>` — restores a saved voice into Voice Clone mode; returns `false` when the id has no reusable reference.

- [ ] **Step 1: Add the shared helper**

Insert directly above `handleSpeakerChange`:

```ts
  /** Notice shown after a saved voice moves the app into Voice Clone mode. */
  let voiceProfileNotice = $state<string | null>(null);
  let voiceProfileNoticeTimer: ReturnType<typeof setTimeout> | null = null;

  function showVoiceProfileNotice(message: string) {
    if (voiceProfileNoticeTimer) clearTimeout(voiceProfileNoticeTimer);
    voiceProfileNotice = message;
    voiceProfileNoticeTimer = setTimeout(() => (voiceProfileNotice = null), 6000);
  }

  /**
   * Load a saved cloned voice for reuse. Qwen can only render an arbitrary
   * voice in Voice Clone mode, so this switches modes and restores the
   * reference audio + transcript the clone was made from. The text the user
   * already typed is preserved.
   */
  async function applyVoiceProfile(id: string): Promise<boolean> {
    const item =
      libraryStore.saved.find((i) => i.id === id) ??
      libraryStore.recent.find((i) => i.id === id);
    if (!item) return false;

    // hasReferenceAudio lives in index.json but the bytes live on disk; the two
    // can diverge if the file was removed. Say so rather than doing nothing.
    const referenceBlob = await libraryStore.getReferenceBlob(id);
    if (!referenceBlob) {
      showVoiceProfileNotice(
        `"${item.name}" has no stored reference audio, so it can't be reused as a voice.`
      );
      return false;
    }

    ttsStore.setMode('voice-clone');
    await handleReferenceAudioChange(referenceBlob, URL.createObjectURL(referenceBlob));

    const lowQuality = item.metadata?.lowQualityMode ?? false;
    ttsStore.setCloneLowQualityMode(lowQuality);

    const transcript = item.metadata?.referenceText ?? '';
    localReferenceText = transcript;
    ttsStore.setReferenceText(transcript);

    if (item.metadata?.language) {
      handleLanguageChange(item.metadata.language);
    }

    showVoiceProfileNotice(`Loaded "${item.name}" in Voice Clone mode.`);
    return true;
  }
```

- [ ] **Step 2: Honour `isPreset` in `handleSpeakerChange`**

```ts
  function handleSpeakerChange(speaker: string, isPreset: boolean) {
    if (!isPreset) {
      // A saved clone, not a preset: its id is not a speaker. Load it as a
      // voice profile and leave the preset selection untouched.
      void applyVoiceProfile(speaker);
      return;
    }
    localSpeaker = speaker;
    ttsStore.setSpeaker(speaker as Speaker);
  }
```

- [ ] **Step 3: Render the notice**

Immediately after the existing error banner block (`{#if ttsState.error}...{/if}`, `+page.svelte:791-803`):

```svelte
  {#if voiceProfileNotice}
    <div class="px-4 py-2 bg-[var(--color-accent)]/10 border-b border-[var(--color-accent)]/30">
      <div class="flex items-center justify-between max-w-4xl mx-auto">
        <span class="text-sm text-[var(--color-accent)]">{voiceProfileNotice}</span>
        <button
          onclick={() => (voiceProfileNotice = null)}
          class="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
        >
          Dismiss
        </button>
      </div>
    </div>
  {/if}
```

- [ ] **Step 4: Route the drawer through the same helper**

Replace the `onUseVoice` body (`+page.svelte:1027-1045`):

```svelte
  onUseVoice={async (id) => {
    const item =
      libraryStore.saved.find((i) => i.id === id) ?? libraryStore.recent.find((i) => i.id === id);
    if (!item) { libraryOpen = false; return; }

    // A clone with reference audio is a reusable voice; anything else just
    // restores the settings it was generated with.
    if (item.type === 'clone' && (await applyVoiceProfile(id))) {
      libraryOpen = false;
      return;
    }

    const modeMap = { clone: 'voice-clone', design: 'voice-design', audio: 'custom-voice' } as const;
    ttsStore.setMode(modeMap[item.type]);

    if (item.metadata?.speaker && PRESET_SPEAKERS.includes(item.metadata.speaker as Speaker)) {
      ttsStore.setSpeaker(item.metadata.speaker as Speaker);
    }
    if (item.metadata?.language) ttsStore.setLanguage(item.metadata.language);
    if (item.metadata?.voiceDescription) ttsStore.setVoiceDescription(item.metadata.voiceDescription);
    if (item.metadata?.referenceText) ttsStore.setReferenceText(item.metadata.referenceText);

    ttsStore.setText(item.name.replace(/\.\.\.$/, ''));

    libraryOpen = false;
  }}
```

`PRESET_SPEAKERS` is not currently imported here. Extend the existing import at `+page.svelte:13`:

```ts
  import { ttsClient, PRESET_SPEAKERS, type BatchRequest, type Speaker, type SystemInfo } from "$lib/api/ttsClient";
```

- [ ] **Step 5: Save the reference blob and name clones sensibly**

> **Use `ttsState.referenceAudio`, not `referenceAudioBlob`.** `handleReferenceAudioChange`
> (`+page.svelte:474-494`) keeps the *original* blob in `referenceAudioBlob` — which is
> WebM/Opus when recorded from the mic — and only the converted WAV `File` reaches
> `ttsStore.setReferenceAudio()`. Persisting `referenceAudioBlob` as `{id}.ref.wav` would
> write WebM bytes under a `.wav` name and the backend would reject it on reuse.

Replace `buildLibraryItem()` and `handleSave()`:

```ts
  function nextVoiceName(): string {
    const used = libraryStore.saved
      .map((i) => /^Voice (\d+)$/.exec(i.name)?.[1])
      .filter((n): n is string => Boolean(n))
      .map(Number);
    return `Voice ${used.length ? Math.max(...used) + 1 : 1}`;
  }

  function buildLibraryItem(): import('$lib/stores/libraryStore.svelte').LibraryItem {
    const isClone = ttsState.mode === 'voice-clone';
    return {
      id: crypto.randomUUID(),
      type: isClone ? 'clone' : ttsState.mode === 'voice-design' ? 'design' : 'audio',
      // A clone is saved to be reused as a voice, so name it after the voice —
      // not the sentence it happened to say. Renameable from the Library.
      name: isClone
        ? nextVoiceName()
        : ttsState.text.slice(0, 30) + (ttsState.text.length > 30 ? '...' : ''),
      audioUrl: ttsState.audioUrl!,
      createdAt: new Date(),
      metadata: {
        speaker: ttsState.speaker,
        language: ttsState.language,
        referenceText: ttsState.referenceText || undefined,
        voiceDescription: ttsState.voiceDescription || undefined,
        modelId: ttsState.modelId ?? undefined,
        // Low-quality clones carry no transcript; restoring one must not then
        // demand a reference text the user never supplied.
        lowQualityMode: isClone ? ttsState.cloneLowQualityMode : undefined,
      },
    };
  }

  async function handleSave() {
    if (ttsState.audioBlob && ttsState.audioUrl) {
      try {
        // Voice Clone saves carry their reference audio so the voice can be
        // reused. Use ttsState.referenceAudio — it is the WAV-converted File;
        // referenceAudioBlob may still be WebM/Opus straight from the mic.
        const referenceBlob =
          ttsState.mode === 'voice-clone' ? (ttsState.referenceAudio ?? undefined) : undefined;
        const result = await libraryStore.saveToLibrary(
          buildLibraryItem(),
          ttsState.audioBlob,
          referenceBlob
        );
        if (result.ok) {
          showSaveNotification('Saved to Library', 'success');
        } else {
          showSaveNotification(`Save failed: ${result.error}`, 'error');
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        showSaveNotification(`Save failed: ${msg}`, 'error');
      }
    } else {
      showSaveNotification('No audio to save — generate first', 'error');
    }
  }
```

- [ ] **Step 6: Typecheck**

Run: `pnpm check`
Expected: no new errors. `handleSpeakerChange` no longer takes an unused parameter.

- [ ] **Step 7: Commit**

```bash
git add src/routes/+page.svelte
git commit -m "fix(voice): load saved clones as voice profiles in Voice Clone mode"
```

---

### Task 5: Make the Library rename control work

**Files:**
- Modify: `src/lib/components/library/LibraryDrawer.svelte:115`, `src/routes/+page.svelte`

**Interfaces:**
- Consumes: `libraryStore.updateItem(id, updates)` (already exists, currently unused).
- Produces: `LibraryDrawer` prop `onEditItem?: (id: string) => void`.

- [ ] **Step 1: Add the prop and wire it to the item**

In `LibraryDrawer.svelte`, add `onEditItem?: (id: string) => void;` to `Props`, destructure it alongside `onUseVoice`, and pass it down beside the existing `onUse`:

```svelte
              onEdit={() => onEditItem?.(item.id)}
```

- [ ] **Step 2: Handle rename on the page**

In `+page.svelte`, next to the other library handlers:

```ts
  let renameTarget = $state<{ id: string; name: string } | null>(null);

  function startRename(id: string) {
    const item =
      libraryStore.saved.find((i) => i.id === id) ?? libraryStore.recent.find((i) => i.id === id);
    if (item) renameTarget = { id, name: item.name };
  }

  async function commitRename() {
    if (!renameTarget) return;
    const name = renameTarget.name.trim();
    if (name) await libraryStore.updateItem(renameTarget.id, { name });
    renameTarget = null;
  }
```

Pass `onEditItem={startRename}` to `<LibraryDrawer>`.

- [ ] **Step 3: Render the rename field**

Directly after `<LibraryDrawer ... />`:

```svelte
{#if renameTarget}
  <div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
    <div class="w-80 rounded-xl bg-[var(--color-bg-elevated)] border border-[var(--color-border-default)] p-4 space-y-3">
      <p class="text-sm font-medium text-[var(--color-text-primary)]">Rename</p>
      <input
        bind:value={renameTarget.name}
        onkeydown={(e) => {
          if (e.key === 'Enter') commitRename();
          if (e.key === 'Escape') renameTarget = null;
        }}
        class="w-full px-3 py-2 rounded-lg bg-[var(--color-bg-surface)] border border-[var(--color-border-subtle)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-accent)]"
      />
      <div class="flex justify-end gap-2">
        <button class="px-3 py-1.5 text-sm text-[var(--color-text-muted)]" onclick={() => (renameTarget = null)}>
          Cancel
        </button>
        <button class="px-3 py-1.5 text-sm rounded-lg bg-[var(--color-accent)] text-white" onclick={commitRename}>
          Save
        </button>
      </div>
    </div>
  </div>
{/if}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm check`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/library/LibraryDrawer.svelte src/routes/+page.svelte
git commit -m "fix(library): make the Edit control rename items"
```

---

### Task 6: End-to-end regression for the reported flow

**Files:**
- Modify: `e2e/library.spec.ts`

**Interfaces:**
- Consumes: everything above. Uses this file's **existing** helpers — `setupTauriMocks(page, { failFs })` (`e2e/library.spec.ts:14`), `setupApiMocks` (`:51`), `setupBypassOnboarding` (`:142`), `seedLibrary` (`:167`), `navigateAndWait` (`:183`). Do not invent new ones.

> **Coverage limit, stated deliberately.** E2E seeds the library through
> `seedLibrary`, which writes localStorage and therefore requires
> `setupTauriMocks(page, { failFs: true })` — the Tauri FS mock returns
> `undefined` for every `plugin:fs|*` call, so with `failFs: false` the store
> reads an empty index and no seeded item ever appears. localStorage cannot hold
> a blob, so `getReferenceBlob()` returns `null` under E2E and the *successful*
> reuse path is **not** reachable here. These two tests therefore pin the
> regression itself — clicking a saved voice can never again produce
> `Unknown speaker` — while the happy path is covered by Task 1's unit tests plus
> the Manual Verification section. Do not fake it by asserting on a path the
> harness cannot execute.

- [ ] **Step 1: Widen `seedLibrary`'s metadata type**

`seedLibrary`'s signature declares `metadata?: Record<string, string>` (`e2e/library.spec.ts:175`), which rejects the boolean `hasReferenceAudio`. Change that one line to:

```ts
  metadata?: Record<string, string | boolean>;
```

- [ ] **Step 2: Write the failing tests**

Append inside the existing `test.describe('Voice Library with data', ...)` block:

```ts
  test('a legacy clone without reference audio is not offered as a voice', async ({ page }) => {
    await setupTauriMocks(page, { failFs: true });
    await setupApiMocks(page);
    await setupBypassOnboarding(page);
    // Saved before reference audio was persisted — exactly the item shape that
    // produced "Unknown speaker: <uuid>" in issue #11.
    await seedLibrary(page, [{
      id: '8f20a31f-ed04-4b85-ac66-d8d5ff03f258',
      type: 'clone',
      name: 'I remember there was like a ti...',
      createdAt: '2026-08-15T00:00:00.000Z',
      metadata: { referenceText: 'Testing, testing.' },
    }]);
    await navigateAndWait(page);

    await page.locator('nav').getByRole('button', { name: 'Custom Voice' }).click();
    await page.getByRole('button', { name: 'Saved (0)' }).click();

    await expect(page.getByText('No reusable voices yet')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Unknown speaker/)).toHaveCount(0);
  });

  test('clicking a saved voice never raises "Unknown speaker"', async ({ page }) => {
    await setupTauriMocks(page, { failFs: true });
    await setupApiMocks(page);
    await setupBypassOnboarding(page);
    await seedLibrary(page, [{
      id: 'voice-profile-1',
      type: 'clone',
      name: 'Voice 1',
      createdAt: '2026-08-15T00:00:00.000Z',
      metadata: { referenceText: 'Testing, testing.', hasReferenceAudio: true },
    }]);
    await navigateAndWait(page);

    await page.locator('nav').getByRole('button', { name: 'Custom Voice' }).click();
    await page.getByRole('button', { name: 'Saved (1)' }).click();
    await page.getByText('Voice 1').click();

    // localStorage holds no blob, so this lands on the explicit "no stored
    // reference audio" notice — never on the raw uuid error.
    await expect(page.getByText(/no stored reference audio/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/Unknown speaker/)).toHaveCount(0);
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm exec playwright test e2e/library.spec.ts -g "Unknown speaker|not offered as a voice"`
Expected: FAIL before Tasks 1–4 land (the legacy item still shows as `Saved (1)`); PASS after.

- [ ] **Step 4: Run the full suite**

Run: `pnpm test:run && pnpm exec playwright test && pnpm check`
Expected: all green. Baseline before this work is 235 unit tests passing and `svelte-check` reporting 0 errors — anything beyond that is a regression from these changes.

- [ ] **Step 5: Commit**

```bash
git add e2e/library.spec.ts
git commit -m "test(e2e): cover saved-voice regression for issue #11"
```

---

## Out of Scope

- **Backend changes.** `qwen_provider.py` / `inference.py` keep their guards as defence-in-depth.
- **Chatterbox Custom Voice voice selection.** Chatterbox ignores `speaker` entirely, so the Voice picker is decorative when a Chatterbox model is loaded. Task 2 stops it rendering the *wrong* voice silently; presenting a Chatterbox-appropriate picker is separate work.
- **Migrating legacy library items.** They lack reference audio and cannot be recovered (D4).
- **Speaker-embedding voice profiles** (storing an x-vector rather than reference audio) — a larger change to the Python provider API.

## Manual Verification

Run the real shell, not a browser — the library only persists under Tauri FS:

```bash
./node_modules/.bin/vite dev &
./node_modules/.bin/tauri dev --config '{"build":{"beforeDevCommand":""}}'
```

1. Voice Clone with a Base model → generate → **Save**. Confirm the library name is `Voice N`, and that `{appData}/library/<id>.ref.wav` exists.
2. Switch to Custom Voice, load `Qwen 0.6B Custom`, open **Voice → Saved**, click the voice. Expect: mode switches to Voice Clone, the reference waveform and transcript are restored, notice shown, **no** `Unknown speaker`.
3. Generate. Expect audio in the cloned voice.
4. Library drawer → item menu → **Edit** → rename → confirm the new name shows in both the drawer and the Voice picker.
5. Confirm a pre-existing legacy clone no longer appears under **Saved** but is still present in the Library drawer.
