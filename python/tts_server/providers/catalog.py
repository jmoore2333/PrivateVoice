"""Provider/model catalog and compatibility helpers."""

from __future__ import annotations

from typing import Optional

from .base import (
    ModelCatalogEntry,
    TTS_MODE_CLONE,
    TTS_MODE_CUSTOM,
    TTS_MODE_DESIGN,
)


DEFAULT_PROVIDER = "qwen3"
DEFAULT_MODEL_KEY = "0.6b"


CATALOG: tuple[ModelCatalogEntry, ...] = (
    ModelCatalogEntry(
        provider="qwen3",
        model_key="0.6b",
        legacy_model_id="0.6b",
        display_name="Qwen3 0.6B Custom",
        capabilities=(TTS_MODE_CUSTOM,),
        languages=("english",),
        description="Fast custom voice model",
        size_gb=1.2,
    ),
    ModelCatalogEntry(
        provider="qwen3",
        model_key="1.7b",
        legacy_model_id="1.7b",
        display_name="Qwen3 1.7B Custom",
        capabilities=(TTS_MODE_CUSTOM,),
        languages=("english",),
        description="Higher-quality custom voice model",
        size_gb=3.4,
    ),
    ModelCatalogEntry(
        provider="qwen3",
        model_key="0.6b-base",
        legacy_model_id="0.6b-base",
        display_name="Qwen3 0.6B Base",
        capabilities=(TTS_MODE_CLONE,),
        languages=("english",),
        description="Fast voice clone base model",
        size_gb=1.2,
    ),
    ModelCatalogEntry(
        provider="qwen3",
        model_key="1.7b-base",
        legacy_model_id="1.7b-base",
        display_name="Qwen3 1.7B Base",
        capabilities=(TTS_MODE_CLONE,),
        languages=("english",),
        description="Higher-quality voice clone base model",
        size_gb=3.4,
    ),
    ModelCatalogEntry(
        provider="qwen3",
        model_key="1.7b-design",
        legacy_model_id="1.7b-design",
        display_name="Qwen3 1.7B Design",
        capabilities=(TTS_MODE_DESIGN,),
        languages=("english",),
        description="Voice design model",
        size_gb=3.4,
    ),
    ModelCatalogEntry(
        provider="chatterbox",
        model_key="turbo",
        display_name="Chatterbox Turbo",
        capabilities=(TTS_MODE_CUSTOM, TTS_MODE_CLONE),
        languages=("en",),
        description="Low-latency English model with paralinguistic tags",
        advanced_controls=(
            "preset",
            "temperature",
            "top_p",
            "top_k",
            "repetition_penalty",
            "norm_loudness",
        ),
        size_gb=3.8,
    ),
    ModelCatalogEntry(
        provider="chatterbox",
        model_key="original",
        display_name="Chatterbox Original",
        capabilities=(TTS_MODE_CUSTOM, TTS_MODE_CLONE),
        languages=("en",),
        description="Expressive English model with cfg/exaggeration controls",
        advanced_controls=(
            "preset",
            "temperature",
            "top_p",
            "min_p",
            "repetition_penalty",
            "cfg_weight",
            "exaggeration",
        ),
        size_gb=3.0,
    ),
    ModelCatalogEntry(
        provider="chatterbox",
        model_key="multilingual",
        display_name="Chatterbox Multilingual",
        capabilities=(TTS_MODE_CUSTOM, TTS_MODE_CLONE),
        languages=(
            "ar",
            "da",
            "de",
            "el",
            "en",
            "es",
            "fi",
            "fr",
            "he",
            "hi",
            "it",
            "ja",
            "ko",
            "ms",
            "nl",
            "no",
            "pl",
            "pt",
            "ru",
            "sv",
            "sw",
            "tr",
            "zh",
        ),
        description="Multilingual Chatterbox model (23+ languages)",
        advanced_controls=(
            "preset",
            "temperature",
            "top_p",
            "min_p",
            "repetition_penalty",
            "cfg_weight",
            "exaggeration",
            "language_id",
        ),
        size_gb=3.0,
    ),
)


_BY_PROVIDER_AND_KEY = {(entry.provider, entry.model_key): entry for entry in CATALOG}
_BY_LEGACY_ID = {
    entry.legacy_model_id: entry
    for entry in CATALOG
    if entry.legacy_model_id
}


def list_catalog() -> list[dict]:
    return [
        {
            "provider": entry.provider,
            "model_key": entry.model_key,
            "legacy_model_id": entry.legacy_model_id,
            "display_name": entry.display_name,
            "capabilities": list(entry.capabilities),
            "languages": list(entry.languages),
            "description": entry.description,
            "advanced_controls": list(entry.advanced_controls),
            "size_gb": entry.size_gb,
        }
        for entry in CATALOG
    ]


def get_entry(provider: str, model_key: str) -> Optional[ModelCatalogEntry]:
    return _BY_PROVIDER_AND_KEY.get((provider, model_key))


def get_entry_from_legacy(model_id: str) -> Optional[ModelCatalogEntry]:
    return _BY_LEGACY_ID.get(model_id)


def resolve_selection(
    *,
    provider: Optional[str] = None,
    model_key: Optional[str] = None,
    model_id: Optional[str] = None,
) -> tuple[str, str, Optional[str]]:
    """Resolve load-model payload variants to provider/model_key."""
    if model_id:
        entry = get_entry_from_legacy(model_id)
        if entry is None:
            raise ValueError(f"Unknown model ID: {model_id}")
        return entry.provider, entry.model_key, entry.legacy_model_id

    selected_provider = provider or DEFAULT_PROVIDER
    selected_model_key = model_key
    if not selected_model_key:
        selected_model_key = DEFAULT_MODEL_KEY if selected_provider == DEFAULT_PROVIDER else "turbo"

    entry = get_entry(selected_provider, selected_model_key)
    if entry is None:
        raise ValueError(
            f"Unknown model selection provider={selected_provider} model_key={selected_model_key}"
        )
    return selected_provider, selected_model_key, entry.legacy_model_id


def model_supports_mode(provider: str, model_key: str, mode: str) -> bool:
    entry = get_entry(provider, model_key)
    if entry is None:
        return False
    return mode in entry.capabilities


def recommended_model_for_mode(provider: str, mode: str) -> Optional[str]:
    for entry in CATALOG:
        if entry.provider != provider:
            continue
        if mode in entry.capabilities:
            return entry.model_key
    return None
