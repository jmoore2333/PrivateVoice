# Qwen3-TTS Desktop for Apple Silicon

A self-contained desktop application that runs Qwen3-TTS text-to-speech locally on Apple Silicon Macs. No cloud API, no Python setup required for end users.

## Current Status

**Phase 3 in progress.** Core infrastructure complete, UI redesign needed.

**What works:**
- Standalone `.app` bundles with no Python required for end users
- All three TTS modes functional (Custom Voice, Voice Clone, Voice Design)
- Model loading/switching with compatibility checking
- Debug console for sidecar log viewing
- Settings panel with persistence
- Loading screen during startup

**What needs work:**
- UI is functional but visually "stubbed" - needs comprehensive redesign
- No download progress indicator during model fetching
- No generation progress indicator while audio is rendering
- See [issues.md](./issues.md) for full tracking

**Note:** First launch takes ~60 seconds while the bundled Python environment initializes. Subsequent launches are faster.

## Overview

This app bundles a Python-based TTS inference server as a sidecar process, communicating with a native Tauri/Svelte frontend. Users get a simple UI to generate speech from text using preset voices, voice cloning, or voice design.

**Target Hardware:** M1/M2/M3/M4 Macs with 16GB+ RAM
**License:** Open source for public benefit

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Tauri App (Svelte 5 UI)                                │
│  - Text input, voice selection, audio playback          │
│  - Model selection (0.6B, 1.7B, 1.7B-Design)            │
│  - Native macOS window                                  │
└─────────────────────────────────────────────────────────┘
                         │ HTTP (localhost:8765)
                         ▼
┌─────────────────────────────────────────────────────────┐
│  Python Sidecar (FastAPI)                               │
│  - Bundled via PyInstaller for distribution             │
│  - Runs Qwen3-TTS on MPS (Apple GPU)                    │
│  - bfloat16 precision, SDPA attention                   │
└─────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│  HuggingFace Hub (External)                             │
│  - Model weights downloaded on first run                │
│  - Cached in ~/.cache/huggingface/                      │
│  - ~1.2GB for 0.6B model, ~3.4GB for 1.7B model         │
└─────────────────────────────────────────────────────────┘
```

## Features

### Three TTS Modes

1. **Custom Voice:** 9 preset speakers with optional style instructions
   - Speakers: `aiden`, `dylan`, `eric`, `ono_anna`, `ryan`, `serena`, `sohee`, `uncle_fu`, `vivian`
   - Works with 0.6B or 1.7B models

2. **Voice Clone:** Clone any voice from a short audio sample + transcript
   - Works with 0.6B or 1.7B models

3. **Voice Design:** Generate novel voices from natural language descriptions
   - Requires the 1.7B-Design model specifically

### Available Models

| Model ID | HuggingFace ID | Size | Use Case |
|----------|----------------|------|----------|
| `0.6b` | `Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice` | ~1.2GB | Fast, Custom Voice & Clone |
| `1.7b` | `Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice` | ~3.4GB | Higher quality |
| `1.7b-design` | `Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign` | ~3.4GB | Voice Design mode |

## MPS Compatibility

Based on [this optimization guide](https://lingshunlab.com/ai/qwen3-tts-on-mac-mini-m4-the-ultimate-installation-optimization-guide), we adapt for Apple Silicon:

| Setting | Value | Reason |
|---------|-------|--------|
| `dtype` | `torch.bfloat16` | M4 fully supports bfloat16; float16 causes nan/inf |
| `attn_implementation` | `"sdpa"` | Flash Attention not available on MPS |
| `device_map` | `"mps"` | Use Apple GPU |

## Project Structure

```
qwen3-tts-desktop/
├── src-tauri/                      # Rust/Tauri backend
│   ├── src/
│   │   ├── main.rs                 # Entry point
│   │   └── lib.rs                  # Sidecar management, log streaming
│   ├── capabilities/default.json   # Permissions
│   └── tauri.conf.json             # Tauri config
│
├── src/                            # Svelte 5 frontend
│   ├── lib/
│   │   ├── api/ttsClient.ts        # HTTP client for TTS API
│   │   ├── stores/
│   │   │   ├── ttsStore.svelte.ts     # TTS state (Svelte 5 runes)
│   │   │   ├── appStore.svelte.ts     # Startup/UI state
│   │   │   ├── debugStore.svelte.ts   # Log buffer
│   │   │   └── settingsStore.svelte.ts # Persistent settings
│   │   └── components/
│   │       ├── ui/                 # Reusable UI primitives
│   │       ├── tts/                # TTS-specific components
│   │       ├── startup/            # Loading screen components
│   │       ├── debug/              # Debug console components
│   │       └── settings/           # Settings panel
│   └── routes/+page.svelte         # Main page
│
├── python/                         # Python sidecar
│   ├── tts_server/
│   │   ├── main.py                 # FastAPI server
│   │   ├── inference.py            # TTS wrapper (MPS-optimized)
│   │   ├── device.py               # MPS detection
│   │   ├── download_tracker.py     # HuggingFace progress (WIP)
│   │   ├── log_handler.py          # Structured logging
│   │   └── speaker_data.py         # Speaker metadata
│   └── requirements.txt
│
├── issues.md                       # Known issues & improvement tracking
└── README.md
```

## Development Setup

### Prerequisites

```bash
# macOS system dependencies
brew install sox python@3.11

# Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Node package manager
brew install pnpm

# Tauri CLI
cargo install tauri-cli
```

### Running in Development

```bash
# 1. Install frontend dependencies
pnpm install

# 2. Set up Python environment (use Python 3.11+)
cd python
/opt/homebrew/bin/python3.11 -m venv .venv
source .venv/bin/activate
pip install qwen-tts --no-deps
pip install "torch>=2.1.0" "transformers>=4.40.0" "accelerate>=1.0.0" \
    "safetensors>=0.4.0" "soundfile>=0.12.0" "librosa>=0.10.0" \
    "numpy>=1.24.0" "fastapi>=0.109.0" "uvicorn[standard]>=0.27.0" \
    "python-multipart>=0.0.6" "huggingface-hub>=0.20.0" "pydantic>=2.0.0" \
    einops torchaudio sox onnxruntime
cd ..

# 3. Start the Python server (in one terminal)
cd python
source .venv/bin/activate
python -m tts_server.main

# 4. Start the Tauri app (in another terminal)
pnpm tauri dev
```

### Building for Release

```bash
# Full release build (builds sidecar + Tauri app)
./scripts/build-release.sh

# Or step by step:
./python/build_sidecar.sh   # Build PyInstaller binary (~243MB)
pnpm tauri build             # Build .app and .dmg

# Output locations:
# - src-tauri/target/release/bundle/macos/Qwen3-TTS.app
# - src-tauri/target/release/bundle/dmg/Qwen3-TTS_0.1.0_aarch64.dmg
```

### Quick Test (CLI)

```bash
# Health check
curl http://127.0.0.1:8765/health

# Load model
curl -X POST http://127.0.0.1:8765/load-model \
  -H "Content-Type: application/json" \
  -d '{"model_id": "0.6b"}'

# Generate speech
curl -X POST http://127.0.0.1:8765/generate/custom-voice \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world", "speaker": "serena"}' \
  --output test.wav
```

## API Reference

**Base URL:** `http://127.0.0.1:8765`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Server health check |
| `/model-status` | GET | Current model info |
| `/speakers` | GET | List preset speakers |
| `/load-model` | POST | Load model by ID |
| `/unload-model` | POST | Free model memory |
| `/generate/custom-voice` | POST | Generate with preset voice |
| `/generate/voice-clone` | POST | Clone from reference audio |
| `/generate/voice-design` | POST | Generate from description |
| `/shutdown` | POST | Graceful shutdown |

## Memory Requirements

| Configuration | RAM Needed |
|---------------|------------|
| 0.6B model | ~8GB total |
| 1.7B model | ~12GB total |
| Comfortable headroom | 16GB Mac recommended |

## Roadmap

### Phase 1: MVP ✅
- [x] Tauri + Svelte project structure
- [x] Python sidecar with MPS inference (bfloat16)
- [x] FastAPI server with all endpoints
- [x] UI with model selection and all three modes
- [x] End-to-end testing on M4 Mac

### Phase 2: Sidecar Bundling ✅
- [x] PyInstaller bundling of Python server
- [x] Tauri shell plugin for sidecar management
- [x] Release build scripts (`build_sidecar.sh`, `build-release.sh`)
- [x] DMG packaging (253MB app, 256MB DMG)

### Phase 3: Infrastructure ✅ (Partial)
- [x] Loading screen during startup
- [x] Debug console for sidecar logs
- [x] Settings panel with persistence
- [x] Model/mode compatibility checking
- [x] Speaker metadata and language info
- [ ] Download progress indicator (research complete, implementation pending)
- [ ] Generation progress indicator (research complete - no native API available)
- [ ] Voice Library (deferred to UI redesign)
- [ ] Help Panel (deferred to UI redesign)

### Phase 4: UI Redesign (Next)
Current UI is functional but visually "stubbed" - needs comprehensive redesign before adding more features.

- [ ] Define product goals and target users
- [ ] Design information hierarchy and layout
- [ ] Create cohesive visual language
- [ ] Implement polished components
- [ ] Voice Library with proper gallery UI
- [ ] Help Panel matching final design

### Phase 5: Polish
- [ ] Waveform visualization
- [ ] Audio export options (MP3, etc.)
- [ ] Memory usage warnings
- [ ] Keyboard shortcuts

### Phase 6: Distribution
- [ ] Code signing and notarization
- [ ] Auto-update via GitHub Releases
- [ ] Homebrew cask formula

## Known Issues

See [issues.md](./issues.md) for detailed tracking with status and research findings.

**Current blockers:**
- No download progress indicator during model fetching (~1.2-3.4GB)
- No generation progress indicator while audio renders
- UI needs comprehensive redesign (functional but visually incomplete)

**Minor issues:**
- First launch takes ~60 seconds (PyInstaller initialization)
- Voice Clone mode lightly tested
- No graceful handling if model download fails mid-stream

## Acknowledgments

- [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) - The underlying TTS model by Alibaba
- [MPS Optimization Guide](https://lingshunlab.com/ai/qwen3-tts-on-mac-mini-m4-the-ultimate-installation-optimization-guide) - M4 compatibility reference
- [Tauri](https://tauri.app/) - Desktop application framework

## License

Open source for public benefit.
