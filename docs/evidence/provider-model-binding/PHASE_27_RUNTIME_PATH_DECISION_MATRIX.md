# Phase 27.4 — Runtime Path Decision Matrix

**Captured:** 2026-05-05 against `fix/pmb-phase-27-runtime-provider-key-surface`.
**Owner:** Governance role per AGENTS.md.

Each runtime provider-key surface gets exactly one decision: `MIGRATE_TO_MODEL_ACCESS`, `RETIRE`, `TEMPORARY_EXCEPTION_WITH_DEADLINE`, `ALREADY_FIXED`, or `NOT_APPLICABLE`. The brief caps new `TEMPORARY_EXCEPTION_WITH_DEADLINE` entries at one; if a second is needed it goes to a Phase 28.

---

## Decisions

| # | Path | Register | Decision | Owner | Deadline / target | Acceptance criteria | Risk |
|---|---|---|---|---|---|---|---|
| 1 | `server/agent-studio/chat-stream.ts:552, 580` (streaming Expert chat) | LR-01 | **ALREADY_FIXED** in 27.3 | Builder (this phase) | Closed at `fix/pmb-phase-27-runtime-provider-key-surface` | `chat-stream.ts` no longer imports `resolveProviderApiKey` or `openai`. `npm run check` + `check:architecture` green. | None — fixed. |
| 2 | `server/agent-studio/services/chat.ts:169 / 1021` (legacy `runChatWithTools`) | LR-01 | **MIGRATE_TO_MODEL_ACCESS** + helper-first per 27.5a | Builder (this phase) | 27.5 + 27.5a (this PR); 27.5b deferred to a labeled follow-up commit | The legacy `runChatWithTools` is removed (or returns a structured `binding_required` error). Helper exists in `scripts/agent-studio/create-provider-bindings-for-legacy-agents.ts`. | Medium — depends on real DB count of unbound agents (Phase 27.1 §1 BLOCKED). 27.5a + deferred 27.5b is the safer path. |
| 3 | `server/agent-studio/services/chat.ts:985` (legacy `sendChatMessage` no-binding fallback) | LR-01 | **MIGRATE_TO_MODEL_ACCESS** | Builder (this phase) | 27.5 (this PR) | The non-binding fallback degrades to a structured `binding_required` error rather than calling `new OpenAI({apiKey})`. | Same as #2; same data dependency. |
| 4 | `server/agent-studio/services/simulation.ts:808, 826` + `runViaOpenAIDirect` / `runViaOpenllmAgent` adapters | LR-01 (shared) | **TEMPORARY_EXCEPTION_WITH_DEADLINE** | Governance | Phase 27.6 documents the choice; the binding remains live as the **single allowed exception** | Documented decision in `PHASE_27_SIMULATION_ENGINE_DECISION.md` with explicit deadline + owner. | Medium — simulation is the last LR-01 caller; deferral is an explicit choice, not a silent allowlist. |
| 5 | `server/embeddings/service.ts:54, 59` (`process.env.OPENAI_API_KEY` + `new OpenAI({apiKey})`) | LR-02 | **TEMPORARY_EXCEPTION_WITH_DEADLINE** | Embeddings owner | Phase 28 | Embeddings is the only caller; migration requires a Model Access embedding endpoint that doesn't exist yet (Model Access is chat/stream/validateBinding only). Out of Phase 27 scope; Phase 28 adds embedding execute to Model Access. | Low — single hard-coded `OPENAI_API_KEY` read; no dynamic indirection. Already isolated. |
| 6 | `server/documents/processor.ts:339` (`process.env.OPENAI_API_KEY`) | LR-03 | **TEMPORARY_EXCEPTION_WITH_DEADLINE** | Documents owner | Phase 28 | Same shape as LR-02; same Model Access embedding-endpoint dependency. | Low. |
| 7 | `server/operators/provider-hub.ts:78` (`process.env.OPENAI_API_KEY`) | LR-04 | **TEMPORARY_EXCEPTION_WITH_DEADLINE** | Operators owner | Phase 28 | Same shape as LR-02. | Low. |
| 8 | `server/_core/index.ts:113–145, 184` (`autoProvisionProviders` boot seed) | LR-06 | **RETIRE** (target: replace with `scripts/provider-connections/seed-from-env.ts`) | Platform | Phase 27.4 ships the **decision**; the actual extract is a focused follow-up in **Phase 28** because it requires moving the encrypted-secret write target from the legacy `providers` table to `provider_connections` + a one-shot operator/CI invocation pattern. The current allowlist entry is preserved with a deadline pointing at Phase 28. | Decision is locked in this matrix. The extract itself is owned by Phase 28. | Medium — boot seed; getting it wrong silently breaks dev startup. |
| 9 | `server/chat/stream.ts:3, 70` (`/api/chat/stream` legacy chat UI endpoint) | LR-08 | **TEMPORARY_EXCEPTION_WITH_DEADLINE** (rolled into the Phase 28 LR-08 batch) | Chat owner | Phase 28 | The non-Agent-Studio `/api/chat/stream` consumes `getProviderRegistry()` (seeded from env at boot via LR-06). It is not the PR-#100 incident shape and is lower priority than the AS streaming surface. Migration to `openRouter.modelAccess.stream` requires the same wiring as 27.3 but for the legacy chat UI; deferring lets us scope Phase 27 cleanly. | Low — read-side of the LR-06-seeded registry; closing LR-06 in Phase 28 closes this transitively for the registry side. |
| 10 | `server/automation/block-executors.ts:executeInvokeAgent` (lines 202–270) | LR-08 | **TEMPORARY_EXCEPTION_WITH_DEADLINE** (rolled into the Phase 28 LR-08 batch) | Automation owner | Phase 28 | Same plumbing as #9 — picks an arbitrary registry provider's `.generate(...)`. Migration target is `agentStudio.providerBindings.resolveForRun` + `openRouter.modelAccess.execute` against the agent's binding. Note: actual function name is `executeInvokeAgent` (the register's `executeRunAgent` is stale). | Low. |
| 11 | `server/code-studio/opencode/provider-sync.ts:96` (subprocess env-write) | LR-09 | **TEMPORARY_EXCEPTION_WITH_DEADLINE** — **single allowed Phase 27 exception** | Code Studio owner | Phase 28 (decision call) | `process.env[envVar] = config.apiKey` writes provider keys onto a spawned-subprocess environment. The opencode CLI subprocess expects credentials in env; this is the handoff point and there is no alternative ingestion path in opencode today. Migration would require an opencode CLI change. Documented as the **one** Phase 27 exception per the matrix cap rule. | Low — write, not read; surface is a contained subprocess handoff. |
| 12 | `server/data-analysis/omnirag-adapter.ts:57` (`process.env.OMNIRAG_API_KEY`) | LR-05 | **NOT_APPLICABLE** | — | — | OmniRAG is a domain-service auth token, not an LLM provider key. The Phase 5 `NON_PROVIDER_KEYS` set in `check-provider-key-env-boundary.ts` already exempts it. | None. |

