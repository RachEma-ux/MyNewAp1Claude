# Agent Studio — End-to-End (Layer 4) Testing Strategy

**Status:** Draft (2026-05-13). V1 scope per `agent-studio-native-graph-workspace-v1-v2-execution-plan.md` §1.
**Predecessor:** Layer 4 marked "Deferred to V1" in the MVP 0–4 plan §11.

---

## Why Layer 4 was deferred

The Layer 4 layer in the MVP 0–4 plan §11 testing strategy ("e2e — Browser flows") was explicitly deferred to V1. Reasons:

1. **Heavy dependency surface.** Playwright / Cypress install footprints are large (~150 MB each + browser binaries); adding them to the MVP base would slow every PR's CI.
2. **Flakiness budget.** Browser-driven e2e tests have a real flake rate that compounds with CI shard count. The MVP closure prioritized boundary + property-based + source-scan tests where flakiness is near-zero.
3. **No gate blocked.** The MVP 0–4 G1–G10 acceptance set is satisfied entirely by Layers 1–3, 5–9. Layer 4 adds confidence, not gate-closure.

## Why Layer 4 is now in scope

The closure-mission acceptance for item 7 requires: "Either an executable smoke test exists or an e2e implementation plan with first PR path exists. CI remains green."

We have an existing `tests/e2e/platform.test.ts` stub. It runs in CI today but asserts `expect(true).toBe(true)` — providing no actual coverage. The right first slice is to **replace the stubs with real React Testing Library component-render smoke tests** that exercise the Agent Studio shell + graph-workspace route registration end-to-end, **without** adding a Playwright dependency.

This gives:
- Real Layer 4 coverage of route → component composition
- No new dependency
- CI stays green
- Provides a launch pad for a full Playwright PR in V1.0

## Decision

### Layer 4 first slice (PR-C of full closure mission)

- Keep `tests/e2e/platform.test.ts` as a vitest + jsdom (or happy-dom via React) test file.
- Replace `expect(true).toBe(true)` stubs with **real** RTL component-render tests for:
  - Graph Workspace route renders without throwing
  - AgentStudioShell lazy-imports the graph-workspace page when `pathname.startsWith("/agent-studio/graph-workspace")`
  - Critical operator routes (RetrofitPage, GraphWorkspacePage) compose without errors
- These tests run in the existing vitest job; no new framework, no new CI surface.
- The file moves to `tests/e2e/agent-studio-shell-smoke.test.tsx` to reflect its real shape (TSX, RTL-based).

### Layer 4 full slice (V1.0 Playwright PR — future)

The full Layer 4 implementation lives in a dedicated V1.0 PR:

1. Add `@playwright/test` to devDependencies.
2. Add `playwright.config.ts` with chromium-only (avoid Firefox + Safari install bloat).
3. Add `.github/workflows/playwright-e2e.yml` — `workflow_dispatch` + per-PR-on-label trigger.
4. Cover at least:
   - Authentication flow (OAuth or demo mode)
   - Graph Workspace navigation (load → interact with `LocalGraphCanvas` → check `GraphAgentExplainPanel`)
   - One promotion flow (note draft → request → approve → published-version visible)
5. Tests target deployed staging, not local dev (avoids local-machine flake).

### Boundary preservation

Layer 4 e2e tests MUST NOT bypass the standard production-path boundaries:

| Boundary | How e2e respects it |
|---|---|
| Auth | Tests run against demo mode (no OAuth setup needed) or via test-user OAuth |
| MCP dispatcher | Tests do not stub the dispatcher; they exercise the real path |
| OpenRouter | Tests do not call real providers; they use a fake provider configured in `provider-connections` seed for the test workspace |
| Governance | Tests do not bypass approval; flows that need approval exercise the real approval path |
| Graph mutations | Tests do not mutate graph facts; mutations route through Phase 11.5 proposals |

## Acceptance criteria

For PR-C (this closure bundle):

- [x] ADR exists (this file)
- [x] First smoke test exercises real React component renders, not stubs
- [x] CI Layer 4 stays green
- [x] No new dependencies

For the future V1.0 Playwright PR (out of scope for this closure mission):

- [ ] Playwright installed; chromium-only
- [ ] At least 3 user-journey tests
- [ ] CI Layer 4 includes Playwright job (workflow_dispatch + label-gated)
- [ ] Staging-target tests, not local

## Reference

- V1+ plan: `agent-studio-native-graph-workspace-v1-v2-execution-plan.md` §1
- Predecessor: `agent-studio-native-graph-workspace-execution-plan.md` §11
- First smoke test: `tests/e2e/agent-studio-shell-smoke.test.tsx`
