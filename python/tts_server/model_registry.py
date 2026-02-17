"""Pinned model metadata and download integrity helpers."""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping


@dataclass(frozen=True)
class HuggingFaceModelSpec:
    """Immutable source metadata for a model snapshot."""

    repo_id: str
    revision: str
    required_files: tuple[str, ...]
    allow_patterns: tuple[str, ...] = ()
    expected_sha256: Mapping[str, str] | None = None


# Qwen3-TTS model snapshots (pinned to immutable Hugging Face commit SHAs).
QWEN_MODEL_SPECS: dict[str, HuggingFaceModelSpec] = {
    "0.6b": HuggingFaceModelSpec(
        repo_id="Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
        revision="85e237c12c027371202489a0ec509ded67b5e4b5",
        required_files=(
            "config.json",
            "tokenizer_config.json",
            "merges.txt",
            "vocab.json",
            "model.safetensors",
            "speech_tokenizer/config.json",
            "speech_tokenizer/configuration.json",
            "speech_tokenizer/model.safetensors",
        ),
        expected_sha256={
            "model.safetensors": "bc3c7e785eb961179c25450d1acff03f839e0002f2f3a5aeb67b5735c0fa2adb",
            "speech_tokenizer/model.safetensors": "836b7b357f5ea43e889936a3709af68dfe3751881acefe4ecf0dbd30ba571258",
        },
    ),
    "0.6b-base": HuggingFaceModelSpec(
        repo_id="Qwen/Qwen3-TTS-12Hz-0.6B-Base",
        revision="5d83992436eae1d760afd27aff78a71d676296fc",
        required_files=(
            "config.json",
            "tokenizer_config.json",
            "merges.txt",
            "vocab.json",
            "model.safetensors",
            "speech_tokenizer/config.json",
            "speech_tokenizer/configuration.json",
            "speech_tokenizer/model.safetensors",
        ),
        expected_sha256={
            "model.safetensors": "180b3b10eb1c9f1b4db7806d5475bae3071c0243c299d49926bab1da3b6946f6",
            "speech_tokenizer/model.safetensors": "836b7b357f5ea43e889936a3709af68dfe3751881acefe4ecf0dbd30ba571258",
        },
    ),
    "1.7b": HuggingFaceModelSpec(
        repo_id="Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
        revision="0c0e3051f131929182e2c023b9537f8b1c68adfe",
        required_files=(
            "config.json",
            "tokenizer_config.json",
            "merges.txt",
            "vocab.json",
            "model.safetensors",
            "speech_tokenizer/config.json",
            "speech_tokenizer/configuration.json",
            "speech_tokenizer/model.safetensors",
        ),
        expected_sha256={
            "model.safetensors": "38b1d5971bdbd982b561cccec982669a53b0537c3cf5e9bd4778ed07bb2f5137",
            "speech_tokenizer/model.safetensors": "836b7b357f5ea43e889936a3709af68dfe3751881acefe4ecf0dbd30ba571258",
        },
    ),
    "1.7b-design": HuggingFaceModelSpec(
        repo_id="Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
        revision="5ecdb67327fd37bb2e042aab12ff7391903235d3",
        required_files=(
            "config.json",
            "tokenizer_config.json",
            "merges.txt",
            "vocab.json",
            "model.safetensors",
            "speech_tokenizer/config.json",
            "speech_tokenizer/configuration.json",
            "speech_tokenizer/model.safetensors",
        ),
        expected_sha256={
            "model.safetensors": "391e8db219f292c515297cdceeb43e4eae67cdde35fa57e79a6a8a532fca0522",
            "speech_tokenizer/model.safetensors": "836b7b357f5ea43e889936a3709af68dfe3751881acefe4ecf0dbd30ba571258",
        },
    ),
    "1.7b-base": HuggingFaceModelSpec(
        repo_id="Qwen/Qwen3-TTS-12Hz-1.7B-Base",
        revision="fd4b254389122332181a7c3db7f27e918eec64e3",
        required_files=(
            "config.json",
            "tokenizer_config.json",
            "merges.txt",
            "vocab.json",
            "model.safetensors",
            "speech_tokenizer/config.json",
            "speech_tokenizer/configuration.json",
            "speech_tokenizer/model.safetensors",
        ),
        expected_sha256={
            "model.safetensors": "38fc7fc51c5e776e840414b6fd443962e9411b9654888fd7913e4da643cb857c",
            "speech_tokenizer/model.safetensors": "836b7b357f5ea43e889936a3709af68dfe3751881acefe4ecf0dbd30ba571258",
        },
    ),
}


