# Runtime Path Migration Matrix — Provider/Model Binding

**Plan v3 Phase 19 deliverable.** Inventory of every runtime path in the codebase that reaches an LLM/embedding provider, with a classification + a migration plan for the ones that still violate D1 (no `process.env[providerKey]` at runtime) or D4 (provider model calls go through OpenRouter Model Access).

The Phase 19 scope is **classification only** — no code changes here. Each path's migration is owned by its phase column. New paths discovered during execution must be added to this matrix in the same PR that adds them.

## Classification key

- **migrated** — path uses `openRouter.modelAccess.execute|stream` via the gateway and does NOT read provider keys from env. Done.
- **temporary_exception** — path still reads env / calls a provider SDK directly, but has a tracked deadline phase + an LR-* register entry. Allowed under the lifecycle rules in `LEGACY_EXCEPTION_REGISTER.md`.
- **blocked** — migration cannot land until an upstream change (Model Access feature, schema migration, etc.) lands. Deadline phase is the upstream-unblock phase.
- **removed** — path was deleted; left in this matrix to document the removal so future "where did /api/chat/stream go?" questions have an answer.

## Lifecycle rules (mirror `LEGACY_EXCEPTION_REGISTER.md`)

- Every `temporary_exception` row MUST have a deadline phase + an LR entry.
- Adding a new `temporary_exception` requires Governance signoff in the PR description.
- A row sitting at `temporary_exception` past its deadline phase becomes `expired` and **must fail** the next architecture/governance review.
- New runtime paths must be classified in the PR that adds them.

---

## Matrix

Columns: `Path | Owner | Current state | Provider call shape | Reads provider key from env? | Classification | Deadline phase | LR entry | Notes`

### Agent Studio surface

| Path | Owner | Current state | Provider call shape | Reads env? | Classification | Deadline phase | LR entry | Notes |
|---|---|---|---|---|---|---|---|---|
| `server/agent-studio/services/chat.ts:sendChatMessageViaBinding` | Agent Studio | Active (Phase 17) | `gatewayCall → openRouter.modelAccess.execute` | No | **migrated** | — | — | The dominant Expert chat shape (binding_v1 + hosted PCID + no tools). Phase 17. |
| `server/agent-studio/services/chat.ts:runChatWithToolsViaBinding` | Agent Studio | Active (Phase 18) | `gatewayCall → openRouter.modelAccess.execute` (per turn) | No | **migrated** | — | — | Tool-equipped binding chats. Phase 18 added the tool-call schema to Model Access (`ModelAccessToolCall`). |
| `server/agent-studio/services/chat.ts:runChatWithTools` (legacy direct-OpenAI tool loop) | Agent Studio | Active for non-binding agents | `new OpenAI({apiKey})` + `chat.completions.create({tools})` | Yes (via `resolveProviderApiKey`) | **temporary_exception** | Phase 27 (Agent Studio raw-key surface elimination) | LR-01 (shared) | Reachable only when an agent has NO `binding_v1` row. UI flow nudges every agent toward a binding via the picker (Phase 14); this branch survives for legacy fixtures + tests. |
| `server/agent-studio/services/chat.ts:sendChatMessage` (no-tool legacy fallback) | Agent Studio | Active for non-binding agents | `OpenAIProvider.generate(...)` from `providers/openai.ts` | Yes (via `resolveProviderApiKey`) | **temporary_exception** | Phase 27 | LR-01 (shared) | Same constraint as the tool-loop fallback. Once every legacy fixture has a binding, this branch can be deleted. |
| `server/agent-studio/services/test-run-binding.ts:runTestWithBinding` | Agent Studio | Active (Phase 16) | `gatewayCall → openRouter.modelAccess.execute` | No | **migrated** | — | — | Binding-driven test runs. |
| `server/agent-studio/services/simulation.ts` (live-runtime branch — `runViaOpenAIDirect` and `runViaOpenllmAgent`) | Agent Studio | Active | `runViaOpenAIDirect`: `new OpenAI({apiKey:endpoint.apiKey})`; `runViaOpenllmAgent`: forwards `apiKey` to the openllm-agent2 WS bridge | Yes (`resolveOpenllmEndpoint` → `resolveProviderApiKey`) | **temporary_exception** | Phase 27 | LR-01 (shared) | The simulation engine is the last LR-01 caller. Migration requires Model Access to expose a streaming-with-MCP-bridge contract, which is currently out of scope for Plan v3. Tracked under LR-01 with the Phase 27 deadline. |
| `server/agent-studio/adapters/openai-direct-adapter.ts:runViaOpenAIDirect` | Agent Studio | Called by simulation only | OpenAI SDK | Yes (caller resolves) | **temporary_exception** | Phase 27 | LR-01 (shared) | If we delete this file in Phase 27, also delete the `runViaOpenAIDirect` import in simulation.ts. |
| `server/agent-studio/adapters/openllm-runtime-adapter.ts:runViaOpenllmAgent` | Agent Studio | Called by simulation only | openllm-agent2 WebSocket | Yes (caller resolves) | **temporary_exception** | Phase 27 | LR-01 (shared) | Out-of-process runtime. Migration is contingent on Model Access exposing the WS bridge primitive (not in Plan v3). Documented as "may stay as exception forever" per Decision pending. |
| `server/agent-studio/adapters/openllm-runtime-adapter.ts:resolveProviderApiKey` (lines 311–334) | Agent Studio | Called by chat-legacy + simulation | Reads `process.env[pc.apiKeyEnvVar]` and `process.env[PROVIDER_ENV_VAR[provider]]` | **Yes — D1 violation** | **temporary_exception** | Phase 27 | **LR-01** | Original LR-01 row. Phases 17/18 narrowed callers; Phase 27 deletes it. |

