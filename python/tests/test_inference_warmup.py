"""Tests for the generation warm-up fixups in TTSModel.load().

Issue #13: transformers logs ``Setting `pad_token_id` to `eos_token_id`:2150
for open-end generation.`` once per generated item, on stderr, which the Tauri
shell rendered as an ERROR row. The pre-existing suppression in inference.py
guarded on ``hasattr(self.model, 'config')``, but Qwen3TTSModel is a plain
wrapper with no ``.config``, so the guard was always False and the code never
ran.

Verified against the real model before writing these: setting the talker's
pad_token_id to config.talker_config.codec_eos_token_id (2150) is exactly the
value transformers derives itself, and produces bit-identical audio once the
model's first-generation warm-up run is discarded.
"""

from types import SimpleNamespace
from unittest.mock import MagicMock

from tts_server.inference import TTSModel


def _make_wrapper(pad_token_id=None, codec_eos_token_id=2150, with_talker=True):
    """Build a stand-in shaped like qwen_tts.Qwen3TTSModel."""
    wrapper = MagicMock()
    # The real wrapper has no `.config` — that is the bug this test pins down.
    del wrapper.config

    inner = SimpleNamespace(
        config=SimpleNamespace(
            talker_config=SimpleNamespace(codec_eos_token_id=codec_eos_token_id)
        ),
    )
    if with_talker:
        inner.talker = SimpleNamespace(
            generation_config=SimpleNamespace(pad_token_id=pad_token_id)
        )
    wrapper.model = inner
    return wrapper


def test_sets_talker_pad_token_id_from_codec_eos():
    m = TTSModel()
    m.model = _make_wrapper(pad_token_id=None, codec_eos_token_id=2150)

    m._silence_pad_token_warning()

    assert m.model.model.talker.generation_config.pad_token_id == 2150


def test_does_not_override_an_existing_pad_token_id():
    m = TTSModel()
    m.model = _make_wrapper(pad_token_id=7, codec_eos_token_id=2150)

    m._silence_pad_token_warning()

    assert m.model.model.talker.generation_config.pad_token_id == 7


def test_is_a_no_op_when_the_talker_is_absent():
    m = TTSModel()
    m.model = _make_wrapper(with_talker=False)

    m._silence_pad_token_warning()  # must not raise


def test_is_a_no_op_when_no_model_is_loaded():
    m = TTSModel()
    m.model = None

    m._silence_pad_token_warning()  # must not raise


def test_is_a_no_op_when_codec_eos_is_unknown():
    """A future qwen_tts could drop the attribute; never guess a token id."""
    m = TTSModel()
    m.model = _make_wrapper(pad_token_id=None, codec_eos_token_id=None)

    m._silence_pad_token_warning()

    assert m.model.model.talker.generation_config.pad_token_id is None
