# MCP Hardening Plan

**Owner:** Agent Studio MCP subsystem (`server/agent-studio/services/mcp/`)
**Created:** 2026-05-03
**Status:** Phase 1 in progress

Closes 15 gaps identified in the MCP architecture review. Five phases, ordered by blast radius (correctness bugs → debt → polish). Every fix specifies files, approach, tests, risks, and LOC estimate.

**Branch strategy:** one PR per phase. Phase 1 alone is shippable on its own; later phases build on it.

---

## Cross-cutting decisions (locked)

| # | Decision |
|---|---|
| 1 | **In-memory FSM is the source of truth.** DB column is a downstream string projection. |
| 2 | **`enabled: boolean` column stays.** It will be kept and synced to/from the FSM `disabled` state — the two storage locations remain but the FSM owns transitions. |
| 3 | `MAX_RECONNECT_ATTEMPTS = 10` (Phase 2.2). |
| 4 | `NEEDS_AUTH_TIMEOUT_MS = 24h` (Phase 2.3). |

---

## Phase 1 — Correctness fixes (ship first)

Goal: close the silent bugs where the FSM state diverges from reality.

### 1.1  Wire `mid_session_disconnect` from transport close handlers

**Problem:** stdio/websocket close handlers reject pending RPCs but never tell `mcp-manager` the connection died. Row stays `connected` forever; tool list becomes a lie.

**Files:**
- `server/agent-studio/services/mcp/types.ts` — extend transport input interface
- `server/agent-studio/services/mcp/transports/stdio.ts`
- `server/agent-studio/services/mcp/transports/websocket.ts`
- `server/agent-studio/services/mcp/transports/http.ts` (no-op — stateless, but accept the prop for symmetry)
- `server/agent-studio/services/mcp/transports/sdk.ts` (in-process — wire to teardown)
- `server/agent-studio/services/mcp/mcp-manager.ts` — pass the callback at connect time

**Approach:**
1. Add to each `*ConnectInput` interface:
   ```ts
   onClose?: (reason: string) => void;
   ```
2. In `stdio.ts` (around line 142), inside `child.on("close", ...)`, after `pending.clear()`:
   ```ts
   input.onClose?.(message); // re-uses the diagnostic message we already build
   ```
3. Same in `stdio.ts::child.on("error", ...)` (line 135) — call `input.onClose?.(err.message)`.
4. Same in `websocket.ts::ws.on("close", ...)` and `ws.on("error", ...)`.
5. In `mcp-manager.ts::connectMcpServer`, build a single closure once per connect and pass it through every transport switch arm:
   ```ts
   const onClose = (reason: string) => {
     const cur = states.get(input.serverId);
     if (cur?.kind !== "connected") return; // idempotency
     connections.delete(input.serverId);
     registry.removeServer(input.serverId);
     applyEvent(input.serverId, { type: "mid_session_disconnect", reason })
       .catch(() => {/* never fail the close */});
   };
   ```

**Tests:** New `__tests__/lifecycle.test.ts` covering stdio child crash, websocket server-side close, idempotent double-fire.

**Risks:** Race between explicit `disconnectMcpServer` and underlying `child.on("close")` — guard with `cur?.kind !== "connected"`.

**Estimate:** ~60 LOC + ~80 LOC tests.

---

### 1.2  Emit `auth_provided` from the OAuth exchange and auto-reconnect

**Problem:** `oauthExchange` persists encrypted tokens but never tells the FSM. Row stays `needs_auth` until manual click.

**Files:**
- `server/agent-studio/api/router.ts` (lines 1315–1377)
- `server/agent-studio/services/mcp/mcp-manager.ts` — expose `notifyAuthProvided(serverId)`

**Approach:**
1. Export from `mcp-manager.ts`:
   ```ts
   export async function notifyAuthProvided(serverId: number): Promise<void> {
     await applyEvent(serverId, { type: "auth_provided" });
   }
   ```
2. In `oauthExchange` mutation, after `updateMcpServerOAuth(...)` resolves and before returning:
   ```ts
   await mcpManager.notifyAuthProvided(input.serverId);
   mcpManager.connectMcpServer({ serverId: input.serverId }).catch(() => {});
   ```

