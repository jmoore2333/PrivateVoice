# PrivateVoice Control MCP Server — Design Plan

## Overview

A Python MCP server (stdio transport) that gives AI agents native control over the PrivateVoice desktop app. Enables "round-trip" testing: launch the app, generate audio, capture the UI, verify playback via speech-to-text.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Claude Code / Claude Desktop                                │
│  (MCP Client)                                                │
└──────────┬───────────────────────────────────────────────────┘
           │ stdio (JSON-RPC)
           ▼
┌──────────────────────────────────────────────────────────────┐
│  privatevoice-mcp-server  (Python, FastMCP 2.x)              │
│                                                              │
│  Tools:                                                      │
│  ├─ app_launch_and_verify    → subprocess + HTTP poll        │
│  ├─ app_capture_view         → WebSocket → MCP Bridge        │
│  ├─ app_trigger_action       → HTTP API (port 8765)          │
│  ├─ app_get_status           → HTTP API (port 8765)          │
│  ├─ app_listen_audio         → ScreenCaptureKit / audiotee   │
│  ├─ verify_speech_accuracy   → mlx-whisper                   │
│  └─ app_shutdown             → HTTP API + process kill       │
└──────┬────────────────────┬──────────────────────────────────┘
       │                    │
       │ WebSocket          │ HTTP localhost:8765
       │ (port 9223)        │
       ▼                    ▼
