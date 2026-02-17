"""Tests for the FastAPI endpoints in tts_server.main.

All tests run WITHOUT real model / torch / GPU dependencies.
The model singleton is replaced with a mock via ``unittest.mock.patch``.
"""

import os
from unittest.mock import patch, MagicMock, PropertyMock

import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_mock_model(*, loaded: bool = False):
    """Return a MagicMock that quacks like TTSModel."""
    m = MagicMock()
    type(m).is_loaded = PropertyMock(return_value=loaded)
    m.model_id = "0.6b"
    m.generate_custom_voice.return_value = (b"fake-wav-data", "audio/wav")
    m.generate_voice_clone.return_value = (b"fake-wav-data", "audio/wav")
    m.generate_voice_design.return_value = (b"fake-wav-data", "audio/wav")
    return m


def _make_mock_whisper(*, loaded: bool = False):
    """Return a MagicMock that quacks like WhisperModel."""
    w = MagicMock()
    type(w).is_loaded = PropertyMock(return_value=loaded)
    w.model_size = "base"

    result = MagicMock()
    result.text = "hello world"
    result.language = "en"
    result.language_probability = 0.99
    result.duration_seconds = 1.23
    w.transcribe.return_value = result
    return w


def _make_mock_translator(*, loaded: bool = False):
    t = MagicMock()
    type(t).is_loaded = PropertyMock(return_value=loaded)
    t.model_key = "nllb-600m"
    t.model_id = "facebook/nllb-200-distilled-600M"

    result = MagicMock()
    result.text = "hola mundo"
    result.source_language = "english"
    result.target_language = "spanish"
    t.translate_text.return_value = result
    return t


def _get_client():
    """Import the app and return a TestClient.

    Must be called *after* patching is in place so that the module-level
    ``app`` object picks up the mocked dependencies.
    """
    from tts_server.main import app
    token = os.environ.get("TTS_ACCESS_TOKEN", "test-token")
    return TestClient(
        app,
        raise_server_exceptions=False,
        headers={"X-API-Key": token},
    )


# ---------------------------------------------------------------------------
# Auth middleware
# ---------------------------------------------------------------------------

class TestAuthMiddleware:
    """Global API key checks."""

    def test_missing_api_key_returns_401(self):
        from tts_server.main import app
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.get("/health")
        assert resp.status_code == 401
        assert resp.json()["detail"] == "Unauthorized"

    def test_options_preflight_bypasses_auth(self):
        """CORS preflight must not require an API key."""
        from tts_server.main import app
        client = TestClient(app, raise_server_exceptions=False)
        resp = client.options("/health")
        assert resp.status_code != 401


# ---------------------------------------------------------------------------
# Health & status
# ---------------------------------------------------------------------------

class TestHealthEndpoint:
    """GET /health."""

    def test_health_returns_ok(self):
        client = _get_client()
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "version" in data