**Tests:** Mock both functions; assert called after successful exchange. Verify FSM transitions `needs_auth → connecting`.

**Estimate:** ~15 LOC + ~20 LOC tests.

---

### 1.3  Auto-reconnect loop picks up `connecting` orphans after restart

**Problem:** Process crashes mid-handshake → row stays `status="connecting"`, FSM map empty → loop's `if (row.status !== "error") continue` skips it forever.

**File:** `server/agent-studio/services/mcp/mcp-manager.ts` (lines 85–113)

**Approach:**
```ts
const inMemState = states.get(row.id);
const isError = row.status === "error";
const isStaleConnecting = row.status === "connecting" && inMemState == null;
if (!isError && !isStaleConnecting) continue;
```

**Tests:** Seed row with `status="connecting"` + empty `states` map → asserts `connectMcpServer` called. Negative case with in-flight FSM state → skipped.

**Estimate:** ~10 LOC + ~30 LOC tests.

---

### 1.4  Registry cleanup on death (covered by 1.1)

`onClose` callback calls `registry.removeServer(serverId)` before `applyEvent`. Tracked separately for the acceptance checklist.

---

### 1.5  Doc-comment correction

**File:** `server/agent-studio/services/mcp/mcp-manager.ts` (lines 18–20)

Replace stale "row's status column is the durable side" wording with accurate description of FSM-as-truth + column-as-projection.

**Estimate:** ~10 LOC, no tests.

---

### Phase 1 acceptance checklist

- [ ] Killing a connected stdio MCP child → FSM `failed` within 1s, tool list empty.
- [ ] Closing a WebSocket server-side → same.
- [ ] OAuth completion auto-transitions `needs_auth → connecting → connected`.
- [ ] Crash mid-handshake → row reconnects within one auto-reconnect tick (≤60s).
- [ ] Doc comment updated.
- [ ] Tests green.

**Phase 1 total:** ~95 LOC impl + ~130 LOC tests, single PR.

---

## Phase 2 — OAuth & retry hardening

### 2.1  Wire `refreshAccessToken` into the connect path

**Problem:** `auth.ts:235 refreshAccessToken` exists but has zero callers. Expired tokens force users through full OAuth flow every time.

**Files:** `auth.ts`, all remote transports, `mcp-manager.ts`, `repository.ts`.

**Approach:**
1. New helper `getValidAccessToken({ server, decrypt, persist, refreshSafetyMs = 60_000 })` in `auth.ts`. Refreshes if expiry < now + safety. Persists. Throws `McpAuthRequiredError` if refresh fails.
2. In `mcp-manager.ts::connectMcpServer`, before transport switch:
   ```ts
   let bearerToken: string | undefined;
   if (row.oauthConfig) {
     bearerToken = (await getValidAccessToken({...})) ?? undefined;
   }
   ```
3. Pass `bearerToken` into HTTP / SSE / WebSocket connect inputs; add to `Authorization: Bearer ...` header.

**Tests:** Mock token-refresh `fetch`; verify refresh fires for tokens expiring soon. Verify failed refresh → `McpAuthRequiredError` → FSM `needs_auth`.

**Risks:** Concurrent connect attempts could trigger duplicate refreshes — second result wins on persist. Acceptable.

**Estimate:** ~80 LOC + ~60 LOC tests.

---

### 2.2  Cap retries — add `abandoned` FSM state

**Problem:** `attemptCount` increments forever. No way to distinguish "still trying" from "given up".

**Files:** `types.ts`, `state-machine.ts`, `state-machine.test.ts`, `AgentMcpManagerPage.tsx`.

**Approach:**
1. Extend `ConnectionState`:
   ```ts
   | { kind: "abandoned"; reason: string; lastAttemptAt: number; attemptCount: number }
   ```
2. `MAX_RECONNECT_ATTEMPTS = 10`.
3. In `connecting → failed` branches, when `newAttemptCount >= MAX_RECONNECT_ATTEMPTS` → return `abandoned` instead.
4. Add `abandoned → connecting` on `connect_requested` (manual retry only).
5. Auto-reconnect filter excludes `abandoned`.
6. UI: red banner + "Retry" button.

