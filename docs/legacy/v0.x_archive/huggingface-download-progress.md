# HuggingFace Download Progress Monitoring

Research findings on how to track download progress when fetching models via HuggingFace Hub.

## Summary

The `huggingface_hub` library supports progress tracking via a `tqdm_class` parameter. Combined with `dry_run=True` for pre-download size info, we can implement comprehensive download progress monitoring.

---

## Key APIs

### 1. Custom tqdm Class (`tqdm_class` parameter)

Both `hf_hub_download()` and `snapshot_download()` accept a custom tqdm class:

```python
from tqdm.auto import tqdm as base_tqdm
from huggingface_hub import snapshot_download

class ProgressCallback(base_tqdm):
    """Custom tqdm class that reports progress to a callback"""

    callback = None  # Set this before use

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

    def update(self, n=1):
        super().update(n)
        if self.callback and self.total:
            self.callback(
                current=self.n,
                total=self.total,
                filename=self.desc or "",
                speed=self.format_dict.get('rate', 0)
            )

# Usage
ProgressCallback.callback = my_progress_handler
local_path = snapshot_download(
    repo_id="Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
    tqdm_class=ProgressCallback
)
```

**Important limitation:** For `snapshot_download()`, the custom tqdm only tracks overall file count progress, not per-file byte progress. Individual file downloads still use the default tqdm.

### 2. Dry Run for Pre-Download Info

Get file sizes and cache status before downloading:

```python
from huggingface_hub import snapshot_download

# Returns list of DryRunFileInfo objects
files_info = snapshot_download(
    repo_id="Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
    dry_run=True
)

# Each DryRunFileInfo has:
# - commit_hash: str
# - file_name: str
# - file_size: int (bytes)
# - is_cached: bool
# - would_download: bool

total_size = sum(f.file_size for f in files_info if f.would_download)
print(f"Need to download: {total_size / 1e9:.2f} GB")
```

### 3. Check Cache Before Download

```python
from huggingface_hub import try_to_load_from_cache, _CACHED_NO_EXIST

cached_path = try_to_load_from_cache(
    repo_id="Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
    filename="model.safetensors"
)

if cached_path is None:
    print("Not in cache - will download")
elif cached_path == _CACHED_NO_EXIST:
    print("Confirmed not on Hub")
else:
    print(f"Cached at: {cached_path}")
```

### 4. Environment Variables

| Variable | Purpose |
|----------|---------|
| `HF_HUB_DISABLE_PROGRESS_BARS=1` | Disable all progress bars |
| `HF_HUB_OFFLINE=1` | Offline mode (no downloads) |

### 5. Programmatic Control

```python
from huggingface_hub.utils import (
    enable_progress_bars,
    disable_progress_bars,
    are_progress_bars_disabled
)

disable_progress_bars()  # Global disable
enable_progress_bars()   # Global enable
```

---

## Recommended Implementation

For our TTS app, the best approach:

