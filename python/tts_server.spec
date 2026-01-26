# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for Qwen3-TTS server sidecar.

Build with: pyinstaller tts_server.spec

Output: dist/tts-server (single executable for macOS arm64)
"""

import sys
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

# Collect all submodules for packages that need them
hiddenimports = [
    # Core packages
    'torch',
    'torch.utils',
    'torch.nn',
    'torch.backends',
    'torch.backends.mps',
    # Transformers
    'transformers',
    'transformers.models',
    'transformers.models.auto',
    'transformers.generation',
    # Accelerate
    'accelerate',
    # Audio processing
    'soundfile',
    'librosa',
    'librosa.core',
    'librosa.feature',
    # Server
    'uvicorn',
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'fastapi',
    'starlette',
    'starlette.routing',
    'starlette.middleware',
    # Qwen TTS
    'qwen_tts',
    # Utilities
    'huggingface_hub',
    'safetensors',
    'pydantic',
    'pydantic_core',
    # HTTP
    'httptools',
    'websockets',
    'watchfiles',
    # Numeric
    'numpy',
    'scipy',
]

# Collect all submodules for complex packages
hiddenimports += collect_submodules('torch')
hiddenimports += collect_submodules('transformers')
hiddenimports += collect_submodules('qwen_tts')
hiddenimports += collect_submodules('uvicorn')
hiddenimports += collect_submodules('librosa')

# Collect data files (model configs, tokenizers, etc.)
datas = []
datas += collect_data_files('transformers')
datas += collect_data_files('huggingface_hub')
datas += collect_data_files('librosa')

# Exclude unnecessary packages to reduce size
excludes = [
    'tkinter',
    'matplotlib',
    'IPython',
    'jupyter',
    'notebook',
    'pytest',
    'sphinx',
    'PIL',
    'cv2',
    'tensorflow',
    'tensorboard',
    'keras',
]

a = Analysis(
    ['tts_server_entry.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='tts-server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,  # UPX can cause issues with torch
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # Keep console for logging
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch='arm64',  # Apple Silicon only
    codesign_identity=None,
    entitlements_file=None,
)