class TestModelStatusEndpoint:
    """GET /model-status."""

    @patch("tts_server.providers.qwen_provider.get_model")
    @patch("tts_server.main.get_device_config")
    @patch("tts_server.main.get_memory_info")
    def test_model_status_no_model(self, mock_mem, mock_cfg, mock_get_model):
        """When no model is loaded, loaded=False and model_id/device are None."""
        mock_model = _make_mock_model(loaded=False)
        mock_get_model.return_value = mock_model
        mock_cfg.return_value = MagicMock(device="cpu")
        mock_mem.return_value = {"device": "cpu", "total_gb": 16, "available_gb": 8}

        client = _get_client()
        resp = client.get("/model-status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["loaded"] is False
        assert data["model_id"] is None
        assert data["device"] is None
        assert "memory" in data


class TestSystemInfoEndpoint:
    """GET /system-info."""

    @patch("tts_server.main.get_device_config")
    @patch("tts_server.main.get_memory_info")
    def test_system_info_valid_structure(self, mock_mem, mock_cfg):
        mock_cfg.return_value = MagicMock(device="cpu")
        mock_mem.return_value = {"device": "cpu", "total_gb": 16, "available_gb": 8}

        client = _get_client()
        resp = client.get("/system-info")
        assert resp.status_code == 200
        data = resp.json()
        expected_keys = {
            "python_version",
            "torch_version",
            "device",
            "device_name",
            "memory_total_gb",
            "memory_available_gb",
            "cache_dir",
            "model_memory_requirements",
            "supported_mp3_bitrates",
        }
        assert expected_keys.issubset(data.keys())
        assert isinstance(data["memory_total_gb"], (int, float))
        assert isinstance(data["memory_available_gb"], (int, float))

    @patch("tts_server.main.get_device_config")
    @patch("tts_server.main.get_memory_info")
    def test_system_info_model_memory_requirements(self, mock_mem, mock_cfg):
        """System info includes memory requirements for all model variants."""
        mock_cfg.return_value = MagicMock(device="cpu")
        mock_mem.return_value = {"device": "cpu", "total_gb": 16, "available_gb": 8}

        client = _get_client()
        resp = client.get("/system-info")
        data = resp.json()
        reqs = data["model_memory_requirements"]
        assert "0.6b" in reqs
        assert "1.7b" in reqs
        assert reqs["0.6b"] == 8
        assert reqs["1.7b"] == 12

    @patch("tts_server.main.get_device_config")
    @patch("tts_server.main.get_memory_info")
    def test_system_info_mp3_bitrates(self, mock_mem, mock_cfg):
        """System info includes supported MP3 bitrates."""
        mock_cfg.return_value = MagicMock(device="cpu")
        mock_mem.return_value = {"device": "cpu", "total_gb": 16, "available_gb": 8}

        client = _get_client()
        resp = client.get("/system-info")
        data = resp.json()
        assert data["supported_mp3_bitrates"] == [128, 192, 256, 320]


# ---------------------------------------------------------------------------
# Speakers & languages
# ---------------------------------------------------------------------------

class TestSpeakersEndpoint:
    """GET /speakers."""

    def test_speakers_returns_list(self):
        client = _get_client()
        resp = client.get("/speakers")
        assert resp.status_code == 200
        data = resp.json()
        assert "speakers" in data
        assert isinstance(data["speakers"], list)
        assert len(data["speakers"]) > 0
        # Spot-check a known speaker
        assert "serena" in data["speakers"]


class TestLanguagesEndpoint:
    """GET /languages."""

    def test_languages_returns_list(self):
        client = _get_client()
        resp = client.get("/languages")
        assert resp.status_code == 200
        data = resp.json()
        assert "languages" in data
        assert isinstance(data["languages"], list)
        assert len(data["languages"]) > 0
        assert "English" in data["languages"]


# ---------------------------------------------------------------------------
# Generation: custom voice
# ---------------------------------------------------------------------------

class TestGenerateCustomVoice:
    """POST /generate/custom-voice."""

    @patch("tts_server.providers.qwen_provider.get_model")
    def test_success_wav(self, mock_get_model):
        """Successful WAV generation returns audio bytes."""
        mock_model = _make_mock_model(loaded=True)
        mock_get_model.return_value = mock_model

        client = _get_client()
        resp = client.post(
            "/generate/custom-voice",
            json={
                "text": "Hello world",
                "speaker": "serena",
                "language": "english",
                "format": "wav",
            },
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "audio/wav"
        assert resp.content == b"fake-wav-data"
        mock_model.generate_custom_voice.assert_called_once()

    @patch("tts_server.providers.qwen_provider.get_model")
    def test_success_mp3(self, mock_get_model):
        """MP3 format request returns audio/mpeg media type."""
        mock_model = _make_mock_model(loaded=True)
        mock_model.generate_custom_voice.return_value = (b"fake-mp3-data", "audio/mpeg")
        mock_get_model.return_value = mock_model

        client = _get_client()
        resp = client.post(
            "/generate/custom-voice",
            json={
                "text": "Hello world",
                "speaker": "serena",
                "language": "english",
                "format": "mp3",
            },
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "audio/mpeg"
        assert resp.content == b"fake-mp3-data"

    @patch("tts_server.providers.qwen_provider.get_model")
    def test_text_too_long(self, mock_get_model):
        """Text exceeding MAX_TEXT_LENGTH returns 400."""
        mock_model = _make_mock_model(loaded=True)
        mock_get_model.return_value = mock_model

        client = _get_client()
        resp = client.post(
            "/generate/custom-voice",
            json={
                "text": "x" * 2001,
                "speaker": "serena",
                "language": "english",
            },
        )
        assert resp.status_code == 400
        assert "maximum length" in resp.json()["detail"].lower()

    @patch("tts_server.providers.qwen_provider.get_model")
    def test_model_not_loaded(self, mock_get_model):
        """Request when model is not loaded returns 400."""
        mock_model = _make_mock_model(loaded=False)
        mock_get_model.return_value = mock_model

        client = _get_client()
        resp = client.post(
            "/generate/custom-voice",
            json={"text": "Hello", "speaker": "serena"},
        )
        assert resp.status_code == 400
        assert "not loaded" in resp.json()["detail"].lower()

    @patch("tts_server.providers.qwen_provider.get_model")
    def test_value_error_returns_400(self, mock_get_model):
        """A ValueError from the model (e.g. unknown speaker) yields 400."""
        mock_model = _make_mock_model(loaded=True)
        mock_model.generate_custom_voice.side_effect = ValueError("Unknown speaker: foo")
        mock_get_model.return_value = mock_model

        client = _get_client()
        resp = client.post(
            "/generate/custom-voice",
            json={"text": "Hello", "speaker": "foo"},
        )
        assert resp.status_code == 400

    @patch("tts_server.providers.qwen_provider.get_model")
    def test_internal_error_returns_500(self, mock_get_model):
        """An unexpected exception from the model yields 500."""
        mock_model = _make_mock_model(loaded=True)
        mock_model.generate_custom_voice.side_effect = RuntimeError("GPU exploded")
        mock_get_model.return_value = mock_model

        client = _get_client()
        resp = client.post(
            "/generate/custom-voice",
            json={"text": "Hello", "speaker": "serena"},
        )
        assert resp.status_code == 500


# ---------------------------------------------------------------------------
# Generation: voice clone
# ---------------------------------------------------------------------------

class TestGenerateVoiceClone:
    """POST /generate/voice-clone (multipart form)."""

    @patch("tts_server.providers.qwen_provider.get_model")
    def test_model_not_loaded(self, mock_get_model):
        """Returns 400 when model is not loaded."""
        mock_model = _make_mock_model(loaded=False)
        mock_get_model.return_value = mock_model

        client = _get_client()
        resp = client.post(
            "/generate/voice-clone",
            data={
                "text": "Hello",
                "reference_text": "Reference transcript",
                "language": "english",
                "format": "wav",
                "x_vector_only_mode": "false",
            },
            files={"reference_audio": ("ref.wav", b"fake-audio", "audio/wav")},
        )
        assert resp.status_code == 400
        assert "not loaded" in resp.json()["detail"].lower()

    @patch("tts_server.providers.qwen_provider.get_model")
    def test_text_too_long(self, mock_get_model):
        """Returns 400 when text exceeds max length."""
        mock_model = _make_mock_model(loaded=True)
        mock_get_model.return_value = mock_model

        client = _get_client()
        resp = client.post(
            "/generate/voice-clone",
            data={
                "text": "x" * 2001,
                "reference_text": "ref text",
                "language": "english",
                "format": "wav",
                "x_vector_only_mode": "false",
            },
            files={"reference_audio": ("ref.wav", b"fake-audio", "audio/wav")},
        )
        assert resp.status_code == 400

    @patch("tts_server.providers.qwen_provider.get_model")
    def test_missing_reference_text_without_x_vector(self, mock_get_model):
        """Returns 400 when reference_text is empty and x_vector_only_mode is off."""
        mock_model = _make_mock_model(loaded=True)
        mock_get_model.return_value = mock_model

        client = _get_client()
        resp = client.post(
            "/generate/voice-clone",
            data={
                "text": "Hello",
                "reference_text": "",
                "language": "english",
                "format": "wav",
                "x_vector_only_mode": "false",
            },
            files={"reference_audio": ("ref.wav", b"fake-audio", "audio/wav")},
        )
        assert resp.status_code == 400


# ---------------------------------------------------------------------------
# Generation: voice design
# ---------------------------------------------------------------------------

class TestGenerateVoiceDesign:
    """POST /generate/voice-design."""

    @patch("tts_server.providers.qwen_provider.get_model")
    def test_model_not_loaded(self, mock_get_model):
        """Returns 400 when model is not loaded."""
        mock_model = _make_mock_model(loaded=False)
        mock_get_model.return_value = mock_model

        client = _get_client()
        resp = client.post(
            "/generate/voice-design",
            json={
                "text": "Hello",
                "voice_description": "A warm male voice",
            },
        )
        assert resp.status_code == 400

    @patch("tts_server.providers.qwen_provider.get_model")
    def test_success(self, mock_get_model):
        """Successful voice design generation returns audio."""
        mock_model = _make_mock_model(loaded=True)
        mock_model.model_id = "1.7b-design"
        mock_get_model.return_value = mock_model

        client = _get_client()
        resp = client.post(
            "/generate/voice-design",
            json={
                "text": "Hello",
                "voice_description": "A warm male voice",
                "language": "english",
                "format": "wav",
            },
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "audio/wav"


# ---------------------------------------------------------------------------
# Model management
# ---------------------------------------------------------------------------

class TestLoadModel:
    """POST /load-model."""

    @patch("tts_server.providers.qwen_provider.get_model")
    def test_load_model_success(self, mock_get_model, reset_startup_state):
        """Successful model load returns status=loaded."""
        mock_model = _make_mock_model(loaded=False)
        mock_get_model.return_value = mock_model

        client = _get_client()
        resp = client.post("/load-model", json={"model_id": "0.6b"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "loaded"
        assert data["model_id"] == "0.6b"
        mock_model.load.assert_called_once_with("0.6b")

    @patch("tts_server.providers.qwen_provider.get_model")
    def test_load_model_failure(self, mock_get_model, reset_startup_state):
        """Failed model load returns 500."""
        mock_model = _make_mock_model(loaded=False)
        mock_model.load.side_effect = RuntimeError("Out of memory")
        mock_get_model.return_value = mock_model

        client = _get_client()
        resp = client.post("/load-model", json={"model_id": "1.7b"})
        assert resp.status_code == 500
        assert resp.json()["detail"] == "Internal server error"


class TestUnloadModel:
    """POST /unload-model."""

    @patch("tts_server.providers.qwen_provider.get_model")
    def test_unload_model(self, mock_get_model, reset_startup_state):
        """Unloading a model returns status=unloaded."""
        mock_model = _make_mock_model(loaded=True)
        mock_get_model.return_value = mock_model

        client = _get_client()
        resp = client.post("/unload-model")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "unloaded"
        mock_model.unload.assert_called_once()


# ---------------------------------------------------------------------------
# Startup & download progress
# ---------------------------------------------------------------------------

class TestStartupStatus:
    """GET /startup-status."""

    def test_startup_status(self, reset_startup_state):
        client = _get_client()
        resp = client.get("/startup-status")
        assert resp.status_code == 200
        data = resp.json()
        assert "phase" in data
        assert "message" in data
        assert "progress" in data


class TestDownloadProgress:
    """GET /download-progress."""

    def test_download_progress(self):
        client = _get_client()
        resp = client.get("/download-progress")
        assert resp.status_code == 200
        data = resp.json()
        assert "status" in data
        assert "bytes_downloaded" in data


# ---------------------------------------------------------------------------
# Memory check
# ---------------------------------------------------------------------------

class TestMemoryCheck:
    """GET /memory-check/{model_id}."""

    @patch("tts_server.main.check_memory_for_model")
    def test_memory_check_sufficient(self, mock_check):
        """Returns sufficient=True when enough RAM."""
        mock_check.return_value = {
            "required_gb": 8,
            "available_gb": 16.0,
            "sufficient": True,
            "warning": None,
        }

        client = _get_client()
        resp = client.get("/memory-check/0.6b")
        assert resp.status_code == 200
        data = resp.json()
        assert data["sufficient"] is True
        assert data["warning"] is None

    @patch("tts_server.main.check_memory_for_model")
    def test_memory_check_insufficient(self, mock_check):
        """Returns warning when not enough RAM."""
        mock_check.return_value = {
            "required_gb": 12,
            "available_gb": 6.0,
            "sufficient": False,
            "warning": "Model requires ~12GB RAM, only 6.0GB available",
        }

        client = _get_client()
        resp = client.get("/memory-check/1.7b")
        assert resp.status_code == 200
        data = resp.json()
        assert data["sufficient"] is False
        assert "12GB" in data["warning"]


# ---------------------------------------------------------------------------
# MP3 bitrate in generation
# ---------------------------------------------------------------------------

class TestMP3Bitrate:
    """Verify mp3_bitrate is passed through to the model."""

    @patch("tts_server.providers.qwen_provider.get_model")
    def test_custom_voice_bitrate(self, mock_get_model):
        """Custom voice passes mp3_bitrate to model."""
        mock_model = _make_mock_model(loaded=True)
        mock_get_model.return_value = mock_model

        client = _get_client()
        resp = client.post(
            "/generate/custom-voice",
            json={
                "text": "Hello",
                "speaker": "serena",
                "format": "mp3",
                "mp3_bitrate": 320,
            },
        )
        assert resp.status_code == 200
        call_kwargs = mock_model.generate_custom_voice.call_args[1]
        assert call_kwargs["mp3_bitrate"] == 320

    @patch("tts_server.providers.qwen_provider.get_model")
    def test_custom_voice_invalid_bitrate_defaults(self, mock_get_model):
        """Invalid bitrate falls back to 192."""
        mock_model = _make_mock_model(loaded=True)
        mock_get_model.return_value = mock_model

        client = _get_client()
        resp = client.post(
            "/generate/custom-voice",
            json={
                "text": "Hello",
                "speaker": "serena",
                "format": "mp3",
                "mp3_bitrate": 999,
            },
        )
        assert resp.status_code == 200
        call_kwargs = mock_model.generate_custom_voice.call_args[1]
        assert call_kwargs["mp3_bitrate"] == 192

    @patch("tts_server.providers.qwen_provider.get_model")
    def test_voice_design_bitrate(self, mock_get_model):
        """Voice design passes mp3_bitrate to model."""
        mock_model = _make_mock_model(loaded=True)
        mock_model.model_id = "1.7b-design"
        mock_get_model.return_value = mock_model

        client = _get_client()
        resp = client.post(
            "/generate/voice-design",
            json={
                "text": "Hello",
                "voice_description": "A warm voice",
                "format": "mp3",
                "mp3_bitrate": 256,
            },
        )
        assert resp.status_code == 200
        call_kwargs = mock_model.generate_voice_design.call_args[1]
        assert call_kwargs["mp3_bitrate"] == 256

    @patch("tts_server.providers.qwen_provider.get_model")
    def test_custom_voice_stable_lead_in_toggle(self, mock_get_model):
        """Custom voice stable_lead_in is passed through to model."""
        mock_model = _make_mock_model(loaded=True)
        mock_get_model.return_value = mock_model

        client = _get_client()
        resp = client.post(
            "/generate/custom-voice",
            json={
                "text": "Hello",
                "speaker": "serena",
                "stable_lead_in": False,
            },
        )
        assert resp.status_code == 200
        call_kwargs = mock_model.generate_custom_voice.call_args[1]
        assert call_kwargs["stable_lead_in"] is False

    @patch("tts_server.providers.qwen_provider.get_model")
    def test_voice_design_stable_lead_in_toggle(self, mock_get_model):
        """Voice design stable_lead_in is passed through to model."""
        mock_model = _make_mock_model(loaded=True)
        mock_model.model_id = "1.7b-design"
        mock_get_model.return_value = mock_model

        client = _get_client()
        resp = client.post(
            "/generate/voice-design",
            json={
                "text": "Hello",
                "voice_description": "A warm voice",
                "stable_lead_in": False,
            },
        )
        assert resp.status_code == 200
        call_kwargs = mock_model.generate_voice_design.call_args[1]
        assert call_kwargs["stable_lead_in"] is False


# ---------------------------------------------------------------------------
# Empty text validation
# ---------------------------------------------------------------------------

class TestEmptyTextValidation:
    """All generation endpoints reject empty or whitespace-only text."""

    @patch("tts_server.providers.qwen_provider.get_model")
    def test_custom_voice_empty_text(self, mock_get_model):
        mock_model = _make_mock_model(loaded=True)
        mock_get_model.return_value = mock_model

        client = _get_client()
        resp = client.post(
            "/generate/custom-voice",
            json={"text": "", "speaker": "serena"},
        )
        assert resp.status_code == 400
        assert "empty" in resp.json()["detail"].lower()

    @patch("tts_server.providers.qwen_provider.get_model")
    def test_custom_voice_whitespace_text(self, mock_get_model):
        mock_model = _make_mock_model(loaded=True)
        mock_get_model.return_value = mock_model

        client = _get_client()
        resp = client.post(
            "/generate/custom-voice",
            json={"text": "   \n\t  ", "speaker": "serena"},
        )
        assert resp.status_code == 400
        assert "empty" in resp.json()["detail"].lower()

    @patch("tts_server.providers.qwen_provider.get_model")
    def test_voice_clone_whitespace_text(self, mock_get_model):
        mock_model = _make_mock_model(loaded=True)
        mock_get_model.return_value = mock_model

        client = _get_client()
        resp = client.post(
            "/generate/voice-clone",
            data={
                "text": "   ",
                "reference_text": "ref text",
                "language": "english",
                "format": "wav",
                "x_vector_only_mode": "false",
            },
            files={"reference_audio": ("ref.wav", b"fake-audio", "audio/wav")},
        )
        assert resp.status_code == 400
        assert "empty" in resp.json()["detail"].lower()

    @patch("tts_server.providers.qwen_provider.get_model")
    def test_voice_design_empty_text(self, mock_get_model):
        mock_model = _make_mock_model(loaded=True)
        mock_get_model.return_value = mock_model

        client = _get_client()
        resp = client.post(
            "/generate/voice-design",
            json={"text": "  ", "voice_description": "A warm voice"},
        )
        assert resp.status_code == 400
        assert "empty" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Normalized error status codes (voice clone)
# ---------------------------------------------------------------------------

class TestVoiceCloneErrorCodes:
    """Voice clone returns 400 for model compatibility, 500 for real errors."""

    @patch("tts_server.providers.qwen_provider.get_model")
    def test_runtime_error_model_compat_returns_400(self, mock_get_model):
        mock_model = _make_mock_model(loaded=True)
        mock_model.model_id = "0.6b"
        mock_get_model.return_value = mock_model

        client = _get_client()
        resp = client.post(
            "/generate/voice-clone",
            data={
                "text": "Hello",
                "reference_text": "ref",
                "language": "english",
                "format": "wav",
                "x_vector_only_mode": "false",
            },
            files={"reference_audio": ("ref.wav", b"fake-audio", "audio/wav")},
        )
        assert resp.status_code == 400
        assert "does not support mode" in resp.json()["detail"]

    @patch("tts_server.providers.qwen_provider.get_model")
    def test_runtime_error_non_compat_returns_500(self, mock_get_model):
        mock_model = _make_mock_model(loaded=True)
        mock_model.model_id = "0.6b-base"
        mock_model.generate_voice_clone.side_effect = RuntimeError("CUDA out of memory")
        mock_get_model.return_value = mock_model

        client = _get_client()
        resp = client.post(
            "/generate/voice-clone",
            data={
                "text": "Hello",
                "reference_text": "ref",
                "language": "english",
                "format": "wav",
                "x_vector_only_mode": "false",
            },
            files={"reference_audio": ("ref.wav", b"fake-audio", "audio/wav")},
        )
        assert resp.status_code == 500

    @patch("tts_server.providers.qwen_provider.get_model")
    def test_generic_exception_returns_500(self, mock_get_model):
        mock_model = _make_mock_model(loaded=True)
        mock_model.model_id = "0.6b-base"
        mock_model.generate_voice_clone.side_effect = Exception("Something went wrong")
        mock_get_model.return_value = mock_model

        client = _get_client()
        resp = client.post(
            "/generate/voice-clone",
            data={
                "text": "Hello",
                "reference_text": "ref",
                "language": "english",
                "format": "wav",
                "x_vector_only_mode": "false",
            },
            files={"reference_audio": ("ref.wav", b"fake-audio", "audio/wav")},
        )
        assert resp.status_code == 500


# ---------------------------------------------------------------------------
# Memory check model ID validation
# ---------------------------------------------------------------------------

class TestMemoryCheckValidation:
    """GET /memory-check/{model_id} rejects invalid model IDs."""

    def test_invalid_model_id_returns_400(self):
        client = _get_client()
        resp = client.get("/memory-check/invalid_id")
        assert resp.status_code == 400
        assert "Unknown model ID" in resp.json()["detail"]
        assert "Available" in resp.json()["detail"]

    @patch("tts_server.main.check_memory_for_model")
    def test_valid_model_id_still_works(self, mock_check):
        mock_check.return_value = {
            "required_gb": 8,
            "available_gb": 16.0,
            "sufficient": True,
            "warning": None,
        }

        client = _get_client()
        resp = client.get("/memory-check/0.6b")
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Cancel generation
# ---------------------------------------------------------------------------

class TestCancelGeneration:
    """POST /cancel-generation."""

    def test_cancel_returns_status(self):
        client = _get_client()
        resp = client.post("/cancel-generation")
        assert resp.status_code == 200
        assert resp.json()["status"] == "cancelled"


# ---------------------------------------------------------------------------
# Whisper transcription
# ---------------------------------------------------------------------------

class TestWhisperTranscription:
    """POST /transcribe with task support."""

    @patch("tts_server.main.get_whisper_model")
    def test_transcribe_requires_loaded_model(self, mock_get_whisper):
        mock_get_whisper.return_value = _make_mock_whisper(loaded=False)

        client = _get_client()
        resp = client.post(
            "/transcribe",
            files={"audio": ("ref.wav", b"fake-audio", "audio/wav")},
        )
        assert resp.status_code == 400
        assert "not loaded" in resp.json()["detail"].lower()

    @patch("tts_server.main.get_whisper_model")
    def test_transcribe_defaults_to_transcribe_task(self, mock_get_whisper):
        mock_whisper = _make_mock_whisper(loaded=True)
        mock_get_whisper.return_value = mock_whisper

        client = _get_client()
        resp = client.post(
            "/transcribe",
            files={"audio": ("ref.wav", b"fake-audio", "audio/wav")},
        )
        assert resp.status_code == 200
        assert resp.json()["text"] == "hello world"
        mock_whisper.transcribe.assert_called_once_with(b"fake-audio", "transcribe")

    @patch("tts_server.main.get_whisper_model")
    def test_transcribe_translate_task(self, mock_get_whisper):
        mock_whisper = _make_mock_whisper(loaded=True)
        mock_get_whisper.return_value = mock_whisper

        client = _get_client()
        resp = client.post(
            "/transcribe",
            data={"task": "translate"},
            files={"audio": ("ref.wav", b"fake-audio", "audio/wav")},
        )
        assert resp.status_code == 200
        mock_whisper.transcribe.assert_called_once_with(b"fake-audio", "translate")

    @patch("tts_server.main.get_whisper_model")
    def test_transcribe_rejects_invalid_task(self, mock_get_whisper):
        mock_whisper = _make_mock_whisper(loaded=True)
        mock_get_whisper.return_value = mock_whisper

        client = _get_client()
        resp = client.post(
            "/transcribe",
            data={"task": "bad-task"},
            files={"audio": ("ref.wav", b"fake-audio", "audio/wav")},
        )
        assert resp.status_code == 400
        assert "invalid transcribe task" in resp.json()["detail"].lower()
        mock_whisper.transcribe.assert_not_called()


# ---------------------------------------------------------------------------
# Local text translation
# ---------------------------------------------------------------------------

class TestTranslationModelEndpoints:
    """Translation model status/load endpoints."""

    @patch("tts_server.main.get_local_translator")
    def test_translation_status_unloaded(self, mock_get_translator):
        mock_get_translator.return_value = _make_mock_translator(loaded=False)

        client = _get_client()
        resp = client.get("/translation-status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["loaded"] is False
        assert data["model_key"] is None
        assert data["model_id"] is None

    @patch("tts_server.main.get_local_translator")
    def test_translation_status_loaded(self, mock_get_translator):
        mock_get_translator.return_value = _make_mock_translator(loaded=True)

        client = _get_client()
        resp = client.get("/translation-status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["loaded"] is True
        assert data["model_key"] == "nllb-600m"
        assert data["model_id"] == "facebook/nllb-200-distilled-600M"

    def test_translation_models_lists_catalog(self):
        client = _get_client()
        resp = client.get("/translation-models")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert any(m["key"] == "nllb-600m" for m in data)

    @patch("tts_server.main.get_local_translator")
    def test_load_translation_success(self, mock_get_translator):
        mock_translator = _make_mock_translator(loaded=False)
        mock_get_translator.return_value = mock_translator

        client = _get_client()
        resp = client.post("/load-translation", json={"model_key": "nllb-600m"})
        assert resp.status_code == 200
        mock_translator.load.assert_called_once_with("nllb-600m")

    def test_load_translation_rejects_invalid_model_key(self):
        client = _get_client()
        resp = client.post("/load-translation", json={"model_key": "bad-model"})
        assert resp.status_code == 400
        assert "unknown translation model key" in resp.json()["detail"].lower()

    @patch("tts_server.main.get_local_translator")
    def test_unload_translation_success(self, mock_get_translator):
        mock_translator = _make_mock_translator(loaded=True)
        mock_get_translator.return_value = mock_translator

        client = _get_client()
        resp = client.post("/unload-translation")
        assert resp.status_code == 200
        assert resp.json()["status"] == "unloaded"
        mock_translator.unload.assert_called_once()


class TestTranslateText:
    """POST /translate-text."""

    @patch("tts_server.main.get_local_translator")
    def test_translate_text_success(self, mock_get_translator):
        mock_translator = _make_mock_translator(loaded=True)
        mock_get_translator.return_value = mock_translator

        client = _get_client()
        resp = client.post(
            "/translate-text",
            json={
                "text": "hello world",
                "target_language": "Spanish",
                "source_language": "auto",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["text"] == "hola mundo"
        assert data["source_language"] == "english"
        assert data["target_language"] == "spanish"
        mock_translator.translate_text.assert_called_once_with(
            "hello world",
            "Spanish",
            "auto",
        )

    @patch("tts_server.main.get_local_translator")
    def test_translate_text_empty_rejected(self, mock_get_translator):
        mock_get_translator.return_value = _make_mock_translator()

        client = _get_client()
        resp = client.post(
            "/translate-text",
            json={
                "text": "   ",
                "target_language": "Spanish",
            },
        )
        assert resp.status_code == 400
        assert "empty" in resp.json()["detail"].lower()

    @patch("tts_server.main.get_local_translator")
    def test_translate_text_requires_loaded_model(self, mock_get_translator):
        mock_get_translator.return_value = _make_mock_translator(loaded=False)

        client = _get_client()
        resp = client.post(
            "/translate-text",
            json={
                "text": "hello world",
                "target_language": "Spanish",
            },
        )
        assert resp.status_code == 400
        assert "not loaded" in resp.json()["detail"].lower()

    @patch("tts_server.main.get_local_translator")
    def test_translate_text_validation_error_returns_400(self, mock_get_translator):
        mock_translator = _make_mock_translator(loaded=True)
        mock_translator.translate_text.side_effect = ValueError("Target language cannot be Auto")
        mock_get_translator.return_value = mock_translator

        client = _get_client()
        resp = client.post(
            "/translate-text",
            json={
                "text": "hello world",
                "target_language": "Auto",
            },
        )
        assert resp.status_code == 400
        assert "target language cannot be auto" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# CORS origins
# ---------------------------------------------------------------------------

class TestCORSOrigins:
    """CORS middleware restricts origins to localhost and Tauri."""

    def test_allowed_origin(self):
        client = _get_client()
        resp = client.get(
            "/health",
            headers={"Origin": "http://localhost"},
        )
        assert resp.status_code == 200
        assert resp.headers.get("access-control-allow-origin") == "http://localhost"

    def test_disallowed_origin(self):
        client = _get_client()
        resp = client.get(
            "/health",
            headers={"Origin": "http://evil.com"},
        )
        assert resp.status_code == 200
        # Disallowed origins should not get the CORS header
        assert "access-control-allow-origin" not in resp.headers


# ---------------------------------------------------------------------------
# Swagger/ReDoc disabled in production
# ---------------------------------------------------------------------------

class TestDocsDisabledInProd:
    """Swagger and ReDoc are disabled when TTS_SERVER_DEV is not set."""

    def test_docs_disabled_by_default(self):
        client = _get_client()
        resp = client.get("/docs")
        assert resp.status_code == 404

    def test_redoc_disabled_by_default(self):
        client = _get_client()
        resp = client.get("/redoc")
        assert resp.status_code == 404
