# PrivateVoice v1.0.0 Release Notes

**Release Date:** February 2026
**Platform:** macOS 12.3+ (Apple Silicon primary, Intel CPU fallback)

## Overview

PrivateVoice v1.0.0 is a fully local, private text-to-speech desktop application for macOS. All processing happens on-device using Qwen3-TTS models — no cloud services, no API keys, no data leaves your Mac.

## Storage Update (v1.x)

- Runtime/model caches are now app-scoped under the app data directory (`python_env/huggingface` for Hugging Face artifacts).
- Existing users may still have legacy cache files in `~/.cache/huggingface/` from older builds.
- Legacy cache can be manually removed if no other local ML applications depend on it.

## Features

### Three TTS Modes
- **Custom Voice**: 9 preset speakers (Aiden, Ryan, Serena, Vivian, and more) with style instructions ("speak slowly", "whisper", "excited tone")
- **Voice Clone**: Clone any voice from 5-15 seconds of reference audio + transcript. Supports low-quality mode (x-vector only, no transcript required)
- **Voice Design**: Create entirely new voices from natural language descriptions ("a warm, deep male voice with a slight British accent")

### Model Management
- 5 Qwen3-TTS model variants (0.6B and 1.7B sizes)
- Real-time download progress with file-level tracking
- Memory requirement validation before loading (0.6B: ~8GB, 1.7B: ~12GB)
- Smart model/mode compatibility: visual indicators show which modes work with the loaded model, one-click switching to compatible models
- Auto-load preferred model on startup

### Audio
- WAV and MP3 export (configurable 128/192/256/320 kbps)
- Native macOS save dialog with descriptive filenames
- Generation progress with elapsed time display and cancel button
- 10 language support (Chinese, English, Japanese, Korean, German, French, Russian, Portuguese, Spanish, Italian)

### Voice Library
- Two-tier storage: in-memory recent cache + persistent file-based library
- Save, search, and organize generated audio
- "Use Voice" to restore generation settings from saved items
- Survives app restarts (audio files + metadata persisted via Tauri FS plugin)

### User Experience
- Multi-column macOS-native layout with responsive design (900x650 to 1920x1080+)
- Responsive stacking at narrow widths for cross-platform readiness
- Comprehensive help system with 6 troubleshooting guides
- Speaker gallery with voice descriptions
- Keyboard shortcuts (Cmd+Enter generate, Cmd+S save, Cmd+1/2/3 switch modes, Space play/pause)
- Debug console with real-time server logs and system info
- Persistent settings (theme, audio format, export folder, default model)

### Developer Experience
- 343 automated tests (216 unit + 90 Playwright E2E across 4 spec files)
- E2E spec breakdown: example (8), library (14), production (34), visual-validation (34)
- 46 screenshots captured at 4 resolutions (900x650, 1280x800, 1440x900, 1920x1080)
- Visual validation covers: core modules, mode switching, settings, library, debug, help panels, generate button accessibility, input/output layout
- HTML validation report at `docs/e2e-visual-validation-report.html`
- All tests mock Tauri internals + API routes for full CI compatibility
- Production test procedure with 93+ manual test cases

## System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| macOS | 12.3+ | 13.0+ |
| Chip | Apple Silicon (M1+) | M2+ |
| RAM | 8GB (0.6B model) | 16GB (1.7B models) |
| Disk | ~1.2GB (0.6B) | ~3.4GB (1.7B) |
| Internet | First launch only | First launch only |

Intel Macs are supported with CPU-only inference (slower).

## Known Limitations

- **Voice Clone recording** requires a production build (macOS WebView security blocks mic in dev)
- **Streaming generation** not yet exposed (models return complete audio)
- **Whisper auto-transcription** and **translation** are disabled (future release)
- **Cross-platform** (Windows/Linux): device detection and build scripts ready, not yet tested
- **Code signing/notarization** not yet configured for public distribution

## API

REST API on `http://127.0.0.1:8765` with 16 endpoints. See [docs/API_REFERENCE.md](docs/API_REFERENCE.md) for full documentation.

## Tech Stack

- **Frontend**: Svelte 5 (runes) + Tailwind CSS 4 + TypeScript
- **Desktop**: Tauri 2 (Rust)
- **Backend**: Python FastAPI + Qwen3-TTS + lameenc (MP3)
- **Testing**: Vitest + Playwright + pytest

## Acknowledgments

- [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) by Alibaba Cloud — the underlying TTS models
- [Tauri](https://tauri.app/) — desktop application framework
- [HuggingFace](https://huggingface.co/) — model hosting and download infrastructure
