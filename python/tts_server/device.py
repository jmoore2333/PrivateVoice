"""Device and dtype detection for Apple Silicon MPS, CUDA, and CPU."""

import torch
import platform
import logging
from dataclasses import dataclass
from typing import Literal, Union

logger = logging.getLogger("tts_server")

DeviceType = Literal["mps", "cuda", "cpu"]


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

    Priority: MPS (Apple Silicon) > CUDA (NVIDIA GPU) > CPU.
    """
    # Check if we're on Apple Silicon
    is_apple_silicon = (
        platform.system() == "Darwin" and
        platform.machine() == "arm64"
    )

    if is_apple_silicon and torch.backends.mps.is_available():
        logger.info("Using MPS (Apple Silicon) device")
        return DeviceConfig(
            device="mps",
            dtype=torch.bfloat16,
            attn_implementation="sdpa",
            device_map="mps"
        )
    elif torch.cuda.is_available():
        # Select dtype based on GPU compute capability
        capability = torch.cuda.get_device_capability()
        # bfloat16 requires compute capability >= 8.0 (Ampere+)
        if capability[0] >= 8:
            dtype = torch.bfloat16
            attn = "flash_attention_2"
        else:
            dtype = torch.float16
            attn = "sdpa"
        device_name = torch.cuda.get_device_name(0)
        logger.info(f"Using CUDA device: {device_name} (compute {capability[0]}.{capability[1]})")
        return DeviceConfig(
            device="cuda",
            dtype=dtype,
            attn_implementation=attn,
            device_map="auto"
        )
    else:
        logger.info("Using CPU device (no GPU acceleration available)")
        return DeviceConfig(
            device="cpu",
            dtype=torch.float32,
            attn_implementation="sdpa",
            device_map="cpu"
        )


def get_memory_info() -> dict:
    """Get memory information for the current device."""
    info: dict = {
        "device": "unknown",
        "total_gb": 0,
        "available_gb": 0,
    }

    if torch.cuda.is_available():
        info["device"] = "cuda"
        try:
            total = torch.cuda.get_device_properties(0).total_mem
            free = total - torch.cuda.memory_allocated(0)
            info["total_gb"] = round(total / (1024**3), 2)
            info["available_gb"] = round(free / (1024**3), 2)
        except Exception:
            pass
    elif torch.backends.mps.is_available():
        info["device"] = "mps"
        try:
            import psutil
            mem = psutil.virtual_memory()
            info["total_gb"] = round(mem.total / (1024**3), 2)
            info["available_gb"] = round(mem.available / (1024**3), 2)
        except ImportError:
            pass
    else:
        info["device"] = "cpu"
        try:
            import psutil
            mem = psutil.virtual_memory()
            info["total_gb"] = round(mem.total / (1024**3), 2)
            info["available_gb"] = round(mem.available / (1024**3), 2)
        except ImportError:
            pass

    return info


# Minimum recommended RAM (GB) per model variant
MODEL_MEMORY_REQUIREMENTS: dict[str, int] = {
    "0.6b": 8,
    "0.6b-base": 8,
    "1.7b": 12,
    "1.7b-base": 12,
    "1.7b-design": 12,
}

SUPPORTED_MP3_BITRATES = [128, 192, 256, 320]


def check_memory_for_model(model_id: str) -> dict:
    """Check if the system has enough memory for a given model.

    Returns a dict with required_gb, available_gb, sufficient (bool),
    and an optional warning message.
    """
    required_gb = MODEL_MEMORY_REQUIREMENTS.get(model_id, 8)
    info = get_memory_info()
    available = info.get("available_gb", 0)
    sufficient = available >= required_gb

    return {
        "required_gb": required_gb,
        "available_gb": available,
        "sufficient": sufficient,
        "warning": (
            f"Model requires ~{required_gb}GB RAM, only {available:.1f}GB available"
            if not sufficient else None
        ),
    }


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
