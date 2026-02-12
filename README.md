# PrivateVoice

PrivateVoice is a local desktop text-to-speech app powered by Qwen3-TTS.
It runs speech generation on your machine with a Tauri desktop app + Python backend.

## Architecture (This Branch)

This branch uses a **deferred dependency installer** architecture:

- Installer ships a lightweight desktop app + `uv` + Python source (`tts_server/`) + `requirements.txt`
- On first launch, the app:
  - detects hardware (GPU/CPU)
  - installs standalone Python 3.11 via `uv`
  - creates a venv in app data
  - installs dependencies with GPU-appropriate PyTorch index
  - verifies environment and starts the local FastAPI server
- On later launches, setup is skipped if `.setup-complete` is valid

This replaces the older large PyInstaller-sidecar installer model.

## Platform Status (February 12, 2026)

| Platform | Status | Notes |
|---|---|---|
| Windows 11 x64 | Working and tested | NSIS installer (lightweight), first-run CUDA setup validated |
| macOS (Apple Silicon) | Working and validated | New deferred installer path and MPS runtime verified |
| Linux x64 | Planned next for validation | CUDA/ROCm/XPU detection paths implemented |

## Core Features

- 3 generation modes:
  - Custom Voice
  - Voice Clone
  - Voice Design
- Model/mode compatibility guidance with one-click model switching
- Optional Whisper auto-transcription for Voice Clone
- Optional local text translation helpers (independent from Whisper)
- Lead-in stabilization controls for Custom Voice and Voice Design
- Save to Library + Export (WAV/MP3)
- Debug console with live logs and system info
- Settings panel includes **Environment status** and repair/rebuild actions

## Model Compatibility

| Model | Custom Voice | Voice Clone | Voice Design |
|---|:---:|:---:|:---:|
| `0.6b` | Yes | No | No |
| `1.7b` | Yes | No | No |
| `0.6b-base` | No | Yes | No |
| `1.7b-base` | No | Yes | No |
| `1.7b-design` | No | No | Yes |

## Windows CUDA and GPU Acceleration (Current Behavior)

Code-verified behavior in this branch:

- Hardware target is detected in Rust (`src-tauri/src/env_manager/gpu.rs`)
- NVIDIA detection uses `nvidia-smi`
- CUDA wheel target is selected automatically:
  - newer GPUs: `cu124`
  - older supported GPUs: `cu121`
- Dependency install uses `uv pip install -r requirements.txt --extra-index-url <torch index>`
- Runtime backend chooses device via `torch.cuda.is_available()` (`python/tts_server/device.py`)
- Attention backend on CUDA:
  - `flash_attention_2` only if `flash_attn` is installed
  - otherwise falls back to PyTorch SDPA (default current behavior)

Additional targets implemented in detection code:
- AMD ROCm target
- Intel XPU target
- CPU fallback

## System Requirements

- Recommended RAM: 16 GB+
- Minimum RAM for smaller models: ~8 GB
- Typical first model download size: ~1.2-3.4 GB
- First-run environment setup needs additional disk/network (depends on GPU target)
- Internet required for first-time setup and model downloads

## Installation and First Run

### Installer contents

Release build includes lightweight resources, not prebuilt full Python environments.

### First launch flow

Startup phases include:
- hardware detection
- disk check
- copy Python source
- install Python 3.11
- create virtual environment
- install dependencies
- verify environment
- start server

If setup is interrupted or corrupted, use **Settings -> Environment -> Repair/Rebuild**.

### Backend sync behavior on app updates

The environment marker now tracks both:
- dependency hash (`requirements.txt`)
- backend source hash (`tts_server/`)

If either changes, the app automatically triggers environment refresh so new API endpoints are available.

### Storage Footprint and Uninstall

PrivateVoice now keeps runtime artifacts in app-managed storage, including:
- standalone Python
- virtualenv packages (including PyTorch)
- Hugging Face model cache (`python_env/huggingface/`)
- library metadata/audio (`library/`)

