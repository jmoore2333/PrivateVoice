"""Process management for launching and shutting down the PrivateVoice Tauri app."""

from __future__ import annotations

import asyncio
import os
import signal
import subprocess
import time


class AppLauncher:
    """Manages the PrivateVoice app process lifecycle."""

    def __init__(self, default_app_path: str, api_base: str) -> None:
        self.default_app_path = default_app_path
        self.api_base = api_base
        self._pid: int | None = None

    async def launch_and_wait(
        self,
        binary_path: str | None = None,
        timeout_seconds: int = 120,
    ) -> dict:
        """Launch PrivateVoice and wait for the backend to become ready."""
        import httpx

        app_path = binary_path or self.default_app_path
        start_time = time.monotonic()

        # Check if already running
        already_running = await self._check_backend_alive()
        if already_running:
            elapsed = time.monotonic() - start_time
            return {
                "status": "already_running",
                "elapsed_seconds": round(elapsed, 1),
                "message": "PrivateVoice backend is already responding.",
            }

        # Verify binary exists
        if not os.path.exists(app_path):
            return {
                "error": f"Application not found at: {app_path}",
                "hint": "Set PRIVATEVOICE_APP_PATH or pass binary_path parameter.",
            }

        # Launch the app
        try:
            proc = subprocess.Popen(
                ["open", "-a", app_path],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            proc.wait(timeout=10)
        except Exception as exc:
            return {"error": f"Failed to launch app: {exc}"}

        # Poll until backend is ready
        last_phase = "unknown"
        last_message = ""
        poll_interval = 2.0

        while (time.monotonic() - start_time) < timeout_seconds:
            await asyncio.sleep(poll_interval)

            try:
                async with httpx.AsyncClient(base_url=self.api_base, timeout=5.0) as c:
                    # Check health first
                    health = await c.get("/health")
                    if health.status_code != 200:
                        continue

                    # Check startup status
                    status = await c.get("/startup-status")
                    data = status.json()
                    last_phase = data.get("phase", "unknown")
                    last_message = data.get("message", "")

                    if last_phase == "ready":
                        elapsed = time.monotonic() - start_time
                        self._pid = self._find_app_pid(app_path)
                        return {
                            "status": "ready",
                            "elapsed_seconds": round(elapsed, 1),
                            "phase": last_phase,
                            "message": last_message,
                        }

                    if last_phase == "error":
                        return {
                            "error": f"Startup failed: {last_message}",
                            "phase": last_phase,
                        }

            except (httpx.ConnectError, httpx.TimeoutException):
                continue

        # Timeout
        elapsed = time.monotonic() - start_time
        return {
            "error": f"Timeout after {timeout_seconds}s waiting for backend.",
            "last_phase": last_phase,
            "last_message": last_message,
            "elapsed_seconds": round(elapsed, 1),
        }

    async def shutdown(self, tts_client, force: bool = False) -> dict:
        """Gracefully shut down the app, optionally force-kill."""
        start_time = time.monotonic()

        # Try graceful shutdown via API
        result = await tts_client.shutdown_backend()

        # Wait for process to exit
        for _ in range(20):  # 10 seconds
            await asyncio.sleep(0.5)
            if not await self._check_backend_alive():
                elapsed = time.monotonic() - start_time
                return {
                    "status": "shutdown_complete",
                    "method": "graceful",
                    "elapsed_seconds": round(elapsed, 1),
                }

        # Force kill if requested
        if force:
            killed = self._force_kill()
            elapsed = time.monotonic() - start_time
            return {
                "status": "shutdown_complete" if killed else "shutdown_failed",
                "method": "force_kill",
                "elapsed_seconds": round(elapsed, 1),
            }

        elapsed = time.monotonic() - start_time
        return {
            "error": "Graceful shutdown timed out after 10s. Use force=True to force kill.",
            "elapsed_seconds": round(elapsed, 1),
        }

    async def _check_backend_alive(self) -> bool:
        import httpx

        try:
            async with httpx.AsyncClient(base_url=self.api_base, timeout=3.0) as c:
                r = await c.get("/health")
                return r.status_code == 200
        except Exception:
            return False

    @staticmethod
    def _find_app_pid(app_path: str) -> int | None:
        """Find the PID of the running PrivateVoice process."""
        try:
            result = subprocess.run(
                ["pgrep", "-f", "PrivateVoice"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            pids = result.stdout.strip().split("\n")
            return int(pids[0]) if pids and pids[0] else None
        except Exception:
            return None

    def _force_kill(self) -> bool:
        """Force kill the PrivateVoice process."""
        try:
            # Try stored PID first
            if self._pid:
                os.kill(self._pid, signal.SIGKILL)
                return True

            # Fall back to pkill
            subprocess.run(
                ["pkill", "-9", "-f", "PrivateVoice"],
                capture_output=True,
                timeout=5,
            )
            return True
        except Exception:
            return False
