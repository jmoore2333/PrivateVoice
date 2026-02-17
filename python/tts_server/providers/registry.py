"""Provider registry singleton."""

from __future__ import annotations

from .base import TTSProvider
from .chatterbox_provider import ChatterboxProvider
from .qwen_provider import QwenProvider


class ProviderRegistry:
    def __init__(self) -> None:
        self._providers: dict[str, TTSProvider] = {}

    def register(self, provider: TTSProvider) -> None:
        self._providers[provider.provider_id] = provider

    def get(self, provider_id: str) -> TTSProvider | None:
        return self._providers.get(provider_id)

    def all(self) -> dict[str, TTSProvider]:
        return dict(self._providers)


_registry: ProviderRegistry | None = None


def get_provider_registry() -> ProviderRegistry:
    global _registry
    if _registry is None:
        reg = ProviderRegistry()
        reg.register(QwenProvider())
        reg.register(ChatterboxProvider())
        _registry = reg
    return _registry
