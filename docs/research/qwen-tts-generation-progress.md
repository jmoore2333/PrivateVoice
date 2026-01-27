# Qwen-TTS Generation Progress Monitoring

Research findings on progress/streaming capabilities during audio generation.

## Summary

**The qwen-tts library (v0.0.5) does NOT expose native progress callbacks, streaming output, or generator patterns.** All generation methods return complete results. Workarounds are required for progress indication.

---

## API Analysis

### Method Signatures

```python
def generate_custom_voice(
    self,
    text: Union[str, List[str]],
    speaker: Union[str, List[str]],
    language: Union[str, List[str]] = None,
    instruct: Optional[Union[str, List[str]]] = None,
    non_streaming_mode: bool = True,
    **kwargs,
) -> Tuple[List[np.ndarray], int]:

def generate_voice_design(..., non_streaming_mode: bool = True, **kwargs) -> Tuple[...]
def generate_voice_clone(..., non_streaming_mode: bool = False, **kwargs) -> Tuple[...]
```

### Key Findings

| Feature | Available? | Notes |
|---------|------------|-------|
| Progress callbacks | ❌ No | Not in API |
| Generator/yield patterns | ❌ No | Methods return complete results |
| Streaming audio output | ❌ No | Only batch output |
| Stdout/stderr progress | ❌ Minimal | Just warnings, already suppressed |
| `non_streaming_mode` param | Misleading | Only affects internal generation, not output format |

---

## The `non_streaming_mode` Parameter

Despite the name, this parameter does NOT provide streaming output to the caller:
- It affects how the model internally generates tokens
- The method still returns complete `(wavs, sample_rate)` tuples
- No way to get incremental audio chunks

---

## Stdout/Stderr Output

The library outputs minimal logging:
- Warning about `use_cache=True` incompatibility
- Audio signal validation warnings
- No progress bars or generation status

**Note:** Our app already suppresses stdout/stderr during model loading to prevent broken pipe errors.

---

## HuggingFace Transformers Streamer

The underlying Transformers library supports a `streamer` parameter:

```python
streamer (`BaseStreamer`, *optional*) --
    Streamer object that will be used to stream the generated sequences.
    Generated tokens are passed through `streamer.put(token_ids)`.
```

### Theoretical Approach

```python
class TTSProgressStreamer:
    def put(self, token_ids):
        # Called for each batch of generated tokens
        # Could emit progress events here
        pass

    def end(self):
        pass

# Might work if qwen-tts forwards kwargs
wavs, sr = model.generate_custom_voice(
    text=text,
    speaker=speaker,
    streamer=my_streamer,  # May or may not be forwarded
)
```

### Caveats

1. Qwen3-TTS has custom generate implementation - may not forward streamer
2. TTS produces audio codec tokens, not text - TextIteratorStreamer won't work
3. **Untested** - would require library modifications to verify

---

## Recommended Workarounds

### 1. Indeterminate Progress with Elapsed Time

Simplest approach - show spinner with elapsed time:

```python
import time
import threading

def generate_with_timer(text, model, on_tick):
    result = [None]
    error = [None]
    done = threading.Event()

    def worker():
        try:
            result[0] = model.generate_custom_voice(text=text, ...)
        except Exception as e:
            error[0] = e
        finally:
            done.set()

    thread = threading.Thread(target=worker)
    start = time.time()
    thread.start()

    while not done.is_set():
        elapsed = time.time() - start
        on_tick(elapsed=elapsed, status="generating")
        done.wait(timeout=0.1)

    if error[0]:
        raise error[0]
    return result[0]
```

### 2. Time-Based Estimation

Benchmark generation time per character/word, estimate progress:

```python
# Calibration data (measure on your hardware)
CHARS_PER_SECOND = 15  # Approximate for 0.6B model on M4

def estimate_progress(text: str, elapsed: float) -> float:
    estimated_total = len(text) / CHARS_PER_SECOND
    return min(elapsed / estimated_total, 0.99)
```

### 3. Text Chunking (for long texts)

Split into sentences, show per-sentence progress:

```python
import re

def split_sentences(text: str) -> list[str]:
    return re.split(r'(?<=[.!?])\s+', text)

def generate_chunked(text: str, model, on_progress):
    sentences = split_sentences(text)
    audio_chunks = []

    for i, sentence in enumerate(sentences):
        on_progress(current=i, total=len(sentences), status="generating")
        wav, sr = model.generate_custom_voice(text=sentence, ...)
        audio_chunks.append(wav)

    on_progress(current=len(sentences), total=len(sentences), status="complete")
    return concatenate_audio(audio_chunks, sr)
```

**Caveat:** Chunking may affect prosody/flow compared to single generation.

---

## vLLM-Omni Alternative

The Qwen3-TTS documentation mentions vLLM-Omni for streaming:

> "vLLM-Omni will continue to offer support and optimization for Qwen3-TTS in areas such as inference speed and streaming capabilities."

This is a separate deployment option requiring vLLM infrastructure - not available through the qwen-tts Python package.

---

## Recommendation for Our App

**Short term:** Implement indeterminate spinner with elapsed time display.

```svelte
<!-- GenerateButton.svelte -->
{#if isGenerating}
  <div class="generating">
    <Spinner />
    <span>Generating... {formatTime(elapsedSeconds)}</span>
  </div>
{/if}
```

**Medium term:** Add time estimation based on text length + hardware benchmarks.

**Long term:** If we need true streaming, consider:
- Forking qwen-tts to expose streaming
- Using vLLM-Omni deployment
- Chunked generation for long texts

---

## References

- [qwen-tts PyPI](https://pypi.org/project/qwen-tts/)
- [Qwen3-TTS GitHub](https://github.com/QwenLM/Qwen3-TTS)
- [HuggingFace Transformers streamer docs](https://huggingface.co/docs/transformers/main_classes/text_generation)