WHISPER_MODEL_SPECS: dict[str, HuggingFaceModelSpec] = {
    "tiny": HuggingFaceModelSpec(
        repo_id="Systran/faster-whisper-tiny",
        revision="d90ca5fe260221311c53c58e660288d3deb8d356",
        required_files=("config.json", "model.bin", "tokenizer.json", "vocabulary.txt"),
        expected_sha256={
            "model.bin": "dcb76c6586fc06cbdac6dd21f14cfd129cc4cdd9dce19bf4ffa62e59cbe6e6d1",
        },
    ),
    "base": HuggingFaceModelSpec(
        repo_id="Systran/faster-whisper-base",
        revision="ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66",
        required_files=("config.json", "model.bin", "tokenizer.json", "vocabulary.txt"),
        expected_sha256={
            "model.bin": "d01c3014881c9c6f3133c182f3d2887eb6ca1c789a7538c5c007196857a0a6a9",
        },
    ),
    "small": HuggingFaceModelSpec(
        repo_id="Systran/faster-whisper-small",
        revision="536b0662742c02347bc0e980a01041f333bce120",
        required_files=("config.json", "model.bin", "tokenizer.json", "vocabulary.txt"),
        expected_sha256={
            "model.bin": "3e305921506d8872816023e4c273e75d2419fb89b24da97b4fe7bce14170d671",
        },
    ),
    "medium": HuggingFaceModelSpec(
        repo_id="Systran/faster-whisper-medium",
        revision="08e178d48790749d25932bbc082711ddcfdfbc4f",
        required_files=("config.json", "model.bin", "tokenizer.json", "vocabulary.txt"),
        expected_sha256={
            "model.bin": "9b45e1009dcc4ab601eff815b61d80e60ce3fd8c74c1a14f4a282258286b51ae",
        },
    ),
    "large-v3": HuggingFaceModelSpec(
        repo_id="Systran/faster-whisper-large-v3",
        revision="edaa852ec7e145841d8ffdb056a99866b5f0a478",
        required_files=("config.json", "model.bin", "tokenizer.json", "vocabulary.txt"),
        expected_sha256={
            "model.bin": "69f74147e3334731bc3a76048724833325d2ec74642fb52620eda87352e3d4f1",
        },
    ),
    "large-v3-turbo": HuggingFaceModelSpec(
        # Public CTranslate2-converted Turbo checkpoint.
        repo_id="mobiuslabsgmbh/faster-whisper-large-v3-turbo",
        revision="0a363e9161cbc7ed1431c9597a8ceaf0c4f78fcf",
        required_files=(
            "config.json",
            "preprocessor_config.json",
            "model.bin",
            "tokenizer.json",
            "vocabulary.json",
        ),
        expected_sha256={
            "model.bin": "e76620f83d5f5b69efd3d87e3dc180c1bd21df9fbebacfd4335e5e1efcc018da",
        },
    ),
}


TRANSLATION_MODEL_SPECS: dict[str, HuggingFaceModelSpec] = {
    "nllb-600m": HuggingFaceModelSpec(
        repo_id="facebook/nllb-200-distilled-600M",
        revision="f8d333a098d19b4fd9a8b18f94170487ad3f821d",
        required_files=(
            "config.json",
            "generation_config.json",
            "pytorch_model.bin",
            "sentencepiece.bpe.model",
            "tokenizer.json",
            "tokenizer_config.json",
        ),
        expected_sha256={
            "pytorch_model.bin": "c266c2cfd19758b6d09c1fc31ecdf1e485509035f6b51dfe84f1ada83eefcc42",
        },
    )
}


