"""Qwen3 provider adapter."""

from __future__ import annotations

from typing import Any

from .base import (
    ModelStatus,
    ProviderError,
    TTS_MODE_CLONE,
    TTS_MODE_CUSTOM,
    TTS_MODE_DESIGN,
    TTSProvider,
)
from .catalog import get_entry, model_supports_mode
from ..inference import PRESET_SPEAKERS, get_model
from ..speaker_data import SUPPORTED_LANGUAGES


class QwenProvider(TTSProvider):
    provider_id = "qwen3"

    def load_model(self, model_key: str) -> dict[str, Any]:
        entry = get_entry(self.provider_id, model_key)
        if entry is None:
            raise ProviderError(
                "invalid_provider_params",
                f"Unknown Qwen model key: {model_key}",
                extra={"provider": self.provider_id, "model_key": model_key},
            )

        model = get_model()
        model.load(model_key)
        return {
            "status": "loaded",
            "provider": self.provider_id,
            "model_key": model_key,
            "model_id": entry.legacy_model_id or model_key,
            "display_name": entry.display_name,
        }

    def unload_model(self) -> dict[str, Any]:
        model = get_model()
        model.unload()
        return {"status": "unloaded", "provider": self.provider_id}

    def status(self) -> ModelStatus:
        model = get_model()
        if not model.is_loaded:
            return ModelStatus(loaded=False)

        entry = get_entry(self.provider_id, model.model_id)
        capabilities = list(entry.capabilities) if entry else []
        languages = list(entry.languages) if entry else ["english"]
        return ModelStatus(
            loaded=True,
            provider=self.provider_id,
            model_key=model.model_id,
            model_id=entry.legacy_model_id if entry else model.model_id,
            display_name=entry.display_name if entry else model.model_id,
            capabilities=capabilities,
            languages=languages,
        )

    def list_speakers(self) -> list[str]:
        return list(PRESET_SPEAKERS)

    def generate(
        self,
        mode: str,
        params: dict[str, Any],
        *,
        reference_audio: bytes | None = None,
    ) -> tuple[bytes, str]:
        model = get_model()
        if not model.is_loaded:
            raise ProviderError("invalid_provider_params", "Model not loaded")

        if not model_supports_mode(self.provider_id, model.model_id, mode):
            raise ProviderError(
                "incompatible_model_mode",
                f"Loaded model '{model.model_id}' does not support mode '{mode}'",
                extra={"provider": self.provider_id, "model_key": model.model_id, "mode": mode},
            )

        text = (params.get("text") or "").strip()
        if not text:
            raise ProviderError("invalid_provider_params", "Text cannot be empty")

        fmt = params.get("format", "wav")
        bitrate = params.get("mp3_bitrate", 192)
        seed = params.get("seed")
        sample_rate = params.get("sample_rate")
        bit_depth = params.get("bit_depth", 16)

        if mode == TTS_MODE_CUSTOM:
            speaker = params.get("speaker", "serena")
            if speaker not in PRESET_SPEAKERS:
                raise ProviderError(
                    "invalid_provider_params",
                    f"Unknown speaker: {speaker}",
                    extra={"provider": self.provider_id, "speaker": speaker},
                )
            return model.generate_custom_voice(
                text=text,
                speaker=speaker,
                instruction=params.get("instruction", ""),
                language=params.get("language", "english"),
                output_format=fmt,
                mp3_bitrate=bitrate,
                stable_lead_in=params.get("stable_lead_in", True),
                seed=seed,
                sample_rate=sample_rate if fmt == "wav" else None,
                bit_depth=bit_depth,
            )

        if mode == TTS_MODE_CLONE:
            if not reference_audio:
                raise ProviderError("invalid_provider_params", "reference_audio is required")
            x_vector_only_mode = bool(params.get("x_vector_only_mode", False))
            reference_text = params.get("reference_text", "")
            if not x_vector_only_mode and not reference_text:
                raise ProviderError(
                    "invalid_provider_params",
                    "reference_text is required unless x_vector_only_mode is enabled",
                )
            return model.generate_voice_clone(
                text=text,
                reference_audio=reference_audio,
                reference_text=reference_text,
                language=params.get("language", "english"),
                x_vector_only_mode=x_vector_only_mode,
                output_format=fmt,
                mp3_bitrate=bitrate,
                seed=seed,
                sample_rate=sample_rate if fmt == "wav" else None,
                bit_depth=bit_depth,
            )

        if mode == TTS_MODE_DESIGN:
            voice_description = (params.get("voice_description") or "").strip()
            if not voice_description:
                raise ProviderError("invalid_provider_params", "voice_description is required")
            return model.generate_voice_design(
                text=text,
                voice_description=voice_description,
                language=params.get("language", "english"),
                output_format=fmt,
                mp3_bitrate=bitrate,
                stable_lead_in=params.get("stable_lead_in", True),
                seed=seed,
                sample_rate=sample_rate if fmt == "wav" else None,
                bit_depth=bit_depth,
            )

        raise ProviderError("invalid_provider_params", f"Unsupported mode: {mode}")

    @staticmethod
    def supported_languages() -> list[str]:
        return [lang.lower() for lang in SUPPORTED_LANGUAGES]
