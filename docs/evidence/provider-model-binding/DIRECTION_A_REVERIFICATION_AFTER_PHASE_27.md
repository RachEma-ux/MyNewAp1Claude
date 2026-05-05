# Direction A — Re-verification after Phase 27

**Direction A:** *AI Types / Provider Connections → Agent Studio → OpenRouter Model Access*
**Verification mode:** read-only re-audit (verify Phase 27 actually closed the PARTIAL gaps from `DIRECTION_A_VERIFICATION_REPORT.md`).
**Branch:** `fix/pmb-phase-27-runtime-provider-key-surface` (from `main@2eefe2e`)
**Date:** 2026-05-05

---

## 1. Executive verdict — change from PARTIAL to PASS

**Direction A is now PASS** for the surfaces Phase 27 owned. The five
defects D-1 through D-5 from the original audit are addressed as follows:

| Defect | Original status | After Phase 27 |
|---|---|---|
| D-1 — Streaming Expert chat off Model Access | OPEN | **CLOSED in 27.3** — `chat-stream.ts` now calls `gatewayCall("openRouter.modelAccess.{stream,execute}")`. No `OpenAI` import, no `resolveProviderApiKey` import. |
| D-2 — Legacy `runChatWithTools` retains `new OpenAI({apiKey})` | OPEN | **CLOSED in 27.5** — function deleted; legacy fallback in `sendChatMessage` now returns `{code: "binding_required"}` instead of instantiating an `OpenAI` client. |
| D-3 — `ags_agent_drafts.providerConfig` permits raw `apiKey` at rest | OPEN | **CLOSED in 27.2** — `services/provider-config-guard.ts` strips `apiKey` / `api_key` / `apiKeyEnvVar` / `api_key_env_var` from any value flowing through `repository.updateRuntimeConfig` and `repository.updateDraft`. Migration apply path redacts existing rows + version snapshots. Schema column remains `jsonb` by design (LK-01 register row flipped to `migrated`). |
| D-4 — `/api/chat/stream` + automation `executeInvokeAgent` use env-seeded registry | OPEN | **DEFERRED (intentional)** — Phase 27.4 matrix items #9 and #10 classify both as TEMPORARY_EXCEPTION_WITH_DEADLINE (Phase 28). LR-08 register row updated; function-name correction `executeRunAgent` → `executeInvokeAgent` recorded. Out of scope for Phase 27. |
| D-5 — Implementation report overstated D1 finality | OPEN | **CLOSED in 27.0** — README wording note added; the off-repo implementation report at `/sdcard/Download/PMB_PLAN_V3_IMPLEMENTATION_REPORT.md` line 18 was rewritten to accurately name LR-01/02/03/04/06/08 + LK-01 + simulation as the legacy/baseline-allowlisted paths. |

**The single remaining LR-01 caller is the simulation engine.** It is
the explicitly approved Phase 27 exception (see
`PHASE_27_SIMULATION_ENGINE_DECISION.md`), deadline Phase 28.

---

## 2. Branch and commits

```
$ git rev-parse HEAD
<post-27.7 commit>
$ git log --oneline 2eefe2e..HEAD
fix(pmb/phase-27.7): allowlist purge — narrow LR-01 to simulation, flip pre-existing deadlines to Phase 28
fix(pmb/phase-27.4-27.6): runtime path decisions + runChatWithTools removal + simulation exception
fix(pmb/phase-27.3): streaming Expert chat through OpenRouter Model Access
fix(pmb/phase-27.2): providerConfig forward-write guard + migration apply path
fix(pmb/phase-27.1): scope and sizing report
fix(pmb/phase-27.0): correct D1 wording overstatement in evidence README
```

Branch is local during this report; push step is at the end.

---

## 3. Re-claim verification

### Claim 9 (Expert chat & runChatWithTools use Model Access)

**Original:** PARTIAL (three live legacy paths).
**Now:** PASS for non-simulation surfaces; simulation remains as the single approved exception.

**Verification:**

```bash
$ grep -n "import OpenAI\|new OpenAI(\|resolveProviderApiKey" \
    server/agent-studio/services/chat.ts \
    server/agent-studio/chat-stream.ts
```

Returns:
- `services/chat.ts:35` — comment reference only (notes the import was removed in 27.5)
- `services/chat.ts:193,759` — comment references only
- `chat-stream.ts` — no matches

No live `import OpenAI`, no live `new OpenAI(...)`, no live
`resolveProviderApiKey` call in either file.

**Phase 42 invariant 5b** (added in 27.7) locks this in CI: the only
Agent Studio paths that may read `process.env.<X>_API_KEY`,
instantiate `new OpenAI(`, or import `resolveProviderApiKey` are:

- `server/agent-studio/adapters/openllm-runtime-adapter.ts` (resolver)
- `server/agent-studio/services/simulation.ts` (sole caller)
- `server/agent-studio/adapters/openai-direct-adapter.ts` (simulation adapter)

Any new violation in any other AS file fails the test.

### Claim 5 / LK-01 (Agent Studio provider binding storage)

**Original:** PASS for new bindings table; LK-01 jsonb gap noted.
**Now:** PASS — LK-01 forward-write guard closed the practical risk.

**Verification:**

```bash
$ grep -n "sanitizeProviderConfig" server/agent-studio/repository.ts
```

Returns two call sites — one in `updateRuntimeConfig`, one in
`updateDraft`. Both wrap `patch.providerConfig` through the guard
before persistence.

```bash
$ grep -n "from.*provider-config-guard" server/agent-studio
```

Returns the two repository imports. Guard tests
(`provider-config-guard.test.ts`) pass 7/7.

