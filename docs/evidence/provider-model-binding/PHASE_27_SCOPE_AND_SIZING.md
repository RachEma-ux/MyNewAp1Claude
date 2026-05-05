# Phase 27 — Scope and Sizing Report

**Captured:** 2026-05-05 against `main@2eefe2e` (post-Direction-A audit, pre-27.2).
**Branch:** `fix/pmb-phase-27-runtime-provider-key-surface`
**Owner:** Reviewer + Tester roles per AGENTS.md.

---

## 1. DB-row counts — BLOCKED (no DB available on this device)

This device is the AGENTS.md/CLAUDE.md "device workflow" host: no DB, no live runtime. Per the prompt, DB-row counts are explicitly marked **BLOCKED** and the 27.5 strategy is therefore decided from static evidence + the safest-default rule.

| # | Required count | Status | Source / replacement |
|---|---|---|---|
| 1 | Agent Studio agents with `binding_v1` row | BLOCKED — DB unavailable | Static: `ags_agent_provider_bindings` schema exists; counts available only by running `psql` against ASDB. |
| 2 | AS agents with `legacy_unresolved` bindings | BLOCKED — DB unavailable | Same as above. |
| 3 | AS agents with no provider binding row | BLOCKED — DB unavailable | Same as above. |
| 4 | Drafts with `providerConfig.apiKey` | BLOCKED — DB unavailable | **Static fixture inventory below — LK-02, LK-03 prove apiKey/apiKeyEnvVar are present in fixture data.** |
| 5 | Drafts with `providerConfig.apiKeyEnvVar` | BLOCKED — DB unavailable | Same as above. |
| 6 | `ags_agent_releases` rows whose snapshot config contains `providerConfig.apiKey` | BLOCKED — DB unavailable | **No code path checked or normalizes release snapshots; assume parity with drafts at release time.** |
| 7 | `ags_agent_releases` rows whose snapshot config contains `providerConfig.apiKeyEnvVar` | BLOCKED — DB unavailable | Same as above. |
| 8 | Active/published agents that would break if legacy fallback were hard-blocked today | BLOCKED — DB unavailable | **Cannot prove safety of hard-block.** Default decision is in §3 below. |

**Implication for 27.5:** because the unbound-agent count is unknown, the safer default is **27.5a (migration helper) + 27.5b (deferred fallback removal)**, not 27.5 hard-block today. See §3.

---

## 2. Static code inventory

### 2.1 LR-01 — Agent Studio raw OpenAI / `resolveProviderApiKey` path

`resolveProviderApiKey` definition lives at:

| File | Line | Use |
|---|---|---|
| `server/agent-studio/adapters/openllm-runtime-adapter.ts` | 311 | Definition (reads `process.env[pc.apiKeyEnvVar]` and `process.env[PROVIDER_ENV_VAR[provider]]`). |
| `server/agent-studio/adapters/openllm-runtime-adapter.ts` | 352 | Self-call inside `resolveOpenllmEndpoint`. |

Live callers:

| File | Line | Where in flow |
|---|---|---|
| `server/agent-studio/chat-stream.ts` | 552 | Streaming Expert chat — handler `handleAgentStudioChatStream`, mounted at `/api/agent-studio/chat/stream`. **D-1 surface.** |
| `server/agent-studio/services/chat.ts` | 985 | Legacy `sendChatMessage` — non-binding fallback. |
| `server/agent-studio/services/chat.ts` | 169 (def) / 1021 (call site) | Legacy `runChatWithTools` — tool-equipped non-binding fallback. **D-2 surface.** |

`new OpenAI(...)` instantiations under `server/agent-studio/`:

| File | Line | Notes |
|---|---|---|
| `server/agent-studio/chat-stream.ts:580` | streaming Expert chat | LR-01. Closes via 27.3. |
| `server/agent-studio/services/chat.ts:179` | legacy `runChatWithTools` body | LR-01. Closes via 27.5. |

`resolveProviderApiKey` is also imported but **only mocked** in `server/agent-studio/services/chat-binding.test.ts`. No production runtime use beyond the three callers above.

`runViaOpenAIDirect` / `runViaOpenllmAgent` (simulation engine):

