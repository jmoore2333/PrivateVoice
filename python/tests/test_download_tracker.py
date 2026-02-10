"""Tests for tts_server.download_tracker module."""

import pytest


class TestDownloadTracker:
    """Tests for DownloadTracker singleton."""

    def test_singleton(self, reset_download_tracker):
        """DownloadTracker is a singleton."""
        from tts_server.download_tracker import DownloadTracker

        a = DownloadTracker()
        b = DownloadTracker()
        assert a is b

    def test_initial_state_is_idle(self, reset_download_tracker):
        """Fresh tracker reports idle status."""
        from tts_server.download_tracker import get_download_tracker

        tracker = get_download_tracker()
        progress = tracker.get_progress()
        assert progress.status == "idle"
        assert progress.bytes_downloaded == 0
        assert progress.bytes_total == 0

    def test_start_session(self, reset_download_tracker):
        """start_session sets status to downloading."""
        from tts_server.download_tracker import get_download_tracker

        tracker = get_download_tracker()
        tracker.start_session()
        progress = tracker.get_progress()
        assert progress.status == "downloading"

    def test_add_file_accumulates_total(self, reset_download_tracker):
        """add_file increases the cumulative total."""
        from tts_server.download_tracker import get_download_tracker

        tracker = get_download_tracker()
        tracker.start_session()
        tracker.add_file("shard-001.safetensors", 1_000_000)
        tracker.add_file("shard-002.safetensors", 2_000_000)

        progress = tracker.get_progress()
        assert progress.bytes_total == 3_000_000
        assert progress.file_name == "shard-002.safetensors"

    def test_update_bytes_incremental(self, reset_download_tracker):
        """update_bytes accumulates downloaded bytes."""
        from tts_server.download_tracker import get_download_tracker

        tracker = get_download_tracker()
        tracker.start_session()
        tracker.add_file("model.safetensors", 1000)
        tracker.update_bytes(100)
        tracker.update_bytes(200)

        progress = tracker.get_progress()
        assert progress.bytes_downloaded == 300

    def test_complete_download(self, reset_download_tracker):
        """complete_download sets status and zeroes ETA."""
        from tts_server.download_tracker import get_download_tracker

        tracker = get_download_tracker()
        tracker.start_session()
        tracker.add_file("model.safetensors", 1000)
        tracker.update_bytes(500)
        tracker.complete_download()

        progress = tracker.get_progress()
        assert progress.status == "complete"
        assert progress.bytes_downloaded == progress.bytes_total
        assert progress.eta == 0

    def test_error(self, reset_download_tracker):
        """error sets status and stores message."""
        from tts_server.download_tracker import get_download_tracker

        tracker = get_download_tracker()
        tracker.start_session()
        tracker.error("Connection lost")

        progress = tracker.get_progress()
        assert progress.status == "error"
        assert progress.error_message == "Connection lost"

    def test_is_downloading(self, reset_download_tracker):
        """is_downloading reflects the current state."""
        from tts_server.download_tracker import get_download_tracker

        tracker = get_download_tracker()
        assert tracker.is_downloading() is False

        tracker.start_session()
        assert tracker.is_downloading() is True

        tracker.complete_download()
        assert tracker.is_downloading() is False

    def test_reset_clears_all(self, reset_download_tracker):
        """reset returns tracker to idle state."""
        from tts_server.download_tracker import get_download_tracker

        tracker = get_download_tracker()
        tracker.start_session()
        tracker.add_file("file.bin", 5000)
        tracker.update_bytes(2500)
        tracker.reset()

        progress = tracker.get_progress()
        assert progress.status == "idle"
        assert progress.bytes_downloaded == 0
        assert progress.bytes_total == 0

    def test_get_progress_returns_copy(self, reset_download_tracker):
        """get_progress returns a copy, not a reference."""
        from tts_server.download_tracker import get_download_tracker

        tracker = get_download_tracker()
        tracker.start_session()
        tracker.add_file("file.bin", 1000)

        p1 = tracker.get_progress()
        tracker.update_bytes(500)
        p2 = tracker.get_progress()

        assert p1.bytes_downloaded == 0
        assert p2.bytes_downloaded == 500


class TestHFTqdmClass:
    """Tests for the tqdm-compatible class from create_hf_tqdm_class."""

    def test_basic_usage(self, reset_download_tracker):
        """HFProgressBar tracks progress through the DownloadTracker."""
        from tts_server.download_tracker import create_hf_tqdm_class, get_download_tracker

        tracker = get_download_tracker()
        tracker.start_session()

        TqdmClass = create_hf_tqdm_class()
        bar = TqdmClass(total=1000, desc="model.safetensors")
        bar.update(100)
        bar.update(200)
        bar.close()

        progress = tracker.get_progress()
        assert progress.bytes_downloaded == 300
        assert progress.bytes_total == 1000
        assert progress.file_name == "model.safetensors"

    def test_disabled_bar_skips_tracking(self, reset_download_tracker):
        """Bars with disable=True don't affect the tracker."""
        from tts_server.download_tracker import create_hf_tqdm_class, get_download_tracker

        tracker = get_download_tracker()
        tracker.start_session()

        TqdmClass = create_hf_tqdm_class()
        bar = TqdmClass(total=1000, desc="hidden.bin", disable=True)
        bar.update(500)

        progress = tracker.get_progress()
        assert progress.bytes_downloaded == 0
        assert progress.bytes_total == 0

    def test_multiple_files(self, reset_download_tracker):
        """Multiple tqdm instances accumulate in the tracker."""
        from tts_server.download_tracker import create_hf_tqdm_class, get_download_tracker

        tracker = get_download_tracker()
        tracker.start_session()

        TqdmClass = create_hf_tqdm_class()

        # First file
        bar1 = TqdmClass(total=1000, desc="shard-001.safetensors")
        bar1.update(1000)
        bar1.close()

        # Second file
        bar2 = TqdmClass(total=2000, desc="shard-002.safetensors")
        bar2.update(500)

        progress = tracker.get_progress()
        assert progress.bytes_total == 3000
        assert progress.bytes_downloaded == 1500
        assert progress.file_name == "shard-002.safetensors"

    def test_context_manager(self, reset_download_tracker):
        """HFProgressBar works as a context manager."""
        from tts_server.download_tracker import create_hf_tqdm_class, get_download_tracker

        tracker = get_download_tracker()
        tracker.start_session()

        TqdmClass = create_hf_tqdm_class()
        with TqdmClass(total=500, desc="file.bin") as bar:
            bar.update(250)

        progress = tracker.get_progress()
        assert progress.bytes_downloaded == 250

    def test_tqdm_compatibility_methods(self, reset_download_tracker):
        """tqdm stub methods don't raise."""
        from tts_server.download_tracker import create_hf_tqdm_class, get_download_tracker

        tracker = get_download_tracker()
        tracker.start_session()

        TqdmClass = create_hf_tqdm_class()
        bar = TqdmClass(total=100, desc="test")
        # These should all be no-ops
        bar.set_description("new desc")
        bar.set_postfix(speed=100)
        bar.set_postfix_str("100 MB/s")
        bar.refresh()
        bar.clear()
        bar.display()
        bar.reset(total=200)
