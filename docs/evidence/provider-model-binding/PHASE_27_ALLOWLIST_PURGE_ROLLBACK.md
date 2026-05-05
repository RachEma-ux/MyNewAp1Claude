# Phase 27.7 — Allowlist Purge & Rollback Plan

**Captured:** 2026-05-05 against `fix/pmb-phase-27-runtime-provider-key-surface`.
**Owner:** Governance role per AGENTS.md.

Phase 27.7 closes the iteration that 27.0–27.6 opened: every runtime
provider-key surface in Agent Studio is now either migrated, retired, or
allowlisted with a deadline-bound, single-file scope. This file records
**what changed in the allowlist**, **what was kept and why**, and the
exact **rollback procedure** if CI regresses.

---

## What changed in `scripts/check-provider-key-env-boundary.ts`

### Narrowed: LR-01 entry

**Before (Phase 5 baseline)** — `server/agent-studio/adapters/openllm-runtime-adapter.ts`
listed under LR-01 with deadline `Phase 17` and reason
*"Active Expert chat path; replaced when Expert chat moves through
Model Access."*

**After (Phase 27.7)** — same file, same `<dynamic>` envKey sentinel,
but the reason is now narrowed to:

> Simulation engine live-runtime branch only (sole remaining LR-01
> caller after 27.3/27.5). See `PHASE_27_SIMULATION_ENGINE_DECISION.md`.

Deadline flipped from `Phase 17` to **`Phase 28`** because the Phase 17
target ("Expert chat moves through Model Access") shipped in 27.3
without closing simulation. The remaining work is the Model Access
streaming-with-tool-calls + MCP-bridge primitive, which is a Phase 28
build, not a Phase 27 surface elimination.

This is the **single approved Phase 27 exception** under the brief's
matrix-cap rule.

### Deadlines flipped: LR-02, LR-03, LR-04, LR-06

These are pre-existing register entries the boundary script already
allowlisted. Phase 27.4's matrix locks them as
TEMPORARY_EXCEPTION_WITH_DEADLINE for Phase 28 (not new exceptions —
just deadline tightening from "Phase 19/Phase 10" to "Phase 28").
Allowlist scopes are unchanged; only the `deadlinePhase` field and
`reason` text were updated.

| Register ID | File | Before | After |
|---|---|---|---|
| LR-02 | `server/embeddings/service.ts` | `Phase 19` | `Phase 28` |
| LR-03 | `server/documents/processor.ts` | `Phase 19` | `Phase 28` |
| LR-04 | `server/operators/provider-hub.ts` | `Phase 19` | `Phase 28` |
| LR-06 | `server/_core/index.ts` | `Phase 10` | `Phase 28` |

The Phase 27.4 matrix decision for LR-06 is `RETIRE` (not
`TEMPORARY_EXCEPTION_WITH_DEADLINE`); the deadline reflects when the
extract to `scripts/provider-connections/seed-from-env.ts` is owned.

### Unchanged: seed-script entry

`scripts/provider-connections/seed-from-env.ts` keeps its permanent
`<seed-script>` exemption — by design, this is the one legitimate
reader of provider env vars at boot.

### Removed: nothing

The brief's 27.7 instructions name candidate-removal entries as
"LR-01 LR-08 LK-01 LR-02 LR-03 LR-04 LR-06" with the qualifier *"only
remove entries that are actually fixed or retired."* After Phase 27.4's
matrix locked simulation as the single approved exception and rolled
the rest to Phase 28:

- **LR-01** — partially closed (chat-stream + chat.ts paths gone) but
  simulation remains, so the allowlist entry is retained with narrowed
  scope rather than removed.
- **LR-02 / LR-03 / LR-04 / LR-06** — not fixed in Phase 27 (matrix
  decisions defer them to Phase 28). Not removed.
- **LR-08** — not in the boundary-script allowlist to begin with
  (registry-side surface, not direct env read at the LR-08 paths).
  Tracked in `LEGACY_EXCEPTION_REGISTER.md` only. No allowlist change.
- **LK-01** — schema-level concern, never in the runtime boundary
  allowlist. Phase 27.2's forward-write guard + migration apply path
  closed the practical risk; the register row flipped to `migrated`.

---

## What changed in `tests/pmb/boundary.test.ts`

Added **invariant 5b — Phase 27.7 broader Agent Studio scan**, with
three sub-tests:

1. *No Agent Studio source outside the simulation allowlist reads
   `process.env.<X>_API_KEY`.*
2. *No Agent Studio source outside the simulation allowlist
   instantiates `new OpenAI(`.*
3. *No Agent Studio source outside the simulation allowlist imports
   `resolveProviderApiKey`.*

The simulation allowlist (3 files):

- `server/agent-studio/adapters/openllm-runtime-adapter.ts`
- `server/agent-studio/services/simulation.ts`
- `server/agent-studio/adapters/openai-direct-adapter.ts`

