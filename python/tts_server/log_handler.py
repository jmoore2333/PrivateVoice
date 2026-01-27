"""Structured logging for the TTS server."""

import logging
import sys
import json
from dataclasses import dataclass, asdict
from datetime import datetime
from typing import List, Optional
from collections import deque
from threading import Lock


@dataclass
class LogEntry:
    """A single log entry."""

    level: str
    message: str
    timestamp: str
    logger_name: str = "tts_server"


class LogBuffer:
    """
    Thread-safe circular buffer for recent log entries.

    Keeps the most recent N log entries for API access.
    """

    def __init__(self, max_size: int = 500):
        self._buffer: deque[LogEntry] = deque(maxlen=max_size)
        self._lock = Lock()

    def add(self, entry: LogEntry) -> None:
        """Add a log entry to the buffer."""
        with self._lock:
            self._buffer.append(entry)

    def get_recent(self, count: int = 100, level_filter: Optional[str] = None) -> List[LogEntry]:
        """
        Get recent log entries.

        Args:
            count: Maximum number of entries to return
            level_filter: Optional minimum log level to include (e.g., "WARNING")

        Returns:
            List of log entries, most recent last
        """
        level_priority = {
            "DEBUG": 0,
            "INFO": 1,
            "WARNING": 2,
            "ERROR": 3,
            "CRITICAL": 4,
        }

        min_priority = level_priority.get(level_filter, 0) if level_filter else 0

        with self._lock:
            entries = list(self._buffer)

        if level_filter:
            entries = [
                e
                for e in entries
                if level_priority.get(e.level, 0) >= min_priority
            ]

        return entries[-count:]

    def clear(self) -> None:
        """Clear all log entries."""
        with self._lock:
            self._buffer.clear()


# Global log buffer
_log_buffer: Optional[LogBuffer] = None


def get_log_buffer() -> LogBuffer:
    """Get the global log buffer instance."""
    global _log_buffer
    if _log_buffer is None:
        _log_buffer = LogBuffer()
    return _log_buffer


class BufferingHandler(logging.Handler):
    """
    Custom logging handler that adds entries to the log buffer.
    """

    def __init__(self, buffer: LogBuffer):
        super().__init__()
        self._buffer = buffer

    def emit(self, record: logging.LogRecord) -> None:
        try:
            entry = LogEntry(
                level=record.levelname,
                message=self.format(record),
                timestamp=datetime.fromtimestamp(record.created).isoformat(),
                logger_name=record.name,
            )
            self._buffer.add(entry)
        except Exception:
            self.handleError(record)


class JSONFormatter(logging.Formatter):
    """JSON formatter for structured logging output."""

    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": datetime.fromtimestamp(record.created).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }

        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_data)


def setup_logging(
    level: int = logging.INFO,
    json_output: bool = False,
) -> logging.Logger:
    """
    Set up structured logging for the TTS server.

    Args:
        level: Logging level
        json_output: If True, output JSON-formatted logs

    Returns:
        Configured root logger
    """
    # Get root logger
    logger = logging.getLogger("tts_server")
    logger.setLevel(level)

    # Clear existing handlers
    logger.handlers.clear()

    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(level)

    if json_output:
        console_handler.setFormatter(JSONFormatter())
    else:
        console_handler.setFormatter(
            logging.Formatter(
                "[%(asctime)s] %(levelname)s - %(message)s",
                datefmt="%H:%M:%S",
            )
        )

    logger.addHandler(console_handler)

    # Buffer handler for API access
    buffer = get_log_buffer()
    buffer_handler = BufferingHandler(buffer)
    buffer_handler.setLevel(level)
    buffer_handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(buffer_handler)

    return logger


def get_logger(name: str = "tts_server") -> logging.Logger:
    """Get a logger instance."""
    return logging.getLogger(name)