**Tests:** 10 successive `connect_failed` → `abandoned`. Manual `connect_requested` from `abandoned` → `connecting`.

**Estimate:** ~50 LOC + ~40 LOC tests + ~30 LOC UI.

---

### 2.3  `needs_auth` timeout → `failed`

**File:** `mcp-manager.ts` (extend auto-reconnect tick)

```ts
const NEEDS_AUTH_TIMEOUT_MS = 24 * 60 * 60 * 1000;
for (const [serverId, state] of states) {
  if (state.kind !== "needs_auth") continue;
  if (now - state.challengeReceivedAt < NEEDS_AUTH_TIMEOUT_MS) continue;
  await applyEvent(serverId, { type: "connect_failed", reason: "auth challenge ignored for >24h" });
}
```

**Estimate:** ~15 LOC + ~20 LOC tests.

---

### 2.4  HTTP/WebSocket heartbeat (proactive `mid_session_disconnect`)

**Files:** `transports/http.ts`, `transports/websocket.ts`.

**Approach:** Per-connection `setInterval(60_000)` calling MCP `ping` (fallback to `tools/list`). 3 consecutive failures → `input.onClose("heartbeat failed")`. Clear interval on close.

**Estimate:** ~50 LOC + ~30 LOC tests.

---

### Phase 2 acceptance

- [ ] OAuth-protected MCP with 5-min token works past expiry without user input.
- [ ] Permanently-broken server → `abandoned` within ~30 minutes.
- [ ] Abandoned row has manual Retry button.
- [ ] 3-min network outage caught by heartbeat.
- [ ] `needs_auth` >24h auto-fails.

**Phase 2 total:** ~195 LOC impl + ~150 LOC tests + ~30 LOC UI.

---

## Phase 3 — `enabled` column sync (revised; no column drop)

Goal: keep the `enabled` column AND wire the FSM `disable_requested` / `enable_requested` events. Both stay; FSM owns transitions and projects to the column.

### 3.1  Wire enable/disable mutations to the FSM

**Files:**
- `server/agent-studio/api/router.ts` — new `mcp.disable(serverId)` / `mcp.enable(serverId)` mutations (governedProcedure)
- `server/agent-studio/services/mcp/mcp-manager.ts` — export `disableMcpServer(serverId)` / `enableMcpServer(serverId)` shims that call `applyEvent` AND update `enabled` column
- `server/agent-studio/repository.ts` — new `setMcpServerEnabled(serverId, enabled)` helper
- `server/agent-studio/services/mcp/state-machine.ts` — extend `projectStateToColumn` so `disabled` still projects to existing `"disabled"` value (no schema change needed)
- `client/src/modules/agent-studio/pages/AgentMcpManagerPage.tsx` — replace static "row disabled" badge with a real toggle

**Approach:**
1. Manager shims:
   ```ts
   export async function disableMcpServer(serverId: number): Promise<void> {
     // Disconnect first if live
     if (connections.has(serverId)) await disconnectMcpServer(serverId);
     await repo.setMcpServerEnabled(serverId, false);
     await applyEvent(serverId, { type: "disable_requested" });
   }
   export async function enableMcpServer(serverId: number): Promise<void> {
     await repo.setMcpServerEnabled(serverId, true);
     await applyEvent(serverId, { type: "enable_requested" });
   }
   ```
2. `boot.ts` already filters on `if (!server.enabled) continue` — keep it. The FSM `disabled` state additionally guards in-memory transitions.
3. Backfill at boot (one-time, idempotent): for every row with `enabled=false`, ensure FSM is `disabled`.

**Tests:**
- `mcp.disable(id)` → FSM `disabled`, column `enabled=false`, status projects to `"disabled"`, row skipped at boot.
- `mcp.enable(id)` → FSM `pending`, column `enabled=true`.
- Boot backfill: row with `enabled=false` and empty in-memory FSM → state `disabled` after boot completes.

**Risks:** Two writes per toggle (column + FSM). If column write succeeds and FSM apply fails, the next boot backfill reconciles. Acceptable.

