"""Tests for tts_server.device module."""

import sys
from unittest.mock import patch, MagicMock

import pytest


class TestGetDeviceConfig:
    """Tests for get_device_config()."""

    def test_returns_device_config(self, torch_mock):
        """get_device_config() returns a DeviceConfig dataclass."""
        from tts_server.device import get_device_config, DeviceConfig

        config = get_device_config()
        assert isinstance(config, DeviceConfig)

    def test_config_has_required_fields(self, torch_mock):
        """DeviceConfig contains device, dtype, attn_implementation, device_map."""
        from tts_server.device import get_device_config

        config = get_device_config()
        assert hasattr(config, "device")
        assert hasattr(config, "dtype")
        assert hasattr(config, "attn_implementation")
        assert hasattr(config, "device_map")

    def test_cpu_fallback(self, torch_mock):
        """Falls back to CPU when neither MPS nor CUDA is available."""
        torch_mock.backends.mps.is_available.return_value = False
        torch_mock.cuda.is_available.return_value = False

        from tts_server.device import get_device_config

        config = get_device_config()
        assert config.device == "cpu"
        assert config.dtype == torch_mock.float32
        assert config.attn_implementation == "sdpa"
        assert config.device_map == "cpu"

    @patch("platform.system", return_value="Darwin")
    @patch("platform.machine", return_value="arm64")
    def test_mps_priority(self, mock_machine, mock_system, torch_mock):
        """MPS is chosen when Apple Silicon is detected and MPS is available."""
        torch_mock.backends.mps.is_available.return_value = True
        torch_mock.cuda.is_available.return_value = True  # CUDA also "available"

        from tts_server.device import get_device_config

        config = get_device_config()
        assert config.device == "mps"
        assert config.dtype == torch_mock.bfloat16
        assert config.attn_implementation == "sdpa"
        assert config.device_map == "mps"

    @patch("platform.system", return_value="Linux")
    @patch("platform.machine", return_value="x86_64")
    def test_cuda_when_no_apple_silicon(self, mock_machine, mock_system, torch_mock):
        """CUDA is chosen on non-Apple-Silicon systems when available."""
        torch_mock.backends.mps.is_available.return_value = False
        torch_mock.cuda.is_available.return_value = True
        torch_mock.cuda.get_device_capability.return_value = (8, 6)
        torch_mock.cuda.get_device_name.return_value = "NVIDIA A100"

        from tts_server.device import get_device_config

        config = get_device_config()
        assert config.device == "cuda"
        assert config.dtype == torch_mock.bfloat16
        assert config.attn_implementation == "flash_attention_2"
        assert config.device_map == "auto"

    @patch("platform.system", return_value="Linux")
    @patch("platform.machine", return_value="x86_64")
    def test_cuda_older_gpu_uses_float16(self, mock_machine, mock_system, torch_mock):
        """Older CUDA GPUs (compute < 8.0) get float16 and sdpa."""
        torch_mock.backends.mps.is_available.return_value = False
        torch_mock.cuda.is_available.return_value = True
        torch_mock.cuda.get_device_capability.return_value = (7, 5)
        torch_mock.cuda.get_device_name.return_value = "NVIDIA RTX 2080"

        from tts_server.device import get_device_config

        config = get_device_config()
        assert config.device == "cuda"
        assert config.dtype == torch_mock.float16
        assert config.attn_implementation == "sdpa"


class TestGetMemoryInfo:
    """Tests for get_memory_info()."""

    def test_returns_dict_with_expected_keys(self, torch_mock):
        """get_memory_info() returns a dict with device, total_gb, available_gb."""
        torch_mock.backends.mps.is_available.return_value = False
        torch_mock.cuda.is_available.return_value = False

        from tts_server.device import get_memory_info

        info = get_memory_info()
        assert isinstance(info, dict)
        assert "device" in info
        assert "total_gb" in info
        assert "available_gb" in info

    def test_cpu_device_label(self, torch_mock):
        """Reports 'cpu' when neither GPU backend is available."""
        torch_mock.cuda.is_available.return_value = False
        torch_mock.backends.mps.is_available.return_value = False

        from tts_server.device import get_memory_info

        info = get_memory_info()
        assert info["device"] == "cpu"

    def test_numeric_values(self, torch_mock):
        """Memory values are numeric (int or float)."""
        torch_mock.cuda.is_available.return_value = False
        torch_mock.backends.mps.is_available.return_value = False

        from tts_server.device import get_memory_info

        info = get_memory_info()
        assert isinstance(info["total_gb"], (int, float))
        assert isinstance(info["available_gb"], (int, float))


class TestSynchronizeDevice:
    """Tests for synchronize_device()."""

    def test_cpu_does_not_crash(self, torch_mock):
        """synchronize_device('cpu') is a no-op and must not raise."""
        from tts_server.device import synchronize_device

        synchronize_device("cpu")  # should be silent

    def test_mps_calls_synchronize(self, torch_mock):
        """synchronize_device('mps') calls torch.mps.synchronize()."""
        from tts_server.device import synchronize_device

        torch_mock.mps.synchronize.reset_mock()
        synchronize_device("mps")
        torch_mock.mps.synchronize.assert_called_once()

    def test_cuda_calls_synchronize(self, torch_mock):
        """synchronize_device('cuda') calls torch.cuda.synchronize()."""
        from tts_server.device import synchronize_device

        torch_mock.cuda.synchronize.reset_mock()
        synchronize_device("cuda")
        torch_mock.cuda.synchronize.assert_called_once()


class TestClearCache:
    """Tests for clear_cache()."""

    def test_cpu_does_not_crash(self, torch_mock):
        """clear_cache('cpu') is a no-op and must not raise."""
        from tts_server.device import clear_cache

        clear_cache("cpu")  # should be silent

    def test_mps_calls_empty_cache(self, torch_mock):
        """clear_cache('mps') calls torch.mps.empty_cache()."""
        from tts_server.device import clear_cache

        torch_mock.mps.empty_cache.reset_mock()
        clear_cache("mps")
        torch_mock.mps.empty_cache.assert_called_once()

    def test_cuda_calls_empty_cache(self, torch_mock):
        """clear_cache('cuda') calls torch.cuda.empty_cache()."""
        from tts_server.device import clear_cache

        torch_mock.cuda.empty_cache.reset_mock()
        clear_cache("cuda")
        torch_mock.cuda.empty_cache.assert_called_once()
