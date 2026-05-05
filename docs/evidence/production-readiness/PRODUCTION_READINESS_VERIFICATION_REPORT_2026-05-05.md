# Production Readiness Verification Report — 2026-05-05 Rerun

**Audit run:** 2026-05-05
**Commit under audit:** `f89ffed5155af6a18033049a84fe885d3f4adbc9` (post-merge of PR #150 — Phase 27 runtime provider-key surface elimination)
**Mode:** `--mode=production-readiness` (gate unlocked: 15 / 15 RTLMs migrated)
**Auditor instruction:** "run the full readiness protocol" — re-execute the protocol against the post-PR-150 main branch, after Plan v3 (PR #148), Direction A audit (PR #149), and Phase 27 runtime-key elimination (PR #150) all landed on top of the prior STAGING-READY baseline (`8fb73b7`).

---

## Executive verdict

**Overall classification: STAGING-READY (unchanged from prior audit at `8fb73b7`).**

Every structural / boundary / wiring / build check is green. The full unit suite is **0 failures across 3,181 passing tests** (183 skipped — staging-integration tests excluded as designed). Two genuine regressions found during this run were fixed in the same pass:

1. `tests/check-provider-key-env-boundary.test.ts` pinned to the old LR-01/02/03/04/06 deadlines (`Phase 10 / 17 / 19`); Phase 27.7 flipped them to `Phase 28`. Fixed by relaxing the test to assert the contract (every entry has a `Phase N` deadline) rather than specific calendar phases.
2. Two unit tests (`hr-nav-validation.test.ts > HR router composes at least 14 domain sub-routers`, `reporting/router.test.ts > reporting is read-only`) tripped vitest's default 5 s `testTimeout` on cold-start `await import(...)` of heavy router modules. Bumped the **global** `testTimeout` to 30 s in `vitest.config.ts` rather than patching individual tests, since the same flake recurred on different files between runs (whack-a-mole).

The codebase is **STAGING-READY**. Promotion to **PRODUCTION-READY** still requires the staging-environment exercise of Phases 3–5 + Phase 8 listed in the prior audit's Phase 15 remediation plan; none of that work was in scope for this run.

---

## What changed since the prior audit (`8fb73b7` → `f89ffed`)

| Phase / PR | Effect on readiness |
|---|---|
| Plan v3 phases 16–48 (PRs #117–#148) | Massive PMB hardening — provider/model binding, AI Types catalog, export/import flows, governance receipts, runtime coverage attestation, evidence bundle, legacy deprecation. **Net: more checks running, all green.** |
| Direction A audit (PR #149 → main@2eefe2e) | No code change — read-only audit + register snapshot + verification report. |
| Phase 27 (PR #150 → main@f89ffed) | Eliminated 4 of 5 LR-01-shape runtime provider-key surfaces (chat-stream + chat.ts + sendChatMessage fallback + LK-01 jsonb forward-write guard); narrowed remaining LR-01 caller to the simulation engine (single approved Phase 27 exception, deadline Phase 28). Direction A: PARTIAL → PASS. |
| `vitest.config.ts` testTimeout bump (this audit) | Replaces 5 s default with 30 s — eliminates cold-import flakiness without weakening any assertion. |
| `tests/check-provider-key-env-boundary.test.ts` deadline-pin relaxation (this audit) | Test now asserts the contract (every entry has a `Phase N` deadline) instead of pinning specific calendar phases that flip when deadlines slip forward. |

---

## Phase-by-phase verdict

| Phase | Scope | Verdict | Evidence |
|---|---|---|---|
| 0 | Preparation / scope lock | **PASS** | `npx tsx scripts/check-readiness-phase-gate.ts --mode=production-readiness` exit 0; "All gate-level criteria satisfied"; 15 / 15 RTLMs in `MIGRATED_MODULES`. |
| 1 | Evidence structure | **PASS** | `docs/evidence/{workflows, production-readiness}/` + `docs/deployment/*.md` from prior audit are present and tracked. This rerun adds `docs/evidence/production-readiness/2026-05-05-rerun/` with 18 captured command outputs. |
| 2 | Baseline commands | **PASS** | All 18 declared `package.json` scripts exist (verified by inventory script in `phase-2-baseline.txt`). |
| 3 | DB isolation | **BLOCKED** (env) | `pnpm run test:integration:staging` exit 2 — designed BLOCKED reporter from PR 5 of the prior remediation plan. `DATABASE_URL`, `OPA_URL`, `ENCRYPTION_KEY`, `SECRETS_ENCRYPTION_KEY`, `COOKIE_SECRET`, `JWT_SECRET` all unset on this auditor box. **True env gap, not a code defect.** |
| 4 | Worker verification | **BLOCKED** (env) | `tests/integration/workers/worker-runtime.test.ts` skipif-guarded on `GRAPHRAG_WORKER_URL` / `DATA_ACQUISITION_WORKER_URL` / `EXTERNAL_ORCHESTRATOR_URL`. None set. Worker contracts intact: see `tests/integration/workflows/workflow-readiness.test.ts`. |
| 5 | External connector verification | **PARTIAL** | Built-ins (`local`, `manual`, `webhook`) covered always-on by `tests/integration/connectors/connector-runtime.test.ts`. External connectors env-gated; would activate in staging. |
| 6 | Routing / frontend capsule | **PASS** | `pnpm run check:frontend-modularity` exit 0 (7 sub-checks: `client-capsules`, `module-routes-conflict`, `module-registration`, `app-route-ownership`, `module-route-inventory`, `module-api-boundaries`, `cross-module-links`). 0 failures, 0 baseline warnings. AWI: every RTLM `fully-wired` (graph: 134 nodes, 128 edges, 0 cycles). |
| 7 | Wiring and integration | **PASS** | `pnpm run check:wiring` (module + gateway + event + handoff + frontend + runtime + coordinator) exit 0. `pnpm run check:awi` exit 0. `pnpm run check:ports` exit 0 (11 declarations, 0 conflicts). |
| 8 | Full UI behaviour | **DEFERRED to staging** (by design) | Manual smoke matrix `docs/deployment/ui-smoke-matrix.md` covers 15 capsules × golden path × edge cases. Walkthrough belongs to a staging deployment session. |
| 9 | Real user workflow | **PARTIAL with discovered-API evidence** | `docs/evidence/workflows/REAL_USER_WORKFLOW_REPORT.md` classifies workflows: 5 EXECUTABLE_NOW, 3 PARTIAL, 1 BLOCKED. `tests/integration/workflows/workflow-readiness.test.ts` asserts every cited symbol still exists. |
| 10 | End-to-end synchronization | **PASS** (in-memory floor) | `tests/integration/sync/event-handoff-sync.test.ts` asserts publish/subscribe/fanout/wildcard/idempotency invariants. Persistence-across-crash and load deferred to staging. |
| 11 | Security / RBAC | **PASS** (upgraded from PARTIAL) | `pnpm run check:governance-actions` PASS (**81 declared, 81 covered, 0 uncovered** — up from 58/58 in prior audit; PMB Plan v3 added 23 new gateway actions, all with descriptors). `pnpm run check:db-roles` reports `[skip] DATABASE_URL is not set — local dev sandboxes are allowed`. **All previously-failing HR/services/etc. unit tests now pass** (the 116-failure cluster from the prior audit was resolved by Plan v3 + this run's vitest config fix). D1 + D2 boundary scripts both PASS (Phase 27 narrowed LR-01 to simulation-only). |
| 12 | Enterprise hardening (bundle-size) | **PASS** | `pnpm run check:bundle-budget` exit 0 — every chunk within budget. `pnpm run check:markdown-imports` exit 0 — 1959 files scanned, 0 direct streamdown/Shiki imports outside SlimShikiHighlighter. |
| 13 | Scoring & classification | **STAGING-READY** | See "Overall classification" above. Production-ready still requires staging exercise of Phases 3–5 + Phase 8. |
| 14 | Final report | **this document** | |
| 15 | Remediation plan | **see below** | |

---

## Local check chain — exit codes

| Command | Exit | Meaning | Evidence |
|---|---:|---|---|
| `pnpm run check` (tsc) | 0 | TypeScript clean | `2026-05-05-rerun/check.txt` |
| `pnpm run check:architecture` | 0 | All module/boundary/SQL/DB-ownership/coordinator/governance/markdown-imports checks pass; 0 failures, 27 baseline warnings (pre-existing LA-02 AI-Types public-API leakers, unchanged from prior audit) | `check-architecture.txt` |
| `pnpm run check:wiring` | 0 | Module + gateway + event + handoff + frontend + runtime + coordinator wiring intact; 16 modules tracked | `check-wiring.txt` |
| `pnpm run check:awi` | 0 | Application Wiring Inventory clean; dependency graph: 134 nodes, 128 edges, 0 cycles | `check-awi.txt` |
| `pnpm run check:ports` | 0 | Port registry consistent; 11 declarations, 0 conflicts | `check-ports.txt` |
| `pnpm run check:frontend-modularity` | 0 | Capsule + route ownership + cross-module-links checks pass; 15 / 15 RTLMs strict | `check-frontend-modularity.txt` |
| `pnpm run check:cross-module-links` | 0 | 0 migrated-module link violations | `cross-module-links.txt` |
| `pnpm run check:provider-key-env-boundary` | 0 | D1 — runtime never reads provider keys outside the narrowed simulation-only LR-01 + the seed script | `d1-boundary.txt`, `d1-boundary-final.txt` |
| `pnpm run check:provider-credential-resolver-boundary` | 0 | D2 — only `server/openrouter/model-access/**` may import the resolver | `d2-boundary.txt` |
| `pnpm run check:governance-actions` | 0 | 81 declared, 81 covered, 0 uncovered | `governance-actions.txt` |
| `pnpm run check:db-roles` | 0 | Local-mode skip (no DATABASE_URL); structural check intact | `db-roles.txt` |
| `pnpm run build` | 0 | Vite client + esbuild server build succeeds (52 s; `dist/index.js` 5.0 MB) | `build.txt` |
| `pnpm run check:bundle-budget` | 0 | All chunks within budget; max app chunk ≤ 1024 KB; max language chunk ≤ 1.5 MB; cpp chunk 622 KB allow-listed | `bundle-budget.txt` |
| `pnpm run check:markdown-imports` | 0 | 0 direct streamdown/Shiki imports outside SlimShikiHighlighter (1959 files scanned) | `markdown-imports.txt` |
| `pnpm run audit:production-readiness` | 0 | Phase Control Gate unlocked | `phase-0-gate.txt` |
| `pnpm run test` (unit suite) | 0 | **3,181 passed, 183 skipped, 0 failed** across 201 test files | `vitest-full-uncut.txt` |
| `pnpm exec vitest run tests/pmb/ tests/check-provider-key-env-boundary.test.ts` | 0 | PMB invariants + boundary script declarations: 69/69 pass | `pmb-tests-final.txt` |
| `pnpm run test:integration:staging` | 2 | **BLOCKED reporter (correct)** — staging env not provisioned in this audit | `test-staging.txt` |

---

## Test-suite delta vs prior audit

| Metric | Prior audit (`8fb73b7`) | This run (`f89ffed`) | Δ |
|---|---:|---:|---:|
| Test files | ~218 (with 42 failing) | **201 (0 failing)** | -17 files, -42 failures |
| Tests run | ~3,180 estimated | **3,364 (3,181 pass + 183 skipped)** | +184 tests |
| Failures | 116 (pre-existing, env-dependent) | **0** | -116 |
| Governance actions covered | 58 / 58 | **81 / 81** | +23 (PMB Plan v3) |
| Bundle chunks | 513 | 513 | unchanged |
| Architecture-check baseline warnings | 27 | 27 | unchanged (LA-02 — pre-existing, scheduled for Phase 26.1 follow-up) |

The 116-failure cluster from the prior audit (`server/hr/__tests__/*`, `server/services/__tests__/*`, etc.) is **resolved**: Plan v3 + Stage 11 evidence work either migrated those tests, fixed their mocks, or moved env-dependent tests under `tests/integration/**` (excluded by default). This run's `vitest.config.ts` testTimeout bump closed the last cold-start flakiness. Direction A's PARTIAL classification is closed by Phase 27 (PR #150).

---

## Regressions found and fixed in this audit

### R-1 — `tests/check-provider-key-env-boundary.test.ts` deadline pin (introduced by Phase 27.7)

**Before:** test asserted `Phase 10`, `Phase 17`, `Phase 19` literal strings appear in the boundary script (the prior LR-01/02/03/04/06 deadline phases).

**After:** Phase 27.7 flipped all those deadlines to `Phase 28`. The test failed.

**Fix:** Replaced the three pinned `expect(scriptSrc).toContain("Phase N")` calls with a contract-level assertion: `expect(deadlineMatches.length).toBeGreaterThanOrEqual(ids.length)`, plus `expect(scriptSrc).toContain("Phase 28")`. A future deadline flip won't fail this test again.

### R-2 — Cold-start `await import(...)` flake (pre-existing, surfaced by this run's slower box)

**Symptom:** Different unit tests trip vitest's default 5 s `testTimeout` on each run when `await import("../router")` cold-loads heavy modules. First run: 3 failures. Second run after fix: 1 different failure. Third run: 1 different failure again.

**Diagnosis:** Pure environmental flakiness — the failing test passes when given a longer timeout. Per-test patching was whack-a-mole.

**Fix:** Bumped `vitest.config.ts → test.testTimeout` from default 5 s to 30 s. 30 s is a safe upper bound — anything that genuinely hangs still fails fast in CI; legitimate cold-imports succeed. Per-test timeout patches reverted to keep the diff minimal.

---

## Phase 15 — Remediation plan (forward-looking)

The list from the prior audit is largely resolved. Remaining items:

1. **Phase 3–5 staging exercise.** Provision staging env per `docs/deployment/staging-env.example.md`, run `pnpm run test:integration:staging` against it, and capture the `worker-runtime`, `connector-runtime`, and `event-handoff-sync` test outputs. Lifts BLOCKED → PASS.
2. **Phase 8 staging UI smoke.** Walk through `docs/deployment/ui-smoke-matrix.md` against a staging deployment. Lifts DEFERRED → PASS.
3. **Phase 9 PARTIAL → PASS.** Replay PARTIAL workflows from `docs/evidence/workflows/REAL_USER_WORKFLOW_REPORT.md` against staging with real inputs.
4. **Phase 26.1 — barrel-strip + caller migration.** 27 baseline AI-Types public-API leakers (LA-02) — scheduled follow-up PR. Out of scope here.
5. **Phase 28 (PMB).** Closes the 5 remaining LR-* register entries deferred by Phase 27.4: simulation engine streaming-with-tool-calls primitive (LR-01); Model Access embedding-execute primitive (LR-02/03/04); seed-from-env.ts extract (LR-06); /api/chat/stream + executeInvokeAgent migration (LR-08); opencode subprocess credential handoff (LR-09).
6. **Mermaid runtime (optional).** Same as prior audit — out of scope for readiness.

None of these blocks staging-ready classification. They block the upgrade from staging-ready to production-ready.

---

## Sign-off

The codebase remains **STAGING-READY** at `f89ffed`. The 12-PR remediation plan from the prior audit is complete; Plan v3 PMB plan is complete; Direction A audit verdict is closed via Phase 27. This run found and fixed two regressions (one I introduced in Phase 27.7, one pre-existing cold-start flake) and confirms the structural floor.

**Auditor:** Claude (Opus 4.7, 1M context) under AGENTS.md 5-agent model
**Audit run commit:** `f89ffed5155af6a18033049a84fe885d3f4adbc9`
**Evidence directory:** `docs/evidence/production-readiness/2026-05-05-rerun/`
