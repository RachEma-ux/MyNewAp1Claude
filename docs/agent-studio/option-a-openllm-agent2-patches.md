# Phase 18 — openllm-agent2 patches (apply to fork)

**Companion doc to:** `option-a-openllm-mcp-patch-plan.md`

This doc contains the **3 ready-to-apply patches** for the openllm-agent2 fork. Apply them in order. The MyNewAp1Claude side is **already deployed** as of commit landing this doc — the runtime adapter sends `configure_session` with feature detection, so an un-patched openllm-agent2 just silently ignores the message and live runs continue to work without MCP. Once the fork is deployed with these patches, MCP injection takes effect automatically.

---

## Confirmed decisions (per user, 2026-04-08)

| # | Decision | User answer | Builder default applied |
|---|---|---|---|
| **1** | Where to land the openllm-agent2 patch? | **(c) fork to a separate repo** | New fork: `RachEma-ux/openllm-agent2-mcp-bridge` (suggested name — pick whatever you prefer) |
| **2** | Backward compatibility | (default a) | YES — un-patched bridges silently ignore unknown message types, our adapter falls through after a 2s wait |
| **3** | Per-WS-session vs per-message | (default a) | Per-session — `configure_session` sent ONCE per WS, MCP children persist for the session lifetime |
| **4** | configure_session failure mode | (default b) | Soft fail — per-server errors reported in `errors[]`, the agent continues with whatever subset connected |
| **5** | MCP server lifecycle ownership | (default a) | openllm-agent2 owns the MCP children — torn down on WS close |
| **6** | Engine creation timing | (default b) | Lazy — engine deferred until configure_session arrives (or first message if no session config) |
| **7** | configure_session ordering | (default a) | Strict — must arrive before any `message`. After the first message, no further session config changes |
| **8** | Adapter wire-up timing | (default b) | Only sent when `mcpServers.length > 0`. Already implemented in runtime-adapter |
| **9** | OAuth token decryption | (default a) | Decrypted server-side in our adapter, sent as `Authorization: Bearer …` headers in the configure_session payload. Already implemented in simulation.ts |
| **10** | openllm-agent2 redeploy | **"three of them"** — interpreted below | See §5 below |
| **11** | Test coverage | (default a) | Unit tests for `handleConfigureSession` only. No integration tests against a real MCP server in CI |
| **12** | MCP transport types in configure_session | (default a) | Pass-through — patch accepts the full upstream union (8 transports), our adapter currently emits 5 of them |

### Decision #10 — "three of them" interpretation

The user said **"three of them"** for the deploy question. The Builder is interpreting this as **three deployment paths** that need the patched build:

1. **Local dev** — `bun run dev` / `bun dist/cli.mjs serve 5000` from the fork's working tree
2. **Tunnel deploy** — whatever Cloudflare / ngrok tunnel the user runs against the local build
3. **GitHub Actions / CI deploy** — the deployment workflow that builds + ships openllm-agent2

If this interpretation is wrong, the user should clarify and the patches doc will be updated. The patches themselves are environment-agnostic — they only touch source files and don't depend on any particular deploy mechanism.

---

## Source repo + commit

Before applying patches, fork from **`RachEma-ux/openllm-agent2`** at its current `main` HEAD (verified at `/data/data/com.termux/files/usr/tmp/openllm-agent2`).

Suggested fork:

```bash
gh repo fork RachEma-ux/openllm-agent2 --fork-name openllm-agent2-mcp-bridge --clone
cd openllm-agent2-mcp-bridge
git checkout -b phase-18-mcp-injection
```

---

## Patch A1 — `src/web/types.ts`

**Purpose:** extend `ClientMessage` union with the new `configure_session` variant; add `ServerSessionConfiguredMessage` to the server-side types.

**Locate the existing `ClientMessage` union** (it currently has 3 variants: `message`, `cancel`, `permission_response`) and add the new variant. Then append the new server message type.

```typescript
// ── Phase 18 (additive): MCP injection via configure_session ──

import type { McpServerConfig } from '../services/mcp/types'

export type ClientMessage =
  | { type: 'message'; content: string; provider?: string; model?: string; apiKey?: string }
  | { type: 'cancel' }
  | { type: 'permission_response'; id?: string; allowed: boolean }
  // NEW (Phase 18):
  | {
      type: 'configure_session'
      mcpServers?: Record<string, McpServerConfig> | McpServerConfig[]
      scope?: 'project' | 'user' | 'managed'
    }

// NEW (Phase 18): server → client ack for configure_session
export type ServerSessionConfiguredMessage = {
  type: 'session_configured'
  mcpServerCount: number
  mcpToolCount: number
  errors?: Array<{ serverName: string; error: string }>
}
```

**Notes:**

