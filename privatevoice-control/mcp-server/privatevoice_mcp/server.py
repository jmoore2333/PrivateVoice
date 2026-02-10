"""PrivateVoice MCP Server — FastMCP entry point with all tool definitions."""

from __future__ import annotations

import json
import os
import sys
import tempfile
from enum import Enum
from pathlib import Path

from fastmcp import FastMCP

from .app_launcher import AppLauncher
from .audio_capture import AudioCapture
from .speech_verify import SpeechVerifier
from .tauri_bridge import TauriBridge
from .tts_client import TTSClient

# ---------------------------------------------------------------------------
# Configuration from environment
# ---------------------------------------------------------------------------
APP_PATH = os.environ.get("PRIVATEVOICE_APP_PATH", "/Applications/PrivateVoice.app")
API_PORT = int(os.environ.get("PRIVATEVOICE_API_PORT", "8765"))
BRIDGE_PORT = int(os.environ.get("PRIVATEVOICE_BRIDGE_PORT", "9223"))
API_BASE = f"http://127.0.0.1:{API_PORT}"
BRIDGE_URL = f"ws://127.0.0.1:{BRIDGE_PORT}"


class ConnectionState(str, Enum):
    DISCONNECTED = "disconnected"
    LAUNCHING = "launching"
    BACKEND_READY = "backend_ready"
    FULLY_CONNECTED = "fully_connected"


# ---------------------------------------------------------------------------
# Shared state (module-level singletons, created lazily)
# ---------------------------------------------------------------------------
_tts: TTSClient | None = None
_bridge: TauriBridge | None = None
_launcher: AppLauncher | None = None
_audio: AudioCapture | None = None
_verifier: SpeechVerifier | None = None
_state = ConnectionState.DISCONNECTED


def _get_tts() -> TTSClient:
    global _tts
    if _tts is None:
        _tts = TTSClient(API_BASE)
    return _tts


def _get_bridge() -> TauriBridge:
    global _bridge
    if _bridge is None:
        _bridge = TauriBridge(BRIDGE_URL)
    return _bridge


def _get_launcher() -> AppLauncher:
    global _launcher
    if _launcher is None:
        _launcher = AppLauncher(APP_PATH, API_BASE)
    return _launcher


def _get_audio() -> AudioCapture:
    global _audio
    if _audio is None:
        _audio = AudioCapture()
    return _audio


def _get_verifier() -> SpeechVerifier:
    global _verifier
    if _verifier is None:
        _verifier = SpeechVerifier()
    return _verifier


# ---------------------------------------------------------------------------
# FastMCP Server
# ---------------------------------------------------------------------------
mcp = FastMCP(
    "privatevoice",
    instructions=(
        "Control the PrivateVoice desktop app for round-trip TTS testing. "
        "Launch the app, generate audio, capture screenshots, and verify speech accuracy."
    ),
)


# ---------------------------------------------------------------------------
# Tool 1: app_launch_and_verify
# ---------------------------------------------------------------------------
@mcp.tool()
async def app_launch_and_verify(
    binary_path: str = APP_PATH,
    timeout_seconds: int = 120,
    model_id: str | None = None,
) -> str:
    """Launch the PrivateVoice production binary and wait until the TTS backend is ready.

    Optionally pre-loads a specific model after startup. Returns startup timing,
    loaded model info, device details, and memory usage.

    Args:
        binary_path: Path to PrivateVoice.app (default: /Applications/PrivateVoice.app)
        timeout_seconds: Max seconds to wait for ready state (default: 120)
        model_id: Optional model to load after startup (e.g. "0.6b", "1.7b-base", "1.7b-design")
    """
    global _state
    launcher = _get_launcher()
    tts = _get_tts()

    _state = ConnectionState.LAUNCHING
    result = await launcher.launch_and_wait(binary_path, timeout_seconds)

    if result.get("error"):
        _state = ConnectionState.DISCONNECTED
        return json.dumps(result, indent=2)

    _state = ConnectionState.BACKEND_READY

    # Try connecting the bridge
    bridge = _get_bridge()
    try:
        await bridge.connect()
        _state = ConnectionState.FULLY_CONNECTED
        result["bridge"] = "connected"
    except Exception as exc:
        result["bridge"] = f"unavailable ({exc})"

    # Optionally load a model
    if model_id:
        load_result = await tts.load_model(model_id)
        result["model_load"] = load_result

    # Fetch final status
    status = await tts.get_composite_status()
    result.update(status)

    return json.dumps(result, indent=2)


# ---------------------------------------------------------------------------
# Tool 2: app_capture_view
# ---------------------------------------------------------------------------
@mcp.tool()
async def app_capture_view(
    save_path: str | None = None,
    full_window: bool = True,
) -> str:
    """Take a high-resolution native screenshot of the PrivateVoice window.

    Uses the Tauri MCP bridge for native window capture. Falls back to macOS
    screencapture CLI if the bridge is unavailable.

    Args:
        save_path: Where to save the PNG. Defaults to a temp file.
        full_window: Capture entire window (True) or just the viewport (False).
    """
    if save_path is None:
        save_path = os.path.join(
            tempfile.gettempdir(),
            f"pv_screenshot_{_next_id()}.png",
        )

    bridge = _get_bridge()
    result = await bridge.take_screenshot(save_path, full_window)
    return json.dumps(result, indent=2)


