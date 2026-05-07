# Model Access — Tool-Loop / openllm-agent Bridge Decision Record

**Captured:** 2026-05-07 against `main@4522dc7` (post-Phase-28.4 merge).
**Branch:** `docs/pmb-phase-28-6a-tool-loop-decision`.
**Owner:** Builder + Governance roles per AGENTS.md.

---

## TL;DR

Phase 28.7 will migrate `agent-studio/services/simulation.ts:808, 826` (the LR-01 simulation exception) onto Model Access. Investigation during 28.6 prep revealed:

1. **`runViaOpenAIDirect` (line 808) is non-streaming, single-turn.** It does not need a new "streaming-with-tool-calls" primitive — the existing `openRouter.modelAccess.execute` already covers this exact shape.

2. **`runViaOpenllmAgent` (line 826) is the actual complexity.** It is an openllm-agent2 WebSocket bridge with a **`permissionResolver` callback**, MCP-server `configure_session` handshake, and a stream of typed events (tokens / permission_request / policy_events / session_configured / done). The 6-minute timeout accommodates a 5-minute permission poll + 1-minute slack.

The plan's framing ("streaming-with-tool-calls + MCP-bridge primitives") was based on the Phase 27.6 simulation decision doc; reality is narrower. **Phase 28.6 needs only one new primitive: an openllm-agent bridge in Model Access.** No streaming-with-tool-calls primitive is needed by any current consumer.

This doc locks the bridge primitive's shape.

---

## Locked decisions

### D-MA-TOOL-1 — Primitive shape: direct-import async function

The bridge primitive is exposed as a **direct-import** function from `server/openrouter/model-access`, mirroring the existing `stream()` precedent. It is **not** wrapped as a gateway-callable action.

```ts
// server/openrouter/model-access/run-via-openllm-bridge.ts
export async function runViaOpenllmBridge(
  input: RunViaOpenllmBridgeInput,
): Promise<RunViaOpenllmBridgeResult>;
```

Reason: `permissionResolver` is a function-valued argument (see D-MA-TOOL-3 for its shape). Functions cannot pass through gateway-call serialization. The existing `stream()` precedent (also direct-import for the same kind of stateful-flow reason — async iteration) establishes that direct-import is acceptable inside Model Access for flows that don't fit the gateway-call shape.

The `manifest.ts` gateway-call wrapper for this primitive is **deliberately omitted** — there is no equivalent of the lossy single-result wrapper that `stream()` has, because the bridge's permission flow can't run without a live caller-supplied resolver.

Consumers that want the bridge through gateway-call must either:
- (a) Provide a fixed permission-resolver shape (e.g., always auto-allow / always auto-deny / route through governance approval) — out of scope for Phase 28; future amendment.
- (b) Import directly. This is what simulation does in 28.7.

### D-MA-TOOL-2 — Where the bridge lives

`server/openrouter/model-access/run-via-openllm-bridge.ts`. Inside Model Access subtree.

Reason: the bridge needs `withProviderCredential` to resolve the credential (D2 boundary requirement: only this subtree may import the credential resolver). Putting the bridge anywhere else would require either re-locating the credential resolver (large blast radius) or exposing decrypted credentials through a non-Model-Access surface (security boundary violation).

The existing `agent-studio/adapters/openllm-runtime-adapter.ts` shrinks: it loses `runViaOpenAIDirect` and `runViaOpenllmAgent` (deleted in 28.7); retains URL derivation helpers (`deriveOpenllmWsUrl`) and shared types that simulation re-imports. The `resolveProviderApiKey` function in that file becomes dead code in 28.7 — also deleted.

### D-MA-TOOL-3 — `permissionResolver` callback contract

Same shape as today. The bridge accepts a function:

```ts
type PermissionResolver = (
  request: PermissionRequestEvent,
) => Promise<PermissionDecision>;

interface PermissionRequestEvent {
  requestId: string;
  toolName: string;
  riskClass: string;
  arguments: unknown;
  timeoutMs: number;
}

type PermissionDecision =
  | { kind: "allow" }
  | { kind: "deny"; reason: string }
  | { kind: "ask"; pollUntilMs: number };
```

