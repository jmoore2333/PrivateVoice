# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PrivateVoice is a macOS desktop app for local text-to-speech using Qwen3-TTS models on Apple Silicon. It's a Tauri 2 app with a Svelte 5 frontend communicating over HTTP (port 8765) with a Python FastAPI backend that runs as a bundled sidecar process.

## Commands

```bash
# Development
pnpm install                    # Install frontend dependencies
pnpm tauri dev                  # Full app with hot reload (starts both Vite + Tauri + Python sidecar)
pnpm dev                        # Frontend only at localhost:1420 (no TTS backend)

# Python backend (manual, for debugging)
cd python && source .venv/bin/activate && python -m tts_server.main

# Testing
pnpm test                       # Unit tests in watch mode
pnpm test:run                   # Unit tests single run
pnpm test:coverage              # Unit tests with v8 coverage
pnpm test:e2e                   # Playwright E2E tests
pnpm test:all                   # Full suite: type check + unit + E2E
pnpm check                      # TypeScript/Svelte type checking
cd python && pytest tests/      # Python backend tests

# Building
./python/build_sidecar.sh       # Build Python sidecar via PyInstaller
pnpm tauri build                # Build Tauri app (requires sidecar built first)
./scripts/build-release.sh      # Full release build (sidecar + Tauri + DMG)
```

## Architecture

Three-layer architecture communicating over HTTP:

```
Svelte 5 Frontend (TypeScript + Tailwind CSS 4)
    ↕ HTTP localhost:8765
Python FastAPI Server (Qwen3-TTS inference)
    ↕ managed by
Tauri 2 Rust Shell (sidecar lifecycle, native APIs)
```

**Frontend** (`src/`): SvelteKit with adapter-static (SPA mode). State managed with Svelte 5 runes (`$state`, `$derived`, `$effect`) in store files (`src/lib/stores/*.svelte.ts`). The HTTP client in `src/lib/api/ttsClient.ts` handles all backend communication.

**Tauri Rust** (`src-tauri/`): Manages the Python sidecar process lifecycle. In dev mode (`debug_assertions`), spawns Python directly from venv. In release mode, uses `tauri-plugin-shell` to run the PyInstaller-bundled binary. Streams sidecar stdout/stderr as Tauri events (`sidecar-log`, `sidecar-startup`). Uses `tauri-plugin-dialog` for native save/open dialogs and `tauri-plugin-fs` for file system access (library persistence, export).

**Python Backend** (`python/tts_server/`): FastAPI server wrapping Qwen3-TTS. `inference.py` handles model loading (two-phase: `snapshot_download` with progress tracking, then `from_pretrained` from local cache) and audio generation (WAV and MP3 via lameenc). `device.py` auto-detects Apple Silicon MPS, NVIDIA CUDA, or CPU and configures dtype/attention accordingly. `download_tracker.py` provides real-time download progress via `/download-progress` endpoint. Models downloaded from HuggingFace Hub on first use (~1.2-3.4GB).

### Three TTS Modes

1. **Custom Voice** — Preset speaker + optional style instruction (requires CustomVoice model)
2. **Voice Clone** — Reference audio + transcript to clone a voice (requires Base model). Supports low-quality mode (x-vector only, no transcript required).
3. **Voice Design** — Text description of desired voice characteristics (requires VoiceDesign model)

### Model Variants

| Short ID | HuggingFace Model | Modes |
|----------|-------------------|-------|
| `0.6b` | Qwen3-TTS-12Hz-0.6B-CustomVoice | Custom Voice |
| `0.6b-base` | Qwen3-TTS-12Hz-0.6B-Base | Voice Clone |
| `1.7b` | Qwen3-TTS-12Hz-1.7B-CustomVoice | Custom Voice |
| `1.7b-base` | Qwen3-TTS-12Hz-1.7B-Base | Voice Clone |
| `1.7b-design` | Qwen3-TTS-12Hz-1.7B-VoiceDesign | Voice Design |

### Audio Export

Generation produces audio in the format selected in Settings (default WAV). MP3 export uses `lameenc` with configurable bitrate (128/192/256/320 kbps, default 192). Export uses native Tauri save dialog in production, browser download fallback in dev.

