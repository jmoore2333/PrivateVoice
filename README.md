# PrivateVoice

**Local, private text-to-speech for Apple Silicon.** No cloud, no API keys, no data leaves your Mac.

PrivateVoice is a self-contained desktop application that runs Qwen3-TTS locally on Apple Silicon. Generate natural speech with preset voices, clone any voice from a short sample, or design entirely new voices from text descriptions.

## Features

- **Custom Voice**: 9 preset speakers with style instructions ("speak slowly", "whisper", etc.)
- **Voice Clone**: Clone any voice from 5-15 seconds of audio + transcript
- **Voice Design**: Create new voices from natural language descriptions ("a warm, elderly British gentleman")
- **Fully Local**: All processing happens on your Mac - no internet required after model download
- **Native App**: Fast, responsive macOS app built with Tauri

## Tech Stack

- Frontend: Svelte 5 + Tailwind CSS 4 + TypeScript
- Desktop: Tauri 2 (Rust)
- Backend: Python FastAPI sidecar with Qwen3-TTS
- Testing: Vitest (unit) + Playwright (E2E)

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

## Model List (Qwen3-TTS)

### 1.7B Models

| Model | Features | Language Support | Streaming | Instruction Control |
|------|----------|------------------|-----------|---------------------|
| Qwen3-TTS-12Hz-1.7B-VoiceDesign | Voice design from user descriptions | CN, EN, JA, KO, DE, FR, RU, PT, ES, IT | ✅ | ✅ |
| Qwen3-TTS-12Hz-1.7B-CustomVoice | Preset timbres with instruction control | CN, EN, JA, KO, DE, FR, RU, PT, ES, IT | ✅ | ✅ |
| Qwen3-TTS-12Hz-1.7B-Base | 3-second rapid voice clone; base for fine-tuning | CN, EN, JA, KO, DE, FR, RU, PT, ES, IT | ✅ | — |

### 0.6B Models

| Model | Features | Language Support | Streaming | Instruction Control |
|------|----------|------------------|-----------|---------------------|
| Qwen3-TTS-12Hz-0.6B-CustomVoice | Preset timbres (fast, lightweight) | CN, EN, JA, KO, DE, FR, RU, PT, ES, IT | ✅ | Limited |
| Qwen3-TTS-12Hz-0.6B-Base | 3-second rapid voice clone; base for fine-tuning | CN, EN, JA, KO, DE, FR, RU, PT, ES, IT | ✅ | — |

**Mode mapping in this app**
- Custom Voice → CustomVoice models
- Voice Clone → Base models
- Voice Design → VoiceDesign model

**Note:** Streaming is a model capability; this app currently uses non-streaming generation.

## Qwen3-TTS Key Features (Reported)

- **Powerful speech representation** via the Qwen3-TTS-Tokenizer-12Hz (high-fidelity acoustic compression + semantic modeling).
- **Universal end-to-end architecture** using a discrete multi-codebook LM to avoid cascaded errors.
- **Dual-track hybrid streaming** for low-latency generation (reported first audio after a single character; ~97ms end-to-end latency).
- **Instruction-driven control** over timbre, emotion, and prosody.

## Performance Highlights (Reported by Qwen)

- Voice Design outperforms closed-source baselines on InstructTTS-Eval for instruction following and expressiveness.
- Voice Control reports WER 2.34% with strong style control fidelity.
- Voice Clone reports average WER 1.835 and speaker similarity 0.789 across 10 languages.
- Cross-lingual cloning reported to exceed prior baselines (MiniMax, SeedTTS, CosyVoice3).

## Tokenizer Performance (Reported by Qwen)

- PESQ: 3.21 (wideband), 3.68 (narrowband)
- STOI: 0.96
- UTMOS: 4.16
- Speaker similarity: 0.95

## Example Prompts & Instructions

**Voice Design**
- "A relaxed, naturally expressive male voice in his late twenties with a warm, conversational tone and clear articulation."
- "Older gentleman, early 60s, confident and authoritative, slightly gravelly texture, measured pace."

**Instruction Control**
- "Speak with a very sad, tearful voice. Keep the pace slow and the volume low."
- "Fast-paced delivery, bright tone, excited and upbeat with clear emphasis on key words."

**Multi-character / narration**
- Narrator: "Calm, objective, slightly cinematic delivery with gentle pauses."
- Character: "Anxious young adult, hesitant with small stutters, then resolves confidently."

## Preset Timbres (Custom Voice)

