# Issue #13 — Batch Settings Visibility, Debug Error Noise, and Capability Docs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make batch mode's voice settings visible and editable, stop the Debug console from painting benign sidecar output red, report cancels and timeouts accurately instead of "Batch generation failed", and document what the Qwen3-TTS models can and cannot actually be asked to do.

**Architecture:** Four independent seams, fixed in place — the Rust stderr log classifier, the Python inference warm-up, the TypeScript abort/timeout contract in `ttsClient`, and the batch-mode layout in `+page.svelte`. No new subsystems and no schema changes to the batch API. Help gains two sections stating verified model capability facts.

**Tech Stack:** Rust (Tauri 2), Python 3.11 (FastAPI + transformers/qwen_tts), TypeScript, Svelte 5 runes, Vitest, Playwright, pytest.

**Spec:** This document. Issue: https://github.com/jmoore2333/PrivateVoice/issues/13

---

## Background — Reported Behaviour

Issue #13 (reporter: @schattenmeister) raises four things:

1. "Is it possible to change the settings while in batch mode, or how do I know which settings it uses for batch mode? Could you modify the program so that the settings remain accessible during batch mode?"
2. "Is it a bug that you can select the voice to be used under 'Save Voices (Library)' while in Custom Voice mode? Clicking there takes you to the 'Clone Voice' tab. Could you provide a brief explanation for this? I couldn't find anything about it in the help section."
3. "P.S. Could you add sliders to control voice speed, emphasis, etc., or would that be too much work?"
4. Follow-up comment: "I have used Voice Clone with a few txt files in Batch mode, and have the error batch generation failed in Debug" — with a screenshot.

## Investigation — What Was Verified

Every root cause below was confirmed by execution, not by reading alone.

### Evidence 1 — the screenshot is not a failure log

The attached image shows seven rows, all badged `ERRO`, all reading:

```
Setting `pad_token_id` to `eos_token_id`:2150 for open-end generation.
```

That string is a benign `logger.warning` in `transformers/generation/utils.py:2102`, emitted once per `generate()` call when `generation_config.pad_token_id` is unset. Timestamps run 12:30:10 → 13:00:44 with 4–5 minute gaps: seven items, ~4.5 min each, over ~30 minutes.

### Evidence 2 — `abort(string)` does not produce an Error

`ttsClient.ts:212` calls `abort("Generation timed out")` and `ttsClient.ts:220` calls `abort("Generation cancelled")`. Probed against a local HTTP server that never responds:

| call | fetch rejects with | `instanceof Error` | `instanceof DOMException` |
|---|---|---|---|
| `abort()` | `DOMException: AbortError` | `true` | `true` |
| `abort("Generation timed out")` | the string `"Generation timed out"` | **`false`** | **`false`** |

Per the Fetch spec the promise rejects with `signal.reason` verbatim. Both existing catch blocks test `e instanceof DOMException && e.name === "AbortError"`, which a string fails, then fall through to `e instanceof Error ? e.message : <fallback>`, which a string also fails — landing on the hardcoded fallback string.

### Evidence 3 — live batch reproduction

Ran the sidecar on port 8799 against the local HF cache, loaded `0.6b`, truncated stderr, and posted a two-item `custom-voice` batch. The batch returned `http=200` in 13s and stderr contained exactly:

```
Setting `pad_token_id` to `eos_token_id`:2150 for open-end generation.
The following generation flags are not valid and may be ignored: ['temperature']. Set `TRANSFORMERS_VERBOSITY=info` for more details.
Setting `pad_token_id` to `eos_token_id`:2150 for open-end generation.
```

One `pad_token_id` line per item, matching the reporter's screenshot. `process_stderr_line` would badge all three `ERROR`.

### Evidence 4 — the pad_token_id fix is behaviour-preserving

`Qwen3TTSModel` is a plain wrapper with no `.config` and no `__getattr__`, so the `hasattr(self.model, 'config')` guard at `inference.py:117` is **always False** — the existing suppression is dead code and has never run. Probing the real model:

```
wrapper has .config?           False
inner type:                    Qwen3TTSForConditionalGeneration
inner.generation_config.pad_token_id = None
talker.generation_config.pad_token_id = None
talker.generation_config.eos_token_id = None
```

`modeling_qwen3_tts.py:2050` passes `eos_token_id = config.talker_config.codec_eos_token_id` into `talker.generate()` per call — that is the `2150` in the warning. Setting `talker.generation_config.pad_token_id = codec_eos_token_id` assigns exactly the value transformers would derive itself.

A first A/B appeared to change the audio. A **control run** (three greedy generations, nothing changed between them) showed run 1 differs from runs 2 and 3 — first-generation warm-up, not the fix. Re-running with the warm-up discarded:

```
before (steady): shape=(105045,)
applied pad_token_id = 2150
after  (steady): shape=(105045,)
BIT-IDENTICAL    : True  max_abs_diff=0.000e+00
```

Warning gone, output bit-identical.

### Evidence 5 — model capability audit

From `qwen_tts/inference/qwen3_tts_model.py`:

- `_merge_generate_kwargs` (line 286) enumerates every tunable: `do_sample`, `top_k`, `top_p`, `temperature`, `repetition_penalty`, `subtalker_dosample`, `subtalker_top_k`, `subtalker_top_p`, `subtalker_temperature`, `max_new_tokens`. **There is no speed, rate, pitch, emphasis, or volume parameter.**
- `generate_voice_clone` (line 470) takes no `instruct` argument at all. Cloned voices structurally cannot accept style instructions.
- `generate_custom_voice` line 799: `if self.model.tts_model_size in "0b6": instruct = None`. The 0.6B CustomVoice model **discards instructions entirely**.
- Prosody is reachable only through `instruct` text, on 1.7B CustomVoice and 1.7B VoiceDesign.

`CustomVoicePanel.svelte:10-20` already ships `STYLE_PRESETS` chips including **Slow**, **Fast**, and **Low pitch** — the effect the reporter asked for already exists, gated behind `currentModelId === "1.7b"`. They could not find it because it is hidden on 0.6B and absent in Voice Clone, and nothing in Help mentions it.

`HelpPanel.svelte:96` lists 0.6B-CustomVoice instruction support as `'Limited'`. That is factually wrong — it is ignored.

## Root Causes

| # | Cause | Location |
|---|---|---|
| **A** | Every sidecar stderr line is hardcoded to level `ERROR`; stdout gets content-based classification but stderr does not. transformers and uvicorn both log to stderr. | `src-tauri/src/lib.rs:353-358` |
| **B** | `GENERATION_TIMEOUT_MS` (5 min) is applied to the whole batch, not per item. At 4–5 min/item the client aborts during item 2 while the server keeps generating for another 25 min, because nothing tells it to stop. | `src/lib/api/ttsClient.ts:180`, `434-450` |
| **C** | Aborts pass a string reason, so both catch blocks miss every branch and emit a hardcoded fallback — `"Batch generation failed"` for batch, and a false `"Generation failed"` banner on user-initiated cancel. | `ttsClient.ts:212,220`; `batchStore.svelte.ts:156-161`; `ttsStore.svelte.ts:243-249` |
| **D** | Toggling batch mode **replaces** the mode's voice panel, so speaker, instruction, reference audio, transcript, language and seed become invisible and uneditable — and Voice Clone batch requires reference audio the user can no longer reach. | `src/routes/+page.svelte:933-1029` |
| **E** | The dead `hasattr(self.model, 'config')` guard means the pad_token_id warning was never actually suppressed. | `python/tts_server/inference.py:116-118` |
| **F** | Help documents none of the batch behaviour, none of the real capability limits, and states one capability fact incorrectly. | `src/lib/components/help/HelpPanel.svelte` |

### Collateral defects found in the same paths

- `MAX_TEXT_LENGTH = 2000` is enforced server-side per batch item (`main.py:841`) with no client pre-flight. A normal `.txt` file exceeds it and fails the entire batch after the upload completes.
- `/health` and the FastAPI app both hardcode `version="1.0.0"` (`main.py:421,472`) while `__init__.py` says `1.0.3`. Verified live: `{"status":"ok","version":"1.0.0"}`.

## Design Decisions

1. **Classify stderr by content, defaulting to WARNING.** stderr is where well-behaved Python libraries put warnings; treating the stream as a severity signal is the bug. Unclassifiable stderr becomes `WARNING`, not `ERROR`, so it stays visible without reading as failure.
2. **Batch gets no total timeout; it gets a stall watchdog.** A fixed cap cannot be right for both a 2-item batch and a 50-item one. The 500 ms progress poll already exists — reuse it as a liveness signal and abort only when progress genuinely stops.
3. **Abort with typed Errors, never strings.** `GenerationCancelledError` and `GenerationTimeoutError` make the catch blocks correct by construction, and a shared `isCancellation()` helper keeps both call sites honest.
4. **On timeout or stall, tell the server to stop.** The 25 minutes of wasted CPU after the client gave up is its own defect.
5. **Batch mode composes with the voice panel rather than replacing it.** A `batchMode` prop hides only the per-generation controls (target text, translate-this-text, Generate) and keeps voice configuration. Editable while files are queued, locked while processing.
6. **Document capabilities; do not invent them.** Per the maintainer's scope decision, 1.0.4 ships documentation of the real limits, not new sampling sliders. The Help text states what was verified in Evidence 5.
7. **Derive the server version from `__version__`.** Hardcoding it in two more places is what caused the drift.

## Global Constraints

