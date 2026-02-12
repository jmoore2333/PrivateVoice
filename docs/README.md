# Documentation Structure

This directory is the canonical home for project documentation beyond the two root entry docs:

- `README.md` (root): project overview and quick start
- `USER_MANUAL_V1.0.md` (root): end-user manual for current release

## Active Docs

- `docs/API_REFERENCE.md`: local backend API endpoints and payloads
- `docs/DEVELOPMENT.md`: developer setup and workflow
- `docs/PRODUCTION_TEST_PROCEDURE.md`: manual production validation checklist
- `docs/crossplatform.md`: current cross-platform build/runtime status
- `docs/handovers/deferred-installer.md`: implementation handover for deferred installer architecture

## Working Docs

- `docs/in-progress/`: temporary runbooks and active validation notes
- `docs/plans/`: scoped plan docs (active or recently completed)
- `docs/reports/`: analysis and release reports that support decisions

## Historical Docs

- `docs/legacy/handovers/`: superseded handovers from older architectures
- `docs/legacy/superseded/`: replaced manuals/procedures kept for reference
- `docs/legacy/v0.x_archive/`: v0.x-era archived content

## Maintenance Rules

1. Keep only user-facing entry docs at repo root (`README.md`, `USER_MANUAL_V1.0.md`).
2. When replacing a doc, move the old version to `docs/legacy/` instead of deleting it.
3. Update paths in `README.md` and this file whenever docs are moved.
