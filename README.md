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

# Run tests
pnpm test:run

# Start development
pnpm tauri dev
```

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

| Phase | Status |
|-------|--------|
| Core Infrastructure | Complete |
| Python Sidecar Bundling | Complete |
| Settings & Debug Tools | Complete |
| UI Redesign | Complete |
| Testing Infrastructure | Complete |
| Code Signing & Distribution | Planned |
| Cross-Platform Support | Planned |

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

**Slow first launch?**
Normal - PyInstaller extracts the bundled Python environment (~60 seconds). Subsequent launches are faster.

**Out of memory?**
Try the smaller 0.6B model. The 1.7B models need ~12GB RAM.

**Model download stuck?**
Check your internet connection. Models are 1.2-3.4GB from HuggingFace Hub.

**MPS errors?**
Ensure you're on Apple Silicon with macOS 12.3+. Intel Macs use slower CPU inference.

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#troubleshooting) for more solutions.

## Acknowledgments

- [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) - The underlying TTS model by Alibaba
- [Tauri](https://tauri.app/) - Desktop application framework
- [MPS Optimization Guide](https://lingshunlab.com/ai/qwen3-tts-on-mac-mini-m4-the-ultimate-installation-optimization-guide) - M4 compatibility reference

## License

MIT License - Open source for public benefit.
