# Phase 27.6 — Simulation Engine Decision

**Captured:** 2026-05-05 against `fix/pmb-phase-27-runtime-provider-key-surface`.
**Owner:** Governance role per AGENTS.md.

The simulation engine is the last LR-01 caller of `resolveProviderApiKey` after 27.3 (streaming Expert chat) and 27.5 (chat.ts fallbacks) close. Per the brief, it must be **migrated, retired, or explicitly exceptioned with a deadline** — no vague "out of scope."

---

## Paths affected

`server/agent-studio/services/simulation.ts`

| Line | Call | Note |
|---|---|---|
| 808 | `runViaOpenAIDirect({ apiKey: endpoint.apiKey, ... })` | OpenAI SDK direct path. |
| 826 | `runViaOpenllmAgent({ apiKey: endpoint.apiKey, wsUrl, ... })` | WebSocket bridge to the openllm-agent2 runtime. |

Both `endpoint.apiKey` values come from `resolveOpenllmEndpoint(providerConfig)` (in `openllm-runtime-adapter.ts:336`), which itself reads `providerConfig.apiKey` and falls back to `process.env[*_API_KEY]` via `resolveProviderApiKey`. After 27.2 the `providerConfig.apiKey` field is stripped at write-time and at-rest, so the live source is `process.env[*]`.

Adapter source files (referenced from these call sites):

- `server/agent-studio/adapters/openai-direct-adapter.ts:67` — `runViaOpenAIDirect` definition.
- `server/agent-studio/adapters/openllm-runtime-adapter.ts:480` — `runViaOpenllmAgent` definition.

---

## Three options

### A — Extend Model Access with streaming/MCP-bridge support and migrate

**Cost:** large. Requires:

- A new Model Access surface that owns the WebSocket bridge to `openllm-agent2` (currently the bridge lives in the AS adapter and assumes raw apiKey + ws URL).
- A streaming-with-tool-calls primitive on Model Access (today: chat-stream is non-streaming for tools; simulation expects token-by-token + permission resolver hooks + MCP server bridge).
- The `permissionResolver` callback shape needs to flow through Model Access without leaking AS internals.

**Scope:** new D2 facade work. Outside Phase 27's "elimination" scope; this is a Phase 28+ build.

### B — Retire direct-provider simulation mode

**Cost:** small. Requires:

- Make `simulation.run()` refuse to use `runViaOpenAIDirect` / `runViaOpenllmAgent` when the agent has no `binding_v1`.
- Direct simulation produces a deterministic "no live runtime available" result, or simulates against the existing mock provider fixture only.
- Live simulation (i.e. against a real provider) becomes test-run territory only — already migrated in Phase 16.

**Effect on users:** any operator running a "live mode" simulation outside the binding picker UI loses that path. Phase 14's picker UI is the one supported way to attach a provider; simulation falls back to mock-only.

**Risk:** unknown — depends on how heavily simulation's live mode is used. The test suite does cover the runtime branch (`simulation.test.ts`), so retirement requires updating those tests too.

### C — Mark as TEMPORARY_EXCEPTION_WITH_DEADLINE

**Cost:** zero (documentation only).

The legacy register's LR-01 entry already names simulation as the "last LR-01 caller". This decision formalizes:

- The exception scope is exactly the two adapter call sites at `simulation.ts:808` and `:826`.
- The deadline is the same Phase 28 batch that owns LR-02/03/04/06/08.
- The acceptance criterion for closing the exception is "Model Access exposes a streaming-with-tool-calls + MCP-bridge primitive that simulation can call via gatewayCall."

---

## Decision

**Option C — TEMPORARY_EXCEPTION_WITH_DEADLINE.**

Rationale:

1. Option A is real work that doesn't fit Phase 27's "eliminate the surface" scope; it's a Model Access feature build, not a surface elimination. Doing it inside Phase 27 would balloon the PR.
2. Option B retires a feature that the test suite covers, which would force test updates and a separate decision about whether live-mode simulation should exist at all. That's a feature-deprecation conversation, not a security-cleanup conversation.
3. Option C is honest: simulation is the last LR-01 caller, the underlying constraint is real (Model Access doesn't expose the WS-bridge primitive yet), and the deadline names the work that closes the exception.

Per the brief's matrix-cap rule (no more than one new exception in 27.4), simulation is the **single Phase 27 exception**. Items 5–11 in the 27.4 decision matrix are pre-existing register entries with deadlines flipped from "Phase 27" to "Phase 28"; none of them count as new.

---

## Deadline

**Phase 28 — Model Access streaming-with-tool-calls + MCP-bridge primitive.**

Acceptance for that future phase will be:

- `openRouter.modelAccess.stream` accepts `tools[]` and yields tool-call deltas in addition to text deltas.
- `openRouter.modelAccess.executeWithMcpBridge` (or equivalent) exposes the openllm-agent2 WS bridge primitive, scoped by `providerConnectionId`, with a permission-resolver callback shape.
- Simulation migrates both call sites to gatewayCall.
- LR-01's simulation exception is removed from the register.

Until that lands, the existing `scripts/check-provider-key-env-boundary.ts` allowlist for `server/agent-studio/adapters/**` remains in place, scoped to the simulation paths. 27.7 narrows the comment on that allowlist entry to name simulation specifically.

---

## Tests required when this exception closes

When Phase 28 lands and migrates simulation:

- `server/agent-studio/services/simulation.test.ts` — assert that `simulation.run()` calls `gatewayCall("openRouter.modelAccess.streamWithTools", ...)` (or equivalent) when `useDirectOpenai === true`.
- A new boundary test in `tests/pmb/boundary.test.ts` invariant 5 extension: scan all of `server/agent-studio/**` for `process.env[*_API_KEY]` patterns and `new OpenAI({apiKey})` instantiations; expect zero matches.
- Removal of the LR-01 row from `LEGACY_EXCEPTION_REGISTER.md`.

---

## Acceptance check for 27.6

- [x] **Decision recorded.** Option C — TEMPORARY_EXCEPTION_WITH_DEADLINE.
- [x] **Rationale given.** Three-option evaluation above.
- [x] **Paths affected named.** `simulation.ts:808, 826` + the two adapter functions.
- [x] **Deadline.** Phase 28, with explicit acceptance criteria.
- [x] **Tests required when exception closes.** Listed.
- [x] **Phase 27 exception count = 1**, used by simulation.
