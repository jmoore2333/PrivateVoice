"""Shared fixtures for TTS server tests."""

import os
import sys
from unittest.mock import MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Mock heavy third-party modules that are unavailable in the test environment
# ---------------------------------------------------------------------------

def _install_torch_mock():
    """
    Create a lightweight mock of the ``torch`` package so that importing
    ``tts_server.*`` never requires a real PyTorch installation.

    The mock is inserted into ``sys.modules`` *before* any tts_server code is
    imported, so every downstream ``import torch`` picks up the fake.
    """
    torch = MagicMock()
    # Common dtype constants used in device.py / inference.py
    torch.bfloat16 = "bfloat16"
    torch.float16 = "float16"
    torch.float32 = "float32"

    # torch.no_grad() context manager
    torch.no_grad.return_value.__enter__ = MagicMock(return_value=None)
    torch.no_grad.return_value.__exit__ = MagicMock(return_value=False)

    # MPS backend defaults (overridden per-test as needed)
    torch.backends.mps.is_available.return_value = False
    torch.cuda.is_available.return_value = False

    # __version__ is accessed as a plain string by main.py's system_info endpoint
    torch.__version__ = "2.1.0+mock"

    sys.modules["torch"] = torch
    return torch


def _install_other_mocks():
    """Mock remaining heavy dependencies that are not under test."""
    for mod_name in (
        "numpy",
        "soundfile",
        "librosa",
        "lameenc",
        "qwen_tts",
        "accelerate",
        "transformers",
        "safetensors",
        "huggingface_hub",
    ):
        if mod_name not in sys.modules:
            sys.modules[mod_name] = MagicMock()

    # psutil needs realistic return values so that get_memory_info() arithmetic
    # produces real numbers instead of MagicMock objects.
    if "psutil" not in sys.modules:
        psutil_mock = MagicMock()
        mem = MagicMock()
        mem.total = 16 * (1024 ** 3)       # 16 GB
        mem.available = 8 * (1024 ** 3)     # 8 GB
        psutil_mock.virtual_memory.return_value = mem
        sys.modules["psutil"] = psutil_mock


# Install mocks before any tts_server import
os.environ.setdefault("TTS_ACCESS_TOKEN", "test-token")
_torch_mock = _install_torch_mock()
_install_other_mocks()


@pytest.fixture
def torch_mock():
    """Provide the shared torch mock for tests that need to reconfigure it."""
    return _torch_mock


@pytest.fixture
def reset_model_singleton():
    """
    Reset the global ``_model`` singleton in ``tts_server.inference`` so each
    test starts with a clean slate.
    """
    from tts_server import inference
    inference._model = None
    yield
    inference._model = None


@pytest.fixture
def reset_startup_state():
    """
    Reset the startup state in ``tts_server.main`` between tests.
    """
    from tts_server.main import get_startup_state
    state = get_startup_state()
    state.phase = "initializing"
    state.message = "Starting Python environment..."
    state.progress = 0
    yield


@pytest.fixture
def reset_download_tracker():
    """
    Reset the download tracker singleton between tests.
    """
    from tts_server.download_tracker import get_download_tracker
    tracker = get_download_tracker()
    tracker.reset()
    yield
    tracker.reset()
