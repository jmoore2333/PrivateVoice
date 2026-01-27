"""Download progress tracking for HuggingFace model downloads."""

import time
from dataclasses import dataclass, field
from typing import Optional, Callable
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

    def reset(self) -> None:
        """Reset progress tracking."""
        with self._progress_lock:
            self._progress = DownloadProgress()
            self._start_time = None
            self._last_bytes = 0
            self._last_time = 0.0

    def start_download(self, file_name: str, total_bytes: int) -> None:
        """Called when a download starts."""
        with self._progress_lock:
            self._progress = DownloadProgress(
                status="downloading",
                file_name=file_name,
                bytes_downloaded=0,
                bytes_total=total_bytes,
            )
            self._start_time = time.time()
            self._last_time = self._start_time
            self._last_bytes = 0

    def update_progress(self, bytes_downloaded: int) -> None:
        """Update download progress."""
        current_time = time.time()

        with self._progress_lock:
            self._progress.bytes_downloaded = bytes_downloaded

            # Calculate speed (rolling average over last update)
            time_delta = current_time - self._last_time
            if time_delta > 0.1:  # Update speed every 100ms
                bytes_delta = bytes_downloaded - self._last_bytes
                speed_bytes_per_sec = bytes_delta / time_delta
                self._progress.speed_mbps = (speed_bytes_per_sec * 8) / (1024 * 1024)  # Convert to Mbps

                self._last_time = current_time
                self._last_bytes = bytes_downloaded

            # Calculate ETA
            if self._progress.speed_mbps > 0 and self._progress.bytes_total > 0:
                remaining_bytes = self._progress.bytes_total - bytes_downloaded
                remaining_mbits = (remaining_bytes * 8) / (1024 * 1024)
                self._progress.eta = remaining_mbits / self._progress.speed_mbps
            else:
                self._progress.eta = 0

    def complete_download(self) -> None:
        """Called when download completes successfully."""
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


def create_hf_progress_callback() -> Callable:
    """
    Create a progress callback for huggingface_hub downloads.

    Returns a callback function compatible with hf_hub_download's
    progress_callback parameter.
    """
    tracker = get_download_tracker()

    def callback(progress: int, total: int, filename: str) -> None:
        if tracker._progress.status != "downloading":
            tracker.start_download(filename, total)
        tracker.update_progress(progress)

    return callback
