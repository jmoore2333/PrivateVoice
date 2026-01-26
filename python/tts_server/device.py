"""Device and dtype detection for Apple Silicon MPS."""

import torch
import platform
from dataclasses import dataclass
from typing import Literal, Union

DeviceType = Literal["mps", "cpu"]
DtypeType = Literal["float16", "float32"]


@dataclass
class DeviceConfig:
    """Configuration for device and dtype."""
    device: str
    dtype: torch.dtype
    attn_implementation: str
    device_map: Union[str, dict]


def get_device_config() -> DeviceConfig:
    """
    Detect the best device configuration for the current system.

    Returns MPS config on Apple Silicon, CPU fallback otherwise.
    """
    # Check if we're on Apple Silicon
    is_apple_silicon = (
        platform.system() == "Darwin" and
        platform.machine() == "arm64"
    )

    if is_apple_silicon and torch.backends.mps.is_available():
        return DeviceConfig(
            device="mps",
            # M4 fully supports bfloat16 (better than float16 which has nan/inf issues)
            dtype=torch.bfloat16,
            # Flash attention not available on MPS, use SDPA
            attn_implementation="sdpa",
            device_map="mps"
        )
    else:
        # CPU fallback
        return DeviceConfig(
            device="cpu",
            dtype=torch.float32,
            attn_implementation="sdpa",
            device_map="cpu"
        )


def get_memory_info() -> dict:
    """Get memory information for the current device."""
    info = {
        "device": "unknown",
        "total_gb": 0,
        "available_gb": 0,
    }

    if torch.backends.mps.is_available():
        info["device"] = "mps"
        # MPS doesn't have direct memory query API like CUDA
        # We can use system memory as a proxy
        try:
            import psutil
            mem = psutil.virtual_memory()
            info["total_gb"] = round(mem.total / (1024**3), 2)
            info["available_gb"] = round(mem.available / (1024**3), 2)
        except ImportError:
            pass

    return info


def synchronize_device(device: str) -> None:
    """Synchronize the device to ensure all operations are complete."""
    if device == "mps":
        torch.mps.synchronize()
    elif device == "cuda":
        torch.cuda.synchronize()
    # CPU doesn't need synchronization


def clear_cache(device: str) -> None:
    """Clear device memory cache."""
    if device == "mps":
        torch.mps.empty_cache()
    elif device == "cuda":
        torch.cuda.empty_cache()