### Other runtime paths

| Path | Owner | Current state | Provider call shape | Reads env? | Classification | Deadline phase | LR entry | Notes |
|---|---|---|---|---|---|---|---|---|
| `server/_core/index.ts:autoProvisionProviders` (lines 120–140) | Platform | Active at boot | `process.env[OPENAI_API_KEY \| ANTHROPIC_API_KEY \| GOOGLE_API_KEY \| GROQ_API_KEY]` → seed legacy `providers` table | Yes (boot-time) | **temporary_exception** | Phase 10 (target — pending replacement script) | LR-06 | The boot-time seed Plan v3 wants, but writes to the wrong table. Phase 10 sketched the replacement (`scripts/provider-connections/seed-from-env.ts`); the cutover lands when that script + the legacy boot block deletion ship together. |
| `server/chat/stream.ts` (`/api/chat/stream`) | Chat | Active | `getProviderRegistry().getProvider(...)` then `provider.generate(...)` (or stream variant) | Yes (registry providers were seeded from env) | **temporary_exception** | Phase 27 (Agent Studio raw-key surface) | LR-08 (NEW — registered in this PR) | Cross-cutting chat HTTP endpoint; same migration shape as Expert chat (Phase 17/18). Lower priority than the Agent Studio paths because it's not the PR-#100 incident path. |
| `server/automation/block-executors.ts:executeRunAgent` (lines 220–270) | Automation | Active | `getProviderRegistry().getAllProviders()[0].generate(...)` | Yes (registry seeded from env) | **temporary_exception** | Phase 27 | LR-08 (shared) | Picks an arbitrary registry provider — not even routed through unified routing. Migration is to use the agent's binding via `agentStudio.providerBindings.resolveForRun` + `openRouter.modelAccess.execute`. |
| `server/embeddings/service.ts:54` | Embeddings | Active | OpenAI SDK | `process.env.OPENAI_API_KEY` (single var) | **temporary_exception** | Phase 27+ (out-of-Plan-v3 followup) | LR-02 | Embeddings is not a Plan v3 module; rule-of-thumb is Plan v3 covers PROVIDER keys, embedding-API keys overlap but a Phase 27 follow-up will reclassify. |
| `server/documents/processor.ts:339` | Documents | Active | OpenAI SDK | `process.env.OPENAI_API_KEY` (single var) | **temporary_exception** | Phase 27+ | LR-03 | Same shape as LR-02. |
| `server/operators/provider-hub.ts:78` | Operators | Active | OpenAI SDK | `process.env.OPENAI_API_KEY` (single var) | **temporary_exception** | Phase 27+ | LR-04 | Same shape as LR-02. |
| `server/data-analysis/omnirag-adapter.ts:57` | Data Analysis | Active | Custom OmniRAG HTTP | `process.env.OMNIRAG_API_KEY` | **temporary_exception** | Phase 27 | LR-05 | OmniRAG is a domain-specific service, not a Plan v3 provider. May be permanently exempted in Phase 27's classification call. |
| `server/code-studio/opencode/provider-sync.ts:96` | Code Studio | Active | `process.env[envVar] = config.apiKey` for spawned tools | Writes env (not reads at runtime) | **temporary_exception** | Phase 27 | LR-09 (NEW) | Sets env vars on a spawned subprocess. D1 covers reading; this is writing. Decision pending: classify as out-of-scope (subprocess env handoff is a different surface) or as a violation. |

### Removed paths

None yet.

---

## New LR entries this matrix introduces

The following entries should be added to `LEGACY_EXCEPTION_REGISTER.md` as part of the Phase 19 PR:

- **LR-08** — `server/chat/stream.ts` and `server/automation/block-executors.ts:executeRunAgent`. Shared because they both consume `getProviderRegistry()`, which is what the boot-time `autoProvisionProviders()` (LR-06) seeds. Closing LR-06 alone does NOT close LR-08; the providers registry is loaded lazily.
- **LR-09** — `server/code-studio/opencode/provider-sync.ts:96`. Writes provider env vars onto a spawned-subprocess environment. The classification decision is **deferred to Phase 27** because it's a different surface than runtime reads.

---

## Phase 19 actions

This is a docs-only phase. No code changes ship in this PR. The follow-ups it triggers:

1. Add LR-08 + LR-09 rows to `LEGACY_EXCEPTION_REGISTER.md`.
2. Update LR-01 register entry to point at this matrix for the surface-narrowing claim (Phase 17/18 already did the narrowing; Phase 19 documents it formally).
3. Phase 27 (Agent Studio raw-key surface elimination) inherits a clear punch list: delete `resolveProviderApiKey` once `services/simulation.ts` migrates; delete the `runChatWithTools` legacy branch once every legacy fixture has a binding; migrate `/api/chat/stream` and `block-executors.executeRunAgent` to Model Access; reclassify LR-02/03/04/05/09.
