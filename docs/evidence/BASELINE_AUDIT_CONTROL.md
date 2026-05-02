# Baseline Audit Control

This document is the **operating contract** for the
**Development Baseline Audit** (Phases 0–2 of the readiness protocol).
It governs what such an audit may produce while RTLM capsule migration
is still in progress.

The companion gate document is
[`docs/architecture/production-readiness/READINESS_PHASE_CONTROL.md`](../architecture/production-readiness/READINESS_PHASE_CONTROL.md),
which describes the structural reasons for the separation. This file
is the **rule list** for anyone running, reviewing, or consuming a
baseline audit report.

## Hard rules

1. **This audit is NOT production certification.** Every artifact and
   summary produced under `--mode=development-baseline` must be
   labeled **Development Baseline Audit — not production
   certification.** Reports that omit this label are invalid and
   must be discarded and re-issued.
2. **This audit captures the current development baseline.** Its
   purpose is to establish a frozen reference point of what works
   and what is missing **today**, against which the remaining
   capsule migrations and downstream phases can be planned.
3. **Status taxonomy is restricted to baseline commands only.** The
   audit may classify individual baseline command results as one of:
   - **PASS** — command exited 0 and the existing strict checks
     interpret the output as conformant for currently-migrated
     RTLMs.
   - **PARTIAL** — command ran but produced report-only warnings or
     covered only a subset of the surface (e.g. unmigrated RTLMs
     remain in report-only mode by design).
   - **FAIL** — command exited non-zero or produced a strict-mode
     failure that the current migration set should already cover.
   - **BLOCKED** — command could not run (missing script, missing
     environment, missing service, missing credential). The exact
     missing dependency must be named.
4. **This audit MUST NOT produce a production-readiness score.** No
   numerical score (e.g. "85 / 100"), no readiness band (e.g.
   "production-ready", "staging-ready", "strong beta"), and no deploy
   recommendation may appear in any baseline artifact. The Phase 13
   scoring model is reserved for the production-readiness mode and
   is meaningless against a partially-migrated app.
5. **This audit MUST NOT trigger remediation automatically.** A
   baseline finding may *recommend* a fix, but no PR or remediation
   workflow may be opened directly from a baseline run. Remediation
   PRs follow the existing capsule migration sequence; they are not
   spawned by audit output.
6. **No evidence, no claim.** PASS requires the captured artifact
   (output + exit code + environment + timestamp). PARTIAL requires
   an explanation of which surface the result covers. FAIL requires
   the exact failing command and its output. BLOCKED requires the
   exact missing dependency or environment.
7. **Sanitization is mandatory.** No evidence file may contain
   secrets, tokens, cookies, authorization headers, customer or
   personal data, raw production records, full DB dumps, or private
   keys. Use redacted IDs, counts, hashes, timestamps, statuses,
   correlation IDs, or sanitized snippets. Raw sensitive evidence
   stays outside Git or is referenced as a secure CI artifact.
8. **Re-run on every migration.** Baseline artifacts go stale the
   moment a new RTLM migrates, because the strict / report-only
   surface changes and prior outputs no longer describe the current
   build. Treat the baseline as a snapshot, not a steady-state
   document.

## What a baseline report MUST contain

- A header that names the mode and current migration count, e.g.
  > Development Baseline Audit — 5 / 15 RTLMs migrated.
- The exact branch and commit the audit ran against.
- An explicit "no application code was fixed" confirmation.
- The list of baseline commands run, each with output path, exit
  code, environment, and timestamp.
- The list of missing scripts, each marked **BLOCKED** with the
  exact missing script name.
- A PASS / PARTIAL / FAIL / BLOCKED table covering only the
  baseline commands above.
- A blocker list, a fail list, and a partial list, each with the
  evidence path that justifies the entry.
- A "next prompt" line pointing to the next allowed step (e.g.
  "Phase 3–7 core architecture verification, blocked until 15 / 15
  RTLMs migrated; the next required implementation PR is `<module>`
  capsule migration").

## What a baseline report MUST NOT contain

- An overall readiness score
- A readiness band ("production-ready", "staging-ready", etc.)
- A "safe to deploy" recommendation
- A claim that the app is "ready for production / staging / beta"
- A `PRODUCTION_READINESS_VERIFICATION_REPORT.md` filename
- A Phase 13 scoring table
- Phase 14 final verdict text
- A Phase 15 remediation plan (remediation lives in the migration
  roadmap, not in audit output)

## How a reviewer validates a baseline report

A reviewer accepting a baseline report should confirm:

- The mode label appears at the top of the report.
- The migration count matches `MIGRATED_MODULES` at the audited
  commit.
- Every PASS row has a captured artifact under `docs/evidence/`.
- Every BLOCKED row names the missing dependency.
- No row contains a score, a band, or a deploy recommendation.
- No artifact under `docs/evidence/` contains secrets or
  unsanitized personal data.
- The report's "next prompt" line points to the
  development-baseline mode of the gate, **not** to a Phase 3–15
  prompt.

If any of those conditions fail, the report is invalid and must be
re-issued.

## Relationship to existing checks

This control document does **not** introduce new strict checks. The
authoritative strict checks remain:

- `pnpm run check:frontend-modularity`
- `pnpm run check:awi`
- `pnpm run check:architecture`
- `pnpm run check:wiring`
- `pnpm run check`  (TypeScript)
- `pnpm build`

Those checks run in both modes and are not weakened by either. The
gate adds a *meta-check* that decides which protocol you are
permitted to invoke against their output.

## See also

- [`docs/architecture/production-readiness/READINESS_PHASE_CONTROL.md`](../architecture/production-readiness/READINESS_PHASE_CONTROL.md)
  — the structural rationale and gate semantics
- [`scripts/check-readiness-phase-gate.ts`](../../scripts/check-readiness-phase-gate.ts)
  — the executable gate
- [`docs/architecture/frontend/MODULE_CLIENT_CAPSULE_ROADMAP.md`](../architecture/frontend/MODULE_CLIENT_CAPSULE_ROADMAP.md)
  — the migration sequence that determines when the gate can flip
