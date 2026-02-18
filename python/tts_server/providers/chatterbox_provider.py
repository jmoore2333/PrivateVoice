"""Chatterbox provider adapter (Turbo, Original, Multilingual)."""

from __future__ import annotations

import os
import tempfile
from typing import Any

import numpy as np
import soundfile as sf

from .base import (
    ModelStatus,
    ProviderError,
    TTS_MODE_CLONE,
    TTS_MODE_CUSTOM,
    TTS_MODE_DESIGN,
    TTSProvider,
)
from .catalog import get_entry, model_supports_mode
from ..device import get_device_config
from ..model_registry import (
    CHATTERBOX_MODEL_SPECS,
    ensure_required_files,
    verify_snapshot_hashes,
)


CHATTERBOX_MODEL_KEYS = {"turbo", "original", "multilingual"}


class ChatterboxProvider(TTSProvider):
    provider_id = "chatterbox"

    def __init__(self) -> None:
        self._model = None
        self._model_key: str | None = None
        self._device: str | None = None

    def _load_impl(self, model_key: str) -> None:
        try:
            from huggingface_hub import snapshot_download

            spec = CHATTERBOX_MODEL_SPECS[model_key]
            snapshot_kwargs: dict[str, Any] = {
                "repo_id": spec.repo_id,
                "revision": spec.revision,
            }
            if spec.allow_patterns:
                snapshot_kwargs["allow_patterns"] = list(spec.allow_patterns)

            # Keep optional support for authenticated Hugging Face access.
            token = os.getenv("HF_TOKEN")
            if token:
                snapshot_kwargs["token"] = token

            local_path = snapshot_download(**snapshot_kwargs)
            ensure_required_files(local_path, spec.required_files)
            verify_snapshot_hashes(local_path, spec.expected_sha256)

            if model_key == "turbo":
                from chatterbox.tts_turbo import ChatterboxTurboTTS

                self._model = ChatterboxTurboTTS.from_local(local_path, device=self._device)
            elif model_key == "original":
                from chatterbox.tts import ChatterboxTTS

                self._model = ChatterboxTTS.from_local(local_path, device=self._device)
            elif model_key == "multilingual":
                from chatterbox.mtl_tts import ChatterboxMultilingualTTS

                self._model = ChatterboxMultilingualTTS.from_local(local_path, device=self._device)
            else:
                raise ProviderError(
                    "invalid_provider_params",
                    f"Unknown Chatterbox model key: {model_key}",
                    extra={"provider": self.provider_id, "model_key": model_key},
                )
        except ProviderError:
            raise
        except Exception as exc:
            # Most common causes are missing runtime dependencies or
            # incompatible local package state.
            raise ProviderError(
                "provider_runtime_missing",
                (
                    "Chatterbox runtime is not available or is incompatible in this "
                    "environment. Run Environment > Full rebuild, restart PrivateVoice, "
                    "and retry."
                ),
                status_code=400,
                extra={"provider": self.provider_id, "detail": str(exc)},
            ) from exc

    def load_model(self, model_key: str) -> dict[str, Any]:
        if model_key not in CHATTERBOX_MODEL_KEYS:
            raise ProviderError(
                "invalid_provider_params",
                f"Unknown Chatterbox model key: {model_key}",
                extra={"provider": self.provider_id, "model_key": model_key},
            )

        if self._model is not None and self._model_key == model_key:
            entry = get_entry(self.provider_id, model_key)
            return {
                "status": "loaded",
                "provider": self.provider_id,
                "model_key": model_key,
                "model_id": model_key,
                "display_name": entry.display_name if entry else model_key,
            }

        self.unload_model()

        cfg = get_device_config()
        self._device = cfg.device
        self._load_impl(model_key)
        self._model_key = model_key
        entry = get_entry(self.provider_id, model_key)
        return {
            "status": "loaded",
            "provider": self.provider_id,
            "model_key": model_key,
            "model_id": model_key,
            "display_name": entry.display_name if entry else model_key,
        }

    def unload_model(self) -> dict[str, Any]:
        self._model = None
        self._model_key = None
        return {"status": "unloaded", "provider": self.provider_id}

    def status(self) -> ModelStatus:
        if self._model is None or self._model_key is None:
            return ModelStatus(loaded=False)
        entry = get_entry(self.provider_id, self._model_key)
        return ModelStatus(
            loaded=True,
            provider=self.provider_id,
            model_key=self._model_key,
            model_id=self._model_key,
            display_name=entry.display_name if entry else self._model_key,
            capabilities=list(entry.capabilities) if entry else [TTS_MODE_CUSTOM, TTS_MODE_CLONE],
            languages=list(entry.languages) if entry else ["en"],
        )

    def generate(
        self,
        mode: str,
        params: dict[str, Any],
        *,
        reference_audio: bytes | None = None,
    ) -> tuple[bytes, str]:
        if self._model is None or self._model_key is None:
            raise ProviderError("invalid_provider_params", "Model not loaded")

        if mode == TTS_MODE_DESIGN:
            raise ProviderError(
                "provider_feature_unsupported",
                "Chatterbox does not support voice-design mode in this release",
                extra={"provider": self.provider_id, "model_key": self._model_key, "mode": mode},
            )

        if not model_supports_mode(self.provider_id, self._model_key, mode):
            raise ProviderError(
                "incompatible_model_mode",
                f"Loaded model '{self._model_key}' does not support mode '{mode}'",
                extra={"provider": self.provider_id, "model_key": self._model_key, "mode": mode},
            )

        text = (params.get("text") or "").strip()
        if not text:
            raise ProviderError("invalid_provider_params", "Text cannot be empty")

        fmt = params.get("format", "wav")
        bitrate = int(params.get("mp3_bitrate", 192))
        advanced = params.get("advanced", {}) or {}

        audio_prompt_path = None
        if mode == TTS_MODE_CLONE:
            if not reference_audio:
                raise ProviderError("invalid_provider_params", "reference_audio is required")
            audio_prompt_path = self._write_temp_reference_audio(reference_audio)

        try:
            model_kwargs: dict[str, Any] = {
                "text": text,
                "audio_prompt_path": audio_prompt_path,
                "temperature": float(advanced.get("temperature", 0.8)),
                "top_p": float(advanced.get("top_p", 0.95)),
                "repetition_penalty": float(advanced.get("repetition_penalty", 1.2)),
            }

            if self._model_key == "turbo":
                model_kwargs["top_k"] = int(advanced.get("top_k", 1000))
                model_kwargs["min_p"] = float(advanced.get("min_p", 0.0))
                model_kwargs["cfg_weight"] = float(advanced.get("cfg_weight", 0.0))
                model_kwargs["exaggeration"] = float(advanced.get("exaggeration", 0.0))
                model_kwargs["norm_loudness"] = bool(advanced.get("norm_loudness", True))
                wav = self._model.generate(**model_kwargs)
            elif self._model_key == "original":
                model_kwargs["min_p"] = float(advanced.get("min_p", 0.05))
                model_kwargs["cfg_weight"] = float(advanced.get("cfg_weight", 0.5))
                model_kwargs["exaggeration"] = float(advanced.get("exaggeration", 0.5))
                wav = self._model.generate(**model_kwargs)
            elif self._model_key == "multilingual":
                model_kwargs["language_id"] = (
                    (advanced.get("language_id") or params.get("language_id") or "en")
                )
                model_kwargs["min_p"] = float(advanced.get("min_p", 0.05))
                model_kwargs["cfg_weight"] = float(advanced.get("cfg_weight", 0.5))
                model_kwargs["exaggeration"] = float(advanced.get("exaggeration", 0.5))
                wav = self._model.generate(**model_kwargs)
            else:
                raise ProviderError(
                    "invalid_provider_params",
                    f"Unsupported Chatterbox model key: {self._model_key}",
                )

            wav_np = self._to_mono_float32(wav)
            if fmt == "mp3":
                return self._to_mp3(wav_np, getattr(self._model, "sr", 24000), bitrate), "audio/mpeg"
            return self._to_wav(wav_np, getattr(self._model, "sr", 24000)), "audio/wav"
        except ProviderError:
            raise
        except Exception as exc:
            raise ProviderError(
                "invalid_provider_params",
                f"Chatterbox generation failed: {exc}",
                extra={"provider": self.provider_id, "model_key": self._model_key},
            ) from exc
        finally:
            if audio_prompt_path and os.path.exists(audio_prompt_path):
                try:
                    os.remove(audio_prompt_path)
                except OSError:
                    pass

    @staticmethod
    def _write_temp_reference_audio(audio_bytes: bytes) -> str:
        fd, path = tempfile.mkstemp(prefix="pv_chatterbox_ref_", suffix=".wav")
        os.close(fd)
        with open(path, "wb") as f:
            f.write(audio_bytes)
        return path

    @staticmethod
    def _to_mono_float32(wav: Any) -> np.ndarray:
        if hasattr(wav, "detach"):
            wav = wav.detach().cpu().numpy()
        arr = np.asarray(wav)
        if arr.ndim > 1:
            arr = arr.reshape(-1)
        arr = arr.astype(np.float32)
        max_abs = float(np.max(np.abs(arr))) if arr.size else 0.0
        if max_abs > 1.0:
            arr = arr / max_abs
        return arr

    @staticmethod
    def _to_wav(wav: np.ndarray, sr: int) -> bytes:
        import io

        buf = io.BytesIO()
        sf.write(buf, wav, sr, format="WAV", subtype="PCM_16")
        buf.seek(0)
        return buf.read()

    @staticmethod
    def _to_mp3(wav: np.ndarray, sr: int, bitrate: int) -> bytes:
        import lameenc

        pcm = (np.clip(wav, -1.0, 1.0) * 32767).astype(np.int16).tobytes()
        enc = lameenc.Encoder()
        enc.set_bit_rate(bitrate)
        enc.set_in_sample_rate(sr)
        enc.set_channels(1)
        enc.set_quality(2)
        data = enc.encode(pcm)
        data += enc.flush()
        return bytes(data)
