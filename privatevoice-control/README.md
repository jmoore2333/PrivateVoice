# PrivateVoice Control

Claude Code plugin providing an MCP server for native control of the PrivateVoice desktop app. Enables AI-driven round-trip testing: launch the app, generate audio, capture screenshots, and verify speech accuracy.

## Prerequisites

- macOS 14.2+ (Apple Silicon recommended)
- Python 3.10+
- [uv](https://docs.astral.sh/uv/) package manager
- [ffmpeg](https://ffmpeg.org/) (`brew install ffmpeg`) — required by mlx-whisper
- PrivateVoice.app installed (default: `/Applications/PrivateVoice.app`)

### Optional

- **audiotee** (`cargo install audiotee`) — for system audio capture via Core Audio Taps
- **Tauri MCP bridge build** — build PrivateVoice with `cargo tauri build --features mcp-bridge` for native screenshot support

## Installation

### As a Claude Code plugin

```bash
claude --plugin-dir /path/to/privatevoice-control
```

### MCP server only (Claude Desktop)

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "privatevoice": {
      "command": "uv",
      "args": ["run", "--directory", "/path/to/privatevoice-control/mcp-server", "privatevoice-mcp"]
    }
  }
}
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PRIVATEVOICE_APP_PATH` | `/Applications/PrivateVoice.app` | Path to the PrivateVoice application |
| `PRIVATEVOICE_API_PORT` | `8765` | Port for the FastAPI backend |
| `PRIVATEVOICE_BRIDGE_PORT` | `9223` | Port for the Tauri MCP bridge WebSocket |

## MCP Tools

| Tool | Description |
|------|-------------|
| `app_launch_and_verify` | Launch PrivateVoice and wait for backend ready state |
| `app_get_status` | Check backend health, loaded model, and connection state |
| `app_trigger_action` | Trigger TTS generation or backend actions via HTTP API |
| `app_capture_view` | Take a native screenshot of the PrivateVoice window |
| `app_listen_audio` | Capture system audio output to a WAV file |
| `verify_speech_accuracy` | Transcribe audio via mlx-whisper and compute Word Error Rate |
| `app_shutdown` | Gracefully shut down the app |

### Whisper Models for Speech Verification

The `verify_speech_accuracy` tool accepts a `model` parameter. Use a shorthand or a full HuggingFace repo ID:

| Shorthand | HuggingFace Repo | Size | Notes |
|-----------|-----------------|------|-------|
| `tiny` | `mlx-community/whisper-tiny` | ~150 MB | Fastest, lowest accuracy |
| `base` | `mlx-community/whisper-base-mlx` | ~290 MB | |
| `small` | `mlx-community/whisper-small-mlx` | ~950 MB | Good balance |
| `medium` | `mlx-community/whisper-medium-mlx` | ~3 GB | |
| `large` | `mlx-community/whisper-large-v3-mlx` | ~6 GB | Best accuracy (default) |
| `large-turbo` | `mlx-community/whisper-large-v3-turbo` | ~3 GB | Near-large accuracy, faster |

All models are MLX-optimized for Apple Silicon and downloaded from HuggingFace Hub on first use. No authentication token is required.

## Plugin Components

| Type | Name | Description |
|------|------|-------------|
| Skill | `privatevoice-testing` | Architecture knowledge and round-trip testing patterns |
| Command | `/setup` | Install dependencies and verify environment |
| Command | `/round-trip-test` | Run a complete end-to-end TTS test |
| Agent | `round-trip-tester` | Autonomous comprehensive testing agent |

## Tauri Integration

To enable the MCP bridge for native UI control (screenshots, element inspection), the PrivateVoice app must be built with the `mcp-bridge` Cargo feature:

```bash
# In the PrivateVoice repo
cargo tauri build --features mcp-bridge
```

This adds a WebSocket listener on port 9223. The feature is off by default in production builds.

Changes required in the Tauri app (already applied on the `feature/mcp-control-server` branch):

1. `Cargo.toml`: `tauri-plugin-mcp-bridge` as optional dependency behind `mcp-bridge` feature
2. `lib.rs`: Conditional plugin registration with `#[cfg(feature = "mcp-bridge")]`
3. `tauri.conf.json`: `withGlobalTauri: true`
