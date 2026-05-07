# Phase 28.1 — LR-09 (opencode subprocess env-write) Decision

**Captured:** 2026-05-07 against `main@f0fa131` (post-Phase-28-plan merge).
**Branch:** `docs/pmb-phase-28-1-lr-09-decision`.
**Owner:** Governance role per AGENTS.md.

---

## TL;DR

**Decision: ALREADY_FIXED. Register row was a documentation gap.**

The surface LR-09 describes — `process.env[envVar] = config.apiKey` in `server/code-studio/opencode/provider-sync.ts` — was eliminated by **PR #100** (`f824d8c`, merged 2026-05-04 13:39 UTC+02:00) **seven hours before the register was created** in PR #104 (`5d7fd92`, merged 2026-05-04 20:34 UTC+02:00). The `LEGACY_EXCEPTION_REGISTER.md` row added in Phase 27.4's matrix references the *historical* behavior that PR #100 had already fixed.

Verified on `main@f0fa131`:

```
$ grep -nE 'process\.env\[[^]]+\]\s*=' server/code-studio/opencode/provider-sync.ts
96:    // `process.env[envVar] = config.apiKey` at the end so spawned
```

Line 96 is **inside a comment block** explaining the historical bug — there is no code mutation. The function now writes to `~/.local/share/opencode/auth.json` (and a proot overlay on Termux) for the OpenCode CLI to consume; it never touches `process.env`.

The boundary lint at `scripts/check-provider-key-env-boundary.ts:166-283` (Rule 2) already detects `process.env[X] = ...` writes and emits an error message that references PR #100 by name:

```
Writes to process.env (${key}). Per Plan v3 Decision D1, the runtime
must not mutate provider env vars. PR #100 fixed exactly this
pollution path; do not reintroduce it.
```

Together: the surface is gone (PR #100) and a regression is structurally caught (boundary lint Rule 2). LR-09 needs no further work.

---

## Three options considered

The Phase 28 plan named three options for LR-09. Re-evaluated against the actual current code:

### A — Migrate the CLI invocation to receive credentials another way

**Verdict:** Not applicable. The function already does this. Per the comment block at provider-sync.ts:96, the fix in PR #100 was: "If a child OpenCode process needs the keys, pass them explicitly through `spawn`'s env option using a decrypted value — don't pollute the parent's global env." The auth.json write at lines 81–93 is the post-PR-#100 mechanism: OpenCode reads its own auth.json file rather than inheriting from the parent's process.env.

### B — Permanent exemption (subprocess env-write to a non-LLM-runtime process)

**Verdict:** Not applicable. There is nothing to exempt. The surface does not exist.

### C — TEMPORARY_EXCEPTION_WITH_DEADLINE rolled forward

**Verdict:** Inappropriate. The thing being temporarily-excepted is gone. Continuing to roll a deadline forward on a closed surface generates fake bookkeeping work and pollutes the register's signal-to-noise.

### Real option D (the actual outcome)

**Verdict: ALREADY_FIXED. Update the register row to status `migrated` with note "surface eliminated by PR #100 prior to register creation".** The boundary lint Rule 2 carries the regression guard going forward.

---

## Why the register row was wrong

Phase 27.4's decision matrix lists LR-09 as item #11 with the description "Active runtime path; subprocess env-write to a different surface than runtime reads; closing requires an opencode CLI change." That description was correct *before* PR #100. PR #100's commit message is explicit:

> fix(code-studio): stop clobbering process.env with encrypted provider apiKeys

The fix predated the register by seven hours. The register inherited the pre-PR-#100 description of the problem and propagated it through Phase 19's `RUNTIME_PATH_MIGRATION_MATRIX.md` and Phase 27.4's matrix. Each subsequent doc trusted the prior doc's snapshot rather than re-verifying against current code — a chain-of-trust drift.

This is the same shape of problem PR #223 surfaced for migration 0042 (a doc-claimed schema change that ASDB never actually ran) and PR #224 surfaced for `useCount` (an event metadata field claimed by docs that never incremented). **Static review didn't catch it; verifying against current code did.**

---

## Lessons reinforced

1. **Register entries lock against a code reference that has a date.** When closing or rolling a row forward, re-grep the file and verify the line still does what the row claims. Don't trust prior doc snapshots when the underlying code has changed since.
2. **Boundary lint rules are stronger regression guards than register entries.** Rule 2 was the right place to fence this surface; the register row was redundant work.
3. **Smoke testing the live app is one form of verification; static-grep against current code is the other form.** Both surface drift that planning docs miss.

---

## What this PR changes

1. This decision doc.
2. `LEGACY_EXCEPTION_REGISTER.md` LR-09 row: `Status` flips from `open` to `migrated`; `Reason retained` rewritten to point at PR #100; `Deadline phase` cleared (or "—") since the closure was retroactive.
3. `PHASE_28_EXECUTION_PLAN.md` 28.1 sub-phase: marked closed, decision = ALREADY_FIXED.

No code changes. The boundary lint already protects the surface; existing fixture tests in `tests/check-provider-key-env-boundary.test.ts` already exercise Rule 2 against the `process.env.X = ...` shape.

---

## Acceptance criteria — met

- [x] Decision doc landed.
- [x] LR-09 row reflects actual current state (migrated, not open).
- [x] Boundary lint coverage verified (Rule 2 fences the surface).
- [x] No new TEMPORARY_EXCEPTION_WITH_DEADLINE introduced.
- [x] Register's chain-of-trust drift documented as a lesson for future audits.

LR-09 closes; Phase 28's exception cap stays at **0 / 1 allowed**.
