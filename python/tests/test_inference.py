"""Unit tests for tts_server.inference behavior."""

from unittest.mock import MagicMock, patch

from tts_server.inference import TTSModel


class TestInferenceCustomVoice:
    """Custom Voice generation behavior."""

    @patch("tts_server.inference.synchronize_device")
    def test_generate_custom_voice_uses_stable_frontend_settings(self, mock_sync):
        """Custom Voice forces stable generation args to reduce lead-in disfluency."""
        model = TTSModel()
        model._loaded = True
        model.config = MagicMock(device="cpu")
        model.model = MagicMock()
        model.model.generate_custom_voice.return_value = (["fake-wav"], 24000)
        model.audio_to_format = MagicMock(return_value=(b"wav-bytes", "audio/wav"))

        audio_bytes, media_type = model.generate_custom_voice(
            text="Hello world",
            speaker="serena",
            instruction="",
            language="english",
            output_format="wav",
            mp3_bitrate=192,
        )

        assert audio_bytes == b"wav-bytes"
        assert media_type == "audio/wav"
        model.model.generate_custom_voice.assert_called_once_with(
            text="Hello world",
            language="english",
            speaker="serena",
            instruct=None,
            non_streaming_mode=False,
            subtalker_dosample=False,
        )
        model.audio_to_format.assert_called_once_with(
            "fake-wav",
            24000,
            "wav",
            mp3_bitrate=192,
            target_sample_rate=None,
            bit_depth=16,
            channels=1,
        )
        mock_sync.assert_called_once_with("cpu")

    @patch("tts_server.inference.synchronize_device")
    def test_generate_custom_voice_can_disable_stable_lead_in(self, mock_sync):
        """Custom Voice can fall back to model defaults when stability toggle is disabled."""
        model = TTSModel()
        model._loaded = True
        model.config = MagicMock(device="cpu")
        model.model = MagicMock()
        model.model.generate_custom_voice.return_value = (["fake-wav"], 24000)
        model.audio_to_format = MagicMock(return_value=(b"wav-bytes", "audio/wav"))

        model.generate_custom_voice(
            text="Hello world",
            speaker="serena",
            instruction="",
            language="english",
            output_format="wav",
            mp3_bitrate=192,
            stable_lead_in=False,
        )

        model.model.generate_custom_voice.assert_called_once_with(
            text="Hello world",
            language="english",
            speaker="serena",
            instruct=None,
        )
        mock_sync.assert_called_once_with("cpu")


class TestInferenceVoiceDesign:
    """Voice Design generation behavior."""

    @patch("tts_server.inference.synchronize_device")
    def test_generate_voice_design_uses_stable_frontend_settings(self, mock_sync):
        """Voice Design mirrors stable lead-in behavior to reduce front filler."""
        model = TTSModel(model_id="1.7b-design")
        model._loaded = True
        model.config = MagicMock(device="cpu")
        model.model = MagicMock()
        model.model.generate_voice_design.return_value = (["fake-wav"], 24000)
        model.audio_to_format = MagicMock(return_value=(b"wav-bytes", "audio/wav"))

        audio_bytes, media_type = model.generate_voice_design(
            text="Hello world",
            voice_description="A calm narrator",
            language="english",
            output_format="wav",
            mp3_bitrate=192,
        )

        assert audio_bytes == b"wav-bytes"
        assert media_type == "audio/wav"
        model.model.generate_voice_design.assert_called_once_with(
            text="Hello world",
            language="english",
            instruct="A calm narrator",
            non_streaming_mode=False,
            subtalker_dosample=False,
        )
        model.audio_to_format.assert_called_once_with(
            "fake-wav",
            24000,
            "wav",
            mp3_bitrate=192,
            target_sample_rate=None,
            bit_depth=16,
            channels=1,
        )
        mock_sync.assert_called_once_with("cpu")
