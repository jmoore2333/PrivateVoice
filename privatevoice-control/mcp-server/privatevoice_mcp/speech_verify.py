"""Speech verification using mlx-whisper for transcription and jiwer for WER calculation."""

from __future__ import annotations

import asyncio
import re
from pathlib import Path

# Shorthand aliases → full HuggingFace repo IDs
WHISPER_MODELS: dict[str, str] = {
    "tiny": "mlx-community/whisper-tiny",
    "base": "mlx-community/whisper-base-mlx",
    "small": "mlx-community/whisper-small-mlx",
    "medium": "mlx-community/whisper-medium-mlx",
    "large": "mlx-community/whisper-large-v3-mlx",
    "large-turbo": "mlx-community/whisper-large-v3-turbo",
}

DEFAULT_MODEL = "large"


def resolve_whisper_model(model: str) -> str:
    """Resolve a shorthand name (e.g. 'large') to a full HuggingFace repo ID."""
    return WHISPER_MODELS.get(model, model)


class SpeechVerifier:
    """Transcribes audio and compares against expected text."""

    WER_PASS_THRESHOLD = 0.15

    async def verify(
        self,
        audio_path: str,
        expected_text: str,
        model: str = DEFAULT_MODEL,
        language: str = "en",
    ) -> dict:
        """Transcribe audio and compute word error rate against expected text."""
        if not Path(audio_path).exists():
            return {"error": f"Audio file not found: {audio_path}"}

        # Resolve shorthand → full repo ID
        resolved_model = resolve_whisper_model(model)

        # Run transcription in a thread pool (mlx-whisper is CPU/GPU bound)
        loop = asyncio.get_event_loop()
        try:
            transcription = await loop.run_in_executor(
                None,
                _transcribe,
                audio_path,
                resolved_model,
                language,
            )
        except ImportError:
            return {
                "error": "mlx-whisper is not installed. Install with: pip install mlx-whisper",
            }
        except Exception as exc:
            return {"error": f"Transcription failed: {exc}"}

        if not transcription or not transcription.strip():
            return {
                "error": "Empty transcription — audio may be silent or corrupt.",
                "audio_path": audio_path,
            }

        # Normalize texts for comparison
        norm_transcription = _normalize(transcription)
        norm_expected = _normalize(expected_text)

        # Calculate WER
        try:
            wer_result = await loop.run_in_executor(
                None,
                _compute_wer,
                norm_expected,
                norm_transcription,
            )
        except ImportError:
            # Fallback: simple word-level comparison
            wer_result = _simple_wer(norm_expected, norm_transcription)

        wer = wer_result["wer"]
        passed = wer < self.WER_PASS_THRESHOLD

        return {
            "transcription": transcription.strip(),
            "expected_text": expected_text,
            "normalized_transcription": norm_transcription,
            "normalized_expected": norm_expected,
            "wer": round(wer, 4),
            "passed": passed,
            "threshold": self.WER_PASS_THRESHOLD,
            "model": resolved_model,
            "language": language,
            "audio_path": audio_path,
            **{k: v for k, v in wer_result.items() if k != "wer"},
        }


def _transcribe(audio_path: str, model: str, language: str) -> str:
    """Run mlx-whisper transcription (blocking)."""
    import mlx_whisper

    result = mlx_whisper.transcribe(
        audio_path,
        path_or_hf_repo=model,
        language=language,
    )
    return result.get("text", "")


def _normalize(text: str) -> str:
    """Normalize text for WER comparison: lowercase, strip punctuation, collapse whitespace."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s]", "", text)  # Remove punctuation
    text = re.sub(r"\s+", " ", text)  # Collapse whitespace
    return text.strip()


def _compute_wer(reference: str, hypothesis: str) -> dict:
    """Compute WER using jiwer (blocking)."""
    import jiwer

    output = jiwer.process_words(reference, hypothesis)
    return {
        "wer": output.wer,
        "substitutions": output.substitutions,
        "deletions": output.deletions,
        "insertions": output.insertions,
        "hits": output.hits,
        "reference_words": reference.split(),
        "hypothesis_words": hypothesis.split(),
    }


def _simple_wer(reference: str, hypothesis: str) -> dict:
    """Fallback WER calculation using edit distance when jiwer is unavailable."""
    ref_words = reference.split()
    hyp_words = hypothesis.split()

    # Levenshtein distance on words
    m, n = len(ref_words), len(hyp_words)
    dp = [[0] * (n + 1) for _ in range(m + 1)]

    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j

    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if ref_words[i - 1] == hyp_words[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(
                    dp[i - 1][j],      # deletion
                    dp[i][j - 1],      # insertion
                    dp[i - 1][j - 1],  # substitution
                )

    edit_distance = dp[m][n]
    wer = edit_distance / max(m, 1)

    return {
        "wer": wer,
        "edit_distance": edit_distance,
        "reference_words": ref_words,
        "hypothesis_words": hyp_words,
        "note": "Computed with simple Levenshtein (jiwer not available)",
    }
