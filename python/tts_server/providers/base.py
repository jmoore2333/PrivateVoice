"""Provider abstraction for multi-model TTS backends."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional


TTS_MODE_CUSTOM = "custom-voice"
TTS_MODE_CLONE = "voice-clone"
TTS_MODE_DESIGN = "voice-design"
SUPPORTED_TTS_MODES = (TTS_MODE_CUSTOM, TTS_MODE_CLONE, TTS_MODE_DESIGN)


@dataclass(frozen=True)
class ModelCatalogEntry:
    provider: str
    model_key: str
    display_name: str
    capabilities: tuple[str, ...]
    languages: tuple[str, ...]
    description: str
    advanced_controls: tuple[str, ...] = ()
    legacy_model_id: Optional[str] = None
    size_gb: Optional[float] = None


@dataclass
class ModelStatus:
    loaded: bool
    provider: Optional[str] = None
    model_key: Optional[str] = None
    model_id: Optional[str] = None
    display_name: Optional[str] = None
    capabilities: list[str] = field(default_factory=list)
    languages: list[str] = field(default_factory=list)


class ProviderError(Exception):
    """Structured provider-layer exception."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        status_code: int = 400,
        extra: Optional[dict[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.extra = extra or {}

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"code": self.code, "message": self.message}
        payload.update(self.extra)
        return payload


class TTSProvider:
    """Interface for TTS provider adapters."""

    provider_id: str = ""

    def load_model(self, model_key: str) -> dict[str, Any]:
        raise NotImplementedError

    def unload_model(self) -> dict[str, Any]:
        raise NotImplementedError

    def status(self) -> ModelStatus:
        raise NotImplementedError

    def list_speakers(self) -> list[str]:
        return []

    def generate(
        self,
        mode: str,
        params: dict[str, Any],
        *,
        reference_audio: bytes | None = None,
    ) -> tuple[bytes, str]:
        raise NotImplementedError
