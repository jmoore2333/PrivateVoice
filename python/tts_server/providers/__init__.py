"""TTS provider adapters."""

from .base import ProviderError
from .catalog import list_catalog, resolve_selection, model_supports_mode, recommended_model_for_mode
from .registry import get_provider_registry

__all__ = [
    "ProviderError",
    "get_provider_registry",
    "list_catalog",
    "resolve_selection",
    "model_supports_mode",
    "recommended_model_for_mode",
]
