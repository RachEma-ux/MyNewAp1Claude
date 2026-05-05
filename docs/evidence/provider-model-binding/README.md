# Plan v3 PMB — Evidence Bundle

**Captured:** 2026-05-04 against main@8517385 (post-Phase 45).

Static snapshot of the Plan v3 PMB deliverable status at the
post-Stage-11-docs cut. The live state of validators, tests, and
the legacy register is in the repository proper; this bundle is
the point-in-time evidence required by Phase 46 of the
EXECUTION_CHECKLIST.

---

## Contents

| File | Purpose |
|---|---|
| [VALIDATION_OUTPUTS.md](VALIDATION_OUTPUTS.md) | All four validation pipelines (`check`, `check:architecture`, `check:wiring`, `check:frontend-modularity`) — green at the snapshot. |
| [TEST_OUTPUTS.md](TEST_OUTPUTS.md) | Combined PMB test run — 222 tests across 16 files, all pass. |
| [BOUNDARY_CHECK_OUTPUTS.md](BOUNDARY_CHECK_OUTPUTS.md) | Three layers of boundary enforcement — architecture scripts, static tests, runtime tests — all green. |
| [CATALOG_LEGACY_IMPORT_BACKFILL_REPORT.md](CATALOG_LEGACY_IMPORT_BACKFILL_REPORT.md) | Phase 24 backfill driver — modes, classifier rules, dry-run shape. |
| [LEGACY_EXCEPTION_REGISTER_SNAPSHOT.md](LEGACY_EXCEPTION_REGISTER_SNAPSHOT.md) | Status counts + notable closures since Phase 0.3. |

Sister bundle in `docs/evidence/ai-types-agent-studio-import/`:

| File | Purpose |
|---|---|
| `IMPORT_FLOW_EVIDENCE.md` | End-to-end import flow with boundary invariants, receipt threading, best-effort posture, test coverage. |

---

## What this evidence demonstrates

1. Every `npm run check*` pipeline is green.
2. 81/81 governance actions covered.
3. 16 PMB-relevant test files run together with 222 passes and zero
   failures. Three best-effort error paths log expected stderr lines
   (documented in `TEST_OUTPUTS.md`) — none are regressions.
4. Three independent layers of boundary enforcement are wired and
   passing.
5. The legacy exception register has 16 open + 4 in-progress + 6
   migrated/removed entries. All Plan v3-owned closures are
   accounted for.

> **Wording note (2026-05-05, Phase 27.0):** earlier framing of D1 in
> some Plan v3 docs read as *"runtime never reads provider API keys
> from `process.env`."* That overstates the post-Plan-v3 state. The
> accurate framing is: **runtime provider-key access is blocked for
> NEW paths; legacy paths LR-01 / LR-02 / LR-03 / LR-04 / LR-06 /
> LR-08 / LK-01 + simulation engine remain baseline-allowlisted in
> `scripts/check-provider-key-env-boundary.ts` until Phase 27 is
> complete.** Phase 27.7 removes the allowlist entries and promotes
> Direction A to exclusive. See `DIRECTION_A_VERIFICATION_REPORT.md`
> for the audit that surfaced this and `PHASE_27_*` for the Phase 27
> deliverables.

---

## How to refresh this bundle

The evidence files are static. Re-running validation against a later
commit may produce different counts (additional tests, additional
governance actions, additional baseline warnings). To capture a
fresh snapshot against a new cut:

1. Run the four validation commands listed in `VALIDATION_OUTPUTS.md`.
2. Run the combined test command listed in `TEST_OUTPUTS.md`.
3. Read the live `LEGACY_EXCEPTION_REGISTER.md` and update the
   snapshot table.
4. Update the leading "Captured" line + `main@<sha>` in each file.

The capture is intentionally manual — there's no automation for
"freeze a snapshot of the validation state" because the artifacts
should reflect a deliberate cut, not a continuously-updating mirror.