| Timbre | Language/Dialect | Notes |
|------|-------------------|------|
| Serena | Chinese | Warm, gentle female |
| Uncle Fu | Chinese | Seasoned, mellow male |
| Vivian | Chinese | Bright young female |
| Aiden | English | Natural American male |
| Ryan | English | Dynamic male, strong rhythm |
| Ono Anna | Japanese | Playful Japanese female |
| Sohee | Korean | Warm Korean female |
| Dylan | Chinese (Beijing) | Youthful Beijing male |
| Eric | Chinese (Sichuan) | Lively Chengdu male |

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
python python/tts_server_entry.py

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

## Key Files

- `src/routes/+page.svelte` - Main app shell and orchestration
- `src/lib/stores/ttsStore.svelte.ts` - TTS state, model loading, generation
- `src/lib/stores/settingsStore.svelte.ts` - Persistent settings (localStorage)
- `src/lib/components/input/*` - Mode input panels (Custom, Clone, Design)
- `src/lib/components/output/OutputPanel.svelte` - Playback + export
- `python/tts_server/main.py` - FastAPI backend (Qwen3-TTS)
- `src-tauri/src/lib.rs` - Tauri backend bootstrap

## Project Status

### Current State (February 2026)

v1.0 release candidate. All core features complete and tested.

| Phase | Status | Notes |
|-------|--------|-------|
| Core Infrastructure | ✅ Complete | Tauri + Svelte 5 + Python sidecar |
| Python TTS Server | ✅ Complete | FastAPI with Qwen3-TTS |
| UI Implementation | ✅ Complete | Multi-column macOS layout, responsive (900x650 to 1920x1080) |
| Settings & Debug Tools | ✅ Complete | Persistent settings, debug console |
| Model Management | ✅ Complete | Load/switch with download progress, memory check, auto-load |
| Custom Voice Mode | ✅ Complete | 9 preset speakers + style instructions |
| Voice Clone Mode | ✅ Complete | Import + recording (production build), low-quality mode |
| Voice Design Mode | ✅ Complete | Description templates, character counter |
| Audio Export | ✅ Complete | WAV + MP3 (configurable 128-320 kbps) |
| Voice Library | ✅ Complete | File-based persistence, search, tabs |
| Help System | ✅ Complete | Troubleshooting, speaker gallery, keyboard shortcuts |
| Model Compatibility UX | ✅ Complete | Visual indicators, one-click model switching |
| Generation Feedback | ✅ Complete | Elapsed time spinner, cancel button |
| Testing Infrastructure | ✅ Complete | 309 automated tests (unit + E2E + visual) |
| Code Signing & Distribution | 🔲 Planned | Required for public release |
| Cross-Platform Support | 🔲 Planned | Device detection ready; builds not yet tested |

### Known Limitations

- **Voice Clone Recording:** Microphone recording requires a production build (macOS WebView security). Use the **Import** button in development mode.
- **Model Download:** First model load requires internet and downloads 1.2-3.4GB from HuggingFace. Progress is now displayed during download.
- **Streaming Generation:** The models support streaming, but the app uses non-streaming generation with elapsed time display.
- **Cross-platform:** Device detection supports CUDA/CPU but Windows/Linux builds are not yet tested.

### Cross-Platform Roadmap

| Platform | GPU Support | Status |
|----------|-------------|--------|
| macOS (Apple Silicon) | MPS | Current focus |
| macOS (Intel) | CPU only | Planned |
| Linux (NVIDIA) | CUDA | Planned |
| Windows (NVIDIA) | CUDA | Planned |

## API Reference

The Python backend exposes a REST API at `http://127.0.0.1:8765`. See [docs/API_REFERENCE.md](docs/API_REFERENCE.md) for full endpoint documentation including request/response schemas.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Server health check |
| `/model-status` | GET | Current model info |
| `/download-progress` | GET | Model download progress |
| `/memory-check/{model_id}` | GET | Check RAM requirements before loading |
| `/system-info` | GET | Device, memory, supported settings |
| `/speakers` | GET | List preset speakers |
| `/speakers-info` | GET | Speaker metadata with descriptions |
| `/load-model` | POST | Load model by ID (background thread) |
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
Check Settings > Audio > Default Format. Both WAV and MP3 (128-320 kbps) are supported.

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md#troubleshooting) for more solutions.

## Acknowledgments

- [Qwen3-TTS](https://github.com/QwenLM/Qwen3-TTS) - The underlying TTS model by Alibaba
- [Tauri](https://tauri.app/) - Desktop application framework
- [MPS Optimization Guide](https://lingshunlab.com/ai/qwen3-tts-on-mac-mini-m4-the-ultimate-installation-optimization-guide) - M4 compatibility reference

## License

MIT License - Open source for public benefit.
