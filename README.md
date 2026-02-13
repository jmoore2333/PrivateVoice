# PrivateVoice

**Local text-to-speech that never leaves your machine.** Generate natural speech, clone voices, and design new ones — powered by [Qwen3-TTS](https://huggingface.co/Qwen) models running entirely on your hardware.

No cloud APIs. No subscriptions. No data sent anywhere.

<p align="center">
  <img src="e2e/screenshots/default-1280x800-main.png" alt="PrivateVoice — Custom Voice mode" width="720" />
</p>

---

## Three Ways to Generate Speech

<table>
<tr>
<td width="33%" valign="top">

### Custom Voice
Pick from preset speakers, choose a language, and type your text. Optionally add style instructions to control tone and delivery.

</td>
<td width="33%" valign="top">

### Voice Clone
Record or import a reference audio clip, and PrivateVoice will generate new speech in that voice. Includes optional Whisper auto-transcription.

</td>
<td width="33%" valign="top">

### Voice Design
Describe the voice you want in plain text — *"warm baritone, slight British accent, nature documentary narrator"* — and the model creates it.

</td>
</tr>
</table>

<p align="center">
  <img src="e2e/screenshots/default-1280x800-voice-clone.png" alt="Voice Clone mode" width="355" />
  <img src="e2e/screenshots/default-1280x800-voice-design.png" alt="Voice Design mode" width="355" />
</p>

## Key Features

- **Runs 100% locally** — inference on Apple Silicon (MPS), NVIDIA CUDA, or CPU. Nothing leaves `localhost`.
- **Lightweight installer** — ships a small desktop app; downloads Python, dependencies, and models on first launch.
- **5 model variants** — from fast 0.6B to high-quality 1.7B, with one-click switching between compatible models.
- **Voice library** — save generated audio, organize with tabs (Recent / Saved Voices / Audio), search and replay.
- **Export to WAV or MP3** — configurable bitrate, native save dialog.
- **Optional Whisper transcription** — auto-fill Voice Clone transcripts from reference audio.
- **Optional translation** — translate input text locally before generating speech (NLLB 600M).
- **Keyboard shortcuts** — `Cmd/Ctrl+Enter` to generate, `Cmd/Ctrl+S` to save, `Space` to play/pause, and more.
- **Debug console** — live logs and system info for troubleshooting.

## Platform Support

| Platform | Status |
|---|---|
| **Windows 11 x64** | Working — NSIS installer, CUDA auto-detection |
| **macOS (Apple Silicon)** | Working — MPS acceleration |
| **Linux x64** | Builds available — CUDA/ROCm/CPU detection implemented |

**System requirements:** 16 GB+ RAM recommended (8 GB minimum for 0.6B models). First model download is ~1.2–3.4 GB.

## Quick Start

### Install and run

Download the latest release for your platform from [Releases](../../releases), then launch the app.

On first run, PrivateVoice will automatically:
1. Detect your hardware (GPU/CPU)
2. Install a standalone Python 3.11 environment
3. Download dependencies (with GPU-appropriate PyTorch)
4. Start the local TTS server

Subsequent launches skip setup and start in seconds.

### Build from source

```bash
pnpm install
pnpm tauri dev          # development with hot reload
```

For a release build:

```bash
# macOS / Linux
./scripts/build-release.sh

# Windows (PowerShell)
.\scripts\build-release.ps1
```

## Model Reference

| Model | Size | Custom Voice | Voice Clone | Voice Design |
|---|---|:---:|:---:|:---:|
| `0.6b` | ~1.2 GB | Yes | — | — |
| `0.6b-base` | ~1.2 GB | — | Yes | — |
| `1.7b` | ~3.4 GB | Yes | — | — |
| `1.7b-base` | ~3.4 GB | — | Yes | — |
| `1.7b-design` | ~3.4 GB | — | — | Yes |

The app shows compatibility indicators on mode tabs and offers one-click model loading when you switch to an incompatible mode.

## How It Works

```
┌─────────────────────────────────────────────────────┐
│  Svelte 5 Frontend  (TypeScript + Tailwind CSS 4)   │
│  ↕ HTTP localhost:8765                              │
│  Python FastAPI Server  (Qwen3-TTS inference)       │
│  ↕ managed by                                       │
│  Tauri 2 Rust Shell  (sidecar lifecycle, native OS) │
└─────────────────────────────────────────────────────┘
```

The Tauri desktop shell manages a Python sidecar process that runs the TTS models. The Svelte frontend communicates with it over HTTP on localhost. All model weights and runtime files are stored in app-scoped directories — nothing pollutes your global Python or system cache.

## Privacy

- All inference runs **locally on your machine**
- The server binds to `127.0.0.1:8765` — not accessible from the network
- Internet is used only during first-run setup (Python, dependencies) and model downloads from HuggingFace
- No telemetry, no analytics, no cloud calls during normal use

## Settings & Environment

<p align="center">
  <img src="e2e/screenshots/default-1280x800-settings.png" alt="Settings panel" width="720" />
</p>

Configure theme, default model/speaker, export format, auto-load behavior, and optional features (Whisper, translation). The **Environment** section shows GPU target, setup state, and disk usage — with **Repair** and **Full Rebuild** buttons if anything goes wrong.

## Storage & Uninstall

App data is stored in platform-standard locations:

| Platform | Path |
|---|---|
| macOS | `~/Library/Application Support/com.privatevoice.desktop/` |
| Windows | `%APPDATA%\com.privatevoice.desktop\` |
| Linux | `~/.local/share/com.privatevoice.desktop/` |

Windows uninstaller offers granular cleanup — keep your voice library while removing models and runtime, or remove everything.

## Development

```bash
pnpm install                    # frontend dependencies
pnpm tauri dev                  # full app with hot reload
pnpm dev                        # frontend only (no TTS backend)

# Python backend standalone
cd python && source .venv/bin/activate && python -m tts_server.main

# Tests
pnpm test:run                   # unit tests
pnpm test:e2e                   # Playwright E2E (90 tests)
pnpm check                      # TypeScript/Svelte type check
cd python && pytest tests/      # Python backend tests
```

343 automated tests: 216 unit tests (Vitest) + 90 E2E tests (Playwright) + Python backend tests.

## Documentation

- [User Manual](USER_MANUAL_V1.0.md)
- [API Reference](docs/API_REFERENCE.md)
- [Development Guide](docs/DEVELOPMENT.md)
- [Cross-Platform Notes](docs/crossplatform.md)
- [Production Test Procedure](docs/PRODUCTION_TEST_PROCEDURE.md)

## License

MIT
