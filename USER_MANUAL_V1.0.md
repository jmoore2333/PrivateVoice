# PrivateVoice User Manual (v1.0)

Version: 1.0.0  
Updated: February 11, 2026 (deferred-installer branch)

## 1. What PrivateVoice Does

PrivateVoice generates speech locally with Qwen3-TTS.
You can:
- use preset speakers (Custom Voice)
- clone a voice from reference audio (Voice Clone)
- create a voice from a description (Voice Design)

## 2. Platform Status

| Platform | Status |
|---|---|
| Windows 11 x64 | Working and validated on this branch |
| macOS (Apple Silicon) | Implemented, validation pending on new installer path |
| Linux x64 | Implemented paths, validation pending |

## 3. New Installer Model (Important)

This build uses a lightweight installer.
It does **not** include a huge prebuilt Python sidecar.

On first launch, the app automatically:
1. detects your hardware (GPU/CPU)
2. checks disk space
3. installs standalone Python 3.11 via `uv`
4. creates a virtual environment
5. installs Python dependencies (with GPU-appropriate PyTorch index)
6. verifies setup and starts the local server

If setup has already completed, future launches skip this process.

## 4. First Launch Expectations

- First launch can take several minutes
- A startup progress screen shows setup phases
- Network is required for dependency/model downloads
- No admin install should be required for normal per-user Windows NSIS installs

If setup fails or is interrupted, open **Settings -> Environment** and use repair controls.

## 5. Generation Modes

### 5.1 Custom Voice

Use one of the preset speakers.

Steps:
1. Open `Custom Voice`
2. Enter text (max 2000 chars)
3. Select language and speaker
4. (Optional) add style instruction
5. Click `Generate`

Required model: `0.6b` or `1.7b`

### 5.2 Voice Clone

Clone voice from reference audio.

Steps:
1. Open `Voice Clone`
2. Provide reference audio (record or import)
3. Enter transcript (or use low-quality mode)
4. Enter target text
5. Click `Generate`

Required model: `0.6b-base` or `1.7b-base`

Notes:
- In this branch, backend voice clone uses in-memory audio decoding to avoid Windows temp-file issues.
- If recording is unavailable in your environment, importing audio still works.

### 5.3 Voice Design

Create a voice from descriptive text.

Steps:
1. Open `Voice Design`
2. Describe the target voice
3. Enter target text
4. Click `Generate`

Required model: `1.7b-design`

## 6. Model Compatibility Reference

| Model | Custom Voice | Voice Clone | Voice Design |
|---|:---:|:---:|:---:|
| `0.6b` | Yes | No | No |
| `1.7b` | Yes | No | No |
| `0.6b-base` | No | Yes | No |
| `1.7b-base` | No | Yes | No |
| `1.7b-design` | No | No | Yes |

When incompatible, the app shows warnings and model-load actions.

## 7. GPU and CUDA Behavior (Windows)

In this branch:
- NVIDIA GPUs are detected via `nvidia-smi`
- CUDA wheel target is selected automatically (`cu124` or `cu121`)
- Runtime uses CUDA when `torch.cuda.is_available()` is true
- If `flash_attn` is not installed, attention falls back to SDPA

CPU fallback is automatic when GPU acceleration is unavailable.

## 8. Whisper Auto-Transcription

Whisper is optional and can auto-fill Voice Clone transcript text.

Enable:
1. Open `Settings`
2. Enable `Auto-transcription`
3. Pick/load Whisper model

Use:
1. Add reference audio in Voice Clone
2. Click `Auto-transcribe`
3. Review transcript and generate

Optional translation:
1. In `Settings -> Optional Features`, enable `Translation support`
2. Run `Auto-transcribe` in Voice Clone
3. A local Whisper translation (English) is shown as a helper and can be applied to the generation text

## 9. Library and Export

### Save to Library

- `Save` stores generated output in library
- Tabs: `Recent`, `Saved Voices`, `Audio`
- Persistence uses Tauri filesystem APIs when available

### Export

- `Export` opens native save dialog
- Formats: WAV or MP3
- Format is controlled by Settings

## 10. Settings Overview

Key settings include:
- Theme
- Default model / default speaker
- Auto-load model
- Export folder + default format
- Whisper auto-transcription controls
- Optional local translation helper
- Debug console on startup

### Environment Section (New)

The `Environment` section shows:
- setup state (ready, update needed, corrupted, etc.)
- GPU target
- environment disk usage
- uv version
- venv path

Actions:
- `Repair (re-verify)`
- `Full rebuild`

Use these if first-run setup or environment validation fails.

## 11. Keyboard Shortcuts

- `Cmd/Ctrl + Enter`: Generate
- `Cmd/Ctrl + S`: Save
- `Cmd/Ctrl + 1`: Custom Voice
- `Cmd/Ctrl + 2`: Voice Clone
- `Cmd/Ctrl + 3`: Voice Design
- `Space`: Play/pause (outside text input)
- `Escape`: Close open panel

## 12. Troubleshooting

### Setup takes too long

First launch may take time due to Python/dependency install and downloads.
Keep the app open until setup completes.

### Setup failed

Open **Settings -> Environment** and run `Repair` or `Full rebuild`.
Also verify network and free disk space.

### GPU not used

Check `System` and `Environment` sections in Settings.
If CUDA is unavailable, app falls back to CPU.

### Voice Clone errors

- Ensure Base model is loaded (`0.6b-base` or `1.7b-base`)
- Provide clear reference audio
- Try import if microphone recording is blocked

### Model download issues

Models are fetched from HuggingFace.
Check connectivity and available disk.

### Out of memory

Use smaller models (`0.6b` / `0.6b-base`) and close other heavy apps.

## 13. Privacy and Network

- Inference runs locally on your machine
- Internet is used for setup-time dependency/model downloads
- Server listens on localhost (`127.0.0.1:8765`)

## 14. Advanced API Access

Local API base URL:

`http://127.0.0.1:8765`

See full endpoint details in `docs/API_REFERENCE.md`.
