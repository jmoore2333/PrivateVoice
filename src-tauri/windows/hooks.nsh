; NSIS installer/uninstaller hooks for PrivateVoice.
; This keeps uninstall behavior aligned with our self-contained storage design.

!macro PRIVATEVOICE_REMOVE_APP_DATA
  ; Remove app-managed runtime and model data (Roaming AppData).
  RMDir /r "$APPDATA\com.privatevoice.desktop"

  ; Remove WebView profile and related LocalAppData cache.
  RMDir /r "$LOCALAPPDATA\com.privatevoice.desktop"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro PRIVATEVOICE_REMOVE_APP_DATA
!macroend

; Keep a post-uninstall fallback for bundler/toolchain variations.
!macro NSIS_HOOK_POSTUNINSTALL
  !insertmacro PRIVATEVOICE_REMOVE_APP_DATA
!macroend
