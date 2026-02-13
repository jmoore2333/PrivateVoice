# AppImage Issues (Deferred)

## Status

- As of **February 13, 2026**, `.deb` builds are functional in current testing.
- `.AppImage` builds still show a critical runtime issue after generation:
  - generation appears to complete,
  - output panel updates (or attempts to),
  - then the app UI becomes unresponsive.

This issue is out of scope for the current branch and should be investigated in a dedicated follow-up branch.

## Branch Context

- Branch: `codex/security-hardening-review`
- Relevant committed work already on this branch:
  - `3d39476` - AppImage env cleanup for subprocesses (`setup.rs` + `lib.rs`).
  - `3b60dbe` - Linux CUDA stabilization + full rebuild cleanup behavior.
  - `f8a3b3d` - Linux microphone stability fixes.

## Confirmed Working

- `.deb` package:
  - startup/setup works,
  - generation works,
  - recorder works after Linux-specific mic fixes.

## Confirmed Failing

- `.AppImage` package:
  - setup can complete and model can load,
  - generation path still leads to unusable UI state after completion.

## What Was Tried

### 1) AppImage Environment Decontamination (Committed)

- Added environment cleanup to subprocess spawns to remove AppImage pollution:
  - `PYTHONHOME`
  - `PYTHONDONTWRITEBYTECODE`
  - `LD_LIBRARY_PATH` (AppImage context)
  - `GI_TYPELIB_PATH` (AppImage context)
- Applied to setup subprocesses and sidecar launch paths.

Result:
- Addressed earlier setup/import issues, but did **not** fully resolve AppImage post-generation freeze.

### 2) Environment Rebuild / Reset

- Full environment reset (`python_env` wipe) and rebuild.

Result:
- Clean rebuild succeeded, but AppImage runtime freeze persisted.

### 3) Output/Waveform Defensive Changes (Experimental, Reverted)

- Multiple output-side mitigations were attempted, including:
  - WaveSurfer fallback paths,
  - Linux-wide native audio fallback experiments,
  - additional frontend guards.

Result:
- Did not resolve AppImage freeze reliably.
- These experiments were rolled back to avoid regressions and to keep `.deb` behavior stable.

### 4) Event/Logging Saturation Guards (Experimental, Reverted)

- Tried reducing high-frequency frontend log/event churn for AppImage paths.

Result:
- Did not deliver a conclusive fix.
- Rolled back as part of scope reduction.

## Final Decision for This Branch

- Keep stable, validated behavior for non-AppImage targets.
- Do not merge speculative AppImage-specific UI/runtime work from this debugging session.
- Defer AppImage root-cause analysis and corrective changes to a dedicated feature branch.

## Suggested Next Branch Plan

1. Create a dedicated branch for AppImage runtime diagnosis.
2. Add targeted instrumentation around:
   - post-generation state transitions,
   - output rendering lifecycle,
   - event throughput and main-thread responsiveness.
3. Reproduce with minimal UI path (disable non-essential post-generate handlers).
4. Introduce one change at a time with explicit rollback points.
5. Validate against both `.AppImage` and `.deb` before merging.

