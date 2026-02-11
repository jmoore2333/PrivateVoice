#!/usr/bin/env python3
"""Entry point script for PyInstaller bundle.

This script is used by PyInstaller to properly bootstrap the tts_server module.
It avoids the relative import issues that occur when running main.py directly.
"""

import multiprocessing
import sys
import os

# Prevent infinite subprocess spawn loops on Windows with PyInstaller
multiprocessing.freeze_support()

# Ensure the parent directory is in the path for imports
if getattr(sys, 'frozen', False):
    # Running as PyInstaller bundle
    base_path = sys._MEIPASS
else:
    # Running as script
    base_path = os.path.dirname(os.path.abspath(__file__))

# Now import and run the server
from tts_server.main import main

if __name__ == "__main__":
    main()