### Claim 10 (Boundary tests enforce Direction A)

**Original:** PASS for what they test; PARTIAL for what they don't —
specifically (a) jsonb shape, (b) AS legacy raw-key paths, (c) runtime
exclusivity.

**Now:** PASS — the gaps closed:
- (a) Forward-write guard + migration apply path means no new raw-key
  jsonb writes can land. The boundary check is still column-name based;
  the runtime guard is the real enforcement.
- (b) Invariant 5b extends scanning from `server/openrouter/model-access/**`
  to `server/agent-studio/**`, with the simulation-only allowlist.
- (c) Same invariant 5b — `new OpenAI(` and `resolveProviderApiKey`
  imports are now both forbidden outside the simulation allowlist.

---

## 4. Commands run and exit codes

| Command | Exit | Notes |
|---|---|---|
| `npm run check` | 0 | tsc --noEmit, no errors. |
| `npx tsx scripts/check-provider-key-env-boundary.ts` | 0 | OK — D1 boundary clean given the narrowed simulation-only LR-01 scope. |
| `npx vitest run tests/pmb/boundary.test.ts` | 0 | **15/15 PASS** including new invariant 5b (3 sub-tests). |
| `npx vitest run tests/pmb/runtime-coverage.test.ts` | 0 | **33/33 PASS** — coverage attestation unchanged. |

(See `VALIDATION_OUTPUTS.md` for the full Phase 27 validation rerun.)

---

## 5. Defects — original vs current

| ID | Title | Phase | Status |
|---|---|---|---|
| D-1 | Streaming Expert chat is not on Model Access | 27.3 | CLOSED |
| D-2 | Legacy `runChatWithTools` fallback retains direct OpenAI key path | 27.5 | CLOSED |
| D-3 | Legacy `ags_agent_drafts.providerConfig` jsonb permits raw apiKey at rest | 27.2 | CLOSED (forward-write guard + migration apply) |
| D-4 | `/api/chat/stream` + automation `executeInvokeAgent` use env-seeded registry | 27.4 | DEFERRED to Phase 28 (LR-08 batch) — intentional |
| D-5 | Implementation report overstated D1 finality | 27.0 | CLOSED |

---

## 6. Single Phase 27 exception (simulation)

The only post-Phase-27 LR-01 caller is the simulation engine
(`services/simulation.ts:808, 826`). Documented in
`PHASE_27_SIMULATION_ENGINE_DECISION.md` (Option C —
TEMPORARY_EXCEPTION_WITH_DEADLINE; Phase 28 acceptance criteria
spelled out). This is the **single allowed exception** under the
brief's matrix-cap rule, and it is enforced as such by:

- The boundary script's narrowed LR-01 allowlist entry.
- The Phase 27.7 invariant 5b allowlist (3 named files).
- `LEGACY_EXCEPTION_REGISTER.md` LR-01 row, status `in_progress`,
  deadline `Phase 28`.

A second exception cannot be added to Phase 27 without re-opening this
PR; that is by design.

---

## 7. Direction A — final state

**Direction A is exclusive on the Agent Studio chat surfaces.** Test-run
(`test-run-binding.ts`), Expert chat tool-equipped path (`runChatWithToolsViaBinding`),
and streaming Expert chat (`chat-stream.ts`) all go through
`gatewayCall("openRouter.modelAccess.{execute,stream}")`. Provider
credentials never leave Provider Connections via the Agent Studio chat
path. The non-binding agent case is now a structured `binding_required`
error rather than a fall-through to `new OpenAI(...)`.

**Direction A is NOT exclusive on:**

- The simulation engine (single approved exception, deadline Phase 28).
- `/api/chat/stream` + automation `executeInvokeAgent` (LR-08, deadline Phase 28).
- Embeddings / Documents / Operators (LR-02/03/04, deadline Phase 28).
- The boot-time provider seed (LR-06, deadline Phase 28).
- Code Studio opencode subprocess env-write (LR-09, deadline Phase 28).

These are all pre-existing register entries with formal Phase 28
deadlines. They are not new exceptions introduced in Phase 27.

---

## 8. Ready to merge

Phase 27 deliverables, all in this branch:

- 27.0 — `README.md` D1 wording note.
- 27.1 — `PHASE_27_SCOPE_AND_SIZING.md` (DB rows BLOCKED on device; static inventory complete; helper-first 27.5a path chosen).
- 27.2 — `services/provider-config-guard.ts` + tests; `repository.ts` integration; `migrate-provider-config-to-bindings.ts` apply path; `PROVIDER_CONFIG_RAW_KEY_CLEANUP.md`.
- 27.3 — `chat-stream.ts` migrated to Model Access (streaming + tool-loop turns).
- 27.4 — `PHASE_27_RUNTIME_PATH_DECISION_MATRIX.md` (12-row matrix; cap 1/1).
- 27.5 — `services/chat.ts` legacy `runChatWithTools` deletion + binding-required fallback.
- 27.5a — `scripts/agent-studio/create-provider-bindings-for-legacy-agents.ts` migration helper.
- 27.6 — `PHASE_27_SIMULATION_ENGINE_DECISION.md` (Option C, deadline Phase 28).
- 27.7 — Allowlist narrowed; invariant 5b added; register updated; rollback documented in `PHASE_27_ALLOWLIST_PURGE_ROLLBACK.md`.

Validation, all green:

- `npm run check` — clean.
- `npx tsx scripts/check-provider-key-env-boundary.ts` — OK.
- `npx vitest run tests/pmb/boundary.test.ts` — 15/15.
- `npx vitest run tests/pmb/runtime-coverage.test.ts` — 33/33.

Direction A moves from PARTIAL to **PASS**.