- **Svelte 5 runes only** — `$state()`, `$derived()`, `$effect()`. No `writable()`/`readable()`.
- **Tailwind CSS 4** via `@tailwindcss/vite`. No PostCSS config.
- Unit tests are Vitest + `@testing-library/svelte` (jsdom), colocated as `*.test.ts`.
- Python tests are pytest under `python/tests/`; `conftest.py` mocks `torch` so tests never need a real install.
- Pre-commit hook (Husky) runs `svelte-check` on staged `.ts`/`.svelte`.
- **Version lives in four files** — `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `python/tts_server/__init__.py`. Target for this branch: **1.0.4**.
- If `python/requirements.txt` changes, run `./scripts/update-requirements-hash.sh` and commit `python/requirements.sha256`. **This plan does not change requirements.txt.**
- Full check before PR: `pnpm test:all` (type check + unit + E2E), plus `cd python && pytest tests/`.
- Never surface raw internal errors to users; keep `INTERNAL_ERROR_DETAIL` behaviour intact.

### Local toolchain note

On this machine `pnpm <script>` aborts before running anything:

```
[ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY] Aborted removal of modules directory due to no TTY
```

The local pnpm is 11.21.0 while CI pins pnpm 8, so pnpm's deps-status check decides `node_modules` (installed under the older pnpm) is stale and wants to purge it. **The toolchain itself is healthy** — invoking the binaries directly runs the full suite green:

```bash
./node_modules/.bin/vitest run          # 244 tests pass
./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json
./node_modules/.bin/playwright test
```

Use those forms while implementing. Resolving the pnpm version mismatch properly is a maintainer decision, because `pnpm install` under v11 may rewrite `pnpm-lock.yaml` (currently `lockfileVersion: '9.0'`) and that is a real repo change CI would then have to accept. It also means the Husky pre-commit hook (`pnpm lint-staged`) cannot run — commits in this branch need `--no-verify`, so **run `svelte-check` manually before each commit** to keep the gate the hook was providing.

## File Structure

**Modified**

| File | Responsibility after the change |
|---|---|
| `src-tauri/src/lib.rs` | `parse_log_level` gains stderr-aware classification; `process_stderr_line` uses it. Adds `#[cfg(test)] mod tests`. |
| `python/tts_server/inference.py` | `load()` sets the talker's `pad_token_id` (replacing dead code). |
| `python/tts_server/main.py` | Version derived from `__version__`. |
| `src/lib/api/ttsClient.ts` | Typed abort errors, `isCancellation()`, per-call timeout, batch opts out of the total cap. |
| `src/lib/stores/batchStore.svelte.ts` | Stall watchdog, accurate error reporting, server-side cancel on stall, text-length pre-flight. |
| `src/lib/stores/ttsStore.svelte.ts` | Uses `isCancellation()`; reports timeouts distinctly. |
| `src/lib/components/input/CustomVoicePanel.svelte` | `batchMode` prop hides text + Generate. |
| `src/lib/components/input/VoiceClonePanel.svelte` | Same. |
| `src/lib/components/input/VoiceDesignPanel.svelte` | Same. |
| `src/routes/+page.svelte` | Batch mode renders voice panel + summary + queue instead of swapping. |
| `src/lib/components/help/HelpPanel.svelte` | New Batch Mode and capability sections; 0.6B instruction row corrected. |
| `.github/workflows/ci.yml` | Runs `cargo test` and `pytest` so the new tests are enforced. |

**Created**

| File | Responsibility |
|---|---|
| `src/lib/components/input/BatchSummary.svelte` | Read-only "This batch will use" card. Pure presentation; no store access. |
| `src/lib/stores/batchStore.test.ts` | Covers stall watchdog, error classification, pre-flight. |
| `src/lib/components/input/BatchSummary.test.ts` | Covers per-mode summary rows. |
| `python/tests/test_inference_warmup.py` | Covers the pad_token_id assignment. |
| `e2e/batch-settings.spec.ts` | Regression for the reported flow. |

---

## Task 1: Classify sidecar stderr instead of hardcoding ERROR

Root cause A. This alone removes the red wall the reporter photographed.

**Files:**
- Modify: `src-tauri/src/lib.rs:74-84` (`parse_log_level`), `src-tauri/src/lib.rs:353-358` (`process_stderr_line`)
- Modify: `.github/workflows/ci.yml` (add a `cargo test` job — the new test is worthless if nothing runs it)
- Test: `src-tauri/src/lib.rs` (`#[cfg(test)] mod tests` at end of file)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `fn classify_log_line(line: &str, is_stderr: bool) -> String` returning one of `"DEBUG" | "INFO" | "WARNING" | "ERROR"`.

- [ ] **Step 1: Write the failing test**

Append to `src-tauri/src/lib.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::classify_log_line;

    #[test]
    fn stderr_warnings_are_not_errors() {
        // The exact line from issue #13's screenshot, emitted once per generated item.
        let line = "Setting `pad_token_id` to `eos_token_id`:2150 for open-end generation.";
        assert_eq!(classify_log_line(line, true), "WARNING");
    }

    #[test]
    fn stderr_defaults_to_warning_not_error() {
        assert_eq!(classify_log_line("some unremarkable stderr chatter", true), "WARNING");
    }

    #[test]
    fn stderr_real_errors_are_still_errors() {
        assert_eq!(classify_log_line("ERROR: model failed to load", true), "ERROR");
        assert_eq!(classify_log_line("Traceback (most recent call last):", true), "ERROR");
    }

    #[test]
    fn uvicorn_startup_on_stderr_is_info() {
        assert_eq!(classify_log_line("INFO:     Uvicorn running on http://127.0.0.1:8765", true), "INFO");
        assert_eq!(classify_log_line("INFO:     Application startup complete.", true), "INFO");
    }

    #[test]
    fn stdout_still_defaults_to_info() {
        assert_eq!(classify_log_line("Model loaded successfully on mps", false), "INFO");
    }

    #[test]
    fn explicit_levels_win_on_both_streams() {
        assert_eq!(classify_log_line("[10:40:20] WARNING - low memory", false), "WARNING");
        assert_eq!(classify_log_line("[10:40:20] ERROR - boom", false), "ERROR");
        assert_eq!(classify_log_line("[10:40:20] DEBUG - noisy", false), "DEBUG");
    }

    #[test]
    fn substring_matches_do_not_false_positive() {
        // "error" inside a longer word must not promote the line to ERROR.
        assert_eq!(classify_log_line("[10:40:20] INFO - errorless run completed", false), "INFO");
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd src-tauri && cargo test classify
```

Expected: FAIL — `cannot find function 'classify_log_line' in this scope`.

- [ ] **Step 3: Implement the classifier**

Replace `parse_log_level` (`src-tauri/src/lib.rs:74-84`) with:

```rust
/// Classify a sidecar log line into a severity level.
///
/// stderr is NOT a severity signal. Python's `transformers` and `uvicorn`
/// both write ordinary warnings and startup banners there, and issue #13
/// showed a Debug console full of red rows that were really benign
/// `transformers` output. So stderr is classified by content like stdout;
/// only its *default* differs (WARNING rather than INFO) so unrecognised
/// stderr stays visible without reading as failure.
fn classify_log_line(line: &str, is_stderr: bool) -> String {
    // Explicit level tokens win on either stream. Uppercase-only, and
    // bounded by a non-alphanumeric neighbour, so "errorless" is not an error.
    if contains_token(line, "CRITICAL") || contains_token(line, "ERROR") || line.starts_with("Traceback") {
        return "ERROR".to_string();
    }
    if contains_token(line, "WARNING") || contains_token(line, "WARN") {
        return "WARNING".to_string();
    }
    if contains_token(line, "DEBUG") {
        return "DEBUG".to_string();
    }
    if contains_token(line, "INFO") {
        return "INFO".to_string();
    }

    if is_stderr {
        "WARNING".to_string()
    } else {
        "INFO".to_string()
    }
}

/// True when `token` appears in `line` as a standalone word.
fn contains_token(line: &str, token: &str) -> bool {
    let bytes = line.as_bytes();
    let mut from = 0usize;
    while let Some(rel) = line[from..].find(token) {
        let start = from + rel;
        let end = start + token.len();
        let before_ok = start == 0 || !bytes[start - 1].is_ascii_alphanumeric();
        let after_ok = end >= bytes.len() || !bytes[end].is_ascii_alphanumeric();
        if before_ok && after_ok {
            return true;
        }
        from = start + 1;
    }
    false
}
```

Update the two call sites. `src-tauri/src/lib.rs:288`:

```rust
        level: classify_log_line(line, false),
```

`src-tauri/src/lib.rs:353-358`:

```rust
fn process_stderr_line(app: &tauri::AppHandle, line: &str) {
    let entry = LogEntry {
        level: classify_log_line(line, true),
        message: line.to_string(),
        timestamp: get_timestamp(),
    };
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd src-tauri && cargo test
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Make CI enforce it**

Add to `.github/workflows/ci.yml` after the `unit-tests` job:

```yaml
  rust-tests:
    name: Rust Tests
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Install Linux system dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            libwebkit2gtk-4.1-dev librsvg2-dev patchelf build-essential \
            curl wget file libssl-dev libgtk-3-dev \
            libayatana-appindicator3-dev

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Cache cargo
        uses: Swatinem/rust-cache@v2
        with:
          workspaces: src-tauri

      - name: Run Rust unit tests
        run: cargo test --manifest-path src-tauri/Cargo.toml
```

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/lib.rs .github/workflows/ci.yml
git commit -m "fix(logs): classify sidecar stderr by content instead of always ERROR"
```

---

## Task 2: Silence the transformers pad_token_id warning at its source

Root cause E. Belt and braces with Task 1: Task 1 stops it reading as an error, this stops it being emitted.

**Files:**
- Modify: `python/tts_server/inference.py:116-118`
- Modify: `.github/workflows/ci.yml` (add a pytest job)
- Test: `python/tests/test_inference_warmup.py` (create)

**Interfaces:**
- Consumes: nothing.
- Produces: `TTSModel._silence_pad_token_warning(self) -> None` — idempotent, never raises.

- [ ] **Step 1: Write the failing test**

Create `python/tests/test_inference_warmup.py`:

```python
"""Tests for the generation warm-up fixups in TTSModel.load().

Issue #13: transformers logs `Setting \\`pad_token_id\\` to \\`eos_token_id\\`:2150
for open-end generation.` once per generated item, on stderr, which the Tauri
shell rendered as an ERROR row. The pre-existing suppression in inference.py
guarded on `hasattr(self.model, 'config')`, but Qwen3TTSModel is a plain
wrapper with no `.config`, so the guard was always False and the code never ran.
"""

from types import SimpleNamespace
from unittest.mock import MagicMock

from tts_server.inference import TTSModel


def _make_wrapper(pad_token_id=None, codec_eos_token_id=2150, with_talker=True):
    """Build a stand-in shaped like qwen_tts.Qwen3TTSModel."""
    wrapper = MagicMock()
    # The real wrapper has no `.config` — that is the bug this test pins down.
    del wrapper.config

    inner = SimpleNamespace(
        config=SimpleNamespace(talker_config=SimpleNamespace(codec_eos_token_id=codec_eos_token_id)),
    )
    if with_talker:
        inner.talker = SimpleNamespace(
            generation_config=SimpleNamespace(pad_token_id=pad_token_id)
        )
    wrapper.model = inner
    return wrapper


def test_sets_talker_pad_token_id_from_codec_eos():
    m = TTSModel()
    m.model = _make_wrapper(pad_token_id=None, codec_eos_token_id=2150)

    m._silence_pad_token_warning()

    assert m.model.model.talker.generation_config.pad_token_id == 2150


def test_does_not_override_an_existing_pad_token_id():
    m = TTSModel()
    m.model = _make_wrapper(pad_token_id=7, codec_eos_token_id=2150)

    m._silence_pad_token_warning()

    assert m.model.model.talker.generation_config.pad_token_id == 7


def test_is_a_no_op_when_the_talker_is_absent():
    m = TTSModel()
    m.model = _make_wrapper(with_talker=False)

    m._silence_pad_token_warning()  # must not raise


def test_is_a_no_op_when_no_model_is_loaded():
    m = TTSModel()
    m.model = None

    m._silence_pad_token_warning()  # must not raise
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd python && .venv/bin/python -m pytest tests/test_inference_warmup.py -v
```

