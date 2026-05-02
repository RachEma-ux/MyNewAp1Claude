# Readiness Phase Control

This document is the **authoritative gate** that separates the
**Development Baseline Audit** (Phases 0–2 of the readiness protocol)
from the **Full Production Readiness Verification Protocol**
(Phases 3–15).

It exists because, without it, an evaluator can run baseline commands
against a half-migrated application and accidentally publish a
"production-ready" verdict. The migration state changes the *meaning*
of every check (strict vs. report-only), so production scoring while
modules are still in report-only mode is structurally invalid.

The gate is **read-only**. It inspects current repo state and refuses
to advance beyond the development baseline until the migration is
complete. It never weakens, modifies, or substitutes any other check.

## Source of truth

The gate reads RTLM membership and migration status directly from:

- `scripts/module-tools/migration-state.ts → RTLM_LIST` (the canonical
  15-entry list of Real-Time Lifecycle Modules)
- `scripts/module-tools/migration-state.ts → MIGRATED_MODULES` (the
  live list of capsule-migrated modules)

If those two structures drift apart, the gate fails closed with an
explicit "migration-state.ts is inconsistent" error.

## The two modes

| Mode                    | Allowed now? | Purpose                            | Output                              |
| ----------------------- | ------------ | ---------------------------------- | ----------------------------------- |
| `development-baseline`  | **Yes**      | Capture current evidence/state     | Baseline report — **no score**      |
| `production-readiness`  | **No**       | Final readiness certification      | Full report and score after all gates |

### `--mode=development-baseline`

Allowed **now**. Runs Phases 0–2 of the readiness protocol while
RTLM capsule migration is still in progress.

Allowed phases:

- **Phase 0** — Preparation and scope lock
- **Phase 1** — Evidence structure setup
- **Phase 2** — Baseline command execution

Outputs are explicitly labeled **Development Baseline Audit — not
production certification**. They:

- **MUST NOT** produce an overall readiness score
- **MUST NOT** claim "production-ready", "staging-ready", or
  "safe for production"
- **MUST NOT** trigger remediation automatically
- **MAY** classify individual baseline command results as
  PASS / PARTIAL / FAIL / BLOCKED

The baseline report's purpose is to establish a frozen reference
point of what works and what's missing **today**, so the team can
plan the remaining capsule migrations against a known starting
state — not to make a deployment decision.

### `--mode=production-readiness`

Allowed **only after** every RTLM has migrated to the Module Client
Capsule pattern. The gate fails closed (exit code ≠ 0) until **every**
condition below holds:

1. **15 / 15 RTLMs migrated.** `MIGRATED_MODULES` length equals
   `RTLM_LIST` length.
2. **`MIGRATED_MODULES` contains every RTLM key.** No RTLM is left in
   report-only mode.

Once the gate passes, the production-readiness protocol is unlocked
and may execute Phases 3–15:

- **Phase 3** — DB isolation and database integration verification
- **Phase 4** — Worker verification
- **Phase 5** — External connector verification
- **Phase 6** — Routing and frontend capsule verification
- **Phase 7** — Wiring and integration verification
- **Phase 8** — Full UI behavior verification
- **Phase 9** — Real user workflow verification
- **Phase 10** — End-to-end synchronization verification
- **Phase 11** — Security / RBAC / access-control verification
- **Phase 12** — Enterprise hardening verification
- **Phase 13** — Scoring and readiness classification
- **Phase 14** — Final production readiness report
- **Phase 15** — Remediation planning

These phases are not "blocked" in a conservative sense — they are
**structurally invalid** while modules remain in report-only mode.
Strict-mode signals are the foundation of every downstream check;
running Phase 6 (routing) while half the RTLMs are still report-only
produces evidence that doesn't say what it appears to say.

## Hard rules the gate enforces

1. **Phase 0–2 may run now.** The gate's `development-baseline` mode
   passes whenever the bare minimum prerequisites exist
   (`package.json`, `docs/`, `scripts/module-tools/migration-state.ts`).
   Missing baseline scripts are reported as
   "Phase 2 will mark BLOCKED" rather than as gate failures, because
   the baseline audit itself is responsible for that evidence.
2. **Phase 3–15 are blocked until 15 / 15 RTLMs are migrated.** The
   gate prints the exact count and the next required implementation
   PR (the first un-migrated RTLM in `RTLM_LIST` order).