These three sub-invariants together replace the implicit
"chat-stream.ts + chat.ts are migrated" check that Phase 42's invariant 5
did not cover. The pre-existing invariant 5 (Model Access reads no env
vars) is unchanged.

---

## What changed in `tests/pmb/runtime-coverage.test.ts`

No changes. The file's purpose is to attest canonical test files exist
for ten runtime concerns (Phase 44); none of those concerns are altered
by Phase 27. The file passes (33/33) on the post-27.7 working tree.

---

## What changed in `LEGACY_EXCEPTION_REGISTER.md`

Updated rows: **LR-01, LR-02, LR-03, LR-04, LR-05, LR-06, LR-08, LR-09,
LK-01**. Specific changes per row:

- **LR-01** — Reason narrowed to "simulation only"; deadline → Phase 28;
  PR column annotated with 27.3/27.5/27.7 closures.
- **LR-02 / LR-03 / LR-04** — Reason expanded to name the Phase 27.4
  matrix decision and the Phase 28 dependency (Model Access embedding-execute
  primitive); deadline → Phase 28.
- **LR-05** — Status `open` → `migrated` (Phase 27.4 NOT_APPLICABLE
  decision; OmniRAG is a domain service token, already in
  `NON_PROVIDER_KEYS`).
- **LR-06** — Reason updated to name the Phase 27.4 RETIRE decision;
  deadline → Phase 28.
- **LR-08** — Function-name correction (`executeRunAgent` →
  `executeInvokeAgent`); decision named (TEMPORARY_EXCEPTION_WITH_DEADLINE
  rolled into Phase 28 batch); deadline → Phase 28.
- **LR-09** — Decision named (TEMPORARY_EXCEPTION_WITH_DEADLINE);
  deadline → Phase 28.
- **LK-01** — Status `open` → `migrated` (Phase 27.2 forward-write
  guard + migration apply path closed the practical risk; schema
  column unchanged by design).

---

## Rollback procedure (if CI regresses)

If the post-27.7 boundary checks or invariant 5b sub-tests fail in CI
on a downstream branch, the safe rollback is:

### Step 1 — restore the LR-01 broad scope

In `scripts/check-provider-key-env-boundary.ts`, revert the LR-01 entry
to its pre-27.7 reason text:

```typescript
{
  file: "server/agent-studio/adapters/openllm-runtime-adapter.ts",
  envKey: "<dynamic>",
  registerId: "LR-01",
  deadlinePhase: "Phase 17",
  reason:
    "Active Expert chat path; replaced when Expert chat moves through Model Access.",
},
```

This restores the broader allowlist semantics. It does NOT re-introduce
the deleted `runChatWithTools` function — `services/chat.ts` remains
binding-required.

### Step 2 — disable invariant 5b

In `tests/pmb/boundary.test.ts`, comment out or remove the
`describe("Phase 27.7 invariant 5b — ...")` block. The pre-27.7
invariant 5 (Model Access scan) continues to run.

### Step 3 — flip register deadlines back

In `LEGACY_EXCEPTION_REGISTER.md`, restore the original deadline phases:

- LR-02/LR-03/LR-04 → `Phase 19`
- LR-06 → `Phase 10`
- LR-01 → `Phase 27`

Step 3 is documentation only and does not affect runtime behavior.

### What rollback does NOT cover

- The `runChatWithTools` function deletion in `services/chat.ts` (27.5).
  Rolling that back means re-importing `OpenAI` and `resolveProviderApiKey`
  and re-instantiating `new OpenAI({apiKey})` — that is the surface 27.5
  eliminated and would itself be a regression. Forward-fix the calling
  bug instead.
- The `chat-stream.ts` Model Access migration (27.3). Same logic.
- The `provider-config-guard.ts` write-time stripping (27.2). Removing
  the guard re-enables the LK-01 storage path.

In other words: rollback applies to **enforcement scope**, not to the
**code migrations themselves**. If a downstream branch needs to write
provider keys to `process.env` or `ags_agent_drafts.providerConfig`,
that branch should justify the regression in its PR description and
add a new register row with Governance signoff — not roll back the
guard.

---

## Acceptance check for 27.7

- [x] LR-01 allowlist scope narrowed to simulation-only.
- [x] LR-02 / LR-03 / LR-04 / LR-06 deadlines flipped to Phase 28.
- [x] Invariant 5b added with three sub-tests covering env-key reads,
      `new OpenAI(` instantiations, and `resolveProviderApiKey`
      imports outside the simulation allowlist.
- [x] Register file updated for LR-01, LR-02, LR-03, LR-04, LR-05,
      LR-06, LR-08, LR-09, LK-01.
- [x] Rollback procedure documented above.
- [x] `npx tsx scripts/check-provider-key-env-boundary.ts` exits 0.
- [x] `npx vitest run tests/pmb/boundary.test.ts` passes 15/15.
- [x] `npx vitest run tests/pmb/runtime-coverage.test.ts` passes 33/33.