**Estimate:** ~90 LOC + ~50 LOC tests + ~40 LOC UI. **No migration.**

---

### Phase 3 acceptance

- [ ] UI toggle drives FSM transitions and persists `enabled` column across restart.
- [ ] Disabled rows skipped at boot auto-connect AND auto-reconnect loop.
- [ ] Boot backfill reconciles drift between column and FSM.

**Phase 3 total:** ~90 LOC + ~50 LOC tests + ~40 LOC UI.

---

## Phase 4 — SSE transport

### 4.1  Port SSE from scaffold to real transport

**File:** `server/agent-studio/services/mcp/transports/sse.ts` (32 LOC → ~150)

**Approach:** Use Node 18+ built-in `EventSource` (verify `engines.node` ≥ 20). Mirror `http.ts` handshake structure: POST for outgoing RPC, EventSource for incoming notifications + responses. Implement `connect`, `close`, `callTool`, `getPrompt`, `readResource`. Wire `onClose` callback.

**Tests:** Fake SSE server in `__tests__/`, full handshake + tool call + close.

**UI:** Remove the `transport_not_implemented` warning from the dropdown.

**Estimate:** ~150 LOC + ~80 LOC tests.

---

## Phase 5 — Observability & polish

### 5.1  Persist FSM transitions

**New table:** `ags_mcp_transitions` (server_id, from_kind, to_kind, event_type, reason, ts). Capped at 1000 rows per server. Subscribe to `connection-events.emitTransition`.

**UI:** "Connection history" panel on row detail.

**Estimate:** ~100 LOC + migration + ~50 LOC UI.

### 5.2  Admin `purge` operation

`mcp.purge(serverId)` adminProcedure: clear `connections`, `states`, `registry`, set DB column to `pending`.

**Estimate:** ~25 LOC + ~15 LOC UI.

### 5.3  Lifecycle integration test suite

**File:** `server/agent-studio/services/mcp/__tests__/lifecycle.test.ts`

Coverage: happy path stdio, mid-session crash, OAuth full cycle, token refresh, retry exhaustion, disable during connecting, enable from disabled, restart-during-handshake.

**Estimate:** ~300 LOC of tests.

---

### Phase 5 acceptance

- [ ] Transitions queryable via SQL.
- [ ] Admin purge clears wedged rows without restart.
- [ ] CI fails if any of 8 lifecycle scenarios break.

**Phase 5 total:** ~125 LOC + ~300 LOC tests + 1 migration + ~65 LOC UI.

---

## Order, dependencies, totals

```
Phase 1  ─┬─ 1.1  mid_session_disconnect (foundation for 1.4, 2.4)
         ├─ 1.2  auth_provided
         ├─ 1.3  connecting orphans
         ├─ 1.4  registry cleanup (rolled into 1.1)
         └─ 1.5  doc fix
              │
Phase 2  ────┼─ 2.1  refresh tokens
             ├─ 2.2  abandoned state
             ├─ 2.3  needs_auth timeout
             └─ 2.4  heartbeat
              │
Phase 3  ────┴─ 3.1  enable/disable mutations + FSM sync (column kept)
              │
Phase 4  ──────  4.1  SSE transport (independent)
              │
Phase 5  ──────  5.1 transition log, 5.2 purge, 5.3 lifecycle tests
```

| Phase | Impl LOC | Test LOC | UI LOC | Migrations | Risk |
|---|---|---|---|---|---|
| 1 | 95 | 130 | 0 | 0 | Low |
| 2 | 195 | 150 | 30 | 0 | Medium |
| 3 | 90 | 50 | 40 | 0 | Low |
| 4 | 150 | 80 | 5 | 0 | Low |
| 5 | 125 | 300 | 65 | 1 | Low |
| **Total** | **655** | **710** | **140** | **1** | — |

---

## Out of scope (deferred)

- Encryption key rotation strategy for `oauthState.encryptedTokens`.
- Per-tool / per-server permission policies.
- MCP server resource quotas (RAM/CPU caps for stdio children).
- Cross-process MCP sharing (multi-instance source-of-truth flip).
