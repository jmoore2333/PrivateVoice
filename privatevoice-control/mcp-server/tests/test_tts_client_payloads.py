"""Unit tests for payload adaptation in the MCP TTS client."""

from __future__ import annotations

import asyncio
import base64
import json
from pathlib import Path

import httpx

from privatevoice_mcp.tts_client import TTSClient


def run(coro):
    return asyncio.run(coro)


def make_client(handler):
    client = TTSClient("http://test")

    def _client():
        return httpx.AsyncClient(
            base_url="http://test",
            transport=httpx.MockTransport(handler),
            timeout=10.0,
        )

    client._client = _client  # type: ignore[method-assign]
    return client


def test_load_model_sends_provider_payload():
    captured: dict = {}

    async def handler(request: httpx.Request) -> httpx.Response:
        captured["path"] = request.url.path
        captured["payload"] = json.loads(request.content.decode("utf-8"))
        return httpx.Response(200, json={"status": "loaded"})

    client = make_client(handler)

    result = run(client.load_model(provider="chatterbox", model_key="multilingual"))

    assert result["status"] == "loaded"
    assert captured["path"] == "/load-model"
    assert captured["payload"] == {"provider": "chatterbox", "model_key": "multilingual"}


def test_generate_speech_encodes_reference_audio(tmp_path: Path):
    captured: dict = {}
    ref = tmp_path / "ref.wav"
    ref_bytes = b"fake-reference-audio"
    ref.write_bytes(ref_bytes)

    async def handler(request: httpx.Request) -> httpx.Response:
        captured["path"] = request.url.path
        captured["payload"] = json.loads(request.content.decode("utf-8"))
        return httpx.Response(
            200,
            content=b"generated-audio",
            headers={"content-type": "audio/wav"},
        )

    client = make_client(handler)

    result = run(
        client.generate_speech(
            {
                "mode": "voice-clone",
                "text": "hello",
                "provider": "chatterbox",
                "model_key": "turbo",
                "reference_audio": str(ref),
            }
        )
    )

    assert captured["path"] == "/generate/speech"
    payload = captured["payload"]
    assert payload["mode"] == "voice-clone"
    assert payload["provider"] == "chatterbox"
    assert payload["model_key"] == "turbo"
    assert payload["reference_audio_base64"] == base64.b64encode(ref_bytes).decode("ascii")
    assert Path(result["audio_path"]).exists()
    assert result["size_bytes"] > 0


def test_generate_speech_fails_on_missing_reference_file():
    client = TTSClient("http://test")

    result = run(
        client.generate_speech(
            {
                "mode": "voice-clone",
                "text": "hello",
                "reference_audio": "/tmp/does-not-exist.wav",
            }
        )
    )

    assert "Reference audio not found" in result["error"]