| File | Line | Use |
|---|---|---|
| `server/agent-studio/adapters/openai-direct-adapter.ts:67` | `runViaOpenAIDirect` definition. |
| `server/agent-studio/adapters/openllm-runtime-adapter.ts:480` | `runViaOpenllmAgent` definition. |
| `server/agent-studio/services/simulation.ts:808, 826` | Both call sites. |

Simulation is **the last LR-01 caller** that the runtime path migration matrix names as needing a Model Access streaming-with-MCP-bridge contract — see 27.6 decision.

### 2.2 LR-02 / LR-03 / LR-04 — embeddings / documents / operators

| ID | File | Line | Pattern |
|---|---|---|---|
| LR-02 | `server/embeddings/service.ts` | 54 | `process.env.OPENAI_API_KEY` then `new OpenAI({ apiKey })` (line 59). |
| LR-03 | `server/documents/processor.ts` | 339 | `if (process.env.OPENAI_API_KEY) { ... }`. |
| LR-04 | `server/operators/provider-hub.ts` | 78 | `const apiKey = process.env.OPENAI_API_KEY;`. |

Each is a single hard-coded-var read; no dynamic indirection. None touch Agent Studio.

### 2.3 LR-06 — `autoProvisionProviders()` boot seed

| File | Line | Use |
|---|---|---|
| `server/_core/index.ts:113` | `ENV_PROVIDER_MAP` — `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `GROQ_API_KEY`. |
| `server/_core/index.ts:120` | `autoProvisionProviders()` definition. |
| `server/_core/index.ts:126` | `process.env[envKey]` read. |
| `server/_core/index.ts:184` | Call site at startup. |

Writes to the **legacy** `providers` table (lines 133–139), not to `provider_connections`. Encrypts the value with `encrypt(apiKey)` before storing. This is the **only** intended runtime env-key reader (boot-time seed); the violation is the *target table* (legacy `providers` instead of `provider_connections`), not the read itself.

### 2.4 LR-08 — `/api/chat/stream` and automation `executeInvokeAgent`

| ID | File | Line | Use |
|---|---|---|---|
| LR-08 (chat) | `server/chat/stream.ts:3` import + `:70` `getProviderRegistry()` call | The legacy `/api/chat/stream` handler. Mounted at `_core/index.ts:879`. |
| LR-08 (automation) | `server/automation/block-executors.ts:227` (`getProviderRegistry()` call inside `executeInvokeAgent` at line 202) | **Function name correction:** the brief and the register say `executeRunAgent`; the actual function is `executeInvokeAgent`. Same code path. |

Both consume `getProviderRegistry()`. The registry is seeded by `autoProvisionProviders()` (LR-06) and contains decrypted-on-construct provider clients — no `process.env` read at the call site, but the registry itself was minted from env at boot.

### 2.5 LK-01 — `ags_agent_drafts.providerConfig` jsonb

| File | Line | Detail |
|---|---|---|
| `drizzle/tables/agent-studio.ts:119` | `providerConfig: jsonb("provider_config").$type<Record<string, unknown>>().default({})` — column comment explicitly says "apiKey is encrypted at rest by the platform encryption helpers." |

Consumers reading `providerConfig.apiKey` / `providerConfig.apiKeyEnvVar`:

| File | Line | Use |
|---|---|---|
| `server/agent-studio/adapters/openllm-runtime-adapter.ts:316–322` | `pc.apiKey` literal + `pc.apiKeyEnvVar` env-var-name path. |
| `server/agent-studio/seeds/openllm-agent2-defaults.ts:131` | Default seed sets `apiKeyEnvVar`. (LK-03) |
| `server/agent-studio/db/seed-legacy-fixtures.ts:36–191` | Five fixtures with `providerConfig.apiKeyEnvVar`. (LK-02) |

### 2.6 OmniRAG (LR-05)

| File | Line | Use |
|---|---|---|
| `server/data-analysis/omnirag-adapter.ts:57` | `process.env.OMNIRAG_API_KEY`. |

LR-05 is **not a provider key** — it is a domain-service auth token. The Phase 5 boundary script's `NON_PROVIDER_KEYS` set already exempts `OMNIRAG_API_KEY`. **Out of Phase 27 scope** — no decision needed. Documented here for completeness.

### 2.7 LR-09 — Code Studio opencode subprocess env-write (write, not read)

| File | Line | Use |
|---|---|---|
| `server/code-studio/opencode/provider-sync.ts:96` | Writes `process.env[envVar] = config.apiKey` onto a spawned-subprocess environment. |

LR-09 is a **subprocess env handoff**, not a runtime env read. The decision to migrate it would require a subprocess-credential-injection alternative that the opencode CLI doesn't currently support. **Phase 27.4 will classify this as `TEMPORARY_EXCEPTION_WITH_DEADLINE` (single allowed exception per the cap rule).**

---

## 3. 27.5 strategy decision (driven by §1 BLOCKED rows)

Decision rule from the prompt:

> If unbound active agents are rare → hard-block.
> If unbound active agents are common → ship 27.5a migration helper first, defer 27.5b.

**Decision: 27.5a (migration helper) + deferred 27.5b (fallback removal).**

Rationale:

1. The unbound-agent count cannot be measured on this device.
2. Static evidence shows the seed fixtures (LK-02, LK-03) ship with `apiKeyEnvVar`, so any environment that has run the seed has at least one unbound legacy agent reachable through the legacy path.
3. Hard-blocking without a backfill helper would silently break dev/staging seeds and any production agent that hasn't been re-bound through the Phase 14 picker.
4. The helper-first path is the safer default; the brief explicitly authorizes it as the conditional path.

This matches the brief's risk callout R-2 ("cap exceptions in 27.4 at one") in spirit — deferring 27.5b to a labeled follow-up commit prevents the fallback from becoming a permanent unflagged exception.

---

## 4. Summary table

| Surface | Register ID | File(s) | Phase 27 sub-phase | Status at 27.1 |
|---|---|---|---|---|
| Streaming Expert chat | LR-01 | `agent-studio/chat-stream.ts` | 27.3 | Pending |
| Legacy `sendChatMessage` no-binding fallback | LR-01 | `agent-studio/services/chat.ts:985` | 27.5 | Pending |
| Legacy `runChatWithTools` no-binding fallback | LR-01 | `agent-studio/services/chat.ts:169 / 1021` | 27.5 (hard-block via degraded error) + 27.5a (helper) | Pending |
| Simulation engine | LR-01 (shared) | `agent-studio/services/simulation.ts:808, 826` + adapters | 27.6 | Decision required |
| `providerConfig` jsonb (drafts + seeds + releases) | LK-01 / LK-02 / LK-03 | `drizzle/tables/agent-studio.ts:119` + seed files | 27.2 | Pending |
| Embeddings | LR-02 | `embeddings/service.ts:54, 59` | 27.4 decision | Pending decision |
| Documents | LR-03 | `documents/processor.ts:339` | 27.4 decision | Pending decision |
| Operators | LR-04 | `operators/provider-hub.ts:78` | 27.4 decision | Pending decision |
| `autoProvisionProviders` boot seed | LR-06 | `_core/index.ts:113–145, 184` | 27.4 decision | Pending decision |
| `/api/chat/stream` | LR-08 | `chat/stream.ts:3, 70` | 27.4 decision | Pending decision |
| Automation `executeInvokeAgent` | LR-08 | `automation/block-executors.ts:202–270` | 27.4 decision | Pending decision |
| Code Studio opencode subprocess env-write | LR-09 | `code-studio/opencode/provider-sync.ts:96` | 27.4 — single TEMPORARY_EXCEPTION_WITH_DEADLINE | Pending |
| OmniRAG | LR-05 | `data-analysis/omnirag-adapter.ts:57` | Out of scope (NON_PROVIDER_KEYS) | NOT APPLICABLE |

---

## 5. Acceptance check for 27.1

- [x] Sizing report exists at this path.
- [x] Every known LR/LK surface is listed with file paths and line numbers.
- [x] Unbound-agent count is **explicitly BLOCKED** with reason (DB unavailable).
- [x] Release snapshot raw-key count is **explicitly BLOCKED** with reason.
- [x] 27.5 strategy is selected from evidence (helper-first path, not preference).
- [x] Function-name correction logged: register says `executeRunAgent`, actual code is `executeInvokeAgent`.
- [x] Out-of-scope items (LR-05, LR-09) are explicitly classified.
