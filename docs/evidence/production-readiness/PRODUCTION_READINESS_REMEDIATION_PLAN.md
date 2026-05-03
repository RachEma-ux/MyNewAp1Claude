# Production Readiness Remediation Plan

**Repository:** `RachEma-ux/MyNewAp1Claude`
**Base branch:** `main`
**Plan author instruction context:** Drive the app from `CONDITIONAL` (per the prior Production Readiness Verification report) toward `PASS / staging-ready / production-ready` without faking readiness.

This document reconstructs the 12-PR plan from the shipped record (PRs #76–#88 on `main`). It is the plan, not a status update — the status is captured separately in [`PRODUCTION_READINESS_VERIFICATION_REPORT.md`](./PRODUCTION_READINESS_VERIFICATION_REPORT.md) and [`FINAL_READINESS_REPORT.md`](./FINAL_READINESS_REPORT.md).

## Standing rules

These applied to every PR in the plan:

- **Do not fake readiness.** If a check cannot be verified locally, it must be reported as BLOCKED with the exact missing dependency, not silently passed.
- **Do not change Module Client Capsule architecture.** Every RTLM stays a strict capsule; no architectural rollback to satisfy a check.
- **Do not weaken any check.** TypeScript, architecture, wiring, AWI, frontend modularity, governance, DB ownership, SQL boundary — all of them keep their existing strictness. New checks may be added; existing ones may not be relaxed.
- **One PR per remediation group.** Mixed-concern PRs are forbidden.
- **Never push to `main` directly.** Never force-push. Never skip CI (`--no-verify`, `--no-gpg-sign`, etc. are all forbidden unless the user explicitly authorizes).
- **Local unit tests must be clean without staging infra.** Tests that need DB / OPA / workers / secrets must live under `tests/integration/**` and be gated by `TEST_MODE=staging-integration`. Default `pnpm run test:unit` must pass on a bare developer machine.
- **Staging tests must surface BLOCKED, not silent skip, when env is unavailable.** The reporter must exit non-zero with the exact unfilled-env list.
- **Per AGENTS.md, follow the 5-agent model:** Planner / Builder / Reviewer / Tester / Governance, with the user owning the merge decision.

## The 12 PRs

Each PR scope below is what the plan called for; the shipped commit is the realisation.

### PR 1 — Missing exports remediation
**Caveat:** Three named exports cited by the prior audit were missing or had drifted from the type surface, breaking imports in downstream tests.
**Scope:** Re-export the missing symbols, add the type assertions back, do not introduce a backwards-compat shim.
**Shipped:** PR #76, merged.

### PR 2 — Workspace stale test remediation
**Caveat:** Workspace-related tests asserted on the legacy lifecycle, not the current 9-status (`draft`, `ready_for_review`, `under_review`, `approved`, `published`, `active`, `rejected`, `archived`, `deleted`).
**Scope:** Update tests to the live lifecycle. Do not add new lifecycle states to make the old tests pass.
**Shipped:** PR #77, merged.

### PR 3 — ScrollableTabsList remediation
**Caveat:** `ScrollableTabsList` component was orphaned in the AWI report — referenced but not wired to the live render path.
**Scope:** Wire the component to its consumer or remove if truly dead. Do not silence the AWI orphan check.
**Shipped:** PR #78, merged.

### PR 4 — Misc residual cleanup
**Caveat:** Smaller follow-ups too small for individual PRs but too important to drop.
**Scope:** Bundle them into a single small PR with each item separately commented.
**Shipped:** PR #79, merged.

### PR 5 — Test-mode separation
**Caveat:** `pnpm run test` ran integration tests against unprovisioned staging in CI, producing flaky failures. Several test files needed DATABASE_URL / OPA / workers but were under `server/**` instead of `tests/integration/**`.
**Scope:**
- Move env-dependent tests to `tests/integration/**`.
- Update `vitest.config.ts` to exclude `tests/integration/**` by default; lift the exclude when `TEST_MODE=staging-integration`.
- Add `tests/_helpers/test-modes.ts` with `hasDb`, `hasOpa`, `hasSecrets`, `hasOrchestrator`, `hasWorkerQueue`, `isStagingIntegrationMode`, `skipUnlessInfra`.
- Add `scripts/run-staging-integration-tests.ts` — a BLOCKED reporter that exits 2 with the exact unfilled-env list (e.g., DATABASE_URL, OPA_URL — rejecting `opa.example.com` placeholder, ENCRYPTION_KEY, SECRETS_ENCRYPTION_KEY, COOKIE_SECRET, JWT_SECRET).
- Wire `pnpm run test:integration:staging` and `pnpm run test:readiness`.
**Shipped:** PR #80, merged.

### PR 6 — Agent Studio routeInventory caveat
**Caveat:** Agent Studio capsule `routeInventory` declared two orphan routes (`/agent-studio/catalog/skills`, `/agent-studio/catalog/tools`) that the AWI couldn't link back to the manifest's declared paths.
**Scope:** Pin those two routes as literal entries in `routeInventory` alongside the parameterized `/catalog/:section`. Orphan count 2 → 0.
**Shipped:** PR #81, merged.

### PR 7 — Staging readiness docs
**Caveat:** Staging deployment story was undocumented; reviewers had no canonical reference for env-var setup, OPA endpoints, worker URLs, or secrets sourcing.
**Scope:**
- Write `docs/deployment/staging-readiness.md` covering DBs, OPA, workers, secrets, OAuth, pre-flight, exit-code semantics.
- Write `docs/deployment/staging-env.example.md` — the full env template with never-commit guidance.
**Shipped:** PR #82, merged.

### PR 8 — Worker runtime verification
**Caveat:** Worker `/health` endpoints existed but were not exercised by any test. No evidence that GraphRAG / Data Acquisition / External Orchestrator workers were reachable.
**Scope:**
- Write `tests/integration/workers/worker-runtime.test.ts` that probes `/health` on each worker URL.
- Use `describe.skipIf(!hasWorker())` (component-scoped optional infra) rather than `skipUnlessInfra` (primary infra) so missing worker URLs skip cleanly without exiting BLOCKED.
- Document the worker probes in `docs/deployment/staging-readiness.md`.
**Shipped:** PR #83, merged.

### PR 9 — Connector evidence expansion
**Caveat:** Connector status verification was implicit; no evidence that built-in connectors always work or that external connectors gracefully gate on credentials.
**Scope:**
- Write `tests/integration/connectors/connector-runtime.test.ts`.
- Built-ins (`local`, `manual`, `webhook`) always-on.
- Externals (`s3`, `gdrive`, `github`, `sensor`, `stream`) gated by `allEnvSet(connector.envVars)`.
- Coverage assertion that guards new credentialed connectors — must be matched against the static envVars registry.
**Shipped:** PR #84, merged.

### PR 10 — UI smoke + workflow E2E
**Caveat:** Phase 8 (UI behaviour) had no manual smoke matrix. Phase 9 (real user workflows) was BLOCKED with no artifact. Phase 10 (E2E sync) was BLOCKED with no artifact.
**Scope:**
- Write `docs/deployment/ui-smoke-matrix.md` covering 15 capsules × golden path × edge cases (Phase 8).
- Write `docs/evidence/workflows/REAL_USER_WORKFLOW_REPORT.md` — discovered-API workflow report classifying 9 workflows as EXECUTABLE_NOW / PARTIAL / BLOCKED with cited file:line evidence; do NOT speculate on tRPC paths (Phase 9 lift from BLOCKED → PARTIAL).
- Write `tests/integration/workflows/workflow-readiness.test.ts` — contract-discovery test asserting every cited symbol still exists; if the report drifts, the test fails.
- Write `tests/integration/sync/event-handoff-sync.test.ts` — deterministic floor for the cross-module event bus (publish/subscribe/fanout/wildcard/idempotencyKey invariants) (Phase 10 lift).
- Phase 9 verdict explicitly **PARTIAL**, not PASS — discovered-API evidence is not the same as live replay against staging.
**Shipped:** PRs #85 + #86 (merged in two commits per the plan but counted as one remediation group), merged.

### PR 11 — Enterprise hardening (the Shiki bundle-size caveat)
**Caveat:** Phase 12 readiness audit flagged five Vite bundle-size warnings (>600 KB each): `WikiArticle`, `emacs-lisp`, `wasm`, `cpp`, `index`. Streamdown's compiled bundle imports `bundledLanguages` from `shiki` at the top level, forcing Vite to emit a chunk per Shiki grammar (220+ chunks).
**Scope:**
- Real fix, not documentation. Stop bundling the full Shiki grammar registry.
- Replace direct Streamdown usage with an app-owned `AppStreamdown` wrapper that uses `react-markdown` directly (with the same plugin set: GFM + math + KaTeX) and routes code fences through `SlimShikiHighlighter`.
- `SlimShikiHighlighter` is the SOLE owner of every Shiki import; uses `shiki/core` (no bundled grammars) plus literal `import("@shikijs/langs/<name>")` and `import("@shikijs/themes/<name>")` calls.
- Allow-listed ~30 common languages. Aliases (js, ts, py, sh, c++, c#, kt, …) normalize to canonical ids.
- Unsupported languages fall back to HTML-escaped plain text. **Do not remove syntax highlighting entirely.**
- Mermaid blocks render as plain `<pre><code>` (no Mermaid runtime bundled — Mermaid is documentation content, not in-product behaviour).
- Add `scripts/check-markdown-imports.ts` — boundary guardrail forbidding direct `streamdown` imports anywhere and Shiki imports outside `client/src/lib/shiki/SlimShikiHighlighter.ts`.
- Add `scripts/check-bundle-budget.ts` — post-build budget asserting ≤1024 KB per application chunk and ≤1.5 MB per language chunk.
- Document the strategy in `docs/deployment/bundle-size-strategy.md`.
- Replace Streamdown in `client/src/components/AIChatBox.tsx`, `client/src/pages/Chat.tsx`, `client/src/pages/WikiArticle.tsx`. Drop `streamdown` from `package.json`; declare `react-markdown`, `remark-gfm`, `remark-math`, `rehype-katex`, `katex`, `shiki`, `@shikijs/langs`, `@shikijs/themes`, `@shikijs/types` as direct deps.
- Verify the build emits zero chunks for unimported grammars (e.g., emacs-lisp, wasm, cpp-when-removed-from-allow-list); WikiArticle bundle drops accordingly.
**Shipped:** PR #87, merged. Result: WikiArticle 890 KB → 437 KB (−51%); language chunks 220 → 29; emacs-lisp / wasm / wolfram / 190+ unused grammars no longer emitted.

### PR 12 — Final readiness rerun
**Caveat:** After PR 11 lands, the Production Readiness Verification Protocol must be re-executed against the post-fix main to validate the caveat is actually lifted.
**Scope:**
- Run the Phase Control Gate; confirm `production-readiness` mode unlocks (15/15 RTLMs migrated).
- Run the full local check chain: `check`, `check:architecture`, `check:wiring`, `check:ports`, `check:awi`, `check:frontend-modularity`, `build`, `check:bundle-budget`, `check:markdown-imports`.
- Run unit tests; characterise any failures as PR-11-regression vs pre-existing (verify pre-existing by re-running the same files against the pre-PR-11 commit).
- Run `test:integration:staging` and confirm BLOCKED reporter exits 2 with the correct unfilled-env list.
- Produce `docs/evidence/production-readiness/PRODUCTION_READINESS_VERIFICATION_REPORT.md` with phase-by-phase verdicts (Phase 0–15), exit codes for every check, bundle-size delta table, and forward-looking remediation list for residual PARTIAL/BLOCKED phases.
- **Do not claim PRODUCTION-READY.** Honest classification — STAGING-READY with documented remaining work.
- Fix any latent regression discovered during the rerun (in scope: anything that breaks the local check chain on post-PR-11 main).
**Shipped:** PR #88, merged. Result: STAGING-READY verdict; 12-PR plan COMPLETE; one PR-11 latent self-reference bug in `scripts/check-markdown-imports.ts` discovered and fixed (the script's own doc-comment contained the literal byte sequence the regex matched, which broke `pnpm run check:architecture` after commit; CI didn't run that command, so PR 11 CI passed).

## Per-PR delivery contract

Each PR shipped against this plan satisfied:

- A scoped branch (`feat/...`, `test/...`, `docs/...`, `perf/...`, `chore/...`).
- A descriptive commit message explaining the why, not just the what.
- A PR body with a before/after table or evidence section, not a one-line summary.
- CI green at merge time (5 checks: `ci`, `build`, `test`, `Governance Compliance Checks`, `Governance Enforcement Harness`).
- No force-push. No skipped CI. No direct main pushes.
- Branch deletion after merge.

## Verdict

The 12-PR Production Readiness Remediation Plan is **shipped and complete on `main` at `23e5134`**. The codebase verdict is **STAGING-READY** as documented in [`FINAL_READINESS_REPORT.md`](./FINAL_READINESS_REPORT.md) and [`PRODUCTION_READINESS_VERIFICATION_REPORT.md`](./PRODUCTION_READINESS_VERIFICATION_REPORT.md). Lifting STAGING-READY → PRODUCTION-READY is forward-looking work explicitly outside the plan's scope.