3. **No score during baseline mode.** The development-baseline output
   contains no readiness score and no deploy recommendation. Reports
   produced under that mode that include either of those are invalid
   and must be discarded.
4. **No evidence, no claim.** PASS requires evidence. PARTIAL requires
   explanation. FAIL requires proof. BLOCKED requires the exact
   missing dependency or environment. This applies in both modes —
   the gate does not weaken evidence requirements for either mode.
5. **The gate is never relaxed for convenience.** If the migration
   stalls and the team needs production-readiness signals sooner,
   the answer is to finish the remaining capsule migrations, not to
   downgrade the gate. The gate has no `--force` or `--override`
   flag and never will.

## Allowed and forbidden commands today

While migration is incomplete, the following are **allowed**:

- `pnpm run check:readiness-phase-gate -- --mode=development-baseline`
- `pnpm run audit:development-baseline`
- All existing strict checks
  (`pnpm run check:frontend-modularity`, `pnpm run check:awi`,
  `pnpm run check`, `pnpm build`, etc.)
- The Phase 0–2 baseline-evidence collection workflow described in
  `docs/evidence/BASELINE_AUDIT_CONTROL.md`

The following are **forbidden** until the gate unblocks:

- Generating a `PRODUCTION_READINESS_VERIFICATION_REPORT.md`
- Producing a Phase 13 readiness score
- Issuing a Phase 14 final verdict
- Treating any baseline output as a deployment recommendation

## Entry criteria for the full protocol

The full Phase 3–15 protocol may begin only after **all** of the
following are simultaneously true:

- `MIGRATED_MODULES.length === RTLM_LIST.length` (15 / 15)
- Every RTLM key appears in `MIGRATED_MODULES`
- `pnpm run check:frontend-modularity` passes with 0 failures (every
  check therefore runs strict for every RTLM by construction)
- `pnpm run check:awi` passes
- The route ownership map has no unknown / orphan canonical routes
- No duplicate canonical route owners
- No module imports `MainLayout`
- No frontend module directly calls another module's backend

The gate enforces conditions 1 + 2 directly. Conditions 3–8 are
enforced by the existing checks the gate composes — running
`production-readiness` mode when those checks fail is simply running
the protocol against a broken foundation.

## Exit criteria for the baseline audit

The `development-baseline` audit is "complete" for a given snapshot
of the codebase when:

- All Phase 0–2 baseline commands have run
- Each command's output, exit code, environment, and timestamp are
  captured in `docs/evidence/commands/`
- `docs/evidence/README.md` indexes every artifact
- Missing scripts are recorded as BLOCKED with the exact missing
  dependency
- The baseline report at
  `docs/evidence/PHASE_0_2_BASELINE_REPORT.md` exists and contains
  no readiness score and no deploy recommendation

A new baseline audit must be re-run whenever a new RTLM migrates,
because the strict / report-only surface changes and prior baseline
artifacts no longer describe the current build.

## How to invoke the gate

```bash
# Allowed now (5 / 15 RTLMs migrated as of this writing).
pnpm run check:readiness-phase-gate -- --mode=development-baseline
pnpm run audit:development-baseline   # convenience alias

# Currently BLOCKED. Will exit non-zero with the reason and the next
# required implementation PR.
pnpm run check:readiness-phase-gate -- --mode=production-readiness
pnpm run audit:production-readiness   # convenience alias
```

Exit codes:

| Code | Meaning |
| ---: | --- |
| `0`  | Gate allows the requested mode |
| `1`  | Gate blocks the requested mode (with reason printed) |
| `2`  | Invocation error (unknown / missing `--mode=` flag) |

## See also

- [`docs/evidence/BASELINE_AUDIT_CONTROL.md`](../../evidence/BASELINE_AUDIT_CONTROL.md)
  — full rules for development-baseline reports
- [`docs/architecture/frontend/MODULE_CLIENT_CAPSULE_ROADMAP.md`](../frontend/MODULE_CLIENT_CAPSULE_ROADMAP.md)
  — the migration sequence the gate is timing against
- [`scripts/module-tools/migration-state.ts`](../../../scripts/module-tools/migration-state.ts)
  — the canonical migration-state source the gate reads