### Library Persistence

Voice library uses two-tier storage:
- **Recent cache**: In-memory blob URLs (session-only, auto-rotated)
- **Saved library**: File-based via Tauri FS plugin (`{appData}/library/{id}.wav` + `index.json`). Falls back to localStorage metadata-only in dev/test environments.

## Key Conventions

- **Svelte 5 runes only** — all stores use `$state()`, `$derived()`, `$effect()`. No legacy `writable()`/`readable()` stores.
- **Tailwind CSS 4** — uses `@tailwindcss/vite` plugin, not PostCSS config.
- **Unit tests** use Vitest + @testing-library/svelte with jsdom environment. Test files live alongside source (`*.test.ts`). Python tests use pytest in `python/tests/`. **E2E tests** use Playwright (90 tests across 4 spec files) in `e2e/` directory with full Tauri + API mocking (CI-compatible). Visual validation generates 46 screenshots at 4 resolutions (900x650, 1280x800, 1440x900, 1920x1080) with an HTML report at `docs/e2e-visual-validation-report.html`.
- **Pre-commit hook** (Husky) runs `svelte-check` on staged `.ts`/`.svelte` files.
- **Version** must be updated in four places: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `python/tts_server/__init__.py`. Also reflected in `SettingsPanel.svelte` and `main.py` health endpoint.
- The Python sidecar binary goes to `src-tauri/binaries/tts-server-{arch}` (e.g., `tts-server-aarch64-apple-darwin`).

## Tauri Plugins

| Plugin | Purpose |
|--------|---------|
| `tauri-plugin-opener` | Open URLs in default browser |
| `tauri-plugin-shell` | Sidecar process management (release mode) |
| `tauri-plugin-dialog` | Native save/open file dialogs |
| `tauri-plugin-fs` | File system access for library persistence |

### Model/Mode Compatibility

Mode tabs show visual indicators (orange dots) when incompatible with the loaded model. Switching to an incompatible mode shows a banner with a one-click "Load compatible model" action.

| Model | Custom Voice | Voice Clone | Voice Design |
|-------|--------------|-------------|--------------|
| 0.6B / 1.7B | Yes | No | No |
| 0.6B-base / 1.7B-base | No | Yes | No |
| 1.7B-design | No | No | Yes |

### Responsive Layout

Multi-column layout with fixed-width input panel (380px) and flexible output panel. Stacks vertically below 768px (md breakpoint). All overlay panels (Library, Settings, Help) use fixed positioning for resolution independence. Tested at 900x650, 1280x800, 1440x900, 1920x1080.

## Platform Support

- **macOS** (12.3+): Apple Silicon primary target (MPS). Intel falls back to CPU.
- **Cross-platform ready**: Device detection supports CUDA (Linux/Windows), build scripts detect OS/arch dynamically. Windows/Linux builds not yet tested.
- **Memory check**: `/memory-check/{model_id}` endpoint validates available RAM before model load (0.6B needs ~8GB, 1.7B needs ~12GB).
- Voice Clone recording requires a production build (WebView security blocks mic in dev mode).
- 16GB+ RAM recommended.

## Testing

343 automated tests total:
- **216 unit tests** (Vitest): Stores, components, API client, audio
- **90 E2E tests** (Playwright across 4 spec files):
  - `example.spec.ts` (8): Basic app loading and navigation
  - `library.spec.ts` (14): Library save, search, tabs, persistence
  - `production.spec.ts` (34): Startup, generation, modes, settings, debug
  - `visual-validation.spec.ts` (34): Module visibility, mode switching, settings, library, debug, help panels, generate button accessibility, input/output layout
- **Visual validation**: 46 screenshots captured at 4 resolutions (900x650, 1280x800, 1440x900, 1920x1080), saved to `e2e/screenshots/`
- **HTML report**: `docs/e2e-visual-validation-report.html` — visual review of all captured screenshots
- All E2E tests mock Tauri internals + API routes for full CI compatibility

See `docs/PRODUCTION_TEST_PROCEDURE.md` for manual pre-release checklist (93+ test cases).