```python
from huggingface_hub import snapshot_download
from tqdm.auto import tqdm as base_tqdm
from typing import Callable, Optional
import threading

class DownloadProgressTracker(base_tqdm):
    """Custom tqdm that emits progress to a callback"""

    _callback: Optional[Callable] = None
    _current_file: str = ""

    @classmethod
    def set_callback(cls, callback: Callable):
        cls._callback = callback

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.desc:
            DownloadProgressTracker._current_file = self.desc

    def update(self, n=1):
        super().update(n)
        if self._callback and self.total:
            self._callback({
                "status": "downloading",
                "file_name": self._current_file or self.desc or "unknown",
                "bytes_downloaded": self.n,
                "bytes_total": self.total,
                "speed_bps": self.format_dict.get('rate', 0) or 0,
                "percent": (self.n / self.total) * 100 if self.total else 0,
            })


def download_model_with_progress(
    repo_id: str,
    progress_callback: Callable,
) -> str:
    """
    Download a HuggingFace model with progress tracking.

    Args:
        repo_id: HuggingFace repo ID (e.g., "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice")
        progress_callback: Function called with progress dict

    Returns:
        Local path to downloaded model
    """
    # First, check what needs to be downloaded
    progress_callback({
        "status": "checking",
        "message": "Checking model cache..."
    })

    files_info = snapshot_download(repo_id, dry_run=True)
    files_to_download = [f for f in files_info if f.would_download]

    if not files_to_download:
        progress_callback({
            "status": "cached",
            "message": "Model already cached"
        })
        return snapshot_download(repo_id)  # Just returns cache path

    total_bytes = sum(f.file_size for f in files_to_download)
    progress_callback({
        "status": "starting",
        "total_bytes": total_bytes,
        "total_files": len(files_to_download),
        "message": f"Downloading {len(files_to_download)} files ({total_bytes / 1e9:.2f} GB)"
    })

    # Set up progress tracking
    DownloadProgressTracker.set_callback(progress_callback)

    # Download with progress
    local_path = snapshot_download(
        repo_id,
        tqdm_class=DownloadProgressTracker
    )

    progress_callback({
        "status": "complete",
        "message": "Download complete"
    })

    return local_path
```

---

## Integration with FastAPI

Add endpoint to expose download progress:

```python
# In main.py

from dataclasses import dataclass
from typing import Optional
import threading

@dataclass
class DownloadState:
    status: str = "idle"
    file_name: str = ""
    bytes_downloaded: int = 0
    bytes_total: int = 0
    speed_bps: float = 0
    message: str = ""

_download_state = DownloadState()
_download_lock = threading.Lock()

def update_download_progress(data: dict):
    global _download_state
    with _download_lock:
        _download_state.status = data.get("status", "idle")
        _download_state.file_name = data.get("file_name", "")
        _download_state.bytes_downloaded = data.get("bytes_downloaded", 0)
        _download_state.bytes_total = data.get("bytes_total", 0)
        _download_state.speed_bps = data.get("speed_bps", 0)
        _download_state.message = data.get("message", "")

@app.get("/download-progress")
async def get_download_progress():
    with _download_lock:
        return {
            "status": _download_state.status,
            "file_name": _download_state.file_name,
            "bytes_downloaded": _download_state.bytes_downloaded,
            "bytes_total": _download_state.bytes_total,
            "speed_mbps": _download_state.speed_bps / 1e6 if _download_state.speed_bps else 0,
            "percent": (_download_state.bytes_downloaded / _download_state.bytes_total * 100)
                       if _download_state.bytes_total else 0,
            "eta": calculate_eta(_download_state),
            "message": _download_state.message,
        }
```

---

## Frontend Polling

```typescript
// In ttsClient.ts
async getDownloadProgress(): Promise<DownloadProgress> {
  const res = await fetch(`${this.baseUrl}/download-progress`);
  return res.json();
}

// In component - poll during model loading
const pollInterval = setInterval(async () => {
  const progress = await ttsClient.getDownloadProgress();
  if (progress.status === "downloading") {
    updateUI(progress);
  } else if (progress.status === "complete" || progress.status === "idle") {
    clearInterval(pollInterval);
  }
}, 500);
```

---

## Limitations

1. **Per-file granularity only** - `snapshot_download` with `tqdm_class` tracks file-level progress, not aggregate bytes across all files
2. **No native `from_pretrained` support** - Must use `snapshot_download` first, then `from_pretrained(local_path)`
3. **Thread safety** - Progress callbacks may come from download threads; use locks for shared state

---

## References

- [huggingface_hub file_download docs](https://huggingface.co/docs/huggingface_hub/en/package_reference/file_download)
- [huggingface_hub utilities docs](https://huggingface.co/docs/huggingface_hub/en/package_reference/utilities)
- [GitHub issue #22504](https://github.com/huggingface/transformers/issues/22504) - Request for progress in `from_pretrained`