Primary app data roots:
- macOS: `~/Library/Application Support/com.privatevoice.desktop/`
- Windows: `%APPDATA%\\com.privatevoice.desktop\\`
- Linux: `~/.local/share/com.privatevoice.desktop/`

Windows NSIS uninstall prompts with two choices:
1. **Keep or delete your voice library** — saved voices are irreplaceable, so you are asked first.
2. **Remove AI models and runtime** — if you kept the library, a second prompt offers to free ~2-10 GB of re-downloadable data (models, Python, caches).

Empty parent directories are cleaned up automatically after uninstall.

macOS `.app` deletion and Linux AppImage deletion do not run a platform uninstaller; remove the app data directory manually if you want a full wipe.

Legacy cache note for existing users:
- Older versions may have model files in `~/.cache/huggingface/`.
- New installs/updates use app-managed cache under `python_env/huggingface/`.
- You can manually remove the legacy `~/.cache/huggingface/` directory if no other apps depend on it.

## Build and Release

### Windows (PowerShell)

```powershell
.\scripts\build-release.ps1
```

This script:
1. downloads `uv.exe` (`scripts/download-uv.ps1`)
2. stages Python source/resources in `src-tauri/resources/`
3. verifies `python/requirements.txt` SHA-256 against `python/requirements.sha256`
4. runs `pnpm install`
5. builds Tauri installer (`nsis` by default)

### macOS/Linux/Windows via bash

```bash
./scripts/build-release.sh
```

This script performs the same resource-staging flow using `scripts/download-uv.sh`.

### Dependency Hash Gate (Release Builds)

Release builds enforce a dependency manifest integrity gate:

- `python/requirements.txt` must match `python/requirements.sha256`
- staged `src-tauri/resources/requirements.txt` must match the same hash

When updating Python dependencies, regenerate the tracked hash before building:

```bash
./scripts/update-requirements-hash.sh
```

Windows PowerShell:

```powershell
.\scripts\update-requirements-hash.ps1
```

Then re-run your release build script.

## Development

```bash
pnpm install
pnpm tauri dev
```

For backend-only debugging:

```bash
cd python
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m tts_server.main
```

## Tests

```bash
pnpm check
pnpm test:run
pnpm test:e2e
cd python && pytest
```

Backend syntax smoke test used in CI:

```bash
python3 -m py_compile \
  python/tts_server/main.py \
  python/tts_server/translation.py \
  src-tauri/resources/tts_server/main.py \
  src-tauri/resources/tts_server/translation.py
```

## API

Local backend base URL:

`http://127.0.0.1:8765`

Core endpoints include:
- `/health`
- `/startup-status`
- `/download-progress`
- `/model-status`
- `/load-model`
- `/generate/custom-voice`
- `/generate/voice-clone`
- `/generate/voice-design`
- `/cancel-generation`
- `/whisper-status`
- `/whisper-models`
- `/load-whisper`
- `/unload-whisper`
- `/transcribe`
- `/translation-status`
- `/translation-models`
- `/load-translation`
- `/unload-translation`
- `/translate-text`

Generation request notes:
- `/generate/custom-voice` supports optional `stable_lead_in` (default `true`)
- `/generate/voice-design` supports optional `stable_lead_in` (default `true`)
- `stable_lead_in=true` prioritizes cleaner starts (less front filler); setting it `false` restores model-default expressive sampling behavior

Full API details: `docs/API_REFERENCE.md`

## Known Notes

- First launch can take several minutes (network and GPU target dependent)
- Voice Clone recording can be unavailable in some dev/runtime environments; import still works
- On Windows, WebView2 mic/camera permission cache is explicitly managed in this branch
- `sox` warnings can appear in logs but are not required for core TTS generation

## Docs

- `docs/README.md` (documentation index + structure)
- `docs/DEVELOPMENT.md`
- `docs/API_REFERENCE.md`
- `docs/crossplatform.md`
- `USER_MANUAL_V1.0.md`

## License

MIT
