# PrivateVoice

**Local, private text-to-speech for Apple Silicon.** No cloud, no API keys, no data leaves your Mac.

PrivateVoice is a self-contained desktop application that runs Qwen3-TTS locally on Apple Silicon. Generate natural speech with preset voices, clone any voice from a short sample, or design entirely new voices from text descriptions.

## Features

- **Custom Voice**: 9 preset speakers with style instructions ("speak slowly", "whisper", etc.)
- **Voice Clone**: Clone any voice from 5-15 seconds of audio + transcript
- **Voice Design**: Create new voices from natural language descriptions ("a warm, elderly British gentleman")
- **Fully Local**: All processing happens on your Mac - no internet required after model download
- **Native App**: Fast, responsive macOS app built with Tauri

## Requirements

- macOS 12.3+ on Apple Silicon (M1/M2/M3/M4)
- 16GB RAM recommended (8GB minimum for 0.6B model)
- ~1.2GB disk for 0.6B model, ~3.4GB for 1.7B models

## Installation

Download the latest `.dmg` from [Releases](https://github.com/your-repo/releases) and drag to Applications.

**First launch notes:**
- Initial startup takes ~60 seconds while the Python environment initializes
- You'll be prompted to select a model - 0.6B is faster, 1.7B is higher quality
- Model weights download from HuggingFace on first use (~1.2-3.4GB)

## Quick Start

1. Launch PrivateVoice
2. Select a TTS mode (Custom Voice, Voice Clone, or Voice Design)
3. Enter your text
4. Click Generate
5. Play, save, or export your audio

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+Enter` | Generate audio |
| `Cmd+S` | Save to library |
| `Space` | Play/pause audio |
| `Cmd+1/2/3` | Switch modes |
| `Escape` | Close panels |

## Available Models

| Model | Size | Use Case | Modes |
|-------|------|----------|-------|
| 0.6B | ~1.2GB | Fast generation | Custom Voice, Voice Clone |
| 1.7B | ~3.4GB | Higher quality | Custom Voice, Voice Clone |
| 1.7B-Design | ~3.4GB | Voice design | Voice Design only |

## Development

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the complete development guide including:
- Development setup
- Running tests
- Building for release
- Release checklist

### Quick Development Start

```bash
# Install dependencies
pnpm install

# Start the Python TTS server (in a separate terminal)
cd tts-server && python server.py

# Start the frontend dev server
pnpm dev

# Or run the full Tauri app in development mode
pnpm tauri dev
```

### Running Tests

```bash
# Unit tests
pnpm test

# Unit tests with coverage
pnpm test:coverage

# E2E tests (requires dev server or mocks)
pnpm test:e2e

# Type checking
pnpm check
```

### Building for Local Testing

Some features (like microphone recording for voice cloning) require a production build due to macOS WebView security restrictions. To test these features locally:

```bash
# 1. Build the production app
pnpm tauri build

# 2. The built app will be at:
#    src-tauri/target/release/bundle/macos/PrivateVoice.app

# 3. Run the production build
open src-tauri/target/release/bundle/macos/PrivateVoice.app

# Or run the unsigned binary directly
./src-tauri/target/release/qwen3-tts-desktop
```

**Note:** The first production build takes several minutes as it compiles the Rust backend and bundles all dependencies.

### Build for Release

```bash
./scripts/build-release.sh
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Tauri App (Svelte 5 + Tailwind CSS 4)                      │
│  - Modern dark UI with three TTS modes                      │
│  - Waveform visualization with wavesurfer.js                │
│  - Voice library with recent/saved items                    │
└─────────────────────────────────────────────────────────────┘
                         │ HTTP (localhost:8765)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  Python Sidecar (FastAPI)                                   │
│  - Bundled via PyInstaller (~243MB)                         │
│  - Qwen3-TTS with MPS optimization                          │
│  - bfloat16 precision for M-series chips                    │
└─────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  HuggingFace Hub                                            │
│  - Model weights downloaded on first use                    │
│  - Cached in ~/.cache/huggingface/                          │
└─────────────────────────────────────────────────────────────┘
```

## Project Status

### Current State (January 2026)

The app is functional for local development and testing. Core TTS generation works across all three modes.

| Phase | Status | Notes |
|-------|--------|-------|
| Core Infrastructure | ✅ Complete | Tauri + Svelte 5 + Python sidecar |
| Python TTS Server | ✅ Complete | FastAPI with Qwen3-TTS |
| UI Implementation | ✅ Complete | Dark theme, all three TTS modes |
| Settings & Debug Tools | ✅ Complete | Persistent settings, debug console |
| Model Management | ✅ Complete | Load/switch models, auto-load on startup |
| Custom Voice Mode | ✅ Complete | 9 preset speakers + style instructions |
| Voice Clone Mode | ⚠️ Partial | Works with imported audio; recording requires production build |
| Voice Design Mode | ✅ Complete | Text-based voice description |
| Audio Export | ✅ Complete | WAV export with descriptive filenames |
| Testing Infrastructure | ✅ Complete | Unit tests + E2E tests (CI-compatible) |
| Code Signing & Distribution | 🔲 Planned | Required for public release |
| Cross-Platform Support | 🔲 Planned | Currently macOS only |

### Known Limitations

- **Voice Clone Recording:** Microphone recording doesn't work in development mode due to macOS WebView security restrictions. Use the **Import** button to upload audio files, or test with a production build.
- **MP3 Export:** Currently only WAV export is supported. MP3 encoding requires backend implementation.
- **Model Download:** First model load requires internet and downloads 1.2-3.4GB from HuggingFace.

### Cross-Platform Roadmap

| Platform | GPU Support | Status |
|----------|-------------|--------|
| macOS (Apple Silicon) | MPS | Current focus |
| macOS (Intel) | CPU only | Planned |
| Linux (NVIDIA) | CUDA | Planned |
| Windows (NVIDIA) | CUDA | Planned |

## API Reference

The Python backend exposes a REST API at `http://127.0.0.1:8765`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Server health check |
| `/model-status` | GET | Current model info |
| `/speakers` | GET | List preset speakers |
| `/load-model` | POST | Load model by ID |
| `/generate/custom-voice` | POST | Generate with preset voice |
| `/generate/voice-clone` | POST | Clone from reference audio |
| `/generate/voice-design` | POST | Generate from description |

## Troubleshooting

**Voice Clone recording not working?**
Microphone access requires a production build on macOS. In development mode, use the **Import** button to upload pre-recorded audio files. To test recording, build the app with `pnpm tauri build` and run the production `.app` bundle.

**"Recording not available" message?**
This appears in development mode because Tauri's WebView doesn't expose `navigator.mediaDevices`. This is expected - use Import instead, or test with a production build.

**Slow first launch?**
Normal - PyInstaller extracts the bundled Python environment (~60 seconds). Subsequent launches are faster.

**Out of memory?**
Try the smaller 0.6B model. The 1.7B models need ~12GB RAM.

**Model download stuck?**
Check your internet connection. Models are 1.2-3.4GB from HuggingFace Hub.

**MPS errors?**
Ensure you're on Apple Silicon with macOS 12.3+. Intel Macs use slower CPU inference.

**Export always saves as WAV?**
Only WAV export is currently supported. The format selector is prepared for future MP3 support.

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#troubleshooting) for more solutions.

## Acknowledgments

- [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) - The underlying TTS model by Alibaba
- [Tauri](https://tauri.app/) - Desktop application framework
- [MPS Optimization Guide](https://lingshunlab.com/ai/qwen3-tts-on-mac-mini-m4-the-ultimate-installation-optimization-guide) - M4 compatibility reference

## License

MIT License - Open source for public benefit.