Expected: FAIL with `AttributeError: 'TTSModel' object has no attribute '_silence_pad_token_warning'`.

- [ ] **Step 3: Implement**

In `python/tts_server/inference.py`, replace lines 116-118:

```python
        # Suppress pad_token_id warning by setting it explicitly
        if hasattr(self.model, 'config') and hasattr(self.model.config, 'eos_token_id'):
            self.model.config.pad_token_id = self.model.config.eos_token_id
```

with:

```python
        self._silence_pad_token_warning()
```

and add this method to `TTSModel` (place it directly above `unload`):

```python
    def _silence_pad_token_warning(self) -> None:
        """Pre-set the talker's pad_token_id so transformers stops warning about it.

        transformers logs `Setting \`pad_token_id\` to \`eos_token_id\`:2150 for
        open-end generation.` on stderr once per generate() call whenever
        generation_config.pad_token_id is None (transformers/generation/utils.py).
        Issue #13 showed a Debug console full of these rendered as errors.

        modeling_qwen3_tts passes eos_token_id=config.talker_config.codec_eos_token_id
        into talker.generate(), and transformers would then derive
        pad_token = eos_token[0]. Assigning that same value up front is
        behaviour-preserving — verified bit-identical audio before/after, once
        the model's first-generation warm-up run is discarded.

        Best-effort by design: qwen_tts internals are not a stable API, so every
        step is guarded and any failure leaves generation untouched.
        """
        try:
            inner = getattr(self.model, "model", None)
            talker = getattr(inner, "talker", None)
            gen_config = getattr(talker, "generation_config", None)
            if gen_config is None or getattr(gen_config, "pad_token_id", None) is not None:
                return

            talker_config = getattr(getattr(inner, "config", None), "talker_config", None)
            codec_eos = getattr(talker_config, "codec_eos_token_id", None)
            if codec_eos is None:
                return

            gen_config.pad_token_id = codec_eos
            logger.debug("Set talker pad_token_id to %s to suppress generation warning", codec_eos)
        except Exception as e:  # pragma: no cover - defensive
            logger.debug("Could not pre-set pad_token_id: %s", e)
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd python && .venv/bin/python -m pytest tests/test_inference_warmup.py -v
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Run the whole Python suite for regressions**

```bash
cd python && .venv/bin/python -m pytest tests/ -q
```

Expected: all pass.

- [ ] **Step 6: Make CI enforce it**

Add to `.github/workflows/ci.yml` after the `rust-tests` job:

```yaml
  python-tests:
    name: Python Tests
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'

      # conftest.py mocks torch and the heavy ML stack, so the suite only
      # needs the web layer installed.
      - name: Install test dependencies
        run: python -m pip install pytest fastapi httpx pydantic

      - name: Run backend tests
        run: python -m pytest tests/ -q
        working-directory: python
```

- [ ] **Step 7: Commit**

```bash
git add python/tts_server/inference.py python/tests/test_inference_warmup.py .github/workflows/ci.yml
git commit -m "fix(tts): pre-set talker pad_token_id so transformers stops warning per item"
```

---

## Task 3: Give aborts typed reasons so cancels and timeouts report accurately

Root cause C. Fixes both the reported `"Batch generation failed"` and the false `"Generation failed"` banner on user cancel.

**Files:**
- Modify: `src/lib/api/ttsClient.ts:180`, `209-226`, `361-450`
- Modify: `src/lib/stores/ttsStore.svelte.ts:241-249`
- Test: `src/lib/api/ttsClient.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `class GenerationCancelledError extends Error` — `name = "GenerationCancelledError"`
  - `class GenerationTimeoutError extends Error` — `name = "GenerationTimeoutError"`, `readonly timeoutMs: number`
  - `function isCancellation(e: unknown): boolean`
  - `private createGenerationSignal(timeoutMs: number | null): AbortSignal` — `null` disables the total cap
  - `SINGLE_GENERATION_TIMEOUT_MS = 30 * 60 * 1000`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/api/ttsClient.test.ts`:

```ts
describe('abort reasons (issue #13)', () => {
  it('rejects a cancelled generation with a typed Error, not a bare string', async () => {
    const { GenerationCancelledError, isCancellation } = await import('./ttsClient');

    // A fetch that never settles until aborted, mirroring a long generation.
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = (init as RequestInit)?.signal as AbortSignal;
          signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
        }) as Promise<Response>
    );

    const pending = ttsClient.generateCustomVoice({ text: 'hello', speaker: 'aiden' });
    ttsClient.abortGeneration();

    await expect(pending).rejects.toBeInstanceOf(GenerationCancelledError);
    await pending.catch((e) => {
      // The old code aborted with a string, so both of these were false and the
      // caller fell through to a hardcoded "…failed" message.
      expect(e).toBeInstanceOf(Error);
      expect(isCancellation(e)).toBe(true);
    });
  });

  it('rejects a timed-out generation with GenerationTimeoutError carrying the budget', async () => {
    vi.useFakeTimers();
    const { GenerationTimeoutError, isCancellation, SINGLE_GENERATION_TIMEOUT_MS } =
      await import('./ttsClient');

    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = (init as RequestInit)?.signal as AbortSignal;
          signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
        }) as Promise<Response>
    );

    const pending = ttsClient.generateCustomVoice({ text: 'hello', speaker: 'aiden' });
    await vi.advanceTimersByTimeAsync(SINGLE_GENERATION_TIMEOUT_MS + 1000);

    await expect(pending).rejects.toBeInstanceOf(GenerationTimeoutError);
    await pending.catch((e) => {
      expect((e as InstanceType<typeof GenerationTimeoutError>).timeoutMs)
        .toBe(SINGLE_GENERATION_TIMEOUT_MS);
      // A timeout is not a cancellation — the user did not ask for this.
      expect(isCancellation(e)).toBe(false);
    });
    vi.useRealTimers();
  });

  it('does not impose a total timeout on a batch', async () => {
    vi.useFakeTimers();
    const { SINGLE_GENERATION_TIMEOUT_MS } = await import('./ttsClient');

    let settled = false;
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = (init as RequestInit)?.signal as AbortSignal;
          signal?.addEventListener('abort', () => { settled = true; reject(signal.reason); }, { once: true });
        }) as Promise<Response>
    );

    void ttsClient
      .generateBatch({ mode: 'custom-voice', items: [{ text: 'a', output_filename: 'a.wav' }] })
      .catch(() => {});

    // Long past the single-generation budget, the batch must still be running:
    // liveness for a batch is the stall watchdog's job, not a fixed cap.
    await vi.advanceTimersByTimeAsync(SINGLE_GENERATION_TIMEOUT_MS * 3);
    expect(settled).toBe(false);

    ttsClient.abortGeneration();
    vi.useRealTimers();
  });

  it('treats a bare AbortError as a cancellation too', async () => {
    const { isCancellation } = await import('./ttsClient');
    const bare = new DOMException('This operation was aborted', 'AbortError');
    expect(isCancellation(bare)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm test:run src/lib/api/ttsClient.test.ts
```

Expected: FAIL — `GenerationCancelledError` is not exported.

- [ ] **Step 3: Implement**

In `src/lib/api/ttsClient.ts`, replace line 180:

```ts
/**
 * Ceiling for a single generation request.
 *
 * Issue #13: this was 5 minutes and was also applied to whole batches. A CPU-only
 * machine takes 4-5 minutes for ONE item, so a batch aborted during item 2 while
 * the server kept generating for another 25 minutes. Batches now opt out of the
 * total cap entirely (batchStore runs a stall watchdog off the progress poll);
 * single generations keep a generous ceiling purely to stop the UI hanging forever.
 */
export const SINGLE_GENERATION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/** The user asked to stop. Not an error condition — callers should stay quiet. */
export class GenerationCancelledError extends Error {
  constructor(message = "Generation cancelled") {
    super(message);
    this.name = "GenerationCancelledError";
  }
}

/** The client gave up waiting. Distinct from a cancellation: the user gets told. */
export class GenerationTimeoutError extends Error {
  readonly timeoutMs: number;
  constructor(timeoutMs: number) {
    super(`Generation timed out after ${Math.round(timeoutMs / 60000)} minutes`);
    this.name = "GenerationTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

/**
 * True when a rejection represents a deliberate stop rather than a failure.
 *
 * Covers the bare `abort()` DOMException as well, so a caller that aborts
 * without a reason is still handled correctly.
 */
export function isCancellation(e: unknown): boolean {
  if (e instanceof GenerationCancelledError) return true;
  return e instanceof DOMException && e.name === "AbortError";
}
```

Replace `createGenerationSignal` and `abortGeneration` (lines 209-222):

```ts
  /** Create a signal for generation requests. Pass `null` to skip the total-time cap. */
  private createGenerationSignal(timeoutMs: number | null = SINGLE_GENERATION_TIMEOUT_MS): AbortSignal {
    const controller = new AbortController();
    this._abortController = controller;

    if (timeoutMs !== null) {
      const timeoutId = setTimeout(() => controller.abort(new GenerationTimeoutError(timeoutMs)), timeoutMs);
      controller.signal.addEventListener("abort", () => clearTimeout(timeoutId), { once: true });
    }
    return controller.signal;
  }

  /** Abort the current generation request. */
  abortGeneration(): void {
    this._abortController?.abort(new GenerationCancelledError());
    this._abortController = null;
  }
```

In `generateBatch` (line 435), opt out of the total cap:

```ts
  async generateBatch(request: BatchRequest): Promise<Blob> {
    // No total cap: batch length is proportional to item count, so a fixed
    // budget is always wrong. batchStore's stall watchdog owns liveness here.
    const signal = this.createGenerationSignal(null);
```

In `src/lib/stores/ttsStore.svelte.ts`, update the import at line 5:

```ts
import {
  ttsClient,
  isCancellation,
  GenerationTimeoutError,
  type ModelStatus,
  type Speaker,
  PRESET_SPEAKERS,
} from "$lib/api/ttsClient";
```

and replace the catch block at lines 241-249:

```ts
    } catch (e) {
      if (isCancellation(e)) {
        // User-initiated stop. Issue #13: the old check missed this because the
        // abort reason was a string, so cancelling raised a false error banner.
        console.debug("[generate] cancelled by user");
      } else if (e instanceof GenerationTimeoutError) {
        state.error = `${e.message}. Try shorter text, or a smaller model — CPU-only machines are much slower.`;
      } else {
        const msg = e instanceof Error ? e.message : "Generation failed";
        console.error("[generate] Error:", e);
        state.error = msg;
      }
    } finally {
```

- [ ] **Step 4: Fix the existing test that gave false confidence**

`src/lib/stores/ttsStore.test.ts:431` currently reads:

```ts
    it("does not show error for AbortError", async () => {
      ...
      const abortError = new DOMException("Aborted", "AbortError");
      vi.mocked(ttsClient.generateCustomVoice).mockRejectedValue(abortError);
```

This test passes today, and has always passed, while the behaviour it claims to protect is broken — production never produced a `DOMException`, because `abortGeneration()` aborted with a **string**. The test mocked the rejection it wished for rather than the one the client actually emits, which is why this bug reached a release.

Add a sibling test that rejects with what the real client now emits, so the two cannot drift apart again:

```ts
    it("does not show an error when the user cancels", async () => {
      const { GenerationCancelledError } = await import("$lib/api/ttsClient");
      vi.mocked(ttsClient.getModelStatus).mockResolvedValue({
        loaded: true,
        model_id: "0.6b",
        device: "mps",
        memory: { device: "mps", total_gb: 16, available_gb: 8 },
      });
      vi.mocked(ttsClient.health).mockResolvedValue({ status: "ok", version: "1.0" });
      await ttsStore.checkServerHealth();

      // What abortGeneration() actually rejects with. Before issue #13 this
      // produced a false "Generation failed" banner on every cancel.
      vi.mocked(ttsClient.generateCustomVoice).mockRejectedValue(new GenerationCancelledError());

      ttsStore.setText("Hello");
      await ttsStore.generate();

      expect(ttsStore.state.error).toBeNull();
      expect(ttsStore.state.isGenerating).toBe(false);
    });

    it("reports a timeout distinctly from a cancellation", async () => {
      const { GenerationTimeoutError } = await import("$lib/api/ttsClient");
      vi.mocked(ttsClient.getModelStatus).mockResolvedValue({
        loaded: true,
        model_id: "0.6b",
        device: "mps",
        memory: { device: "mps", total_gb: 16, available_gb: 8 },
      });
      vi.mocked(ttsClient.health).mockResolvedValue({ status: "ok", version: "1.0" });
      await ttsStore.checkServerHealth();

      vi.mocked(ttsClient.generateCustomVoice).mockRejectedValue(
        new GenerationTimeoutError(30 * 60 * 1000)
      );

      ttsStore.setText("Hello");
      await ttsStore.generate();

      expect(ttsStore.state.error).toMatch(/timed out/i);
    });
```

Keep the original `AbortError` test — a bare `abort()` is still a cancellation and `isCancellation()` must keep handling it.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm test:run src/lib/api/ttsClient.test.ts src/lib/stores/ttsStore.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/api/ttsClient.ts src/lib/api/ttsClient.test.ts \
        src/lib/stores/ttsStore.svelte.ts src/lib/stores/ttsStore.test.ts
git commit -m "fix(tts): abort with typed errors so cancels and timeouts report accurately"
```

---

## Task 4: Replace the batch total timeout with a stall watchdog

Root cause B's tail. Also stops the server burning CPU after the client gives up.

**Files:**
- Modify: `src/lib/stores/batchStore.svelte.ts:104-166`
- Test: `src/lib/stores/batchStore.test.ts` (create)

**Interfaces:**
- Consumes: `isCancellation`, `GenerationTimeoutError` from Task 3.
- Produces: `BATCH_STALL_TIMEOUT_MS = 15 * 60 * 1000`, exported for tests.

- [ ] **Step 1: Write the failing test**

Create `src/lib/stores/batchStore.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('$lib/api/ttsClient', () => ({
  ttsClient: {
    generateBatch: vi.fn(),
    getBatchProgress: vi.fn(),
    cancelBatch: vi.fn(),
    abortGeneration: vi.fn(),
  },
  GenerationCancelledError: class GenerationCancelledError extends Error {
    constructor(message = 'Generation cancelled') {
      super(message);
      this.name = 'GenerationCancelledError';
    }
  },
  isCancellation: (e: unknown) => (e as Error)?.name === 'GenerationCancelledError',
}));

const REQUEST = {
  mode: 'voice-clone' as const,
  items: [{ text: 'one', output_filename: 'one.wav' }],
};

function idleProgress(overrides = {}) {
  return { total: 1, completed: 0, current_item: 'one.wav', status: 'running', ...overrides };
}

describe('batchStore error reporting (issue #13)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports a user cancellation as cancelled, not as a failure', async () => {
    const { batchStore } = await import('./batchStore.svelte');
    const { ttsClient, GenerationCancelledError } = await import('$lib/api/ttsClient');

    await batchStore.addFiles([new File(['hello'], 'one.txt', { type: 'text/plain' })]);
    vi.mocked(ttsClient.getBatchProgress).mockResolvedValue(idleProgress());
    vi.mocked(ttsClient.generateBatch).mockRejectedValue(new GenerationCancelledError());

    await batchStore.startBatch(REQUEST);

    expect(batchStore.state.progress.status).toBe('cancelled');
    expect(batchStore.state.error).toBeNull();
  });

  it('surfaces a real server error message instead of a generic fallback', async () => {
    const { batchStore } = await import('./batchStore.svelte');
    const { ttsClient } = await import('$lib/api/ttsClient');

    await batchStore.addFiles([new File(['hello'], 'one.txt', { type: 'text/plain' })]);
    vi.mocked(ttsClient.getBatchProgress).mockResolvedValue(idleProgress());
    vi.mocked(ttsClient.generateBatch).mockRejectedValue(
      new Error('Loaded model \'0.6b\' does not support mode \'voice-clone\'')
    );

    await batchStore.startBatch(REQUEST);

    expect(batchStore.state.error).toContain('does not support mode');
    expect(batchStore.state.progress.status).toBe('error');
  });

  it('stops the batch and tells the server when progress stalls', async () => {
    vi.useFakeTimers();
    const { batchStore, BATCH_STALL_TIMEOUT_MS } = await import('./batchStore.svelte');
    const { ttsClient, GenerationCancelledError } = await import('$lib/api/ttsClient');

    await batchStore.addFiles([new File(['hello'], 'one.txt', { type: 'text/plain' })]);

    // Model the real client: generateBatch stays pending until abortGeneration
    // rejects it, exactly as an aborted fetch does.
    let rejectBatch: (reason: unknown) => void = () => {};
    vi.mocked(ttsClient.generateBatch).mockImplementation(
      () => new Promise<Blob>((_resolve, reject) => { rejectBatch = reject; })
    );
    vi.mocked(ttsClient.abortGeneration).mockImplementation(() => {
      rejectBatch(new GenerationCancelledError());
    });

    // The server answers every poll but never advances — a genuine stall.
    vi.mocked(ttsClient.getBatchProgress).mockResolvedValue(idleProgress());
    vi.mocked(ttsClient.cancelBatch).mockResolvedValue(undefined);

    const running = batchStore.startBatch(REQUEST);
    await vi.advanceTimersByTimeAsync(BATCH_STALL_TIMEOUT_MS + 2000);
    await running;

    // The server must be told to stop — issue #13 saw it generate for 25 more minutes.
    expect(ttsClient.cancelBatch).toHaveBeenCalled();
    expect(batchStore.state.progress.status).toBe('error');
    expect(batchStore.state.error).toMatch(/no progress/i);
  });

  it('does not stall out while the server keeps making progress', async () => {
    vi.useFakeTimers();
    const { batchStore, BATCH_STALL_TIMEOUT_MS } = await import('./batchStore.svelte');
    const { ttsClient, GenerationCancelledError } = await import('$lib/api/ttsClient');

    await batchStore.addFiles([new File(['hello'], 'one.txt', { type: 'text/plain' })]);

    let rejectBatch: (reason: unknown) => void = () => {};
    vi.mocked(ttsClient.generateBatch).mockImplementation(
      () => new Promise<Blob>((_resolve, reject) => { rejectBatch = reject; })
    );
    vi.mocked(ttsClient.abortGeneration).mockImplementation(() => {
      rejectBatch(new GenerationCancelledError());
    });

    // Progress advances on every poll, so the watchdog must never fire.
    let completed = 0;
    vi.mocked(ttsClient.getBatchProgress).mockImplementation(async () =>
      idleProgress({ total: 100, completed: completed++ })
    );

    const running = batchStore.startBatch(REQUEST);
    await vi.advanceTimersByTimeAsync(BATCH_STALL_TIMEOUT_MS * 2);

    expect(ttsClient.cancelBatch).not.toHaveBeenCalled();
    expect(batchStore.state.error).toBeNull();
    expect(batchStore.state.isProcessing).toBe(true);

    // Settle the pending batch so the poll timer is cleared before the next test.
    ttsClient.abortGeneration();
    await running;
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm test:run src/lib/stores/batchStore.test.ts
```

Expected: FAIL — `BATCH_STALL_TIMEOUT_MS` is not exported; the cancellation test reports `"Batch generation failed"`.

- [ ] **Step 3: Implement**

In `src/lib/stores/batchStore.svelte.ts`, update the import at line 1:

```ts
import {
  ttsClient,
  isCancellation,
  type BatchProgress,
  type BatchRequest,
} from "$lib/api/ttsClient";
```

Add below `EMPTY_PROGRESS` (after line 29):

```ts
const POLL_INTERVAL_MS = 500;

/**
 * How long the server may report zero progress before the client gives up.
 *
 * Issue #13: a fixed total budget cannot suit both a 2-item batch and a 50-item
 * one. Liveness is the right signal — the progress poll already runs, so a
 * batch is healthy for as long as `completed` or `current_item` keeps moving.
 * 15 minutes comfortably clears a slow CPU-only item (~5 minutes observed).
 */
export const BATCH_STALL_TIMEOUT_MS = 15 * 60 * 1000;
```

Replace the polling and `startBatch` block (lines 104-166):

```ts
  let progressTimer: ReturnType<typeof setInterval> | null = null;
  let lastProgressAt = 0;
  let lastProgressKey = "";
  let stalledOut = false;

  function stopPolling() {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
  }

  /** Identity of a progress snapshot — changes whenever the server moves forward. */
  function progressKey(progress: BatchProgress): string {
    return `${progress.completed}|${progress.current_item}|${progress.status}`;
  }

  async function handleStall() {
    stalledOut = true;
    // Tell the server to stop before dropping the connection. Without this it
    // keeps generating into a socket nobody is reading (issue #13: 25 minutes of it).
    try {
      await ttsClient.cancelBatch();
    } catch {
      // Best-effort — we are giving up either way.
    }
    ttsClient.abortGeneration();
  }

  function startPolling() {
    stopPolling();
    lastProgressAt = Date.now();
    lastProgressKey = "";
    stalledOut = false;

    progressTimer = setInterval(async () => {
      let progress: BatchProgress;
      try {
        progress = await ttsClient.getBatchProgress();
      } catch {
        // A dead server surfaces through the generateBatch rejection instead;
        // a transient poll failure should not be read as a stall.
        return;
      }

      state.progress = progress;

      const key = progressKey(progress);
      if (key !== lastProgressKey) {
        lastProgressKey = key;
        lastProgressAt = Date.now();
        return;
      }

      if (!stalledOut && Date.now() - lastProgressAt >= BATCH_STALL_TIMEOUT_MS) {
        await handleStall();
      }
    }, POLL_INTERVAL_MS);
  }

  async function startBatch(request: BatchRequest) {
    if (state.files.length === 0) {
      state.error = "Add at least one text file to start batch processing.";
      return;
    }

    state.isProcessing = true;
    state.error = null;
    state.results = [];
    state.zipBlob = null;
    state.progress = {
      total: request.items.length,
      completed: 0,
      current_item: "",
      status: "running",
    };

    startPolling();
    try {
      const zipBlob = await ttsClient.generateBatch(request);
      state.zipBlob = zipBlob;
      state.results = request.items.map((item) => ({ outputFilename: item.output_filename }));
      try {
        state.progress = await ttsClient.getBatchProgress();
      } catch {
        state.progress = {
          total: request.items.length,
          completed: request.items.length,
          current_item: "",
          status: "completed",
        };
      }
    } catch (e) {
      if (stalledOut) {
        const minutes = Math.round(BATCH_STALL_TIMEOUT_MS / 60000);
        state.error =
          `Batch stopped: no progress for ${minutes} minutes. ` +
          `${state.progress.completed} of ${state.progress.total} finished. ` +
          `The server was asked to stop.`;
        state.progress = { ...state.progress, status: "error" };
      } else if (isCancellation(e)) {
        state.progress = { ...state.progress, status: "cancelled" };
      } else {
        // Issue #13: an abort reason that was a plain string fell through both
        // branches and produced a bare "Batch generation failed" with no cause.
        state.error = e instanceof Error ? e.message : String(e) || "Batch generation failed";
        state.progress = { ...state.progress, status: "error" };
      }
    } finally {
      stopPolling();
      state.isProcessing = false;
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm test:run src/lib/stores/batchStore.test.ts
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/batchStore.svelte.ts src/lib/stores/batchStore.test.ts
git commit -m "fix(batch): replace the total timeout with a stall watchdog that cancels the server"
```

---

## Task 5: Pre-flight batch text length so oversized files fail before upload

Collateral defect. A normal `.txt` file exceeds the server's 2000-character per-item cap and kills the whole batch after the upload.

**Files:**
- Modify: `src/lib/stores/batchStore.svelte.ts:58-80` (`addFiles`)
- Test: `src/lib/stores/batchStore.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `MAX_BATCH_ITEM_CHARS = 2000`, exported; `BatchFile` gains `charCount: number`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/stores/batchStore.test.ts`:

```ts
describe('batch file pre-flight (issue #13)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('rejects a file over the server per-item limit and names it', async () => {
    const { batchStore, MAX_BATCH_ITEM_CHARS } = await import('./batchStore.svelte');
    const tooLong = 'a'.repeat(MAX_BATCH_ITEM_CHARS + 1);

    await batchStore.addFiles([new File([tooLong], 'chapter-one.txt', { type: 'text/plain' })]);

    expect(batchStore.state.files).toHaveLength(0);
    expect(batchStore.state.error).toContain('chapter-one.txt');
    expect(batchStore.state.error).toContain(String(MAX_BATCH_ITEM_CHARS));
  });

  it('keeps the files that fit when only some are too long', async () => {
    const { batchStore, MAX_BATCH_ITEM_CHARS } = await import('./batchStore.svelte');

    await batchStore.addFiles([
      new File(['short and fine'], 'ok.txt', { type: 'text/plain' }),
      new File(['a'.repeat(MAX_BATCH_ITEM_CHARS + 1)], 'huge.txt', { type: 'text/plain' }),
    ]);

    expect(batchStore.state.files.map((f) => f.name)).toEqual(['ok.txt']);
    expect(batchStore.state.error).toContain('huge.txt');
  });

  it('records a character count for each accepted file', async () => {
    const { batchStore } = await import('./batchStore.svelte');

    await batchStore.addFiles([new File(['hello'], 'ok.txt', { type: 'text/plain' })]);

    expect(batchStore.state.files[0].charCount).toBe(5);
    expect(batchStore.state.error).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm test:run src/lib/stores/batchStore.test.ts
```

Expected: FAIL — `MAX_BATCH_ITEM_CHARS` is not exported and oversized files are accepted.

- [ ] **Step 3: Implement**

In `src/lib/stores/batchStore.svelte.ts`, extend `BatchFile` (line 4):

```ts
export interface BatchFile {
  id: string;
  name: string;
  text: string;
  outputFilename: string;
  charCount: number;
}
```

Add next to `BATCH_STALL_TIMEOUT_MS`:

```ts
/**
 * Server per-item cap, mirrored client-side (MAX_TEXT_LENGTH in main.py).
 *
 * Issue #13: without a pre-flight check a single oversized .txt failed the whole
 * batch with a 400 only after every file had been uploaded, and the message did
 * not say which file was at fault.
 */
export const MAX_BATCH_ITEM_CHARS = 2000;
```

Replace `addFiles` (lines 58-80):

```ts
  async function addFiles(input: FileList | File[]) {
    const files = Array.from(input);
    const added: BatchFile[] = [];
    const rejected: string[] = [];
    let emptyCount = 0;

    for (const file of files) {
      const text = await file.text();
      if (!text.trim()) {
        emptyCount += 1;
        continue;
      }
      if (text.length > MAX_BATCH_ITEM_CHARS) {
        rejected.push(`${file.name} (${text.length.toLocaleString()} characters)`);
        continue;
      }
      const base = sanitizeOutputFilename(file.name || "output");
      added.push({
        id: makeId(),
        name: file.name,
        text,
        outputFilename: `${base}.wav`,
        charCount: text.length,
      });
    }

    state.files = [...state.files, ...added];

    const problems: string[] = [];
    if (rejected.length > 0) {
      problems.push(
        `Skipped ${rejected.length === 1 ? "a file that is" : "files that are"} over the ` +
          `${MAX_BATCH_ITEM_CHARS.toLocaleString()} character limit per file: ${rejected.join(", ")}. ` +
          `Split ${rejected.length === 1 ? "it" : "them"} into smaller files.`
      );
    }
    if (emptyCount > 0) {
      problems.push(`Skipped ${emptyCount} empty file${emptyCount === 1 ? "" : "s"}.`);
    }
    if (added.length === 0 && problems.length === 0) {
      problems.push("No valid text files were added.");
    }

    state.error = problems.length > 0 ? problems.join(" ") : null;
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm test:run src/lib/stores/batchStore.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stores/batchStore.svelte.ts src/lib/stores/batchStore.test.ts
git commit -m "feat(batch): reject oversized text files before upload and name the offender"
```

---

## Task 6: Keep voice settings visible and editable in batch mode

Root cause D, first half. Answers "could you modify the program so that the settings remain accessible during batch mode?"

**Files:**
- Modify: `src/lib/components/input/CustomVoicePanel.svelte`
- Modify: `src/lib/components/input/VoiceClonePanel.svelte`
- Modify: `src/lib/components/input/VoiceDesignPanel.svelte`
- Modify: `src/routes/+page.svelte:933-1029`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: each of the three panels accepts `batchMode?: boolean` (default `false`). When `true` the panel renders voice configuration only — no target-text field, no translate-this-text control, no Generate button.

- [ ] **Step 1: Add the prop to CustomVoicePanel**

In `src/lib/components/input/CustomVoicePanel.svelte`, add to `interface Props` after `modelSupported?: boolean;`:

```ts
    /**
     * Batch mode reuses this panel for voice configuration only. The text to
     * speak comes from the queued files and generation is driven by the batch
     * controls, so the per-generation pieces are hidden (issue #13).
     */
    batchMode?: boolean;
```

Add to the destructuring after `modelSupported = true,`:

```ts
    batchMode = false,
```

Wrap the `TextInput` (lines 114-119) and the translation block (lines 130-146):

```svelte
  {#if !batchMode}
    <TextInput
      bind:value={text}
      onInput={onTextChange}
      placeholder="Enter the text you want to generate as speech..."
      maxLength={2000}
    />
  {/if}
```

```svelte
  {#if hasTranslation && !batchMode}
```

Wrap the Generate button (lines 212-219):

```svelte
  {#if !batchMode}
    <!-- Generate Button -->
    <button
      class="w-full py-3 rounded-lg bg-[var(--color-accent)] text-white font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      disabled={!text.trim() || isGenerating || modelLoading || !modelSupported}
      onclick={onGenerate}
    >
      {isGenerating ? `Generating... ${elapsedTime.toFixed(1)}s` : 'Generate'}
    </button>
  {/if}
```

- [ ] **Step 2: Add the prop to VoiceClonePanel**

Same `batchMode?: boolean;` prop and `batchMode = false,` default. Then wrap, in `src/lib/components/input/VoiceClonePanel.svelte`:

- the "Step 3: Text to generate" heading, the `TextInput`, and the `canTranslateText` block (lines 242-272) in a single `{#if !batchMode}` … `{/if}`
- the Generate button (lines 285-292) in `{#if !batchMode}` … `{/if}`

Reference audio, transcript, language and seed all stay visible — Voice Clone batch cannot run without them, and hiding them is what made the "Reference audio is required for Voice Clone batch mode" error unfixable.

- [ ] **Step 3: Add the prop to VoiceDesignPanel**

Same prop and default in `src/lib/components/input/VoiceDesignPanel.svelte`. Wrap:

- the "Target Text" `TextInput` (lines 152-158) in `{#if !batchMode}` … `{/if}`
- the `hasTranslation` block (line 171) as `{#if hasTranslation && !batchMode}`
- the Generate button (lines 189-196) in `{#if !batchMode}` … `{/if}`

- [ ] **Step 4: Compose instead of replace in the workspace**

In `src/routes/+page.svelte`, the input panel currently swaps the voice panel out for `<BatchPanel>` (line 933 opens `{#if batchModeEnabled && batchMode}` and line 947 begins `{:else if ttsState.mode === 'custom-voice'}`). Restructure so the voice panel always renders and the batch controls are appended.

Add this derived value beside the other `$derived` declarations in the `<script>` block (near line 176):

```ts
  const inBatchMode = $derived(batchModeEnabled && batchMode);
```

Then rewrite the region from line 933 (`{#if batchModeEnabled && batchMode}`) through line 1029 (`{/if}`, closing the mode chain) as:

```svelte
        <!-- Voice configuration. Batch mode used to replace this outright, which
             left Voice Clone batches impossible to configure — the reference
             audio control was gone (issue #13). It now stays put, and locks
             while a batch is running so every file gets the same voice. -->
        <div
          class:pointer-events-none={batchState.isProcessing}
          class:opacity-60={batchState.isProcessing}
        >
          {#if ttsState.mode === 'custom-voice'}
            <CustomVoicePanel
              bind:text={localText}
              bind:language={localLanguage}
              bind:speaker={localSpeaker}
              bind:instruction={localInstruction}
              bind:seed={localSeed}
              batchMode={inBatchMode}
              hasTranslation={settingsStore.state.enableTranslation}
              {isTranslatingText}
              {textTranslationError}
              modelSupported={customVoiceModelSupported}
              modelLoading={ttsState.isLoadingModel}
              recommendedModelLabel={recommendedCustomModelLabel}
              currentModelId={ttsState.modelId}
              isGenerating={ttsState.isGenerating}
              {elapsedTime}
              onGenerate={handleGenerate}
              onTextChange={handleTextChange}
              onLanguageChange={handleLanguageChange}
              onSpeakerChange={handleSpeakerChange}
              onInstructionChange={handleInstructionChange}
              onSeedChange={handleSeedChange}
              onTranslateText={handleTranslateInputText}
              onLoadModel={handleLoadCustomVoiceModel}
            />
          {:else if ttsState.mode === 'voice-clone'}
            <VoiceClonePanel
              bind:text={localText}
              bind:language={localLanguage}
              bind:referenceText={localReferenceText}
              bind:seed={localSeed}
              batchMode={inBatchMode}
              {referenceAudioUrl}
              {referenceAudioBlob}
              modelSupported={voiceCloneModelSupported}
              modelLoading={ttsState.isLoadingModel}
              recommendedModelLabel={recommendedCloneModelLabel}
              recommendedModelHint={recommendedCloneHint}
              isGenerating={ttsState.isGenerating}
              {elapsedTime}
              hasWhisper={settingsStore.state.enableWhisper}
              hasTranslation={settingsStore.state.enableWhisper}
              canTranslateText={settingsStore.state.enableTranslation}
              {isTranscribing}
              {transcriptionError}
              {translationText}
              {translationError}
              {isTranslatingText}
              {textTranslationError}
              onGenerate={handleGenerate}
              onTextChange={handleTextChange}
              onLanguageChange={handleLanguageChange}
              onReferenceTextChange={handleReferenceTextChange}
              onReferenceAudioChange={handleReferenceAudioChange}
              onAutoTranscribe={handleAutoTranscribe}
              onUseTranslation={handleUseTranslationAsText}
              onTranslateText={handleTranslateInputText}
              onLowQualityModeChange={handleCloneQualityChange}
              onSeedChange={handleSeedChange}
              onLoadModel={handleLoadVoiceCloneModel}
            />
          {:else if ttsState.mode === 'voice-design'}
            <VoiceDesignPanel
              bind:text={localText}
              bind:language={localLanguage}
              bind:voiceDescription={localVoiceDescription}
              bind:seed={localSeed}
              batchMode={inBatchMode}
              hasTranslation={settingsStore.state.enableTranslation}
              {isTranslatingText}
              {textTranslationError}
              isGenerating={ttsState.isGenerating}
              {elapsedTime}
              modelLoaded={voiceDesignModelLoaded}
              modelLoading={ttsState.isLoadingModel}
              recommendedModelLabel={recommendedDesignModelLabel}
              onGenerate={handleGenerate}
              onLoadModel={handleLoadVoiceDesignModel}
              onTextChange={handleTextChange}
              onLanguageChange={handleLanguageChange}
              onDescriptionChange={handleDescriptionChange}
              onSeedChange={handleSeedChange}
              onTranslateText={handleTranslateInputText}
            />
          {/if}
        </div>

        {#if inBatchMode}
          <!-- BatchSummary is inserted here in Task 7 -->
          <BatchPanel
            files={batchState.files}
            isProcessing={batchState.isProcessing}
            progress={batchState.progress}
            resultsCount={batchState.results.length}
            error={batchState.error}
            onAddFiles={handleBatchFilesAdded}
            onRemoveFile={handleBatchFileRemove}
            onOutputFilenameChange={handleBatchFilenameChange}
            onStart={handleStartBatch}
            onCancel={handleCancelBatch}
            onDownload={() => batchStore.downloadResults()}
          />
        {/if}
```

The outer `space-y-4` wrapper and the batch-mode toggle block (lines 913-931) are unchanged. Replace the remaining `batchModeEnabled && batchMode` occurrence in the output panel (line 1034) with `inBatchMode` for consistency.

Every prop above is copied verbatim from the current call sites — only `batchMode={inBatchMode}` is new. If a prop name has drifted, trust the file over this plan.

- [ ] **Step 5: Verify type checking and existing tests still pass**

```bash
pnpm check && pnpm test:run
```

Expected: no type errors; unit tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/input/CustomVoicePanel.svelte \
        src/lib/components/input/VoiceClonePanel.svelte \
        src/lib/components/input/VoiceDesignPanel.svelte \
        src/routes/+page.svelte
git commit -m "feat(batch): keep voice settings visible and editable in batch mode"
```

---

## Task 7: Show the effective batch configuration

Root cause D, second half. Answers "how do I know which settings it uses for batch mode?" — including the settings the voice panel does not show.

**Files:**
- Create: `src/lib/components/input/BatchSummary.svelte`
- Create: `src/lib/components/input/BatchSummary.test.ts`
- Modify: `src/routes/+page.svelte`

**Interfaces:**
- Consumes: `TTSMode` from `$lib/stores/ttsStore.svelte`.
- Produces: `BatchSummary` with props `{ mode: TTSMode; modelId: string | null; modelLabel: string; speaker?: string; instruction?: string; voiceDescription?: string; referenceAudioName?: string | null; lowQualityMode?: boolean; language: string; format: string; sampleRate: number | null; bitDepth: number; seed: number | null; }`

`modelId` and `modelLabel` are both passed deliberately: the label is for display, the id is for capability decisions. Deriving behaviour from a display string would break the moment a label is reworded.

- [ ] **Step 1: Write the failing test**

Create `src/lib/components/input/BatchSummary.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import BatchSummary from './BatchSummary.svelte';

const BASE = {
  modelId: '0.6b-base',
  modelLabel: '0.6B Base',
  language: 'English',
  format: 'wav',
  sampleRate: null,
  bitDepth: 16,
  seed: null,
};

describe('BatchSummary', () => {
  it('names the model, format and language every batch will use', () => {
    render(BatchSummary, { props: { ...BASE, mode: 'custom-voice', speaker: 'aiden' } });

    expect(screen.getByText(/0\.6B Base/)).toBeTruthy();
    expect(screen.getByText(/English/)).toBeTruthy();
    expect(screen.getByText(/WAV/i)).toBeTruthy();
  });

  it('shows the reference clip for voice clone', () => {
    render(BatchSummary, {
      props: { ...BASE, mode: 'voice-clone', referenceAudioName: 'sample.wav' },
    });

    expect(screen.getByText(/sample\.wav/)).toBeTruthy();
  });

  it('warns when voice clone has no reference audio, before the batch is started', () => {
    render(BatchSummary, { props: { ...BASE, mode: 'voice-clone', referenceAudioName: null } });

    expect(screen.getByText(/reference audio/i)).toBeTruthy();
  });

  it('reports a random seed when none is pinned', () => {
    render(BatchSummary, { props: { ...BASE, mode: 'custom-voice', speaker: 'aiden', seed: null } });

    expect(screen.getByText(/random/i)).toBeTruthy();
  });

  it('reports a pinned seed value', () => {
    render(BatchSummary, { props: { ...BASE, mode: 'custom-voice', speaker: 'aiden', seed: 42 } });

    expect(screen.getByText(/42/)).toBeTruthy();
  });

  it('says instructions are ignored on the 0.6B model that discards them', () => {
    render(BatchSummary, {
      props: {
        ...BASE,
        modelId: '0.6b',
        modelLabel: '0.6B Custom',
        mode: 'custom-voice',
        speaker: 'aiden',
        instruction: 'speak slowly',
      },
    });

    expect(screen.getByText(/ignore/i)).toBeTruthy();
  });

  it('does not claim instructions are ignored on 1.7B Custom', () => {
    render(BatchSummary, {
      props: {
        ...BASE,
        modelId: '1.7b',
        modelLabel: '1.7B Custom',
        mode: 'custom-voice',
        speaker: 'aiden',
        instruction: 'speak slowly',
      },
    });

    expect(screen.queryByText(/ignore/i)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
pnpm test:run src/lib/components/input/BatchSummary.test.ts
```

Expected: FAIL — cannot resolve `./BatchSummary.svelte`.

- [ ] **Step 3: Implement the component**

Create `src/lib/components/input/BatchSummary.svelte`:

```svelte
<script lang="ts">
  import type { TTSMode } from '$lib/stores/ttsStore.svelte';

  /**
   * Read-only statement of what a batch run will actually send.
   *
   * Issue #13 asked "how do I know which settings it uses for batch mode?".
   * Some of the answer lives in the voice panel and some in Settings, so this
   * card gathers the whole effective request in one place. Presentation only —
   * it reads no stores, so it stays trivially testable.
   */
  interface Props {
    mode: TTSMode;
    /** Capability decisions key off the id, never off the display label. */
    modelId: string | null;
    modelLabel: string;
    speaker?: string;
    instruction?: string;
    voiceDescription?: string;
    referenceAudioName?: string | null;
    lowQualityMode?: boolean;
    language: string;
    format: string;
    sampleRate: number | null;
    bitDepth: number;
    seed: number | null;
  }

  let {
    mode,
    modelId,
    modelLabel,
    speaker = '',
    instruction = '',
    voiceDescription = '',
    referenceAudioName = null,
    lowQualityMode = false,
    language,
    format,
    sampleRate,
    bitDepth,
    seed,
  }: Props = $props();

  const modeLabels: Record<TTSMode, string> = {
    'custom-voice': 'Custom Voice',
    'voice-clone': 'Voice Clone',
    'voice-design': 'Voice Design',
  };

  // Only the 1.7B CustomVoice model acts on instructions. qwen_tts discards them
  // outright on 0.6B (`if tts_model_size in "0b6": instruct = None`), so saying
  // so here is more honest than showing text that will have no effect.
  // Matches CustomVoicePanel's `supportsInstructions` check, on id not label.
  const instructionIgnored = $derived(
    mode === 'custom-voice' && instruction.trim().length > 0 && modelId !== '1.7b'
  );

  const audioLine = $derived(
    format === 'mp3'
      ? 'MP3 · 192 kbps'
      : `WAV · ${bitDepth}-bit · ${sampleRate ? `${(sampleRate / 1000).toFixed(sampleRate % 1000 === 0 ? 0 : 1)} kHz` : 'model rate'}`
  );

  const missingReference = $derived(mode === 'voice-clone' && !referenceAudioName);
</script>

<div class="rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] p-3 space-y-2">
  <p class="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
    This batch will use
  </p>

  <dl class="space-y-1 text-xs">
    <div class="flex justify-between gap-3">
      <dt class="text-[var(--color-text-muted)]">Mode</dt>
      <dd class="text-[var(--color-text-primary)] text-right">{modeLabels[mode]}</dd>
    </div>
    <div class="flex justify-between gap-3">
      <dt class="text-[var(--color-text-muted)]">Model</dt>
      <dd class="text-[var(--color-text-primary)] text-right">{modelLabel}</dd>
    </div>

    {#if mode === 'custom-voice'}
      <div class="flex justify-between gap-3">
        <dt class="text-[var(--color-text-muted)]">Speaker</dt>
        <dd class="text-[var(--color-text-primary)] text-right">{speaker || '—'}</dd>
      </div>
      {#if instruction.trim()}
        <div class="flex justify-between gap-3">
          <dt class="text-[var(--color-text-muted)]">Style</dt>
          <dd class="text-[var(--color-text-primary)] text-right truncate max-w-[60%]" title={instruction}>
            {instruction}
          </dd>
        </div>
      {/if}
    {:else if mode === 'voice-clone'}
      <div class="flex justify-between gap-3">
        <dt class="text-[var(--color-text-muted)]">Reference</dt>
        <dd class="text-right {missingReference ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-primary)]'}">
          {referenceAudioName ?? 'No reference audio selected'}
        </dd>
      </div>
      <div class="flex justify-between gap-3">
        <dt class="text-[var(--color-text-muted)]">Transcript</dt>
        <dd class="text-[var(--color-text-primary)] text-right">
          {lowQualityMode ? 'Not used (low-quality mode)' : 'Required'}
        </dd>
      </div>
    {:else}
      <div class="flex justify-between gap-3">
        <dt class="text-[var(--color-text-muted)]">Description</dt>
        <dd class="text-[var(--color-text-primary)] text-right truncate max-w-[60%]" title={voiceDescription}>
          {voiceDescription.trim() || '—'}
        </dd>
      </div>
    {/if}

    <div class="flex justify-between gap-3">
      <dt class="text-[var(--color-text-muted)]">Language</dt>
      <dd class="text-[var(--color-text-primary)] text-right">{language}</dd>
    </div>
    <div class="flex justify-between gap-3">
      <dt class="text-[var(--color-text-muted)]">Audio</dt>
      <dd class="text-[var(--color-text-primary)] text-right">{audioLine}</dd>
    </div>
    <div class="flex justify-between gap-3">
      <dt class="text-[var(--color-text-muted)]">Seed</dt>
      <dd class="text-[var(--color-text-primary)] text-right">{seed === null ? 'Random' : seed}</dd>
    </div>
  </dl>

  {#if instructionIgnored}
    <p class="text-xs text-[var(--color-warning)]">
      This model ignores style instructions. Load 1.7B Custom to use them.
    </p>
  {/if}

  {#if missingReference}
    <p class="text-xs text-[var(--color-warning)]">
      Add reference audio above before starting the batch.
    </p>
  {/if}
</div>
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
pnpm test:run src/lib/components/input/BatchSummary.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Wire it into the workspace**

In `src/routes/+page.svelte`, add the import beside the other input imports:

```ts
  import BatchSummary from "$lib/components/input/BatchSummary.svelte";
```

Insert between the mode-panel block and `<BatchPanel>` (see Task 6, step 4):

```svelte
        {#if batchModeEnabled && batchMode}
          <BatchSummary
            mode={ttsState.mode}
            modelId={ttsState.modelId}
            modelLabel={MODEL_OPTIONS.find((m) => m.id === ttsState.modelId)?.label ?? (ttsState.modelId ?? 'None')}
            speaker={localSpeaker}
            instruction={localInstruction}
            voiceDescription={localVoiceDescription}
            referenceAudioName={ttsState.referenceAudio?.name ?? null}
            lowQualityMode={ttsState.cloneLowQualityMode}
            language={localLanguage}
            format={settingsStore.state.exportFormat || 'wav'}
            sampleRate={(settingsStore.state.exportFormat || 'wav') === 'wav' ? settingsStore.state.wavSampleRate : null}
            bitDepth={settingsStore.state.wavBitDepth}
            seed={localSeed}
          />
        {/if}
```

- [ ] **Step 6: Verify**

```bash
pnpm check && pnpm test:run
```

Expected: no type errors; all unit tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/input/BatchSummary.svelte \
        src/lib/components/input/BatchSummary.test.ts \
        src/routes/+page.svelte
git commit -m "feat(batch): show the effective configuration a batch run will use"
```

---

## Task 8: Document what the models can and cannot actually be asked to do

Root cause F. Answers the sliders question, the saved-voice question, and the batch-settings question in the place the reporter looked first.

**Files:**
- Modify: `src/lib/components/help/HelpPanel.svelte`

**Interfaces:**
- Consumes: nothing.
- Produces: two new sections in the `sections` array, ids `voice-controls` and `batch-mode`.

- [ ] **Step 1: Correct the factually wrong capability row**

In `src/lib/components/help/HelpPanel.svelte`, in `modelGroups`, change the 0.6B CustomVoice row (line 96) from:

```ts
          instruction: 'Limited',
```

to:

```ts
          instruction: 'Ignored',
```

And in the same group, `Qwen3-TTS-12Hz-0.6B-Base` and `1.7B-Base` already read `'No'` — leave them.

- [ ] **Step 2: Add the capability section**

Insert into the `sections` array, immediately after the `voice-design` entry:

```ts
    {
      id: 'voice-controls',
      title: 'What You Can Control (and What You Cannot)',
      type: 'voice-guides',
      subsections: [
        {
          title: 'There are no speed, pitch, or emphasis sliders',
          text: 'Qwen3-TTS exposes no numeric parameters for rate, pitch, emphasis, or volume — the model has no such inputs. Prosody is controlled entirely through style instruction text. Ask for "speaking at an extremely slow pace" or "clear emphasis on key words" and the model interprets it.',
        },
        {
          title: 'Style instructions work on two models only',
          text: 'Instruction control is available on 1.7B CustomVoice and 1.7B VoiceDesign. The 0.6B CustomVoice model discards instructions entirely — it renders the speaker\'s default style no matter what you type. Voice Clone accepts no instructions on any model.',
        },
        {
          title: 'Style preset chips',
          text: 'In Custom Voice with the 1.7B Custom model loaded, one-click chips cover Happy, Sad, Angry, Whisper, Slow, Fast, Low pitch, Formal and Excited. These are the closest thing to speed and emphasis controls. They are hidden on 0.6B because that model would ignore them.',
        },
        {
          title: 'Cloned voices cannot use Custom Voice controls',
          text: 'A cloned voice reproduces the timbre of your reference recording and can only be rendered in Voice Clone mode, on a Base model. Custom Voice renders the nine preset speakers only. This is why picking a saved voice under Voice → Saved switches the app to Voice Clone: it is the only mode that can render a voice other than the presets. To change how a cloned voice performs, change the reference recording — a calmer or faster reference produces a calmer or faster clone.',
        },
        {
          title: 'Seed',
          text: 'Generation samples randomly, so the same text produces slightly different audio each run. Pin a seed to make a result reproducible, and reuse that seed to regenerate the same delivery.',
        },
      ],
    },
```

- [ ] **Step 3: Add the batch section**

Insert immediately after the `voice-controls` entry:

```ts
    {
      id: 'batch-mode',
      title: 'Batch Mode',
      type: 'voice-guides',
      subsections: [
        {
          title: 'Which settings a batch uses',
          text: 'A batch applies your current voice configuration to every queued file: the mode, the loaded model, speaker and style instruction (Custom Voice), reference audio and transcript (Voice Clone), or voice description (Voice Design) — plus language, seed, and the export format, sample rate and bit depth from Settings. The "This batch will use" card above the file queue lists exactly what will be sent.',
        },
        {
          title: 'Changing settings during batch mode',
          text: 'The voice panel stays visible and editable while files are queued, so you can adjust the voice before starting. It locks while a batch is running — changing the voice mid-run would produce inconsistent output across files. Cancel, adjust, and start again.',
        },
        {
          title: 'One voice per batch',
          text: 'Every file in a batch is rendered with the same voice. To use different voices, run one batch per voice.',
        },
        {
          title: 'File size limit',
          text: 'Each file must be 2,000 characters or fewer — roughly two minutes of speech, which is close to the model\'s maximum output length. Longer files are rejected when you add them, naming the file so you can split it.',
        },
        {
          title: 'How long a batch takes',
          text: 'Time scales with the number of files. A single item takes seconds on a GPU but several minutes on a CPU-only machine, so a large batch can run for hours. Progress shows the current file and completed count. If the server stops making progress for 15 minutes the batch is stopped and the server is told to stand down, and any files already finished are reported.',
        },
        {
          title: 'Red rows in the Debug console',
          text: 'The Python machine-learning libraries write ordinary status messages to the error stream. These are informational, not failures — a batch that reports completed succeeded even if the Debug console showed warnings while it ran.',
        },
      ],
    },
```

- [ ] **Step 4: Verify the panel renders and type checking passes**

```bash
pnpm check && pnpm test:run
```

Expected: no type errors; unit tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/help/HelpPanel.svelte
git commit -m "docs(help): document real model capabilities, batch settings, and log noise"
```

---

## Task 9: End-to-end regression for the reported flow

**Files:**
- Create: `e2e/batch-settings.spec.ts`

**Interfaces:**
- Consumes: the Tauri + API mocking helpers used by `e2e/production.spec.ts`.

- [ ] **Step 1: Export the mock helpers for reuse**

`setupMocks`, `defaultMockState` and `MockServerState` are module-private in `e2e/production.spec.ts`. Add `export` to each of those three declarations so the new spec reuses one mocking approach rather than inventing a second. Do not change their bodies.

```ts
export interface MockServerState {
export const defaultMockState: MockServerState = {
export async function setupMocks(page: Page, mockState: MockServerState = defaultMockState) {
```

- [ ] **Step 2: Write the failing test**

Create `e2e/batch-settings.spec.ts`:

```ts
import { test, expect, Page } from '@playwright/test';
import { setupMocks, defaultMockState } from './production.spec';

/**
 * Issue #13 regressions.
 *
 * The reporter ran a Voice Clone batch and could neither see nor change the
 * voice settings it would use, then read benign sidecar warnings as failures.
 */

/** Bypass onboarding with batch mode already enabled. */
async function setupWithBatchEnabled(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'privatevoice-settings',
      JSON.stringify({
        theme: 'dark',
        defaultModel: '0.6b',
        defaultSpeaker: 'aiden',
        autoLoadModel: true,
        showWaveform: true,
        showDebugOnStartup: false,
        exportFolder: '~/Documents/PrivateVoice',
        exportFormat: 'wav',
        wavSampleRate: null,
        wavBitDepth: 16,
        recentCacheSize: 10,
        enableWhisper: false,
        enableTranslation: false,
        enableBatchMode: true,
        hasCompletedOnboarding: true,
      })
    );
  });
}

async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.locator('nav')).toBeVisible({ timeout: 20000 });
}

async function toggleBatchMode(page: Page) {
  await page.getByRole('switch', { name: 'Toggle batch mode' }).click();
}

test.describe('Batch mode keeps voice settings reachable (issue #13)', () => {
  test('Voice Clone reference audio stays visible with batch mode on', async ({ page }) => {
    await setupMocks(page, { ...defaultMockState, modelId: '0.6b-base' });
    await setupWithBatchEnabled(page);
    await openApp(page);

    await page.locator('nav').getByRole('button', { name: 'Voice Clone' }).click();
    await expect(page.getByText(/reference audio/i).first()).toBeVisible();

    await toggleBatchMode(page);

    // The whole point of the fix: the panel is no longer swapped out.
    await expect(page.getByText(/reference audio/i).first()).toBeVisible();
    await expect(page.getByText('Batch Processing')).toBeVisible();
  });

  test('Custom Voice speaker picker stays visible with batch mode on', async ({ page }) => {
    await setupMocks(page);
    await setupWithBatchEnabled(page);
    await openApp(page);

    await toggleBatchMode(page);

    await expect(page.getByRole('button', { name: 'Preset' })).toBeVisible();
    await expect(page.getByText('Aiden')).toBeVisible();
  });

  test('the effective-configuration card names the model and format', async ({ page }) => {
    await setupMocks(page);
    await setupWithBatchEnabled(page);
    await openApp(page);

    await toggleBatchMode(page);

    const summary = page.getByText('This batch will use').locator('..');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('0.6B Custom');
    await expect(summary).toContainText('WAV');
    await expect(summary).toContainText('Random');
  });

  test('the per-generation Generate button is hidden in batch mode', async ({ page }) => {
    await setupMocks(page);
    await setupWithBatchEnabled(page);
    await openApp(page);

    await expect(page.getByRole('button', { name: 'Generate', exact: true })).toBeVisible();
    await toggleBatchMode(page);

    await expect(page.getByRole('button', { name: 'Generate', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Process All' })).toBeVisible();
  });
});

test.describe('Batch file pre-flight (issue #13)', () => {
  test('a file over the character limit is rejected by name', async ({ page }) => {
    await setupMocks(page);
    await setupWithBatchEnabled(page);
    await openApp(page);
    await toggleBatchMode(page);

    await page.locator('input[type="file"][accept*=".txt"]').setInputFiles({
      name: 'chapter-one.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('a'.repeat(2001)),
    });

    await expect(page.getByText(/chapter-one\.txt/)).toBeVisible();
    await expect(page.getByText(/2,000 character/i)).toBeVisible();
    await expect(page.getByText('No files queued.')).toBeVisible();
  });

  test('a file within the limit is queued', async ({ page }) => {
    await setupMocks(page);
    await setupWithBatchEnabled(page);
    await openApp(page);
    await toggleBatchMode(page);

    await page.locator('input[type="file"][accept*=".txt"]').setInputFiles({
      name: 'fine.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('This one is short enough.'),
    });

    await expect(page.getByText('No files queued.')).toHaveCount(0);
    await expect(page.getByDisplayValue('fine.wav')).toBeVisible();
  });
});

test.describe('Help answers the reported questions (issue #13)', () => {
  test('capability section explains the absent sliders and cloned voices', async ({ page }) => {
    await setupMocks(page);
    await setupWithBatchEnabled(page);
    await openApp(page);

    await page.getByRole('button', { name: /help/i }).first().click();
    await page.getByRole('button', { name: /What You Can Control/i }).click();

    await expect(page.getByText(/no numeric parameters for rate, pitch, emphasis/i)).toBeVisible();
    await expect(page.getByText(/Cloned voices cannot use Custom Voice controls/i)).toBeVisible();
  });

  test('batch section explains which settings a batch uses', async ({ page }) => {
    await setupMocks(page);
    await setupWithBatchEnabled(page);
    await openApp(page);

    await page.getByRole('button', { name: /help/i }).first().click();
    await page.getByRole('button', { name: 'Batch Mode' }).click();

    await expect(page.getByText(/applies your current voice configuration to every queued file/i))
      .toBeVisible();
    await expect(page.getByText(/informational, not failures/i)).toBeVisible();
  });
});
```

If a selector above does not match after Tasks 6-8, fix the selector against the real DOM — do not weaken the assertion.

- [ ] **Step 3: Run the E2E suite**

```bash
pnpm test:e2e
```

Expected: the four new tests pass and the existing 90 still pass. If `visual-validation.spec.ts` fails because batch mode now renders more, update its expectations — the layout change is intended.

- [ ] **Step 4: Commit**

```bash
git add e2e/batch-settings.spec.ts
git commit -m "test(e2e): cover batch settings visibility and capability docs for issue #13"
```

---

## Task 10: Bump to 1.0.4 and stop the server version drifting

**Files:**
- Modify: `package.json:3`, `src-tauri/tauri.conf.json:4`, `src-tauri/Cargo.toml:3`, `python/tts_server/__init__.py:3`
- Modify: `python/tts_server/main.py:421,472`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing.
- Produces: version `1.0.4` everywhere; `/health` reports it from `__version__`.

- [ ] **Step 1: Write the failing test**

Append to `python/tests/test_api.py`:

```python
def test_health_reports_the_package_version(client):
    """The server version was hardcoded to 1.0.0 in two places and drifted
    behind __init__.py (verified live during the issue #13 investigation:
    {"status":"ok","version":"1.0.0"} while the package said 1.0.3)."""
    from tts_server import __version__

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["version"] == __version__
```

Use whatever client fixture `python/tests/test_api.py` already defines; match its existing style rather than adding a new one.

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd python && .venv/bin/python -m pytest tests/test_api.py -k health_reports -v
```

Expected: FAIL — `'1.0.0' != '1.0.3'`.

- [ ] **Step 3: Derive the version from the package**

In `python/tts_server/main.py`, add to the imports near line 42:

```python
from . import __version__
```

Replace line 421:

```python
    version=__version__,
```

Replace line 472:

```python
    return HealthResponse(status="ok", version=__version__)
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd python && .venv/bin/python -m pytest tests/test_api.py -q
```

Expected: PASS.

- [ ] **Step 5: Bump all four version files to 1.0.4**

```bash
cd /Users/jmoore/Documents/Github/PrivateVoice
```

- `package.json` line 3: `"version": "1.0.4",`
- `src-tauri/tauri.conf.json` line 4: `"version": "1.0.4",`
- `src-tauri/Cargo.toml` line 3: `version = "1.0.4"`
- `python/tts_server/__init__.py` line 3: `__version__ = "1.0.4"`

Verify none were missed:

```bash
grep -rn '1\.0\.3' package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml python/tts_server/__init__.py
```

Expected: no output.

- [ ] **Step 6: Correct CLAUDE.md**

The "Version" convention line claims the version is "also reflected in `SettingsPanel.svelte` and `main.py` health endpoint". `SettingsPanel.svelte` contains no version string, and `main.py` now derives it. Replace that sentence with:

```markdown
  `main.py` imports it from `python/tts_server/__init__.py`, so the four files above are the only places to edit.
```

Also correct the test counts in CLAUDE.md's Testing section. They are already wrong before this branch: CLAUDE.md claims "343 automated tests total: 216 unit tests, 90 E2E" — which does not add up, and a local `vitest run` reports **244** unit tests passing, not 216. Recount after Task 9 and state real numbers.

- [ ] **Step 7: Run the whole suite**

```bash
pnpm test:all && cd python && .venv/bin/python -m pytest tests/ -q && cd ../src-tauri && cargo test
```

Expected: everything passes.

- [ ] **Step 8: Commit**

```bash
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml \
        python/tts_server/__init__.py python/tts_server/main.py \
        python/tests/test_api.py CLAUDE.md
git commit -m "chore: bump version to 1.0.4 and derive the server version from the package"
```

---

## Out of Scope

Found during investigation, deliberately not addressed here:

- **`wavChannels` is a dead setting.** Present in `settingsStore` and the Settings UI, never sent by any request path. Either wire it through or remove it — a separate change with its own audio-quality verification.
- **`mp3_bitrate` is a dead field** on the TS `BatchRequest` interface. There is no bitrate setting in the UI (the Settings label hardcodes "192kbps"), so nothing is broken today, but CLAUDE.md's claim of a "configurable bitrate" is aspirational. Remove the field or add the setting, separately.
- **Advanced sampling sliders** (`temperature`, `top_p`, `top_k`, `repetition_penalty`). The model supports them; the maintainer's scope decision for 1.0.4 is documentation only. They control randomness and stability, not speed, so shipping them under the banner of this issue would answer a question nobody asked.
- **Chunking oversized `.txt` files** into multiple items. Task 5 rejects them with a clear message; automatic splitting needs a sentence-boundary strategy and a naming scheme for the pieces.
- **Per-file voice selection within one batch.** A genuine feature, not a defect.
- **The orphaned sidecar on port 8765** observed on this machine during investigation. Expected behaviour per CLAUDE.md; the app reclaims its own orphan on next launch.

## Manual Verification

Run against a production build (`pnpm tauri build`), not `pnpm tauri dev` — microphone access and the release sidecar path only exist there.

1. **The reported flow.** Enable batch mode in Settings. Switch to Voice Clone, load 0.6B Base, import a reference clip and transcript. Toggle batch mode on — **the reference clip and transcript must still be visible**. Confirm the "This batch will use" card names 0.6B Base and the clip. Queue three short `.txt` files and process.
2. **Debug console is not red.** Open Debug during that run. The `pad_token_id` lines should be gone entirely; anything else from stderr should read `WARNING` or `INFO`, not `ERROR`.
3. **Cancel is not an error.** Start a batch, press Cancel. Status reads `cancelled`, no red error banner.
4. **Single-generation cancel.** Leave batch mode, start a normal generation, press Cancel. No error banner (this was broken before — it showed "Generation failed").
5. **Oversized file.** Try to add a `.txt` over 2,000 characters. It is rejected by name before any upload, and the other files in the same selection are still added.
6. **Locked while running.** Start a batch and confirm the voice panel is dimmed and non-interactive until it finishes.
7. **Help answers the questions.** Open Help. "What You Can Control (and What You Cannot)" explains the absent sliders and why saved voices open in Voice Clone. "Batch Mode" explains which settings apply. The Model List shows `Ignored` for 0.6B CustomVoice instructions.
8. **Version.** Settings/About and `curl -H "X-API-Key: $TOKEN" http://127.0.0.1:8765/health` both report `1.0.4`.

## Release

After the PR merges to `main`:

1. Confirm CI is green on `main`, including the two new jobs (`rust-tests`, `python-tests`).
2. Tag and push: `git tag v1.0.4 && git push origin v1.0.4`.
3. The release workflow builds macOS (Apple Silicon + Intel cross-compiled from arm64), Linux and Windows, and attaches installers to a **draft** release.
4. Verify all four artefacts attached, then publish and promote to latest.
5. Close issue #13 with a summary of what changed, and note explicitly that the red Debug rows were never failures.

## Review Adjudication

_To be filled in after the clean-eyes review, before implementation begins._