CHATTERBOX_MODEL_SPECS: dict[str, HuggingFaceModelSpec] = {
    "original": HuggingFaceModelSpec(
        repo_id="ResembleAI/chatterbox",
        revision="05e904af2b5c7f8e482687a9d7336c5c824467d9",
        required_files=(
            "ve.safetensors",
            "t3_cfg.safetensors",
            "s3gen.safetensors",
            "tokenizer.json",
            "conds.pt",
        ),
        allow_patterns=("*.safetensors", "*.json", "*.txt", "*.pt", "*.model"),
        expected_sha256={
            "ve.safetensors": "f0921cab452fa278bc25cd23ffd59d36f816d7dc5181dd1bef9751a7fb61f63c",
            "t3_cfg.safetensors": "914cb1696f47527fe8852ca8f1fe1fa63cb34f76f9c715e84e067b744dd0da81",
            "s3gen.safetensors": "2b78103c654207393955e4900aac14a12de8ef25f4b09424f1ef91941f161d4e",
        },
    ),
    "turbo": HuggingFaceModelSpec(
        repo_id="ResembleAI/chatterbox-turbo",
        revision="749d1c1a46eb10492095d68fbcf55691ccf137cd",
        required_files=(
            "ve.safetensors",
            "t3_turbo_v1.safetensors",
            "s3gen_meanflow.safetensors",
            "tokenizer_config.json",
            "vocab.json",
            "merges.txt",
            "conds.pt",
        ),
        allow_patterns=("*.safetensors", "*.json", "*.txt", "*.pt", "*.model", "*.yaml"),
        expected_sha256={
            "ve.safetensors": "f0921cab452fa278bc25cd23ffd59d36f816d7dc5181dd1bef9751a7fb61f63c",
            "t3_turbo_v1.safetensors": "fcf1f8c1d651bb7e3acd69ee5be269b4ac10c02980b7708213d598bc9f7cdf87",
            "s3gen_meanflow.safetensors": "d65cb687a2ed581ee6cc297e919ffefa63386944f42364ae13b78a594945514f",
        },
    ),
    "multilingual": HuggingFaceModelSpec(
        repo_id="ResembleAI/chatterbox",
        revision="05e904af2b5c7f8e482687a9d7336c5c824467d9",
        required_files=(
            "ve.pt",
            "t3_mtl23ls_v2.safetensors",
            "s3gen.pt",
            "grapheme_mtl_merged_expanded_v1.json",
            "conds.pt",
            "Cangjie5_TC.json",
        ),
        allow_patterns=("ve.pt", "t3_mtl23ls_v2.safetensors", "s3gen.pt", "grapheme_mtl_merged_expanded_v1.json", "conds.pt", "Cangjie5_TC.json"),
        expected_sha256={
            "ve.pt": "4b16d836bc598509860f6fa068165a8bb5e9ac84f05582dfcf278a5a372879f1",
            "t3_mtl23ls_v2.safetensors": "b1237586127ce98e7800a68e49938eb5092846862aabcb6e17b2fda7889a6c75",
            "s3gen.pt": "9b9ff07e60b20c136e2b1b3d7563a24604e8d2c4c267888d1ee929dd0151d2a3",
        },
    ),
}


def ensure_required_files(snapshot_path: str | Path, required_files: tuple[str, ...]) -> None:
    """Fail closed if mandatory model files are missing from the snapshot."""
    base = Path(snapshot_path)
    missing = [rel for rel in required_files if not (base / rel).exists()]
    if missing:
        raise RuntimeError(
            f"Snapshot at {base} is missing required files: {', '.join(sorted(missing))}"
        )


def _sha256_file(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def _hash_verification_enabled() -> bool:
    raw = os.environ.get("PV_VERIFY_MODEL_HASHES", "1").strip().lower()
    return raw not in {"0", "false", "no", "off"}


def verify_snapshot_hashes(snapshot_path: str | Path, expected_sha256: Mapping[str, str] | None) -> None:
    """Verify critical artifact hashes once per snapshot revision and cache the result."""
    if not expected_sha256 or not _hash_verification_enabled():
        return

    base = Path(snapshot_path)
    cache_path = base / ".privatevoice-integrity.json"

    cache: dict[str, dict[str, int | str]] = {}
    if cache_path.exists():
        try:
            raw = json.loads(cache_path.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                cache = {
                    k: v for k, v in raw.items() if isinstance(v, dict)
                }
        except Exception:
            cache = {}

    updated = False
    for rel, expected in expected_sha256.items():
        artifact = base / rel
        if not artifact.exists():
            raise RuntimeError(f"Missing expected model artifact for hash verification: {artifact}")

        stat = artifact.stat()
        cached = cache.get(rel)
        if (
            cached
            and cached.get("sha256") == expected
            and cached.get("size") == stat.st_size
            and cached.get("mtime_ns") == stat.st_mtime_ns
        ):
            continue

        actual = _sha256_file(artifact)
        if actual.lower() != expected.lower():
            raise RuntimeError(
                "Model artifact integrity check failed for "
                f"{artifact}. Expected sha256={expected}, got sha256={actual}."
            )

        cache[rel] = {
            "sha256": expected.lower(),
            "size": stat.st_size,
            "mtime_ns": stat.st_mtime_ns,
        }
        updated = True

    if updated:
        cache_path.write_text(json.dumps(cache, indent=2, sort_keys=True), encoding="utf-8")
