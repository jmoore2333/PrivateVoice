"""Unit tests for MCP TTS client action dispatch."""

from __future__ import annotations

import asyncio

from privatevoice_mcp.tts_client import TTSClient


def run(coro):
    return asyncio.run(coro)


def test_trigger_action_dispatches_legacy_generation(monkeypatch):
    client = TTSClient("http://127.0.0.1:8765")

    async def fake_generate(params: dict) -> dict:
        return {"ok": True, "mode": "legacy", "text": params.get("text")}

    monkeypatch.setattr(client, "generate_custom_voice", fake_generate)

    result = run(client.trigger_action("generate_custom_voice", {"text": "hello"}))

    assert result["ok"] is True
    assert result["mode"] == "legacy"
    assert result["text"] == "hello"


def test_trigger_action_dispatches_provider_load(monkeypatch):
    client = TTSClient("http://127.0.0.1:8765")
    calls: list[dict] = []

    async def fake_load(model_id=None, provider=None, model_key=None):
        calls.append(
            {
                "model_id": model_id,
                "provider": provider,
                "model_key": model_key,
            }
        )
        return {"status": "loaded"}

    monkeypatch.setattr(client, "load_model", fake_load)

    result = run(
        client.trigger_action(
            "load_provider_model",
            {"provider": "chatterbox", "model_key": "turbo"},
        )
    )

    assert result["status"] == "loaded"
    assert calls == [
        {"model_id": None, "provider": "chatterbox", "model_key": "turbo"}
    ]


def test_trigger_action_reports_unknown_action():
    client = TTSClient("http://127.0.0.1:8765")

    result = run(client.trigger_action("nope", {}))

    assert "Unknown action" in result["error"]


def test_trigger_action_provider_generate(monkeypatch):
    client = TTSClient("http://127.0.0.1:8765")

    async def fake_generate(params: dict) -> dict:
        return {
            "audio_path": "/tmp/fake.wav",
            "provider": params.get("provider"),
            "model_key": params.get("model_key"),
        }

    monkeypatch.setattr(client, "generate_speech", fake_generate)

    result = run(
        client.trigger_action(
            "generate_speech",
            {
                "mode": "custom-voice",
                "text": "hello",
                "provider": "chatterbox",
                "model_key": "original",
            },
        )
    )

    assert result["audio_path"].endswith(".wav")
    assert result["provider"] == "chatterbox"
    assert result["model_key"] == "original"