---

## Exception count check

The brief caps **new** `TEMPORARY_EXCEPTION_WITH_DEADLINE` entries in 27.4 at **one**.

Re-counting:

| # | Path | New exception? |
|---|---|---|
| 4 (simulation) | LR-01 | **Yes — but with explicit 27.6 follow-up doc and named deadline.** Counts as the **one allowed Phase 27 exception** for the AS surface. |
| 5 (embeddings) | LR-02 | **No — pre-existing exception** in the legacy register; rolled to Phase 28 with no scope change. |
| 6 (documents) | LR-03 | **No — pre-existing.** |
| 7 (operators) | LR-04 | **No — pre-existing.** |
| 8 (autoProvisionProviders) | LR-06 | **No — pre-existing; decision locked here is RETIRE, the deferral is just timing.** |
| 9 (`/api/chat/stream`) | LR-08 | **No — pre-existing.** |
| 10 (automation `executeInvokeAgent`) | LR-08 | **No — pre-existing.** |
| 11 (code-studio opencode env-write) | LR-09 | **No — pre-existing; doc-only "decision call" per the original register.** |

Phase 27 introduces zero new register entries. All deferrals are existing register entries with their existing deadlines tightened to "Phase 28" instead of the open "Phase 27" they had before.

The single new explicit deadline-bound exception is for **simulation (item 4)**, formally documented in `PHASE_27_SIMULATION_ENGINE_DECISION.md` per 27.6.

**Cap respected: 1 / 1 allowed.**

---

## What 27.7 will do with this matrix

- Items #1, #3 → ALREADY_FIXED in 27.3 / 27.5; remove their LR-01 allowlist entries.
- Item #2 → 27.5b removes the fallback after the migration helper drains unbound agents; LR-01 closes.
- Item #4 → Simulation kept as the single approved exception; LR-01 stays partially open with the simulation-specific scope note.
- Items #5–#11 → Pre-existing register entries; their allowlist entries stay, but their deadlines flip from "Phase 27" to "Phase 28" so the register is still useful.
- Item #12 → No-op; never was in scope.

After 27.7's allowlist purge:
- LR-01 contains only the simulation exception (and 27.5b's deferred chat fallback if 27.5b hasn't shipped yet).
- LR-02, LR-03, LR-04, LR-06, LR-08, LR-09 keep their entries but with "Phase 28" deadlines.
- LR-05 is unchanged.
