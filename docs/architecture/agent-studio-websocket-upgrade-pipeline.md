# Agent Studio — WebSocket Upgrade Pipeline ADR

**Status:** Accepted (2026-05-14). V1+ scope per `docs/implementation/agent-studio-native-graph-workspace-v1-v2-execution-plan.md` Phase CRDT and §1 critical path.

**Decision owners:** Planner (this doc) → Builder → Reviewer → Tester → Governance per AGENTS.md.

**Predecessors:**
- `docs/architecture/agent-studio-realtime-collab-crdt.md` — CRDT library choice (Yjs); Postgres-as-source-of-truth invariant.
- `server/agent-studio/services/vault/realtime-doc-transport.ts` (#774 CRDT-γ-2) — transport scaffold + `RealtimeDocConnection` narrow interface.
- `server/agent-studio/services/vault/realtime-doc-authorize.ts` (#787 CRDT-γ-3-auth) — pure authorization rule.
- `server/agent-studio/services/vault/realtime-doc-upgrade-handler.ts` (#788 CRDT-γ-3-upgrade-handler) — auth + transport composition entry point.

---

## Context

The CRDT-γ-2 transport, CRDT-γ-3-auth rule, and CRDT-γ-3-upgrade-handler compositional entry point are all in place. What is **not** in place is the concrete WebSocket server adapter that bridges a real `ws.WebSocket` (or other framework's socket) to the narrow `RealtimeDocConnection` interface and routes upgrade requests into `handleRealtimeDocUpgrade`.

This ADR pins the framework choice and the upgrade-pipeline shape before any runtime wiring lands, per the AGENTS.md Planner-first order.

---

## Decision

### WebSocket framework: **`ws` (npm package, version `^8.18.3`) with `noServer: true`**

`ws` is the canonical Node WebSocket library, already declared in `package.json` as a hard dependency, and already used by the outbound MCP WebSocket transport at `server/agent-studio/services/mcp/transports/websocket.ts`. The `noServer: true` mode means we own the HTTP upgrade routing — multiple upgrade paths (future agent-streaming, future MCP-inbound, etc.) can coexist behind one shared `http.Server`.

### Rejected alternatives

| Option | Why rejected |
|---|---|
| **uWebSockets.js** | Higher throughput but not used elsewhere in the repo; adds a native build dependency and a second WebSocket abstraction. The performance margin does not yet justify the cognitive cost. |
| **native Node `http.Server.on('upgrade')` + handcrafted protocol parsing** | Reinvents `ws`'s frame parser, ping/pong, close-code handling, and per-message-deflate. Unjustified surface area. |
| **`socket.io`** | Already a declared dep (used for legacy areas) but introduces an opinionated handshake (transports negotiation, room model) that does not compose naturally with Yjs's binary framing. Reserving `socket.io` for legacy chat surfaces; CRDT does not pay its complexity tax. |
| **Framework-bundled (e.g. Express WS plugin)** | Same `ws` underneath; adds Express coupling for no benefit. We attach to the `http.Server` directly. |

### Upgrade routing

Routes are owned by the upgrade dispatcher:

| Path | Owner |
|---|---|
| `/api/agent-studio/vault/realtime` | This ADR (realtime-doc) |
| `/api/agent-studio/*` (future) | Reserved for follow-up upgrade subsystems (agent streaming, etc.) |
| any other path | Reject with HTTP `404` before WebSocket handshake completes |

The dispatcher is a single `installRealtimeDocUpgradeOnServer(server, opts)` registration at boot. It:

1. Subscribes once to `server.on("upgrade", handler)`.
2. For each upgrade request:
   - Parses `req.url` → routes by pathname.
   - Matches `/api/agent-studio/vault/realtime` → calls the realtime-doc upgrade path.
   - Anything else → calls `socket.destroy()` (HTTP 426 / 404 semantics — no half-open sockets).
3. Realtime-doc upgrade path:
   - Parses `vaultId` + `noteId` from query string. Rejects if malformed → `socket.destroy()`.
   - Resolves `userId` from the upgrade request's cookies/headers via the same auth resolver Express middleware uses. (For the first slice, this is a closure DI seam — the production resolver lands in a follow-up PR once the cookie shape is locked.)
   - Calls `wss.handleUpgrade(req, socket, head, (ws) => ...)` to complete the WebSocket handshake.
   - Wraps the resulting `ws.WebSocket` in a `RealtimeDocConnection` adapter.
   - Calls `handleRealtimeDocUpgrade({ conn, sessionKey, userId, transport, getVaultIdsForUser })`.
   - If `attached: false`, the `conn.close(code, reason)` inside the handler already closed the socket — nothing more to do.

The dispatcher is **not** an Express middleware. HTTP upgrade requests do not flow through Express's `app` routing tree; they hit the `http.Server` directly via the `upgrade` event. This keeps the WebSocket path zero-cost when no upgrade is in flight.

### Auth-before-upgrade enforcement

The CRDT-γ-3 stack (auth rule + upgrade handler) is already structured so the auth decision happens **before** `transport.attachConnection`. The WebSocket adapter slots in there:

```
http upgrade  →  WebSocketServer.handleUpgrade  →  ws.WebSocket
                                                       │
                                                       ▼
                                              adaptWsToRealtimeDocConnection
                                                       │
                                                       ▼
                                       handleRealtimeDocUpgrade
                                                  │           │
                                            allow │           │ deny
                                                  ▼           ▼
                                   transport.attachConnection  conn.close(code, reason)
                                              │
                                              ▼
                                  RealtimeDocSession (in-memory backend; Postgres save boundary)
```

`handleUpgrade` itself completes the WebSocket handshake before `handleRealtimeDocUpgrade` runs — this is unavoidable in `ws` (the WebSocket has to exist before we can wrap it). The deny path therefore takes the form "WebSocket opens, auth runs synchronously after handshake, deny → `ws.close(4xxx, reason)`". This is consistent with normal WebSocket auth UX (browsers see a close immediately after open).

For paths that should reject **before** the handshake (e.g. wrong pathname), the dispatcher calls `socket.destroy()` and the WebSocket is never created. This keeps unauthenticated/wrong-path traffic from consuming any session state.

### Why this does not bypass MCP / OpenRouter / GraphRepository / governance / Postgres

| Concern | Disposition |
|---|---|
| **MCP dispatcher** | The realtime-doc transport carries CRDT message frames only. Tool execution still goes through `dispatchMcpToolCall`. The upgrade pipeline never imports `mcp/dispatcher` — source-scan tested. |
| **OpenRouter Model Access** | No model invocation happens on the realtime-doc path. Source-scan tested (no `openrouter` import). |
| **GraphRepository** | No graph access from the realtime-doc transport. Source-scan tested (no `neo4j-driver`, no `GraphRepository` import). Graph mutations still route through Phase 11.5 proposal/approval surface — `agentic_eligibility` rules unchanged. |
| **Governance** | Auth-before-upgrade is the governance hook for "is this user allowed to see vault N". Persistence still flows through `agsVaultNotes` + `agsNoteVersions` at the save boundary (per the CRDT ADR); CRDT is a transient session layer. |
| **Postgres source-of-truth** | Same invariant as the predecessor CRDT ADR. The CRDT layer is derived; Postgres is canonical. |

### How future CRDT-γ-3-framing composes

The WebSocket message handler (set up by `transport.attachConnection`) currently dispatches raw `Uint8Array` frames to `session.handleUpdate(data)`. CRDT-γ-3-framing will introduce a frame-type prefix (sync vs awareness vs custom) and split dispatch — but the *transport* (this ADR) does not need to change. The adapter just forwards binary frames to `transport`; the framing logic lives one layer up, inside `RealtimeDocSession`. This keeps the WebSocket plumbing stable across γ-3-framing's rollout.

### Connection lifecycle + error audit

- **Open:** `handleUpgrade` completes the WS handshake → auth runs → `attachConnection` either attaches (bumps session counter, sends snapshot) or `ws.close(4xxx)` denies.
- **Message:** the adapter forwards `data` events to the registered `RealtimeDocMessageHandler`. Errors thrown inside the handler are caught by the existing `try/catch` in `attachConnection` (per the CRDT-γ-2 implementation) — they do not crash the process.
- **Close:** the adapter forwards `close` events to the registered `RealtimeDocCloseHandler` with `code` + `reason`. The transport's `onClose` calls `detachConnectionWithSession` which drops the session when the last connection leaves AND no pending updates remain.
- **Error:** `ws.WebSocket` emits `error` events that the adapter logs to `console.warn` and routes to the close handler with a synthetic `code=1011` ("server error") + `reason="ws_error"`. No silent drops.

The boot step logs:

```
[ags-realtime-doc] WebSocket upgrade installed — path=/api/agent-studio/vault/realtime
[ags-realtime-doc] WebSocket upgrade install skipped — env flag unset
[ags-realtime-doc] WebSocket upgrade install failed — <error>
```

These are the only observability surfaces for the first slice; structured metrics land in a follow-up.

### Rollback / disable

The install is gated by env flag `AGS_REALTIME_DOC_WEBSOCKET_ENABLED`. Values:

- `"true"` → install dispatcher; subscribe to `server.upgrade`.
- anything else (including unset) → no-op. The realtime-doc subsystem stays available at the service layer but no WebSocket path is open.

To disable in production: unset/clear `AGS_REALTIME_DOC_WEBSOCKET_ENABLED` and redeploy. There is no server-side persistent state in the WebSocket adapter — disabling immediately stops accepting new connections and existing connections terminate at next message (the server has already disposed the `WebSocketServer`).

### Test strategy

1. **Source-scan tests** on the new bridge file:
   - No `credential-resolver`, `dispatchMcpToolCall`, `*_API_KEY`, `neo4j-driver`, or `openrouter` imports.
   - The boot install point in `server/_core/index.ts` references the bridge by exact path.
2. **Unit tests** for the `ws.WebSocket → RealtimeDocConnection` adapter using a stubbed `ws`-shaped object:
   - `send(Uint8Array)` forwards to `ws.send(data)`.
   - `on("message", h)` registers a `message` listener that forwards the binary payload.
   - `on("close", h)` registers a `close` listener that forwards `(code, reason)`.
   - `close(code, reason)` calls `ws.close(code, reason)`.
   - `error` event routes to the close handler with `code=1011` + `reason="ws_error"`.
3. **Unit tests** for `installRealtimeDocUpgradeOnServer`:
   - Env flag enabled → subscribes to `server.upgrade`; returns `{ installed: true }`.
   - Env flag disabled → does NOT subscribe; returns `{ installed: false }`.
   - Wrong upgrade path → calls `socket.destroy()`.
   - Right path but malformed query → calls `socket.destroy()`.
   - Right path + valid query → invokes the upgrade handler closure with the parsed sessionKey.
4. **Source-scan boundary test** confirming the boot install is in `server/_core/index.ts` between `createServer(app)` and `server.listen(...)`.

CI gate: existing `pnpm check` + the new test suites. No live WebSocket integration test in the first slice — that's framework-level and lands once the auth-cookie resolver is wired.

### First implementation PR scope

This ADR's first PR (PR-V1-38, this PR) ships:

| File | Purpose |
|---|---|
| `docs/architecture/agent-studio-websocket-upgrade-pipeline.md` | This ADR |
| `server/agent-studio/services/vault/realtime-doc-websocket-bridge.ts` | `adaptWsToRealtimeDocConnection` + `installRealtimeDocUpgradeOnServer` |
| `server/_core/index.ts` | Single install call between `createServer(app)` and `server.listen(...)`, env-flag gated |
| `tests/agent-studio/vault-realtime-doc-websocket-bridge.test.ts` | Adapter unit tests + dispatcher install tests + source-scan boundary |
| `docs/implementation/agent-studio-native-graph-workspace-v1-v2-execution-plan.md` | Ledger row append |
| `docs/implementation/chatgpt-graph-workspace-progress-tracker.md` | Track section update |
| `docs/implementation/agent-studio-native-graph-workspace-continuation-state.md` | Continuation state update |

**Explicitly out of scope for this PR** (follow-ups, each its own PR):
- Production auth-cookie resolver (`getUserIdFromUpgradeRequest`). The first slice exposes a DI seam; production wires it once the cookie shape is locked.
- `getVaultIdsForUser` production binding from `VaultRepository.listVaultsForUser` at the install point (DI seam for now).
- CRDT-γ-3-framing message dispatch (separate sub-arc).
- Live WebSocket integration test against the dev server (separate ops PR).
- Structured metrics surface.

### Acceptance

- [x] ADR exists and is specific enough for implementation.
- [x] Names exact files to touch.
- [x] Declares selected framework (`ws` with `noServer: true`).
- [x] Includes boundaries and rejected alternatives.
- [x] Includes first implementation PR scope.

---

## References

- `package.json` — `"ws": "^8.18.3"` already declared.
- `server/_core/index.ts:259` — `const server = createServer(app);`
- `server/_core/index.ts:1150` — `server.listen(port, ...)`.
- `server/agent-studio/services/mcp/transports/websocket.ts` — existing `ws` client usage (outbound).
- `server/agent-studio/services/vault/realtime-doc-transport.ts` — transport scaffold + `RealtimeDocConnection` interface.
- `server/agent-studio/services/vault/realtime-doc-authorize.ts` — auth rule.
- `server/agent-studio/services/vault/realtime-doc-upgrade-handler.ts` — auth + transport composition.
- `docs/architecture/agent-studio-realtime-collab-crdt.md` — predecessor CRDT ADR.