Caller is responsible for:
- Ensuring the resolver returns within the agreed `timeoutMs` (or the bridge auto-denies).
- Tracking permission events on its side (the bridge does NOT persist them — it forwards them in the result's `permissionEvents` array).

The simulation engine's existing `trackingResolver` pattern continues to work unchanged: the engine wraps an inner resolver with telemetry/tracking and passes the wrapper through.

### D-MA-TOOL-4 — Input/output shape

Mirror the existing `OpenllmRuntimeRequest` / `OpenllmRuntimeResult` shapes from `server/agent-studio/adapters/openllm-runtime-adapter.ts`. The new types live in Model Access (`server/openrouter/model-access/types.ts`); the adapter file in Agent Studio re-exports them for back-compat:

```ts
interface RunViaOpenllmBridgeInput {
  // Provider Connections — replaces today's `wsUrl + apiKey + provider + model`
  providerConnectionId: number;
  modelRef: string;

  // Same as today
  message: string;
  timeoutMs?: number;
  permissionResolver?: PermissionResolver;
  mcpServers?: McpServerSpec[];
  mcpScope?: "managed" | "system";

  // Identity for governance/telemetry
  intent: ModelAccessIntent;
  workspaceId: number;
  actorId: number;
  correlationId?: string;
}

interface RunViaOpenllmBridgeResult {
  ok: boolean;
  text: string;
  tokenCount: number;
  durationMs: number;
  error?: string;
  finalizedNormally: boolean;
  usage?: ModelAccessUsage;
  permissionEvents: PermissionEvent[];
  policyEvents: PolicyEvent[];
  sessionConfig: SessionConfigResult | null;
  correlationId?: string;
}
```

Inside the primitive, `withProviderCredential(providerConnectionId, ...)` resolves to `{baseUrl, authHeaders, providerType}`. The bridge derives the WebSocket URL from `baseUrl` (using the existing `deriveOpenllmWsUrl(baseUrl)` helper, which we move from the adapter to Model Access alongside the bridge). The `apiKey` for the WebSocket handshake is extracted from `authHeaders.Authorization` (`"Bearer <key>"` → `<key>`), since that's the same shape openllm-agent2's WS protocol expects.

### D-MA-TOOL-5 — Receipt policy

Same hybrid policy as `execute` / `stream` / `embed`: `intent === "agent-test"` is exempt; other intents require `governanceReceiptId`.

But: the bridge is **not** exposed via gateway-call (D-MA-TOOL-1), so the manifest's `enforceModelAccessReceipt` doesn't gate it. Instead, the bridge function itself takes `intent` in its input and enforces the receipt-or-test rule **inline**:

```ts
if (input.intent !== "agent-test") {
  // Require the caller to have already passed receipt validation
  // upstream. The bridge cannot itself check `sealed.governanceReceiptId`
  // because there is no sealed context — it's a direct call.
  // See PHASE_28_TOOL_LOOP_DECISION.md §5 for the receipt-flow
  // contract for direct-import primitives.
}
```

For Phase 28.7, simulation always uses `intent="agent-test"` (test runs are exempt anyway). For future non-test consumers, the convention will be: callers ensure they've passed governance gating before calling the direct-import primitive. The compile-time signal is that the input requires `intent` + `workspaceId` + `actorId` — these are the same fields gateway-call enforces.

### D-MA-TOOL-6 — MCP server lifecycle

Unchanged from today. The caller passes `mcpServers: McpServerSpec[]` (and an `mcpScope`); the bridge sends `configure_session` if the array is non-empty (D-CAG-RECON-6 / Phase 18 decision #8b). When empty, no `configure_session` is sent — the WebSocket runs in pre-Phase-18 mode.

The MCP-server type (`McpServerSpec`) lives in `server/agent-studio/services/cag/` today; we lift it to a shared location (`server/agent-studio/types/mcp.ts` or similar) so Model Access can import without violating the AS internal-types boundary. **Decision-call:** if relocation requires touching CAG types, defer the relocation and have Model Access re-export the type via a barrel — same shape as the adapter does today. Locked: **re-export, don't relocate.**

### D-MA-TOOL-7 — What this primitive does NOT do

- Does **not** handle multi-turn tool loops where the model emits `tool_call` and the caller re-injects `tool_result` over multiple turns. That's a separate "streaming-with-tool-calls" primitive that **no current consumer needs**. Building it now is YAGNI.
- Does **not** support providers other than openllm-agent2. The WebSocket protocol is openllm-agent2-specific; calling this primitive with a Provider Connection that doesn't have an openllm-agent2 worker will fail with `unsupported_provider_type` (mirror the embed primitive's pattern).
- Does **not** persist `permissionEvents` / `policyEvents` — those are returned to the caller for caller-side tracking (simulation already persists them via its own logic).

### D-MA-TOOL-8 — Test strategy

- New test file `server/openrouter/model-access/run-via-openllm-bridge.test.ts`.
- Mock `withProviderCredential` and the global `WebSocket` constructor.
- Tests:
  - Happy path (single token + done).
  - Permission flow: bridge invokes resolver on `permission_request`, sends decision, completes.
  - Permission timeout: bridge auto-denies if resolver doesn't return.
  - WebSocket connect failure: returns `ok: false` with `error` set.
  - WebSocket protocol error: same.
  - 6-minute timeout: bridge resolves with `ok: false` after timer fires.
  - MCP `configure_session` is sent when `mcpServers` non-empty; not sent when empty.
  - `unsupported_provider_type` when provider connection is OpenAI / Anthropic (not openllm-agent2 backed).

These tests are functionally equivalent to the existing tests for `runViaOpenllmAgent` in `agent-studio/adapters/__tests__/openllm-runtime-adapter.test.ts` (or wherever they live today); the new file is a relocate-and-rewire, not a from-scratch test build.

---

## Why this differs from the original plan

`PHASE_28_EXECUTION_PLAN.md` §28.6 named **two** primitives — streaming-with-tool-calls + MCP-bridge — and described their wire shapes in tentative terms. Investigation surfaced:

1. **The streaming-with-tool-calls primitive has no consumer.** Simulation's two call sites are: (a) non-streaming single-turn (`runViaOpenAIDirect`), already covered by `execute`; and (b) the openllm-agent WebSocket bridge (`runViaOpenllmAgent`). There is no third site that needs token-by-token + tool-call deltas. Building it now violates "don't add features beyond what the task requires."

2. **The MCP-bridge primitive cannot be gateway-callable** because of the `permissionResolver` callback. The existing `stream()` precedent gives us a clean pattern (direct-import async function inside Model Access subtree) — we use it.

3. **Receipt enforcement for direct-import primitives** needs an explicit contract — the `enforceModelAccessReceipt` helper is gateway-only. D-MA-TOOL-5 names the contract: callers gate themselves upstream; the primitive accepts `intent` and trusts the call.

This is the **fifth** scope reality check in the Phase 28 batch (after 28.1 LR-09 already-fixed, 28.2 LR-06 downstream readers, 28.3 LR-08 routing-layer, 28.4 LR-04 reclassification). The pattern is consistent: when locking primitive shapes, walk the actual call sites first; the register and earlier plan docs describe scope at write-time, not at execution-time.

---

## What this PR changes

This PR is **docs-only** (28.6a). It locks the design above. Implementation lands as 28.6b.

Files:

- new `MODEL_ACCESS_TOOL_LOOP_DECISION.md` (this doc)
- `PHASE_28_EXECUTION_PLAN.md` — 28.6 scope updated to reflect "one primitive, not two"; sub-phase split into 28.6a (this) + 28.6b (implementation) + 28.6c (tests bundled into 28.6b)
- `MODEL_ACCESS_CONTRACT.md` — note the new direct-import surface (will land formally in 28.6b)

---

## Acceptance criteria (28.6a)

- [x] Decision doc landed.
- [x] All 8 D-MA-TOOL-* decisions named and rationale captured.
- [x] Plan doc reflects narrowed scope (1 primitive, not 2).
- [x] No code changes; lint clean.

---

## What 28.6b will ship

- `server/openrouter/model-access/run-via-openllm-bridge.ts` (~300 LOC, mostly mechanical relocate-and-rewire from the existing adapter).
- `server/openrouter/model-access/run-via-openllm-bridge.test.ts` (~250 LOC, mirror of the existing adapter tests).
- `types.ts` additions for `RunViaOpenllmBridgeInput` / `RunViaOpenllmBridgeResult` / re-exported `PermissionResolver` etc.
- `index.ts` re-export.
- `agent-studio/adapters/openllm-runtime-adapter.ts` shrinks (delete `runViaOpenllmAgent`, `runViaOpenAIDirect`, `resolveProviderApiKey`; retain `deriveOpenllmWsUrl` until simulation no longer imports it from there).
- `MODEL_ACCESS_CONTRACT.md` — final formal entry.

28.6b lands as a single PR after this 28.6a PR merges.
