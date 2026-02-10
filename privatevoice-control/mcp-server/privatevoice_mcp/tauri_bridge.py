"""WebSocket client for the Tauri MCP Bridge plugin (port 9223).

The bridge is provided by `tauri-plugin-mcp-bridge` and exposes native UI
operations: screenshots, element inspection, JS evaluation, window state, etc.

Protocol format:
  Request:  {"command": "<name>", "id": "<unique>", "args": {...}}
  Response: {"id": "<same>", "success": bool, "data": ..., "error": ...}
"""

from __future__ import annotations

import base64
import json
import os
import subprocess

import websockets


_msg_counter = 0


def _next_msg_id() -> str:
    global _msg_counter
    _msg_counter += 1
    return f"msg-{_msg_counter:04d}"


class TauriBridge:
    """Communicates with the Tauri MCP bridge via WebSocket."""

    def __init__(self, url: str) -> None:
        self.url = url
        self._ws: websockets.WebSocketClientProtocol | None = None

    async def connect(self) -> None:
        """Establish WebSocket connection to the bridge."""
        if self._ws is not None:
            try:
                await self._ws.ping()
                return  # Already connected
            except Exception:
                self._ws = None

        self._ws = await websockets.connect(self.url, open_timeout=5)

    async def disconnect(self) -> None:
        """Close the WebSocket connection."""
        if self._ws is not None:
            try:
                await self._ws.close()
            except Exception:
                pass
            self._ws = None

    @property
    def connected(self) -> bool:
        return self._ws is not None

    async def _send_command(self, command: str, args: dict | None = None) -> dict:
        """Send a JSON command to the bridge and return the response."""
        if self._ws is None:
            raise ConnectionError(
                "Bridge not connected. Launch the app with app_launch_and_verify first."
            )

        msg_id = _next_msg_id()
        payload: dict = {"command": command, "id": msg_id}
        if args:
            payload["args"] = args

        await self._ws.send(json.dumps(payload))
        response = await self._ws.recv()
        return json.loads(response)

    # ------------------------------------------------------------------
    # Screenshot
    # ------------------------------------------------------------------

    async def take_screenshot(self, save_path: str, full_window: bool = True) -> dict:
        """Capture a screenshot of the Tauri window.

        Tries the bridge first; falls back to macOS screencapture CLI.
        """
        try:
            return await self._bridge_screenshot(save_path, full_window)
        except (ConnectionError, Exception) as exc:
            # Fallback to macOS native screencapture
            return await self._fallback_screenshot(save_path, str(exc))

    async def _bridge_screenshot(self, save_path: str, full_window: bool) -> dict:
        """Take screenshot via bridge WebSocket protocol."""
        result = await self._send_command("capture_native_screenshot", {
            "format": "png",
        })

        if not result.get("success"):
            raise RuntimeError(result.get("error", "Unknown bridge error"))

        # The bridge returns a data URL (data:image/png;base64,...)
        image_data = result.get("data", "")
        if not image_data:
            raise RuntimeError("Bridge returned empty screenshot data.")

        # Strip data URL prefix if present
        if image_data.startswith("data:"):
            image_data = image_data.split(",", 1)[1]

        png_bytes = base64.b64decode(image_data)
        with open(save_path, "wb") as f:
            f.write(png_bytes)

        return {
            "path": save_path,
            "size_bytes": len(png_bytes),
            "method": "bridge",
        }

    @staticmethod
    async def _fallback_screenshot(save_path: str, bridge_error: str) -> dict:
        """Fall back to macOS screencapture CLI targeting the PrivateVoice window."""
        # Find the window ID for PrivateVoice
        try:
            wid_result = subprocess.run(
                [
                    "osascript",
                    "-e",
                    'tell application "System Events" to get id of first window of '
                    '(first process whose name is "PrivateVoice")',
                ],
                capture_output=True,
                text=True,
                timeout=5,
            )
            window_id = wid_result.stdout.strip()
        except Exception:
            window_id = None

        if window_id:
            # Capture specific window by ID
            cmd = ["screencapture", "-l", window_id, "-o", "-x", save_path]
        else:
            # Capture frontmost window
            cmd = ["screencapture", "-w", "-o", "-x", save_path]

        try:
            subprocess.run(cmd, capture_output=True, timeout=10)
        except Exception as exc:
            return {
                "error": f"Both bridge and screencapture failed. Bridge: {bridge_error}. CLI: {exc}",
            }

        if not os.path.exists(save_path):
            return {
                "error": f"Screenshot file not created. Bridge error: {bridge_error}",
            }

        size = os.path.getsize(save_path)
        return {
            "path": save_path,
            "size_bytes": size,
            "method": "screencapture_fallback",
            "bridge_error": bridge_error,
        }

    # ------------------------------------------------------------------
    # Window management
    # ------------------------------------------------------------------

    async def list_windows(self) -> dict:
        """List all Tauri windows."""
        return await self._send_command("list_windows")

    async def get_window_info(self, window_id: str | None = None) -> dict:
        """Get the Tauri window info (size, position, focus)."""
        args = {}
        if window_id:
            args["windowId"] = window_id
        return await self._send_command("get_window_info", args or None)

    async def resize_window(
        self, width: int, height: int, window_id: str | None = None, logical: bool = True
    ) -> dict:
        """Resize a Tauri window."""
        args: dict = {"width": width, "height": height, "logical": logical}
        if window_id:
            args["windowId"] = window_id
        return await self._send_command("resize_window", args)

    # ------------------------------------------------------------------
    # JS evaluation
    # ------------------------------------------------------------------

    async def evaluate_js(self, script: str, window_label: str | None = None) -> dict:
        """Execute JavaScript in the WebView and return the result."""
        args: dict = {"script": script}
        if window_label:
            args["windowLabel"] = window_label
        return await self._send_command("execute_js", args)

    # ------------------------------------------------------------------
    # Convenience: get window state (wraps get_window_info)
    # ------------------------------------------------------------------

    async def get_window_state(self) -> dict:
        """Get window state — alias for get_window_info."""
        return await self.get_window_info()
