"""Download progress tracking for HuggingFace model downloads."""

import time
from dataclasses import dataclass
from typing import Optional
from threading import Lock


@dataclass
class DownloadProgress:
    """Current download progress state."""

    status: str = "idle"  # idle, downloading, complete, error
    file_name: str = ""
    bytes_downloaded: int = 0
    bytes_total: int = 0
    speed_mbps: float = 0.0
    eta: float = 0.0  # seconds remaining
    error_message: str = ""


class DownloadTracker:
    """
    Tracks download progress for HuggingFace Hub downloads.

    Thread-safe singleton that can be queried from the API endpoints.
    Supports cumulative tracking across multiple files in a snapshot_download.
    """

    _instance: Optional["DownloadTracker"] = None
    _lock: Lock = Lock()

    def __new__(cls) -> "DownloadTracker":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self) -> None:
        if self._initialized:
            return
        self._initialized = True
        self._progress = DownloadProgress()
        self._progress_lock = Lock()
        self._start_time: Optional[float] = None
        self._last_bytes: int = 0
        self._last_time: float = 0.0
        self._cumulative_total: int = 0
        self._cumulative_downloaded: int = 0

    def reset(self) -> None:
        """Reset progress tracking."""
        with self._progress_lock:
            self._progress = DownloadProgress()
            self._start_time = None
            self._last_bytes = 0
            self._last_time = 0.0
            self._cumulative_total = 0
            self._cumulative_downloaded = 0

    def start_session(self) -> None:
        """Start a new download session (called before snapshot_download)."""
        with self._progress_lock:
            self._progress = DownloadProgress(status="downloading")
            self._cumulative_total = 0
            self._cumulative_downloaded = 0
            self._start_time = time.time()
            self._last_time = self._start_time
            self._last_bytes = 0

    def add_file(self, file_name: str, total_bytes: int) -> None:
        """Register a new file being downloaded (adds to cumulative total)."""
        with self._progress_lock:
            self._cumulative_total += total_bytes
            self._progress.file_name = file_name
            self._progress.bytes_total = self._cumulative_total
            if self._progress.status != "downloading":
                self._progress.status = "downloading"
                self._start_time = time.time()
                self._last_time = self._start_time

    def update_bytes(self, delta_bytes: int) -> None:
        """Update progress with bytes just downloaded (incremental)."""
        current_time = time.time()

        with self._progress_lock:
            self._cumulative_downloaded += delta_bytes
            self._progress.bytes_downloaded = self._cumulative_downloaded

            # Calculate speed (rolling average over last update interval)
            time_delta = current_time - self._last_time
            if time_delta > 0.1:  # Update speed every 100ms
                bytes_delta = self._cumulative_downloaded - self._last_bytes
                speed_bytes_per_sec = bytes_delta / time_delta
                self._progress.speed_mbps = (speed_bytes_per_sec * 8) / (1024 * 1024)

                self._last_time = current_time
                self._last_bytes = self._cumulative_downloaded

            # Calculate ETA
            if self._progress.speed_mbps > 0 and self._cumulative_total > 0:
                remaining_bytes = self._cumulative_total - self._cumulative_downloaded
                remaining_mbits = (remaining_bytes * 8) / (1024 * 1024)
                self._progress.eta = remaining_mbits / self._progress.speed_mbps
            else:
                self._progress.eta = 0

    def complete_download(self) -> None:
        """Called when all downloads complete successfully."""
        with self._progress_lock:
            self._progress.status = "complete"
            self._progress.bytes_downloaded = self._progress.bytes_total
            self._progress.eta = 0

    def error(self, message: str) -> None:
        """Called when download fails."""
        with self._progress_lock:
            self._progress.status = "error"
            self._progress.error_message = message

    def get_progress(self) -> DownloadProgress:
        """Get current progress (thread-safe copy)."""
        with self._progress_lock:
            return DownloadProgress(
                status=self._progress.status,
                file_name=self._progress.file_name,
                bytes_downloaded=self._progress.bytes_downloaded,
                bytes_total=self._progress.bytes_total,
                speed_mbps=self._progress.speed_mbps,
                eta=self._progress.eta,
                error_message=self._progress.error_message,
            )

    def is_downloading(self) -> bool:
        """Check if a download is in progress."""
        with self._progress_lock:
            return self._progress.status == "downloading"


def get_download_tracker() -> DownloadTracker:
    """Get the global download tracker instance."""
    return DownloadTracker()


def create_hf_tqdm_class():
    """
    Create a tqdm-compatible class for huggingface_hub's snapshot_download.

    Returns a class that can be passed as the ``tqdm_class`` parameter.
    Each file download creates a new instance; progress is accumulated
    across all files in the DownloadTracker singleton.
    """
    tracker = get_download_tracker()

    class HFProgressBar:
        """tqdm-compatible progress bar that reports to DownloadTracker."""

        def __init__(self, *args, **kwargs):
            self.total = kwargs.get("total", 0) or 0
            self.desc = kwargs.get("desc", "") or ""
            self.n = 0
            self.disable = kwargs.get("disable", False)

            if self.total > 0 and not self.disable:
                tracker.add_file(self.desc, int(self.total))

        def update(self, n=1):
            if self.disable:
                return
            self.n += n
            tracker.update_bytes(int(n))

        def close(self):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            self.close()

        # tqdm compatibility stubs
        def set_description(self, desc=None, refresh=True):
            if desc:
                self.desc = desc

        def set_postfix(self, **kwargs):
            pass

        def set_postfix_str(self, s="", refresh=True):
            pass

        def refresh(self):
            pass

        def clear(self):
            pass

        def display(self, *args, **kwargs):
            pass

        def reset(self, total=None):
            if total is not None:
                self.total = total
            self.n = 0

    return HFProgressBar
