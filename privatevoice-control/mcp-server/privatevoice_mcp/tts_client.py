"""HTTP client for the PrivateVoice FastAPI backend (port 8765)."""

from __future__ import annotations

import base64
import os
import tempfile

import httpx


class TTSClient:
    """Wraps all FastAPI backend endpoints."""

    def __init__(self, base_url: str, timeout: float = 120.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(base_url=self.base_url, timeout=self.timeout)

    # ------------------------------------------------------------------
    # Health / status
    # ------------------------------------------------------------------

    async def check_health(self) -> dict:
        try:
            async with self._client() as c:
                r = await c.get("/health", timeout=5.0)
                data = r.json()
                data["alive"] = True
                return data
        except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPError):
            return {"alive": False}

    async def get_startup_status(self) -> dict:
        async with self._client() as c:
            r = await c.get("/startup-status")
            return r.json()

    async def get_model_status(self) -> dict:
        async with self._client() as c:
            r = await c.get("/model-status")
            return r.json()

    async def get_model_catalog(self) -> dict:
        async with self._client() as c:
            r = await c.get("/model-catalog")
            return r.json()

    async def get_system_info(self) -> dict:
        async with self._client() as c:
            r = await c.get("/system-info")
            return r.json()

    async def get_composite_status(self) -> dict:
        """Fetch health, startup-status, model-status, system-info in parallel."""
        async with self._client() as c:
            results = {}
            for name, path in [
                ("health", "/health"),
                ("startup", "/startup-status"),
                ("model", "/model-status"),
                ("system", "/system-info"),
            ]:
                try:
                    r = await c.get(path, timeout=10.0)
                    results[name] = r.json()
                except Exception as exc:
                    results[name] = {"error": str(exc)}
            return results

    # ------------------------------------------------------------------
    # Model management
    # ------------------------------------------------------------------

    async def load_model(
        self,
        model_id: str | None = None,
        provider: str | None = None,
        model_key: str | None = None,
    ) -> dict:
        payload: dict[str, str] = {}
        if model_id:
            payload["model_id"] = model_id
        if provider:
            payload["provider"] = provider
        if model_key:
            payload["model_key"] = model_key

        if not payload:
            return {"error": "Provide model_id or provider/model_key."}

        async with self._client() as c:
            r = await c.post("/load-model", json=payload)
            return r.json()

    async def unload_model(self) -> dict:
        async with self._client() as c:
            r = await c.post("/unload-model")
            return r.json()

    # ------------------------------------------------------------------
    # Speakers
    # ------------------------------------------------------------------

    async def get_speakers(self) -> dict:
        async with self._client() as c:
            r = await c.get("/speakers")
            return r.json()

    # ------------------------------------------------------------------
    # Generation
    # ------------------------------------------------------------------

    async def generate_custom_voice(self, params: dict) -> dict:
        text = params.get("text")
        if not text:
            return {"error": "Parameter 'text' is required."}

        payload = {
            "text": text,
            "speaker": params.get("speaker", "serena"),
            "instruction": params.get("instruction", ""),
            "language": params.get("language", "english"),
            "format": params.get("format", "wav"),
            "mp3_bitrate": params.get("mp3_bitrate", 192),
        }

        return await self._generate("/generate/custom-voice", payload)

    async def generate_voice_clone(self, params: dict) -> dict:
        text = params.get("text")
        ref_audio_path = params.get("reference_audio")
        if not text:
            return {"error": "Parameter 'text' is required."}
        if not ref_audio_path:
            return {"error": "Parameter 'reference_audio' is required."}
        if not os.path.exists(ref_audio_path):
            return {"error": f"Reference audio not found: {ref_audio_path}"}

        form_data = {
            "text": text,
            "reference_text": params.get("reference_text", ""),
            "x_vector_only_mode": str(params.get("x_vector_only_mode", False)).lower(),
            "language": params.get("language", "english"),
            "format": params.get("format", "wav"),
            "mp3_bitrate": str(params.get("mp3_bitrate", 192)),
        }

        async with self._client() as c:
            with open(ref_audio_path, "rb") as f:
                files = {"reference_audio": (os.path.basename(ref_audio_path), f, "audio/wav")}
                r = await c.post("/generate/voice-clone", data=form_data, files=files)

            if r.status_code != 200:
                return {"error": f"Generation failed ({r.status_code}): {r.text}"}

            return self._save_audio(r, params.get("format", "wav"))

    async def generate_voice_design(self, params: dict) -> dict:
        text = params.get("text")
        voice_desc = params.get("voice_description")
        if not text:
            return {"error": "Parameter 'text' is required."}
        if not voice_desc:
            return {"error": "Parameter 'voice_description' is required."}

        payload = {
            "text": text,
            "voice_description": voice_desc,
            "language": params.get("language", "english"),
            "format": params.get("format", "wav"),
            "mp3_bitrate": params.get("mp3_bitrate", 192),
        }

        return await self._generate("/generate/voice-design", payload)

    async def generate_speech(self, params: dict) -> dict:
        mode = params.get("mode")
        text = params.get("text")
        if not mode:
            return {"error": "Parameter 'mode' is required."}
        if not text:
            return {"error": "Parameter 'text' is required."}

        payload = {
            "mode": mode,
            "provider": params.get("provider"),
            "model_key": params.get("model_key"),
            "text": text,
            "language": params.get("language", "english"),
            "speaker": params.get("speaker", "serena"),
            "instruction": params.get("instruction", ""),
            "voice_description": params.get("voice_description", ""),
            "reference_text": params.get("reference_text", ""),
            "x_vector_only_mode": params.get("x_vector_only_mode", False),
            "format": params.get("format", "wav"),
            "mp3_bitrate": params.get("mp3_bitrate", 192),
            "stable_lead_in": params.get("stable_lead_in", True),
            "seed": params.get("seed"),
            "sample_rate": params.get("sample_rate"),
            "bit_depth": params.get("bit_depth", 16),
            "advanced": params.get("advanced", {}) or {},
            "reference_audio_base64": None,
        }

        ref_audio_path = params.get("reference_audio")
        if ref_audio_path:
            if not os.path.exists(ref_audio_path):
                return {"error": f"Reference audio not found: {ref_audio_path}"}
            with open(ref_audio_path, "rb") as f:
                payload["reference_audio_base64"] = base64.b64encode(f.read()).decode("ascii")

        return await self._generate("/generate/speech", payload)

    # ------------------------------------------------------------------
    # Shutdown
    # ------------------------------------------------------------------

    async def shutdown_backend(self) -> dict:
        try:
            async with self._client() as c:
                r = await c.post("/shutdown", timeout=10.0)
                return r.json()
        except Exception as exc:
            return {"error": str(exc)}

    # ------------------------------------------------------------------
    # Action dispatcher
    # ------------------------------------------------------------------

    async def trigger_action(self, action: str, params: dict) -> dict:
        dispatch = {
            "generate_custom_voice": self.generate_custom_voice,
            "generate_voice_clone": self.generate_voice_clone,
            "generate_voice_design": self.generate_voice_design,
            "generate_speech": self.generate_speech,
            "load_model": lambda p: self.load_model(
                model_id=p.get("model_id"),
                provider=p.get("provider"),
                model_key=p.get("model_key"),
            ),
            "load_provider_model": lambda p: self.load_model(
                provider=p.get("provider"),
                model_key=p.get("model_key"),
                model_id=p.get("model_id"),
            ),
            "unload_model": lambda _: self.unload_model(),
            "get_speakers": lambda _: self.get_speakers(),
            "get_model_status": lambda _: self.get_model_status(),
            "get_model_catalog": lambda _: self.get_model_catalog(),
            "get_system_info": lambda _: self.get_system_info(),
        }

        handler = dispatch.get(action)
        if handler is None:
            return {"error": f"Unknown action: {action}"}

        try:
            return await handler(params)
        except httpx.ConnectError:
            return {
                "error": "Backend unreachable. Is PrivateVoice running? Use app_launch_and_verify first."
            }
        except Exception as exc:
            return {"error": f"Action '{action}' failed: {exc}"}

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _generate(self, endpoint: str, payload: dict) -> dict:
        """POST JSON to a generation endpoint, save the returned audio."""
        async with self._client() as c:
            r = await c.post(endpoint, json=payload)

            if r.status_code != 200:
                return {"error": f"Generation failed ({r.status_code}): {r.text}"}

            return self._save_audio(r, payload.get("format", "wav"))

    @staticmethod
    def _save_audio(response: httpx.Response, fmt: str = "wav") -> dict:
        ext = fmt if fmt in ("wav", "mp3") else "wav"
        fd, path = tempfile.mkstemp(suffix=f".{ext}", prefix="pv_generated_")
        os.close(fd)

        with open(path, "wb") as f:
            f.write(response.content)

        return {
            "audio_path": path,
            "format": ext,
            "size_bytes": len(response.content),
            "content_type": response.headers.get("content-type", "unknown"),
        }
