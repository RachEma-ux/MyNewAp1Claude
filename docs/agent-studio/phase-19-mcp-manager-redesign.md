# Phase 19 — MCP Manager Redesign

**Status:** Planner deliverable (per AGENTS.md). Builder may NOT start until the user confirms the decision points in §7. **All decisions accepted at defaults per user "yes" on 2026-04-09.**

**Baseline:** This repo at commit `93f5a2e` (Phase 18 fully shipped — MyNewAp1Claude side of the openllm-agent2 MCP unlock complete; the openllm-agent2 fork patch itself is the user's pending manual step).

**Constraint:** Scenario B confirmed — isolated agents per module, no cross-talk. Connection sharing drops in priority; dispatcher + FSM rise.

**Goal:** evolve `services/mcp/mcp-manager.ts` from a single-file singleton into 3 thin layers, each independently shippable, with **zero behavior change for existing callers** (the public API stays compatible at every step).

---

## 1. Why this exists

Two architectural facts the user surfaced after the original "don't redesign" answer:

1. **Agent-per-module is the planned architecture** → many concurrent agent loops, each with its own MCP bindings. The current process-wide singleton with one flat connection map starts leaking concerns the moment you have ≥3 modules running agents.
2. **The governance module already exists** → MCP tool invocations should flow through it as a first-class enforcement point, not via ad-hoc audit calls scattered across `simulation.ts` and `governance-adapter.ts`.

This redesign closes both gaps. It does NOT add new MCP capabilities, transports, or features — it's pure architectural cleanup that unblocks future work.

---

## 2. Target state

```
┌─────────────────────────────────────────────────────────┐
│  dispatcher.ts        ← Phase 19a (the keystone)        │
│  one function: dispatchMcpToolCall(req) → result        │
│  validates · authorizes · governance pre/post · audits  │
│  every MCP tool call in the codebase goes through here  │
├─────────────────────────────────────────────────────────┤
│  state-machine.ts     ← Phase 19b                       │
│  pure FSM: ConnectionState union + transition()         │
│  events: onConnect/onDisconnect/onAuthRequired/onError  │
│  string status column becomes the persistence projection│
├─────────────────────────────────────────────────────────┤
│  registry.ts          ← Phase 19c                       │
│  versioned snapshots: tools/prompts/resources frozen    │
│  bumped on tools/list_changed notifications             │
│  dispatcher reads from snapshot, not from live conn     │
├─────────────────────────────────────────────────────────┤
│  mcp-manager.ts       ← unchanged public API            │
│  thin orchestrator: drives the FSM, owns the connection │
│  Map, exports the same connectMcpServer/disconnect/etc. │
├─────────────────────────────────────────────────────────┤
│  transports/{stdio,http,sse,websocket,sdk}.ts           │
│  unchanged except: each calls registry.publishSnapshot()│
│  after its initial discovery RPCs (Phase 19c only)      │
└─────────────────────────────────────────────────────────┘
```

**Sandbox** (the 4th layer in the original design) stays parked. Single trigger to revisit: 3rd-party MCP marketplace where users install untrusted servers. Today, all MCP servers are user-attached on a single-trust-boundary host.

---

## 3. Phase breakdown

| Phase | Layer | New LOC | Modified LOC | Files touched | Independently shippable |
|---|---|---|---|---|---|
| **19a** | Dispatcher | ~290 | ~80 | 1 new + 3 modified | **Yes — ship first** |
| **19b** | Connection FSM | ~260 | ~120 | 2 new + 3 modified | Yes — depends on 19a only for the audit hook |
| **19c** | Versioned Registry | ~180 | ~90 | 1 new + 6 modified | Yes — no caller-visible changes |
| **19d** | Sandbox | — | — | — | **Parked** |
| **Total** | | **~730** | **~290** | | **3 commits, single PR** |

Each phase is reviewable on its own. No flag-day rewrite, no schema migration, no data backfill.

---

## 4. Phase 19a — Dispatcher (the keystone)

### 4.1 Goal

A single function `dispatchMcpToolCall(req)` that is the **only** way MCP tools get invoked anywhere in the codebase. Replaces ~5 scattered call sites with one well-typed entry point that owns:

1. Input validation
2. Tool name parsing (`mcp__serverName__toolName`)
3. Server lookup + state check
4. Tool existence check
5. Per-agent `allowedTools` authorization
6. Governance pre-invoke evaluation
7. Actual `conn.callTool()` invocation
8. Error normalization
9. Latency + cost capture
10. Governance post-invoke evaluation
11. Audit row write to `runtime_policy_events`
12. Event emission for streaming UIs
13. Structured result return

### 4.2 New files

#### `server/agent-studio/services/mcp/dispatcher.ts` (~250 lines)

Public API:

```typescript
export interface DispatchMcpToolCallInput {
  /** The agent draft this call belongs to (for allowedTools + audit) */
  agentDraftId: number
  /** The runtime run row this call attaches to (for audit linkage) */
  runtimeRunId?: number
  /** Tool name in mcp__server__tool format */
  toolName: string
  /** Tool arguments — validated against the tool's input schema */
  args: Record<string, unknown>
  /** Where the call originated — affects audit attribution */
  source: "simulation" | "live_runtime" | "manual_test" | "subagent"
  /** User context for audit (optional in single-user mode) */
  caller?: { userId?: number; sessionId?: string }
}

export interface DispatchMcpToolCallResult {
  ok: boolean
  result?: unknown
  error?: {
    code:
      | "invalid_tool_name"
      | "server_not_found"
      | "server_not_connected"
      | "tool_not_found"
      | "not_authorized"
      | "governance_blocked"
      | "tool_execution_failed"
      | "internal_error"
    message: string
    details?: Record<string, unknown>
  }
  durationMs: number
  /** Audit row id in runtime_policy_events */
  auditId?: number
  /** Governance verdict for the pre-invoke check */
  governanceVerdict?: "allow" | "deny" | "warn"
}

export async function dispatchMcpToolCall(
  input: DispatchMcpToolCallInput
): Promise<DispatchMcpToolCallResult>
```

#### `server/agent-studio/services/mcp/dispatcher-types.ts` (~40 lines)

Pure type module — no runtime code. Re-exports the dispatcher input/output types and adds helper unions like `DispatchErrorCode`. Lets other modules import types without pulling in the dispatcher implementation.

### 4.3 Modified files

| File | Change |
|---|---|
| `server/agent-studio/services/simulation.ts` | Replace inline `mcp__` prefix handling (~50 lines around the tool dispatch loop) with a single `dispatchMcpToolCall(...)` call. Pass `source: "simulation"`. |
| `server/agent-studio/services/governance-adapter.ts` | Add (or rename) `evaluateMcpPreInvoke({ agentDraftId, toolName, args })` and `evaluateMcpPostInvoke({ agentDraftId, toolName, result, durationMs })`. These wrap the existing `evaluateGovernance` with MCP-specific event types. |
| `server/agent-studio/api/router.ts` (mcp router) | The "test invoke" admin button currently calls `mcpManager.callMcpTool` directly. Switch it to `dispatchMcpToolCall(..., source: "manual_test")` so even admin clicks get governance + audit. |
| `server/agent-studio/services/mcp/mcp-manager.ts` | `callMcpTool` stays exported but becomes a **shim** that calls the dispatcher with `source: "manual_test"` and a synthetic `agentDraftId: -1` (or throws if no agentDraftId is supplied — see §7 decision #2). Backward compat for any caller that hasn't migrated yet. |

### 4.4 Authorization model

The dispatcher reads the agent's allowedTools list once per call, in this order:

1. Look up the draft's `agsDraftPermissionRules` rows
2. Build a matcher (reusing `matchesToolPattern` from `simulation.ts:45` — we'll move it into a shared helper)
3. Match the incoming `toolName` against each rule
4. Verdict: `allow` / `deny` / `ask`
5. `ask` → for the dispatcher path, defaults to `deny` (the dispatcher is sync; "ask" requires the long-poll pending-request flow which only the simulation engine wires up). Leave a comment for future async support.

### 4.5 Governance integration

**Pre-invoke** — called BEFORE `conn.callTool`. Inputs: agentDraftId, toolName, args (sanitized of secrets if any rule says so), source. Output: allow/deny/warn + reason. If `deny`, the dispatcher short-circuits, writes an audit row with `governance_blocked`, and returns the structured error.

**Post-invoke** — called AFTER `conn.callTool` returns. Inputs: same as pre-invoke + durationMs + result preview (truncated to 4KB) + cost (if known). Output: allow/warn (no deny — the call already happened). The verdict goes into the audit row alongside the result.

This is the **single integration point** between MCP and governance. Today there are zero. After 19a, every MCP tool call is governed.

### 4.6 Audit format

One row per dispatched call written to `runtime_policy_events`:

```typescript
{
  runtimeRunId: number | null,
  ts: ISOString,
  source: "mcp_dispatch",
  toolName: string,
  serverName: string,
  agentDraftId: number,
  durationMs: number,
  preVerdict: "allow" | "deny" | "warn",
  postVerdict: "allow" | "warn" | null,
  errorCode: DispatchErrorCode | null,
  // The full args + result are NOT in the row — they go in payload jsonb
  payload: { argsPreview, resultPreview, cost, ... }
}
```

### 4.7 Test plan (Phase 19a)

`server/agent-studio/services/mcp/__tests__/dispatcher.test.ts` (~200 lines, ~12 cases):

1. Happy path — connected server, tool exists, allowedTools permits, governance allows → returns `ok:true` with result and audit row
2. Invalid tool name format → `invalid_tool_name`
3. Server not in connections map → `server_not_found`
4. Server in failed state → `server_not_connected`
5. Tool name not on the server's tool list → `tool_not_found`
6. allowedTools rejects → `not_authorized` + audit row written
7. Governance pre-invoke denies → `governance_blocked` + audit row + tool NOT invoked
8. `conn.callTool` throws → `tool_execution_failed` with the original error in `details`
9. Cost rollup — verify the audit row has the durationMs and cost (if returned)
10. Source attribution — verify `source: "manual_test"` flows into the audit row
11. Sanitization — verify args containing `apiKey: "..."` are redacted in the audit payload
12. Subagent call — verify a `subagent` source records the parent runtimeRunId correctly

---

## 5. Phase 19b — Connection FSM

### 5.1 Goal

Replace the implicit string-status-column-as-truth with an explicit discriminated union + pure transition function. The DB column stays — it just becomes a projection of `state.kind`. No schema change, no migration.

Today's bug this fixes: status flips happen in 4+ places (`connectMcpServer`, `disconnectMcpServer`, the auto-reconnect loop, OAuth callback). They race. After 19b, **every** transition goes through `transition(currentState, event) → nextState`.

### 5.2 The state union

```typescript
export type ConnectionState =
  | { kind: "pending" }
  | { kind: "connecting"; startedAt: number }
  | {
      kind: "connected"
      connectedAt: number
      toolCount: number
      promptCount: number
      resourceCount: number
    }
  | {
      kind: "needs_auth"
      reason: string
      authUrl?: string
      challengeReceivedAt: number
    }
  | {
      kind: "failed"
      reason: string
      lastAttemptAt: number
      attemptCount: number
      nextRetryAt?: number
    }
  | { kind: "disabled"; disabledAt: number }
```

### 5.3 The events

```typescript
export type ConnectionEvent =
  | { type: "connect_requested" }
  | { type: "connect_succeeded"; toolCount: number; promptCount: number; resourceCount: number }
  | { type: "connect_failed"; reason: string }
  | { type: "auth_required"; reason: string; authUrl?: string }
  | { type: "auth_provided" } // OAuth flow completed → retry connect
  | { type: "disconnect_requested" }
  | { type: "mid_session_disconnect"; reason: string }
  | { type: "disable_requested" }
  | { type: "enable_requested" }
```

### 5.4 The transition function

Pure, side-effect-free, ~60 lines:

```typescript
export function transition(
  current: ConnectionState,
  event: ConnectionEvent,
  now: number = Date.now()
): { next: ConnectionState; emit?: ConnectionEvent } {
  // explicit switch with every legal transition
  // throws on illegal transitions in dev, falls back to current state in prod
}
```

Illegal transitions in dev throw (catches state-machine bugs early); in prod they log + stay at current state (safety).

### 5.5 New files

- `server/agent-studio/services/mcp/state-machine.ts` (~200 lines) — pure FSM, no I/O, fully unit-testable
- `server/agent-studio/services/mcp/connection-events.ts` (~60 lines) — thin EventEmitter wrapper that wakes up subscribers on transitions

### 5.6 Modified files

| File | Change |
|---|---|
| `server/agent-studio/services/mcp/types.ts` | Add `ConnectionState` + `ConnectionEvent` exports |
| `server/agent-studio/services/mcp/mcp-manager.ts` | All status flips replaced with `transition(state, event)`. Holds an in-memory `Map<serverId, ConnectionState>` alongside the existing `Map<serverId, McpConnection>`. After each transition, calls `repo.updateMcpServerStatus(id, state.kind)` for the projection. |
| `client/src/pages/agent-studio/AgentMcpPage.tsx` | Render rich state instead of plain status string. `connecting` shows a spinner with elapsed time, `failed` shows reason + next-retry countdown, `needs_auth` shows the OAuth button inline |
| `server/agent-studio/api/router.ts` (mcp router) | New `getServerState(serverId)` query that returns the rich state object (not just the string) for the UI |

### 5.7 Test plan (Phase 19b)

`server/agent-studio/services/mcp/__tests__/state-machine.test.ts` (~150 lines, ~25 cases):

- Every legal transition from every starting state (one test each, ~20)
- Illegal transitions throw in dev mode
- Failed → connecting backoff math (`nextRetryAt`)
- Needs_auth → connecting after `auth_provided`
- Disabled blocks all transitions except `enable_requested`
- Persistence projection — every `state.kind` matches an existing string value the column already accepts
- Event emission — subscribers fire exactly once per transition

---

## 6. Phase 19c — Versioned Registry

### 6.1 Goal

Snapshot-based discovery cache. Today, `listConnectedTools(draftId)` walks `connections.values()` on every call and reads `conn.tools` directly — which is mutable and changes when transports get `tools/list_changed` notifications mid-flight. A reader can see a half-updated array.

After 19c: each connection publishes immutable snapshots with a version counter. Readers always see a consistent point-in-time view. The dispatcher reads from the registry, not from the live connection.

### 6.2 The registry

```typescript
export interface RegistrySnapshot {
  serverId: number
  version: number
  publishedAt: number
  tools: ReadonlyArray<McpTool>
  prompts: ReadonlyArray<McpPrompt>
  resources: ReadonlyArray<McpResource>
}

class McpRegistry {
  private snapshots = new Map<number, RegistrySnapshot>()

  publishSnapshot(serverId: number, payload: Omit<RegistrySnapshot, "version" | "publishedAt">): void
  getSnapshot(serverId: number): RegistrySnapshot | undefined
  findToolForServer(serverId: number, toolName: string): McpTool | undefined
  findToolByGlobalName(globalName: string): { serverId: number; tool: McpTool } | undefined  // for "mcp__server__tool" lookups
  removeServer(serverId: number): void
  listSnapshotsForDraft(draftId: number): ReadonlyArray<RegistrySnapshot>  // joins via repo.listMcpServers
}

export const registry = new McpRegistry()
```

Versions are monotonic per serverId. Each `publishSnapshot` increments. Snapshots are removed on `disconnect` or when the connection enters `failed` state.

### 6.3 Modified files

- 5x `services/mcp/transports/*.ts` — each calls `registry.publishSnapshot(serverId, {tools, prompts, resources})` after their initial discovery RPCs. Each one's `tools/list_changed` notification handler calls `publishSnapshot` again (or reads list and bumps).
- `mcp-manager.ts` — `listConnectedTools/Prompts/Resources` read from `registry.listSnapshotsForDraft(draftId)` instead of walking the connections map directly
- `dispatcher.ts` (Phase 19a) — gets refactored to look up tools via `registry.findToolForServer(serverId, toolName)` instead of `conn.tools.find(...)`

### 6.4 New file

- `server/agent-studio/services/mcp/registry.ts` (~180 lines)

### 6.5 Why this matters in Scenario B

Even without connection sharing, the registry gives you:
1. **Cache invalidation correctness** — readers can't see torn writes
2. **Stable references** — the dispatcher's tool lookup doesn't race with mid-session reconnects
3. **Future hot-reload** — when MCP spec list_changed lands more broadly, the registry handles it without touching every caller
4. **Cleaner shutdown** — `removeServer` is one call, not "iterate every reader and notify"

It's the smallest of the three phases (~180 LOC) and the easiest to roll back if needed.

### 6.6 Test plan (Phase 19c)

`server/agent-studio/services/mcp/__tests__/registry.test.ts` (~120 lines, ~15 cases):

- Publish snapshot, read it back identically
- Version increments on republish
- `findToolForServer` happy path + miss
- `findToolByGlobalName` parses `mcp__github__create_issue` correctly
- `removeServer` deletes the snapshot
- `listSnapshotsForDraft` returns only the draft's servers' snapshots
- Concurrent publishes don't lose updates (last-write-wins is fine)
- Snapshot immutability — caller modifying the returned `tools` array doesn't affect the registry

---

## 7. Decision points (all ACCEPTED at default per user "yes" on 2026-04-09)

| # | Decision | Default chosen | Rationale |
|---|---|---|---|
| **1** | Where to land the work? | **(b) feature branch + single PR** | Branch `phase-19-mcp-redesign`, three commits, single PR to review the layered changes together |
| **2** | Backward compat for `mcpManager.callMcpTool`? | **(a) keep as a 5-line shim** | Zero risk for any caller we missed |
| **3** | Authorization "ask" handling in the dispatcher? | **(a) treat as deny (sync limitation)** | Async pending-request flow is invasive; only the simulation engine has it. TODO for future. |
| **4** | Governance pre-invoke verdict precedence over allowedTools? | **(a) allowedTools first, then governance** | Fast in-memory check before the policy engine roundtrip |
| **5** | Audit row write — sync or async? | **(a) sync** | Correctness > latency. An audit row that doesn't write before the result is worthless for compliance. |
| **6** | FSM transition violations in dev mode | **(a) throw in dev, (b) log+stay in prod** | Catches bugs early in dev, never crashes in prod |
| **7** | Registry snapshot retention after disconnect | **(a) remove immediately** | No in-flight calls survive disconnect anyway. Simpler. |
| **8** | Scope attribution per Scenario B | **(b) add `scope: "agent_draft"` for forward compat** | Zero cost today, future-proof if Scenario A ever happens |
| **9** | State events emitter — sync or async listeners? | **(b) async (queued via setImmediate)** | Prevents a slow subscriber from blocking the FSM |
| **10** | Test runner integration | **(a) ship tests in the same PR** | Dispatcher + FSM tests must land with the implementation |

---

## 8. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | A caller of `callMcpTool` that the migration missed breaks at runtime | Phase 19a keeps the shim. Grep across the entire repo before merging — there should be exactly 0 direct callers besides the shim itself. |
| R2 | The FSM transition table misses a corner case (e.g., `connecting → disable_requested`) | Test every cell of the transition matrix. ~25 tests cover all 6 states × 9 events = 54 cells (with most being illegal). |
| R3 | Governance pre-invoke is slow and adds latency to every MCP call | Pre-invoke must complete in <50ms. If the policy engine becomes a bottleneck, add a per-tool decision cache (5s TTL). Out of scope for Phase 19a; add a TODO. |
| R4 | The registry's `findToolByGlobalName` parser misinterprets server names containing double underscores | Use a strict 3-component parse (`mcp__SERVER__TOOL` where SERVER may not contain `__`). Reject ambiguous names with `invalid_tool_name`. |
| R5 | Audit row writes fail silently and break compliance | Treat audit insert errors as fatal — return `internal_error` to the caller. The caller can retry. |
| R6 | The state machine refactor introduces a regression in auto-reconnect | The auto-reconnect loop already exists (`mcp-manager.ts:51-92`). Phase 19b just changes how it requests transitions, not what it does. Keep the same backoff math. |
| R7 | Phase 19c's registry diverges from the live `conn.tools` array | The transports must call `publishSnapshot` as the LAST step of their connect flow, before returning. Add an assertion in dev mode that `getSnapshot(serverId)` returns non-undefined immediately after `connectMcpServer` returns. |
| R8 | Phase 19a accidentally double-audits when `simulation.ts` and the dispatcher both write a row | Remove the audit write from `simulation.ts` as part of the same commit. The dispatcher is the only audit writer for MCP calls after 19a. |

---

## 9. Backward compatibility

The full plan is **caller-side backward compatible at every step**:

- `mcpManager.connectMcpServer` — unchanged
- `mcpManager.disconnectMcpServer` — unchanged
- `mcpManager.callMcpTool` — kept as a shim (decision #2a)
- `mcpManager.listConnectedTools/Prompts/Resources` — unchanged signatures, backed by registry after 19c
- `mcpManager.invokeMcpPrompt`, `readMcpResource` — unchanged
- DB schema — **no changes**, no migrations, no backfill
- Existing tests — should all keep passing (any failures are real regressions, not noise)
- Phase 17 + 18 functionality — unchanged. The simulation engine and the openllm-runtime-adapter both work the same after 19a, just with one fewer code path inside them.

---

## 10. Effort estimate

| Phase | New LOC | Modified LOC | New tests | Commits | Est. session count |
|---|---|---|---|---|---|
| 19a (Dispatcher) | ~290 | ~80 | ~200 | 1 | 1-2 sessions |
| 19b (FSM) | ~260 | ~120 | ~150 | 1 | 1-2 sessions |
| 19c (Registry) | ~180 | ~90 | ~120 | 1 | 1 session |
| **Total** | **~730** | **~290** | **~470** | **3** | **3-5 sessions** |

The Builder ships **one phase per session**, each phase pushed to its own commit on the `phase-19-mcp-redesign` branch. Reviewer + Tester run after each commit. PR opens after Phase 19c lands.

---

## 11. AGENTS.md execution protocol

Architectural change → full **Planner → Builder → Reviewer → Tester → Governance** flow.

| Role | Responsibility | Output |
|---|---|---|
| **Planner** | This doc. Approved 2026-04-09. | `phase-19-mcp-manager-redesign.md` |
| **Builder** | Land 3 commits in order: 19a → 19b → 19c. Each commit atomically reversible, each pushes to remote, each is independently shippable. | 3 commits |
| **Reviewer** | Re-read each commit's diff against this plan. Verify no scope drift, no schema changes, public API unchanged. Verify the dispatcher is the ONLY MCP audit writer after 19a. | Comment per commit |
| **Tester** | Run the new test files locally → CI. Verify zero regressions in existing tests. Manual smoke: connect a stdio MCP server, run a simulation, check the runtime_policy_events row format. | Report at the bottom of this doc |
| **Governance** | Verify: (a) every MCP tool call now goes through governance pre/post-invoke, (b) audit rows have the right shape, (c) the FSM transition table is exhaustive, (d) no caller bypasses the dispatcher. | Sign-off in this doc |

---

## 12. What this plan does NOT do

- Does NOT add new MCP transports
- Does NOT add MCP server marketplace / discovery / installation
- Does NOT add sandbox isolation for stdio servers (Phase 19d, parked)
- Does NOT add per-tool rate limiting or circuit breakers
- Does NOT add tool result caching
- Does NOT change the DB schema
- Does NOT touch the openllm-agent2 fork (Phase 18 territory)
- Does NOT add async "ask" permission handling to the dispatcher (decision #3a — sync deny for now)
- Does NOT migrate Phase 17's `listConnectedPrompts` / `listConnectedResources` to a new shape — they keep their current signatures, backed by the registry after 19c
- Does NOT change anything user-visible except the MCP page status display (richer state rendering in Phase 19b)

---

## 13. Approval gate

**Approved 2026-04-09.** Builder may begin Phase 19a after this Planner deliverable is committed.

Builder lands Phase 19a first (smallest, lowest risk, highest leverage), reports back, then continues with 19b and 19c gated on the prior commit's tests passing.