# ---------------------------------------------------------------------------
# Tool 3: app_trigger_action
# ---------------------------------------------------------------------------
@mcp.tool()
async def app_trigger_action(
    action: str,
    params: dict | None = None,
) -> str:
    """Trigger a TTS generation or backend action directly via the HTTP API.

    Bypasses the UI entirely. For generation actions, the returned audio is
    saved to a temp file and the path is returned.

    Args:
        action: One of "generate_custom_voice", "generate_voice_clone",
                "generate_voice_design", "load_model", "unload_model",
                "get_speakers", "get_system_info"
        params: Action-specific parameters as a dict.
                For generate_custom_voice: {text, speaker?, instruction?, language?, format?}
                For generate_voice_clone: {text, reference_audio, reference_text?, language?, format?}
                For generate_voice_design: {text, voice_description, language?, format?}
                For load_model: {model_id}
    """
    tts = _get_tts()
    params = params or {}

    valid_actions = {
        "generate_custom_voice",
        "generate_voice_clone",
        "generate_voice_design",
        "load_model",
        "unload_model",
        "get_speakers",
        "get_system_info",
    }

    if action not in valid_actions:
        return json.dumps({"error": f"Unknown action: {action}. Valid: {sorted(valid_actions)}"})

    result = await tts.trigger_action(action, params)
    return json.dumps(result, indent=2)


# ---------------------------------------------------------------------------
# Tool 4: app_get_status
# ---------------------------------------------------------------------------
@mcp.tool()
async def app_get_status() -> str:
    """Get comprehensive status of the PrivateVoice app.

    Returns backend health, loaded model info, startup phase, system info,
    and bridge connection state.
    """
    global _state
    tts = _get_tts()

    status: dict = {"connection_state": _state.value}

    health = await tts.check_health()
    if not health.get("alive"):
        _state = ConnectionState.DISCONNECTED
        status["backend"] = "unreachable"
        return json.dumps(status, indent=2)

    _state = max(_state, ConnectionState.BACKEND_READY, key=lambda s: list(ConnectionState).index(s))

    composite = await tts.get_composite_status()
    status.update(composite)

    # Check bridge
    bridge = _get_bridge()
    try:
        window_state = await bridge.get_window_state()
        status["window"] = window_state
        _state = ConnectionState.FULLY_CONNECTED
    except Exception:
        status["window"] = "bridge unavailable"

    status["connection_state"] = _state.value
    return json.dumps(status, indent=2)


# ---------------------------------------------------------------------------
# Tool 5: app_listen_audio
# ---------------------------------------------------------------------------
@mcp.tool()
async def app_listen_audio(
    duration_seconds: float = 5.0,
    save_path: str | None = None,
) -> str:
    """Capture system audio output for a specified duration and save to a WAV file.

    Uses macOS Core Audio Taps (requires macOS 14.2+ and Screen Recording permission).

    Args:
        duration_seconds: How long to record in seconds (default: 5.0, max: 30.0).
        save_path: Where to save the WAV file. Defaults to a temp file.
    """
    if duration_seconds > 30.0:
        return json.dumps({"error": "Maximum duration is 30 seconds."})
    if duration_seconds <= 0:
        return json.dumps({"error": "Duration must be positive."})

    if save_path is None:
        save_path = os.path.join(
            tempfile.gettempdir(),
            f"pv_audio_capture_{_next_id()}.wav",
        )

    audio = _get_audio()
    result = await audio.capture(duration_seconds, save_path)
    return json.dumps(result, indent=2)


# ---------------------------------------------------------------------------
# Tool 6: verify_speech_accuracy
# ---------------------------------------------------------------------------
@mcp.tool()
async def verify_speech_accuracy(
    audio_path: str,
    expected_text: str,
    model: str = "large",
    language: str = "en",
) -> str:
    """Transcribe an audio file and compare against expected text.

    Uses mlx-whisper for Apple Silicon-optimized local transcription.
    Returns the transcription, expected text, word error rate (WER),
    and a pass/fail verdict (threshold: WER < 0.15).

    Args:
        audio_path: Path to the WAV or MP3 file to transcribe.
        expected_text: The text that was supposed to be spoken.
        model: Whisper model — use a shorthand ("tiny", "base", "small",
               "medium", "large", "large-turbo") or a full HuggingFace repo ID.
               Default: "large" (whisper-large-v3-mlx, best accuracy).
        language: Expected language code (default: "en").
    """
    if not Path(audio_path).exists():
        return json.dumps({"error": f"Audio file not found: {audio_path}"})

    verifier = _get_verifier()
    result = await verifier.verify(audio_path, expected_text, model, language)
    return json.dumps(result, indent=2)


# ---------------------------------------------------------------------------
# Tool 7: app_shutdown
# ---------------------------------------------------------------------------
@mcp.tool()
async def app_shutdown(force: bool = False) -> str:
    """Gracefully shut down the PrivateVoice app.

    Sends a shutdown request to the backend, waits for the process to exit,
    and optionally force-kills if it doesn't stop in time.

    Args:
        force: Force kill if graceful shutdown fails after 10 seconds (default: False).
    """
    global _state
    tts = _get_tts()
    launcher = _get_launcher()

    result = await launcher.shutdown(tts, force)
    _state = ConnectionState.DISCONNECTED

    # Disconnect bridge
    bridge = _get_bridge()
    await bridge.disconnect()

    return json.dumps(result, indent=2)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
_counter = 0


def _next_id() -> str:
    global _counter
    _counter += 1
    return f"{_counter:03d}"


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main():
    """Run the MCP server with stdio transport."""
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