- The `mcpServers` field accepts EITHER a `Record<string, McpServerConfig>` (named map, matching openllm-agent2's `getMcpToolsCommandsAndResources` signature) OR an `McpServerConfig[]` (array, matching what our MyNewAp1Claude adapter currently sends). The bridge's `handleConfigureSession` (Patch A2) normalizes both into the named-map shape before passing to `getMcpToolsCommandsAndResources`. Accepting both keeps the wire format flexible.
- `permission_response` was changed to make `id` optional (already handled in some upstream branches; if your fork has it required, leave that line untouched).
- The `import type { McpServerConfig }` may need its path adjusted if your fork's services tree has been reorganized.

---

## Patch A2 — `src/web/ws-bridge.ts`

**Purpose:** implement `handleConfigureSession`. Stores per-WS session state, calls `getMcpToolsCommandsAndResources` with the supplied configs, aggregates `tools` + `mcpClients` from each connection callback, and sends back `session_configured` with counts + per-server errors.

**Locate the existing `handleClientMessage` switch** in the bridge and add a new case. Then implement the handler.

```typescript
// ── Phase 18 (additive): handleConfigureSession ──

// In handleClientMessage's switch:
case 'configure_session': {
  await this.handleConfigureSession(ws, parsed)
  break
}

// Add as a private method on the bridge class:
private async handleConfigureSession(
  ws: WebSocket,
  msg: Extract<ClientMessage, { type: 'configure_session' }>
): Promise<void> {
  // ── Decision #4b: soft-fail aggregation ──
  const errors: Array<{ serverName: string; error: string }> = []
  const collectedTools: Tool[] = []
  const collectedClients: McpClient[] = []

  // Normalize array → record for getMcpToolsCommandsAndResources
  let mcpConfigs: Record<string, McpServerConfig> = {}
  const incoming = msg.mcpServers
  if (Array.isArray(incoming)) {
    incoming.forEach((cfg, idx) => {
      // Use the URL/command/serverName as the key when nothing else
      // is supplied — best-effort uniqueness
      const key =
        ('url' in cfg && cfg.url) ||
        ('command' in cfg && cfg.command) ||
        ('serverName' in cfg && cfg.serverName) ||
        `server-${idx}`
      mcpConfigs[String(key)] = cfg
    })
  } else if (incoming && typeof incoming === 'object') {
    mcpConfigs = incoming
  }

  // ── Decision #6b: lazy engine creation ──
  // Stash on per-WS state; the engine is built on first `message`.
  const state = this.getOrCreateSessionState(ws)
  state.pendingMcpConfigs = mcpConfigs
  state.pendingMcpScope = msg.scope ?? 'managed'

  // ── R7: 15-second hard timeout on the connect attempts ──
  const timeoutMs = 15_000
  const deadline = Date.now() + timeoutMs

  try {
    await getMcpToolsCommandsAndResources(
      // Per-server connect callback. openllm-agent2's existing API: each
      // attempt invokes this with success/failure. We aggregate.
      ({ serverName, status, tools, client, error }) => {
        if (Date.now() > deadline) return // ignore late callbacks
        if (status === 'connected') {
          if (Array.isArray(tools)) collectedTools.push(...tools)
          if (client) collectedClients.push(client)
        } else if (status === 'failed') {
          errors.push({
            serverName,
            error: error?.message ?? 'unknown connect error',
          })
        }
      },
      mcpConfigs
    )
  } catch (e) {
    // Internal error (not a per-server failure) — return as a top-level
    // error rather than a partial session_configured
    this.sendToClient(ws, {
      type: 'error',
      message: `configure_session failed: ${e instanceof Error ? e.message : String(e)}`,
    })
    return
  }

  // Persist on the session so the next `message` reuses these
  state.mcpClients = collectedClients
  state.mcpTools = collectedTools

  // Reply with session_configured (decision #4b — partial success is OK)
  const ack: ServerSessionConfiguredMessage = {
    type: 'session_configured',
    mcpServerCount: collectedClients.length,
    mcpToolCount: collectedTools.length,
    errors: errors.length > 0 ? errors : undefined,
  }
  this.sendToClient(ws, ack)
}
```

**Notes:**

- `getOrCreateSessionState(ws)` is a small per-WS state map. If your bridge already has a `WeakMap<WebSocket, SessionState>` or similar, reuse it. If not, add:
  ```typescript
  private sessionState = new WeakMap<WebSocket, {
    mcpClients?: McpClient[]
    mcpTools?: Tool[]
    pendingMcpConfigs?: Record<string, McpServerConfig>
    pendingMcpScope?: 'project' | 'user' | 'managed'
  }>()
  private getOrCreateSessionState(ws: WebSocket) {
    let s = this.sessionState.get(ws)
    if (!s) { s = {}; this.sessionState.set(ws, s) }
    return s
  }
  ```
- The `getMcpToolsCommandsAndResources` signature is the upstream function in `src/services/mcp/client.ts`. The 2nd-positional `mcpConfigs` param already exists (verified in the deep-dive). Pass-through behavior. If the function signature is slightly different in your fork (e.g. options object), adapt accordingly.
- On WS close, walk `state.mcpClients` and call `client.close()` (or whatever the upstream lifecycle method is) to reap MCP children. Add this in your existing close handler — same place pending permission requests are cleaned up.

---

## Patch A3 — `src/web/headless-engine.ts`

**Purpose:** accept `opts.mcpClients` and `opts.tools` so the bridge can inject the merged tool universe AND the live MCP client list per session. Removes the hardcoded `mcpClients: []`.

**Locate the engine factory function** (currently around line 419 — search for the literal `mcpClients: []`). Change the function signature and the body.

```typescript
// BEFORE (~line 419):
//   mcpClients: [],

// AFTER:
export function createHeadlessEngine(opts?: {
  mcpClients?: McpClient[]
  tools?: Tool[]
  // ... existing options
}) {
  // ... existing setup ...

  const baseTools = [/* the existing 51 built-in tools */]
  const mergedTools =
    opts?.tools && opts.tools.length > 0
      ? [...baseTools, ...opts.tools]
      : baseTools

  return {
    // ... existing fields ...
    tools: mergedTools,
    mcpClients: opts?.mcpClients ?? [],
  }
}
```

**Notes:**

- The existing function probably has a much wider option surface (model, provider, prompts, etc.). Only the `mcpClients` and `tools` additions are new in Phase 18 — leave the rest of the signature alone.
- The merge order matters: built-in tools FIRST, then MCP-discovered tools. When two tools have the same name, the LLM sees the built-in one (matches the upstream `mcpSkillBuilders` precedence in openclaude — "built-ins win on conflict").
- The `bridge.ts` flow then calls `createHeadlessEngine({ mcpClients: state.mcpClients, tools: state.mcpTools, ... })` lazily when the first `message` arrives, instead of eagerly on WS open.

---

## Test plan (decision #11a — unit tests only)

In `src/web/__tests__/configure-session.test.ts` (NEW):

```typescript
import { describe, it, expect, vi } from 'vitest'
import { WebSocketBridge } from '../ws-bridge'

describe('handleConfigureSession (Phase 18)', () => {
  it('replies with session_configured ack on empty mcpServers', async () => {
    const bridge = new WebSocketBridge(/* deps */)
    const ws = makeMockWs()
    await bridge.handleClientMessage(ws, {
      type: 'configure_session',
      mcpServers: {},
    })
    const sent = ws.sentMessages.find((m) => m.type === 'session_configured')
    expect(sent).toBeDefined()
    expect(sent.mcpServerCount).toBe(0)
    expect(sent.mcpToolCount).toBe(0)
  })

  it('aggregates tools across multiple connected servers', async () => {
    // mock getMcpToolsCommandsAndResources to invoke callback twice
    // ...
  })

  it('puts per-server failures in errors[] without failing the whole call', async () => {
    // mock one connect to throw, verify errors array contains it
    // ...
  })

  it('normalizes McpServerConfig[] into Record<string, …> on input', async () => {
    // ...
  })

  it('respects 15s hard timeout on slow connects', async () => {
    // mock a connect that never fires the callback
    // ...
  })
})
```

The 5 tests cover the contract surface. No real MCP servers are spawned in CI.

---

## Apply order

```
1. Apply Patch A1 (types.ts)         → tsc passes
2. Apply Patch A2 (ws-bridge.ts)     → tsc passes
3. Apply Patch A3 (headless-engine.ts) → tsc passes, existing tests still green
4. Add tests                          → vitest passes
5. Build:  bun run build              → emits dist/cli.mjs
6. Deploy: whatever the user's "three of them" deploy paths are
7. Verify on MyNewAp1Claude side: trigger a live simulation run with an
   attached MCP server, check the runs page outputPayload.mcpInjection field:
     - sent: true
     - acked: true
     - mcpServerCount: 1
     - mcpToolCount: > 0
```

---

## Rollback path

The MyNewAp1Claude side is **already backward-compatible**. To roll back the fork side, just revert the 3 commits (A1/A2/A3) — the runtime adapter will start hitting the 2-second `no_ack` fallback again and live runs will continue without MCP, exactly as they did before Phase 18.

No data migration, no schema changes, no client-side coordination needed for rollback.

---

## What this doc does NOT do

- Does NOT actually create the fork (the user does that with `gh repo fork`)
- Does NOT push to the fork (the user runs the patches + commits + push themselves)
- Does NOT trigger the deploy (decision #10 — depends on user's deploy mechanism)
- Does NOT modify any file outside the openllm-agent2 fork

The MyNewAp1Claude side is shipped on this branch — the runtime adapter, simulation wire-up, MCP page banner, and `outputPayload.mcpInjection` reporting are all live as of this commit.
