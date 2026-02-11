# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for PrivateVoice TTS server sidecar.

Build with: pyinstaller tts_server.spec

Output: dist/tts-server (single executable for current platform)
"""

import sys
import platform
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

# Detect target architecture dynamically
_machine = platform.machine().lower()
if _machine in ('arm64', 'aarch64'):
    _target_arch = 'arm64'
elif _machine in ('x86_64', 'amd64'):
    _target_arch = 'x86_64'
else:
    _target_arch = None  # Let PyInstaller auto-detect

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
    # Audio encoding
    'lameenc',
    # Whisper transcription (faster-whisper / CTranslate2)
    'faster_whisper',
    'ctranslate2',
]

# Platform-specific hidden imports
if platform.system() == 'Windows':
    hiddenimports += [
        'multiprocessing.popen_spawn_win32',
    ]

# CUDA-specific hidden imports (only when building with CUDA torch)
import torch as _torch
if _torch.cuda.is_available() or '+cu' in _torch.__version__:
    hiddenimports += [
        'torch.backends.cuda',
        'torch.backends.cudnn',
    ]

# Collect all submodules for complex packages
hiddenimports += collect_submodules('torch')
hiddenimports += collect_submodules('transformers')
hiddenimports += collect_submodules('qwen_tts')
hiddenimports += collect_submodules('uvicorn')
hiddenimports += collect_submodules('librosa')
hiddenimports += collect_submodules('faster_whisper')
hiddenimports += collect_submodules('ctranslate2')

# Collect data files (model configs, tokenizers, etc.)
datas = []
datas += collect_data_files('transformers')
datas += collect_data_files('huggingface_hub')
datas += collect_data_files('librosa')
datas += collect_data_files('faster_whisper')

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
    # Unused torch subsystems (significant size savings)
    'torch._dynamo',
    'torch._inductor',
    'torch.compiler',
    'triton',
    'torch.distributed',
    'torch.testing',
    'torch.utils.tensorboard',
    'torch.profiler',
    'torch.onnx',
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
    target_arch=_target_arch,  # Detected from current platform
    codesign_identity=None,
    entitlements_file=None,
)