┌─────────────┐    ┌──────────────────┐
│ MCP Bridge  │    │  Python FastAPI   │
│ (Rust)      │    │  TTS Backend      │
│             │    │  (sidecar)        │
│ - screenshot│    │  - /health        │
│ - click     │    │  - /generate/*    │
│ - type      │    │  - /load-model    │
│ - evaluate  │    │  - /model-status  │
│ - inspect   │    │  - /speakers      │
└─────────────┘    └──────────────────┘
       │                    │
       └────────┬───────────┘
                ▼
        ┌──────────────┐
        │  Tauri App   │
        │  (Rust)      │
        │  PrivateVoice│
        └──────────────┘
```

## Two Communication Channels

### Channel 1: HTTP API (Port 8765) — Backend Control

The Python FastAPI backend already exposes all TTS functionality over HTTP. Our MCP server calls these directly — no bridge needed for backend operations.

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Check if backend is alive |
| `GET /startup-status` | Poll startup phase (initializing → ready) |
| `GET /model-status` | Check loaded model, device, memory |
| `POST /load-model` | Load a specific model variant |
| `POST /generate/custom-voice` | Generate TTS with preset speaker |
| `POST /generate/voice-clone` | Generate TTS from reference audio |
| `POST /generate/voice-design` | Generate TTS from voice description |
| `GET /speakers` | List available speakers |
| `GET /system-info` | Device, memory, versions |
| `POST /shutdown` | Graceful backend shutdown |

### Channel 2: WebSocket Bridge (Port 9223) — UI Control

The `tauri-plugin-mcp-bridge` exposes native UI operations via WebSocket. Required for operations that touch the GUI.

| Capability | Used For |
|------------|----------|
| `screenshot` | `app_capture_view` — native window capture |
| `click` | Future: UI interaction testing |
| `type` | Future: text input testing |
| `evaluate` | Execute JS in WebView (read DOM state) |
| `find_elements` | Inspect UI element visibility/state |
| `get_window_state` | Window size, position, focus |

## Tauri Integration Steps

### Step 1: Add MCP Bridge Plugin to Rust

**Cargo.toml** — add dependency:
```toml
[dependencies]
tauri-plugin-mcp-bridge = "0.6"
```

**lib.rs** — register plugin:
```rust
// In the run() function, add to the plugin chain:
.plugin(tauri_plugin_mcp_bridge::init())
```

### Step 2: Enable `withGlobalTauri`

**tauri.conf.json** — add to `app` section:
```json
{
  "app": {
    "withGlobalTauri": true,
    ...
  }
}
```

This exposes `window.__TAURI__` to JavaScript, which the bridge plugin needs to communicate with the Rust backend.

### Step 3: Frontend Bridge Script

**src/app.html** or via SvelteKit layout — inject bridge initialization:
```html
<script src="https://unpkg.com/@hypothesi/tauri-plugin-mcp-bridge/dist/index.js"></script>
```

Or install as npm dependency:
```bash
pnpm add @hypothesi/tauri-plugin-mcp-bridge
```

And import in `+layout.svelte`:
```typescript
import '@hypothesi/tauri-plugin-mcp-bridge';
```

## MCP Server Implementation

### Technology Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| MCP Framework | `fastmcp` 2.x (Python) | Already have Python backend expertise; rich ecosystem |
| Transport | stdio | Direct integration with Claude Desktop/Code |
| HTTP Client | `httpx` | Async support for backend API calls |
| WebSocket Client | `websockets` | Bridge communication |
| Audio Capture | `screencapturekit` (via PyObjC) | macOS native, no external drivers |
| Speech-to-Text | `mlx-whisper` | Apple Silicon optimized, local-only |
| Process Management | `subprocess` | Launch/monitor Tauri binary |

### File Structure

```
mcp-server/
├── pyproject.toml              # Dependencies + entry point
├── README.md                   # Setup + Claude Desktop config
├── privatevoice_mcp/
│   ├── __init__.py
│   ├── server.py               # FastMCP server + tool definitions
│   ├── tauri_bridge.py         # WebSocket client for MCP bridge
│   ├── tts_client.py           # HTTP client for FastAPI backend
│   ├── app_launcher.py         # Process management for Tauri binary
│   ├── audio_capture.py        # macOS system audio capture
│   └── speech_verify.py        # mlx-whisper transcription + accuracy
```

### Tool Specifications

#### 1. `app_launch_and_verify`

**Purpose:** Launch the PrivateVoice production binary and wait until the TTS backend reports "ready".

**Parameters:**
- `binary_path: str` — Path to PrivateVoice.app (defaults to `/Applications/PrivateVoice.app`)
- `timeout_seconds: int` — Max wait for ready state (default: 120)
- `model_id: str | None` — Optional model to pre-load after startup

**Implementation:**
1. Check if app is already running (check port 8765)
2. If not, launch via `subprocess.Popen(["open", "-a", binary_path])`
3. Poll `GET /health` every 2 seconds until responsive
4. Poll `GET /startup-status` until phase == "ready"
5. If `model_id` provided, call `POST /load-model` and poll `/model-status`
6. Return: startup time, loaded model, device info, memory usage

**Error handling:**
- Timeout → return error with last known startup phase
- Port already in use → attempt to connect to existing instance
- Binary not found → return error with expected path

#### 2. `app_capture_view`

**Purpose:** Take a high-resolution native screenshot of the Tauri window.

**Parameters:**
- `save_path: str | None` — Where to save the PNG (default: temp file)
- `full_window: bool` — Capture entire window vs. viewport (default: true)

**Implementation:**
1. Connect to MCP bridge WebSocket at `ws://localhost:9223`
2. Send screenshot command via bridge protocol
3. Receive base64-encoded PNG
4. Save to `save_path` or temp file
5. Return: file path, dimensions, file size

**Fallback:** If bridge is unavailable, use `screencapture -l <windowID>` CLI tool (macOS native).

**Error handling:**
- Bridge not connected → return error suggesting app needs to be running
- App not focused → return warning (screenshot may capture overlay)

#### 3. `app_trigger_action`

**Purpose:** Trigger TTS generation or other backend actions directly via HTTP API, bypassing the UI.

**Parameters:**
- `action: str` — One of: "generate_custom_voice", "generate_voice_clone", "generate_voice_design", "load_model", "unload_model", "get_speakers", "get_system_info"
- `params: dict` — Action-specific parameters (see below)

**Parameter schemas by action:**

```
generate_custom_voice:
  text: str (required)
  speaker: str = "serena"
  instruction: str = ""
  language: str = "english"
  format: str = "wav"

generate_voice_clone:
  text: str (required)
  reference_audio: str (file path, required)
  reference_text: str = ""
  x_vector_only_mode: bool = false
  language: str = "english"
  format: str = "wav"

generate_voice_design:
  text: str (required)
  voice_description: str (required)
  language: str = "english"
  format: str = "wav"

load_model:
  model_id: str (required, e.g. "0.6b", "1.7b-base")

unload_model: (no params)

get_speakers: (no params)

get_system_info: (no params)
```

**Implementation:**
1. Validate action name and params
2. Build HTTP request to appropriate endpoint
3. For generation actions: save returned audio to temp WAV/MP3 file
4. Return: audio file path (for generation), or JSON response (for info actions)

**Error handling:**
- Backend unreachable → return error suggesting `app_launch_and_verify`
- Model not loaded → return error with compatible model suggestion
- Text too long (>2000 chars) → return error with limit info

#### 4. `app_listen_audio`

**Purpose:** Capture system audio output for a specified duration and save to a WAV file.

**Parameters:**
- `duration_seconds: float` — How long to record (default: 5.0, max: 30.0)
- `save_path: str | None` — Where to save WAV (default: temp file)

**Implementation (macOS 14.2+ Core Audio Taps):**
1. Use PyObjC bindings to ScreenCaptureKit
2. Create an `SCStreamConfiguration` with `capturesAudio = true`
3. Start capture, collect audio samples for `duration_seconds`
4. Convert samples to WAV format (16-bit, 44.1kHz)
5. Save to file
6. Return: file path, duration, sample rate, file size

**Alternative implementation (subprocess):**
1. Use bundled `audiotee` binary or `screencapture --audio` (if available)
2. Record for specified duration
3. Convert to WAV if needed

**Error handling:**
- Screen Recording permission not granted → return error with instructions
- No audio detected → return warning (silence captured)
- macOS version < 14.2 → return error suggesting BlackHole setup

#### 5. `verify_speech_accuracy`

**Purpose:** Transcribe an audio file and compare against expected text.

**Parameters:**
- `audio_path: str` — Path to WAV/MP3 file
- `expected_text: str` — The text that should have been spoken
- `model: str` — Whisper model to use (default: "mlx-community/whisper-small")
- `language: str` — Expected language (default: "en")

**Implementation:**
1. Load mlx-whisper model (cached after first use)
2. Transcribe `audio_path`
3. Normalize both transcription and expected text (lowercase, strip punctuation)
4. Calculate word error rate (WER) using Levenshtein distance
5. Return: transcription, expected_text, WER, pass/fail (threshold: WER < 0.15), word-level alignment

**Error handling:**
- Audio file not found → return error
- Empty transcription → return error (possibly silence or corrupt audio)
- High WER → return detailed diff showing mismatches

#### 6. `app_get_status`

**Purpose:** Get comprehensive status of the running app (backend health, loaded model, UI state).

**Parameters:** None

**Implementation:**
1. Check if port 8765 is responding (`GET /health`)
2. If alive, fetch: `/model-status`, `/startup-status`, `/system-info`
3. If bridge available, get window state
4. Return: composite status object

#### 7. `app_shutdown`

**Purpose:** Gracefully shut down the PrivateVoice app.

**Parameters:**
- `force: bool` — Force kill if graceful shutdown fails (default: false)

**Implementation:**
1. Call `POST /shutdown` on backend
2. Wait up to 10 seconds for process to exit
3. If `force` and still running, `kill -9`
4. Return: shutdown status, duration

## Handshake Sequence

The MCP server needs to discover and connect to the running Tauri app. Here's the handshake flow:

```
Claude sends tool call → MCP Server receives via stdio
                              │
                              ▼
                    ┌─────────────────────┐
                    │ Is app running?     │
                    │ Check port 8765     │
                    └────┬────────────┬───┘
                         │            │
                    Yes  │            │  No
                         ▼            ▼
                    ┌──────────┐  ┌──────────────────┐
                    │ Check    │  │ Return error:     │
                    │ bridge   │  │ "App not running. │
                    │ port 9223│  │ Use app_launch_   │
                    └────┬─────┘  │ and_verify first" │
                         │        └──────────────────┘
                    ┌────┴────┐
                    │Connected│
                    └────┬────┘
                         │
                    Execute tool
                    Return result
```

### Connection State Machine

```
DISCONNECTED
  │
  ├─ app_launch_and_verify() ──→ LAUNCHING
  │                                  │
  │                          health poll OK
  │                                  │
  │                                  ▼
  │                             BACKEND_READY
  │                                  │
  │                          bridge connect OK
  │                                  │
  │                                  ▼
  └─ (existing app detected) ──→ FULLY_CONNECTED
                                     │
                              app_shutdown()
                                     │
                                     ▼
                               DISCONNECTED
```

The MCP server maintains internal state tracking these connections. Tools that need only the HTTP API (like `app_trigger_action`) work in `BACKEND_READY` state. Tools that need the bridge (like `app_capture_view`) require `FULLY_CONNECTED`.

## Dependencies

### Python (pyproject.toml)

```toml
[project]
name = "privatevoice-mcp"
version = "0.1.0"
requires-python = ">=3.10"
dependencies = [
    "fastmcp>=2.0,<3",
    "httpx>=0.27",
    "websockets>=13.0",
    "mlx-whisper>=0.4",
    "jiwer>=3.0",         # Word Error Rate calculation
]

[project.scripts]
privatevoice-mcp = "privatevoice_mcp.server:main"
```

### Rust (added to src-tauri/Cargo.toml)

```toml
tauri-plugin-mcp-bridge = "0.6"
```

### Frontend (package.json)

```json
"@hypothesi/tauri-plugin-mcp-bridge": "^0.6"
```

## Claude Desktop Configuration

```json
{
  "mcpServers": {
    "privatevoice": {
      "command": "python",
      "args": ["-m", "privatevoice_mcp.server"],
      "cwd": "/Users/jmoore/Documents/Github/Qwen3-TTS/mcp-server",
      "env": {
        "PRIVATEVOICE_APP_PATH": "/Applications/PrivateVoice.app",
        "PRIVATEVOICE_API_PORT": "8765",
        "PRIVATEVOICE_BRIDGE_PORT": "9223"
      }
    }
  }
}
```

Or using `uv`:
```json
{
  "mcpServers": {
    "privatevoice": {
      "command": "uv",
      "args": ["run", "--directory", "/path/to/mcp-server", "privatevoice-mcp"]
    }
  }
}
```

## Round-Trip Test Example

A typical round-trip test session using these tools:

```
1. app_launch_and_verify(model_id="0.6b")
   → App started, model loaded, 23.4s startup

2. app_capture_view()
   → Screenshot saved: /tmp/pv_screenshot_001.png (1280x800)

3. app_trigger_action(
     action="generate_custom_voice",
     params={"text": "Hello, this is a test.", "speaker": "serena"}
   )
   → Audio saved: /tmp/pv_audio_001.wav (2.3s, 16-bit 24kHz)

4. app_listen_audio(duration_seconds=5)
   → Captured: /tmp/pv_capture_001.wav (5.0s, 44.1kHz)

5. verify_speech_accuracy(
     audio_path="/tmp/pv_audio_001.wav",
     expected_text="Hello, this is a test."
   )
   → Transcription: "Hello, this is a test."
   → WER: 0.0, PASS

6. app_capture_view()
   → Screenshot saved: /tmp/pv_screenshot_002.png (verify UI updated)

7. app_shutdown()
   → Graceful shutdown in 1.2s
```

## Implementation Order

| Phase | What | Effort |
|-------|------|--------|
| 1 | MCP bridge integration (Rust + frontend) | Small — add dependency + 2 lines |
| 2 | Python MCP server scaffold (FastMCP + stdio) | Small — boilerplate |
| 3 | `app_launch_and_verify` + `app_shutdown` | Medium — process management |
| 4 | `app_get_status` + `app_trigger_action` | Small — HTTP client wrapping |
| 5 | `app_capture_view` | Medium — bridge WebSocket protocol |
| 6 | `app_listen_audio` | Hard — macOS audio capture APIs |
| 7 | `verify_speech_accuracy` | Medium — mlx-whisper + WER calc |
| 8 | Testing + documentation | Medium |

## Open Questions

1. **Audio capture approach**: Core Audio Taps (requires macOS 14.2+) vs. ScreenCaptureKit (macOS 12.3+) vs. BlackHole (requires user setup). Recommendation: ScreenCaptureKit for broader compatibility since PrivateVoice already targets macOS 12.3+.

2. **Bridge dependency**: Should the MCP bridge be included in production builds, or only in a debug/test build variant? Including it in production adds a WebSocket listener on port 9223.

3. **Audio file handling**: Should `app_trigger_action` save generated audio to a temp dir, or should it let the caller specify the path? Recommendation: default to temp dir, allow override.

4. **Whisper model size**: `whisper-tiny` (39M) is fast but less accurate. `whisper-small` (244M) is a good balance. `whisper-large-v3` (1.5B) is most accurate but uses significant memory alongside TTS models. Recommendation: default to `whisper-small`.

5. **Concurrent usage**: Should the MCP server handle multiple simultaneous tool calls, or serialize them? The backend already serializes TTS generation, so the MCP server should probably do the same for generation-related tools but allow status checks concurrently.
