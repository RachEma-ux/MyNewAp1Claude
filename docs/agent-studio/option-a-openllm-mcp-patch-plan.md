# Option A — Full MCP Unlock for Live Runtime

## Phase 18 — patch openllm-agent2 to accept MCP server config via WS

**Status:** Planner deliverable (per AGENTS.md). Builder may NOT start until the user confirms the decision points in §6.

**Baseline:** This repo at commit `f0441c8` (Phase 17 fully shipped — simulation-mode MCP unlock complete). `RachEma-ux/openllm-agent2` at its current `main` HEAD (verified via `/data/data/com.termux/files/usr/tmp/openllm-agent2`).

**Repo ownership:** Both repos are owned by RachEma-ux. The user has authorized direct push (or can pick a branch strategy in §6 #1).

---

## 1. Why this patch exists

After Phase 17, MCP works fully in **simulation mode** but NOT in **live runtime mode** because openllm-agent2's headless engine (`src/web/headless-engine.ts:419`) hardcodes `mcpClients: []`. This means:

- Agents that need MCP capabilities (GitHub create-issue, Slack send-message, Database queries, etc.) **only work in dev/test runs**
- A skill that uses `mcp__github__create_issue` will pass simulation but **fail silently in production live runs** because the LLM never sees the tool
- Two parallel tool universes — sim has MCP, live doesn't

Phase 18 closes the gap by adding a single new WebSocket message type that openllm-agent2 already has the infrastructure to handle. The fix is small and additive.

---

## 2. Architecture — current vs after

### Current

```
┌────────────────┐    ws://    ┌──────────────────┐
│ Agent Studio   │ ──────────→ │ openllm-agent2   │
│ runtime        │             │ /ws bridge       │
│ adapter        │ ←────────── │ headless-engine  │
└────────────────┘   tokens    │                  │
                               │ tools = 51 base  │
                               │ mcpClients = []  │ ← hardcoded
                               └──────────────────┘
```

The agent loop runs inside openllm-agent2 with a fixed tool list.

### After Phase 18

```
┌────────────────┐    ws://             ┌──────────────────┐
│ Agent Studio   │ ───────────────────→ │ openllm-agent2   │
│ runtime        │  configure_session   │ /ws bridge       │
│ adapter        │  + message           │                  │
│                │ ←────────────────── │ headless-engine  │
│ reads          │  tokens              │                  │
│ agsDraftMcp    │                      │ tools = 51 +     │
│ Servers        │                      │   discovered MCP │
│                │                      │ mcpClients =     │
│                │                      │   [from config]  │
└────────────────┘                      └──────────────────┘
```

The adapter sends `configure_session` ONCE per WS connection BEFORE the first `message`. The bridge stores the config, instantiates MCP clients via openllm-agent2's existing `services/mcp/client.ts`, builds the full tool list, and passes both to the engine. Subsequent `message` events run the agent loop with the merged tool universe.

---

## 3. Wire format — the new message type

### Client → server (new variant on `ClientMessage`)

```typescript
{
  type: 'configure_session'
  mcpServers?: Record<string, McpServerConfig>
  /** Optional — caller-supplied scope for plugin attribution */
  scope?: 'project' | 'user' | 'managed'
}
```

`McpServerConfig` is openllm-agent2's existing union type (`src/services/mcp/types.ts:124`). It already supports stdio / sse / sse-ide / ws-ide / http / websocket / sdk / claudeai-proxy. Our agent-studio rows map to: **stdio, http, websocket, sse, sdk** — all supported upstream.

### Server → client responses

Two new server message types:

```typescript
// Acknowledgment
{
  type: 'session_configured'
  mcpServerCount: number
  mcpToolCount: number
  errors?: Array<{ serverName: string; error: string }>
}

// Failure (rare — only on internal errors, not per-server failures)
{
  type: 'error'
  message: string
}
```

Per-server connect failures don't fail the whole `configure_session` — they're reported in `errors[]` and the agent continues with whatever subset connected. Fail-soft (Decision #4 below).

### Lifecycle

```
1. Client opens WS
2. Client sends configure_session   ← NEW
3. Server replies session_configured ← NEW
4. Client sends message
5. Server streams token / done / permission_request
6. ...
7. Client sends cancel OR closes WS → MCP children torn down
```

If `configure_session` is omitted entirely, the bridge falls back to `mcpClients: []` (current behavior — backward compatible).

---

## 4. Per-repo file changes

### A. `RachEma-ux/openllm-agent2` — 3 files

#### A1. `src/web/types.ts` — extend `ClientMessage` union (~12 lines)

```typescript
export type ClientMessage =
  | { type: 'message'; content: string; provider?: string; model?: string; apiKey?: string }
  | { type: 'cancel' }
  | { type: 'permission_response'; id: string; allowed: boolean }
  // NEW (Phase 18):
  | {
      type: 'configure_session'
      mcpServers?: Record<string, McpServerConfig>
      scope?: 'project' | 'user' | 'managed'
    }
```

Plus add 2 new server message types:

```typescript
export type ServerSessionConfiguredMessage = {
  type: 'session_configured'
  mcpServerCount: number
  mcpToolCount: number
  errors?: Array<{ serverName: string; error: string }>
}
```

#### A2. `src/web/ws-bridge.ts` — handle the new message (~80 lines)

Add a new case in `handleClientMessage`:

```typescript
case 'configure_session': {
  await this.handleConfigureSession(ws, parsed)
  break
}
```

Implement `handleConfigureSession`:
1. Store the parsed config on `ws.data.sessionConfig` (per-WS-connection state)
2. Re-build the engine for this WS session with the new `mcpServers` config (or defer engine creation until `configure_session` arrives — see Decision #6)
3. Call `getMcpToolsCommandsAndResources(callback, mcpServers)` from `services/mcp/client.ts` — openllm-agent2 already has this function and it accepts `mcpConfigs` as a parameter
4. Aggregate the `tools` and `mcpClients` from each onConnectionAttempt callback
5. Reply with `session_configured` containing counts + per-server errors

#### A3. `src/web/headless-engine.ts` — accept MCP config (~30 lines)

Replace the hardcoded `mcpClients: []` with a parameter:

```typescript
// Before
mcpClients: [],

// After
mcpClients: opts?.mcpClients ?? [],
```

The function signature gains an `opts?: { mcpClients?: McpClient[]; tools?: Tool[] }` parameter so the bridge can inject both the MCP client list AND the merged tool list (built-in + MCP-discovered).

### B. `RachEma-ux/MyNewAp1Claude` (this repo) — 2 files

#### B1. `server/agent-studio/adapters/openllm-runtime-adapter.ts` — send `configure_session` (~60 lines)

After the WS opens but before the first `message` is sent:

```typescript
ws.on('open', async () => {
  // Phase 18: send configure_session FIRST so openllm-agent2 has the
  // MCP server list before it processes our message.
  if (req.mcpServers && req.mcpServers.length > 0) {
    ws.send(JSON.stringify({
      type: 'configure_session',
      mcpServers: req.mcpServers,
    }))
    // Wait for session_configured ack before sending the message.
    // This is a small state-machine extension on the existing handler.
  }
  ws.send(JSON.stringify({ type: 'message', content: req.message, ... }))
})
```

Plus extend `OpenllmRuntimeRequest` with an optional `mcpServers` field, and extend the message handler to recognize `session_configured`.

The simulation engine (`simulation.ts`) already pulls `agsDraftMcpServers` for the draft. It will pass them as `mcpServers` to `runViaOpenllmAgent`, decrypting any OAuth tokens via `decrypt()` from `server/_core/encryption.ts` before sending.

#### B2. `client/src/pages/agent-studio/AgentMcpPage.tsx` — update the status banner (~10 lines)

Change the "upstream blocked" warning to "✅ Phase 18 unlocked — works in both simulation AND live runtime".

---

## 5. Cross-repo coordination

**Two repos, two PRs, one redeploy.** The order matters:

1. **First**: land the openllm-agent2 patch on its own (3 commits in that repo). This is backward compatible — old clients work unchanged.
2. **Then**: redeploy openllm-agent2 (whatever your existing flow is — `npm run build` + your tunnel? bun bundle + GH Actions?)
3. **Finally**: land the MyNewAp1Claude side (2 commits). Once both are deployed, the live runtime path uses MCP.

**Rollback path**: if anything breaks, just stop sending `configure_session` from our adapter. openllm-agent2 falls back to `mcpClients: []` automatically (backward compatible by design). No openllm-agent2 redeploy needed for rollback.

---

## 6. Decision points (need user confirmation before Builder starts)

| # | Decision | Options | My recommendation |
|---|---|---|---|
| **1** | **Where to land the openllm-agent2 patch?** | (a) push directly to `main` of `RachEma-ux/openllm-agent2` (b) feature branch + PR (c) fork to a separate repo | **(b) feature branch `phase-18-mcp-injection` + PR** so you can review before merging |
| **2** | **Backward compatibility** | (a) yes — old WS clients (no `configure_session`) get empty MCP list (b) no — break existing flow | **(a)** trivial to do, zero risk |
| **3** | **Per-WS-session vs per-message MCP config** | (a) per-session: send once after connect, MCP children persist (b) per-message: spin up per call | **(a)** spawning MCP children per message is wasteful, sometimes breaks for large servers |
| **4** | **`configure_session` failure mode** | (a) hard fail — reject the WS (b) soft fail — log per-server errors, continue with subset (c) all-or-nothing — must connect every server or reject | **(b)** matches Phase 7 connect behavior here |
| **5** | **MCP server lifecycle ownership** | (a) openllm-agent2 owns the MCP children (spawned in headless-engine) (b) our side owns them, openllm-agent2 just gets connection handles | **(a)** much cleaner. Each WS session gets its own children, torn down on close. |
| **6** | **Engine creation timing** | (a) create the engine eagerly on WS open with empty config, RECREATE on `configure_session` (b) defer engine creation until `configure_session` arrives (or first `message` if no session config) | **(b)** lazy creation. Simpler, no recreate logic, no race conditions |
| **7** | **`configure_session` ordering** | (a) MUST come first, before any `message` — strict (b) optional, can come anytime | **(a)** strict. If a `message` arrives before `configure_session`, the engine starts with empty MCP. After that, no config changes. |
| **8** | **Adapter wire-up timing** | (a) always send `configure_session`, even when the draft has zero MCP servers (b) only send when there's at least one MCP server | **(b)** minimize wire traffic when not needed |
| **9** | **OAuth token decryption** | (a) decrypt server-side in our adapter, send plaintext over the WS (b) send encrypted, openllm-agent2 decrypts | **(a)** openllm-agent2 doesn't know our encryption key. The WS is local-only or over WSS to our own tunnel — TLS protects in transit |
| **10** | **openllm-agent2 redeploy** | (a) push to its existing deploy pipeline (whatever that is) (b) we add the patched build to MyNewAp1Claude's `builder-deploy.yml` (c) you handle it manually | **need to know your current deploy flow** for openllm-agent2 first |
| **11** | **Test coverage on openllm-agent2 side** | (a) unit tests for `handleConfigureSession` (b) integration test that round-trips a stdio MCP server (c) skip tests for now | **(a)** unit tests only. Full integration would need a real MCP server in CI which is too much for Phase 18. |
| **12** | **MCP transport types to support in `configure_session`** | (a) all 8 openllm-agent2 supports (b) only the 4 we currently use (stdio, http, websocket, sse, sdk) | **(a)** pass-through. The schema is already a discriminated union; supporting all 8 is free. |

---

## 7. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | The patch breaks openllm-agent2's existing CLI/non-headless mode | The patch only touches `web/` files. CLI mode (`src/cli/`) is unrelated. |
| R2 | `getMcpToolsCommandsAndResources` has hidden dependencies on file-system config that doesn't exist in headless mode | Read the function to confirm — it accepts `mcpConfigs` as a parameter, suggesting it's already designed for in-memory config. Verified in source. |
| R3 | MCP child processes leak when WS closes | openllm-agent2 already has cleanup in its MCP client. Need to verify the `close` path on disconnect. Add a `process.on('exit')` cleanup as a safety net. |
| R4 | Backward compatibility break for clients that DO send unknown fields on `message` | The current bridge logs and rejects unknown message types. Adding a new known type doesn't affect existing types. |
| R5 | Token leakage in WS message bodies | Our adapter only opens WS to localhost (dev) or our own tunnel (prod via Cloudflare TLS). Nothing in the path that openllm-agent2 doesn't already log via stdout. Add a redaction filter if needed. |
| R6 | The patch ships before openllm-agent2 redeploy → our adapter sends `configure_session` to a non-patched bridge → bridge logs "unknown message type" error | Ship adapter side LAST (after openllm-agent2 is redeployed). Adapter side is also wrapped in feature detection — if `session_configured` doesn't arrive within 2s, fall back to current behavior. |
| R7 | openllm-agent2's `getMcpToolsCommandsAndResources` callback is async and unbounded — could hang the WS handshake | Add a 15s hard timeout on `configure_session` processing. If exceeded, send `session_configured` with the partial subset that completed in time. |
| R8 | OAuth token rotation — if a token expires mid-session | Out of scope for Phase 18. Users would re-trigger the OAuth flow + restart the run. |

---

## 8. Effort estimate

| Side | LOC (new) | LOC (mod) | Commits |
|---|---|---|---|
| openllm-agent2 (3 files) | ~150 | ~30 | 3 |
| MyNewAp1Claude (2 files) | ~80 | ~30 | 2 |
| Tests on openllm-agent2 side | ~80 | 0 | 1 |
| **Total** | **~310** | **~60** | **6** |

---

## 9. Validation plan

After both repos are deployed:

1. **Backward compat smoke test** — without sending `configure_session`, run a normal `message` against openllm-agent2 → confirm tokens stream as before. Existing `.env`-based callers untouched.
2. **Single stdio MCP server** — attach a simple stdio MCP server (e.g., the `studio.echo` SDK server) to a draft, run a live simulation in non-mocked mode against the seeded OpenLLM Agent → confirm `session_configured` ack arrives, then the LLM can call `mcp__studio.echo__echo` and the trace shows the real response.
3. **Per-server failure handling** — attach two MCP servers, one with a bad command. Run live → confirm `session_configured.errors[]` contains the bad server but the good server still works.
4. **Cancel mid-run** — run a long-running MCP tool, send `cancel`, confirm MCP children are reaped.
5. **Rollback path** — temporarily disable the `configure_session` send in our adapter, confirm everything still works (just without MCP).
6. **Static checks**:
   - `grep -rn "mcpClients: \[\]" openllm-agent2/src/web/headless-engine.ts` → must return 0 matches
   - openllm-agent2 type check passes
   - our type check passes
   - existing CI green on both repos

---

## 10. Rollback plan

**Per-step revert**:

1. Adapter side: comment out the `configure_session` send → instant rollback, no openllm-agent2 redeploy needed
2. openllm-agent2 side: revert the 3 commits → redeploy. The change is purely additive (new message type + optional engine param), so reverting is safe.

**Worst case**: if Phase 18 ships and immediately breaks production, rollback time is **<5 minutes** (revert + push to adapter, no openllm-agent2 redeploy required).

---

## 11. AGENTS.md execution protocol

This is an architectural / runtime / governance change → full **Planner → Builder → Reviewer → Tester → Governance** flow.

| Role | Responsibility | Output |
|---|---|---|
| **Planner** | This document. Done. | `option-a-openllm-mcp-patch-plan.md` |
| **Builder** | Land the 6 commits across 2 repos in the order from §5. Each commit atomically reversible. Each commit pushes to remote. | 6 commits |
| **Reviewer** | Re-read each commit's diff against this plan. Verify no scope drift, no unrelated edits, backward compat preserved. | comment in this doc per commit |
| **Tester** | Static checks per §9 + the 5 functional smoke tests. Local first, then deployed. | report at the bottom of this doc |
| **Governance** | Verify: (a) no platform-file edits beyond the standalone budget, (b) no cross-module imports beyond the documented exception, (c) OAuth tokens never logged in plaintext, (d) MCP child process cleanup paths covered, (e) backward compat actually works | sign-off in this doc |

The 6 commits land in this order:

1. **Phase 18a** (openllm-agent2) — extend `ClientMessage` + `ServerMessage` types in `src/web/types.ts`
2. **Phase 18b** (openllm-agent2) — implement `handleConfigureSession` in `src/web/ws-bridge.ts`
3. **Phase 18c** (openllm-agent2) — accept `opts.mcpClients` in `src/web/headless-engine.ts`, remove the hardcoded `[]`
4. **Phase 18d** (openllm-agent2 redeploy) — whatever your normal deploy is for openllm-agent2
5. **Phase 18e** (MyNewAp1Claude) — extend `OpenllmRuntimeRequest` + send `configure_session` from the runtime adapter
6. **Phase 18f** (MyNewAp1Claude) — update the MCP page status banner

---

## 12. What this plan does NOT do

- Does NOT add resource caching or tool result caching
- Does NOT add OAuth token rotation/refresh on the openllm-agent2 side
- Does NOT add per-tool cost tracking on the live runtime path
- Does NOT add MCP server health monitoring beyond existing `status` flips
- Does NOT touch openllm-agent2's CLI / interactive mode
- Does NOT add new MCP transport types (uses what openllm-agent2 already supports)
- Does NOT migrate existing draft MCP server rows — they're already in the right shape, just need decryption before send

---

## 13. Builder may NOT start until decision points #1-#12 are answered.

After approval, Builder lands commit Phase 18a first (smallest, lowest risk) and reports back before continuing. Each subsequent commit is gated on the previous one's CI/local-test pass.
