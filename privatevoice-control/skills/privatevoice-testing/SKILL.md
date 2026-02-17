---
description: Use this skill when the user wants to test the PrivateVoice desktop app, run round-trip TTS tests, verify audio generation, capture app screenshots, check speech accuracy, debug the Tauri sidecar, or interact with the PrivateVoice MCP tools. Also use when troubleshooting PrivateVoice startup, model loading, or audio playback issues.
---

# PrivateVoice Testing & Control

Guide for using the PrivateVoice MCP tools to perform AI-driven round-trip testing of the PrivateVoice desktop application.

## Architecture

PrivateVoice is a Tauri 2 desktop app with three layers:

```
Svelte 5 Frontend → HTTP :8765 → Python FastAPI (provider adapters: Qwen3 + Chatterbox) → Tauri Rust (sidecar manager)
```

The MCP server communicates via two channels:
- **HTTP API (port 8765)**: Backend control — model loading, TTS generation, status
- **WebSocket Bridge (port 9223)**: UI control — screenshots, element inspection (requires `--features mcp-bridge` build)

## Available MCP Tools

### Lifecycle Tools

- **`app_launch_and_verify`** — Launch PrivateVoice and wait for backend ready state. Optionally pre-load a model.
- **`app_get_model_catalog`** — Retrieve provider/model metadata and compatibility from `/model-catalog`.
- **`app_get_model_status`** — Retrieve provider-aware loaded model state from `/model-status`.
- **`app_get_status`** — Check backend health, loaded model, startup phase, system info, and bridge connection.
- **`app_shutdown`** — Graceful shutdown with optional force kill.

### Action Tools

- **`app_trigger_action`** — Trigger TTS generation or backend actions via HTTP API. Legacy actions: `generate_custom_voice`, `generate_voice_clone`, `generate_voice_design`, `load_model`, `unload_model`, `get_speakers`, `get_system_info`. Provider-aware actions: `generate_speech`, `load_provider_model`, `get_model_catalog`, `get_model_status`.
- **`app_capture_view`** — Take a native screenshot of the PrivateVoice window.

### Verification Tools

- **`app_listen_audio`** — Capture system audio output for a specified duration (requires macOS Screen Recording permission).
- **`verify_speech_accuracy`** — Transcribe audio via mlx-whisper and compare against expected text using Word Error Rate (WER).

## Round-Trip Test Pattern

The standard round-trip test follows this sequence:

1. Launch the app and load a model
2. Capture a screenshot to verify UI state
3. Generate audio with specific text
4. Verify the generated audio matches the expected text
5. Capture another screenshot to confirm UI updated
6. Shut down the app

### Example

```
app_launch_and_verify(model_id="0.6b")
app_capture_view()
app_trigger_action(action="generate_custom_voice", params={"text": "Hello world", "speaker": "serena"})
verify_speech_accuracy(audio_path="<returned path>", expected_text="Hello world")
app_capture_view()
app_shutdown()
```

## Model Compatibility

Each TTS mode requires a compatible provider/model combination from the backend catalog:

| Mode | Compatible Models |
|------|-------------------|
| Custom Voice | Qwen custom models, Chatterbox Turbo/Original/Multilingual |
| Voice Clone | Qwen base models, Chatterbox Turbo/Original/Multilingual |
| Voice Design | Qwen `1.7b-design` (Chatterbox unsupported in phase 1) |

Always load the correct model before triggering a generation action. Use `app_get_model_catalog` + `app_get_model_status` for deterministic compatibility checks in test agents.

## Troubleshooting

### App won't start
- Check if port 8765 is already in use: `lsof -ti :8765`
- Verify the app binary exists at the configured path
- Check `app_get_status()` for the last known startup phase

### Bridge unavailable
- The app must be built with `--features mcp-bridge`: `cargo tauri build --features mcp-bridge`
- Bridge listens on port 9223 — check it's not blocked
- `app_capture_view` falls back to macOS `screencapture` CLI if bridge is down

### Audio capture fails
- Grant Screen Recording permission in System Preferences > Privacy & Security
- macOS 14.2+ required for Core Audio Taps
- Install `audiotee` for best results: `cargo install audiotee`

### High WER in verification
- Use `whisper-small` or `whisper-medium` for better accuracy (default: `whisper-small`)
- Ensure audio is not clipped or too quiet
- Check the language parameter matches the spoken language
- WER threshold is 0.15 (15%) — adjust in verification params if needed

## Connection States

The MCP server tracks its connection to the app:

- **DISCONNECTED** — No app running. Use `app_launch_and_verify`.
- **LAUNCHING** — App is starting, polling for backend readiness.
- **BACKEND_READY** — HTTP API responding. Generation and status tools work.
- **FULLY_CONNECTED** — Bridge also connected. Screenshot and UI tools work.

Tools that only need HTTP (like `app_trigger_action`) work in BACKEND_READY state. Tools that need the bridge (like `app_capture_view` via WebSocket) require FULLY_CONNECTED, but fall back to CLI alternatives when possible.
