; NSIS installer/uninstaller hooks for PrivateVoice.
; Gives users control over what data to keep during uninstall.
;
; Directory layout under %APPDATA%\com.privatevoice.desktop\:
;   python_env\          Runtime, venv, models, caches (re-downloadable)
;   library\             User-saved voices and metadata (irreplaceable)
;
; %LOCALAPPDATA%\com.privatevoice.desktop\ holds the WebView profile/cache.

!macro NSIS_HOOK_PREUNINSTALL
  ; --- Prompt 1: Voice library (irreplaceable user content) ----------------
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Do you want to keep your saved voice library?$\n$\n\
     This includes any voices you have generated and saved.$\n\
     These files cannot be recovered after deletion." \
    IDYES _pv_keep_library

  ; User chose "No" — delete everything
  RMDir /r "$APPDATA\com.privatevoice.desktop"
  RMDir /r "$LOCALAPPDATA\com.privatevoice.desktop"
  Goto _pv_done

_pv_keep_library:
  ; --- Prompt 2: Models and runtime (re-downloadable) ----------------------
  MessageBox MB_YESNO|MB_ICONQUESTION \
    "Remove downloaded AI models and the Python runtime?$\n\
     This frees approximately 2-10 GB of disk space.$\n$\n\
     These will be re-downloaded automatically if you reinstall." \
    IDNO _pv_done

  ; Delete runtime/models but preserve library/
  RMDir /r "$APPDATA\com.privatevoice.desktop\python_env"
  ; Clean up WebView cache (not user data)
  RMDir /r "$LOCALAPPDATA\com.privatevoice.desktop"

_pv_done:
!macroend

; Post-uninstall: remove empty parent directories left behind.
; RMDir (without /r) only removes a directory if it is already empty,
; so this is safe — it will not delete remaining library/ files.
!macro NSIS_HOOK_POSTUNINSTALL
  RMDir "$APPDATA\com.privatevoice.desktop"
  RMDir "$LOCALAPPDATA\com.privatevoice.desktop"
!macroend
