# Agent Studio — Unified Remaining-Phases Plan

**Status:** Planner deliverable (per AGENTS.md). Builder may NOT start until the
decision points in section 5 are answered.

**Baseline:** commit `37ce1c8` — Phase 0 (parity foundation), Phase 1a/b/c
(seed + live runtime + permission lookup), and Phase 2 (clone-as-template)
are merged. CI has only one Phase-introduced error (a fix for `37ce1c8`); the
remaining errors are pre-existing in the repo and out of scope for this plan.

---

## 0. Status snapshot — what's already done

| Phase | Commit | What it shipped |
|---|---|---|
| 0a-f | `c02a567` … `7244068` | Schema (6 tables, 8 cols), repo CRUD, tRPC procedures, tool catalog (51), skill catalog (19), Identity / Runtime / Hooks / MCP / Subagents / Tools-tabs UI |
| 1a | `f1fe9d3` | Idempotent `seedOpenllmAgent2` |
| 1b | `12098d3` | Live WebSocket runtime adapter (`runViaOpenllmAgent`) |
| 1c | `0cb7a33` | `agsDraftPermissionRules` lookup replaces auto-deny |
| 2  | `cfa9538` | `cloneAgent` service + Clone button on home table |

Everything below this line is **representational data without runtime
behavior**, plus the items the original Phase 0 plan deferred.

---

## 1. Plan overview — the 10 remaining phases

| # | Phase | Why it matters | Depends on | Effort |
|---|---|---|---|---|
| 3  | Interactive Permission UI    | Completes the Phase 1 trio. "ask" rules currently fall through to deny. | 1c | S |
| 4  | Hook event delivery          | Activates the entire `AgentHooksPage`; 27 events sit idle. | 1b | M |
| 5  | Cost / token tracking        | Live `usage` is already in the WebSocket payload — just persist it. | 1b | S |
| 6  | Slash command parser         | Operational commands (`/clear`, `/compact`, `/cost`, `/help`). Standalone. | — | S |
| 7  | MCP server lifecycle         | Spawn stdio servers, connect SSE/HTTP, expose their tools at runtime. | 1b | L |
| 8  | Subagent execution           | Parent agents can invoke `agsDraftSubagents` rows. | 1b, 7 | M |
| 9  | Plugin loader                | Load vendored `agsDraftPlugins` and expose their tools/hooks. | 4, 7 | M |
| 10 | Cron / scheduled tasks       | Reuse `server/routers/triggers.ts` to fire agents on a schedule. | — | S |
| 11 | Resume / rewind / compact    | Take a prior runtime run as the seed for a new run. | 1b | M |
| 12 | Output styles / status line  | UX customization parity with openllm-agent2. | — | S |

**Total estimate:** 10 phases, ~25 commits, ~5,000 LOC.
S = ~200 LOC / 1 commit, M = ~500 LOC / 2-3 commits, L = ~1,200 LOC / 4-5 commits.

---

## 2. Dependency graph

```
                ┌──── 1c ─── 3 (interactive perm UI)
                │
                ├──── 1b ─── 4 (hooks delivery) ──┐
                │                                 │
                ├──── 1b ─── 5 (cost tracking)    ├── 9 (plugin loader)
   Phase 0/1 ──┤                                 │
                ├──── 1b ─── 7 (MCP lifecycle) ───┤
                │                                 │
                │                                 └── 8 (subagent exec)
                │
                ├──── 1b ─── 11 (resume/rewind/compact)
                │
                ├──── independent ── 6  (slash commands)
                ├──── independent ── 10 (cron scheduling)
                └──── independent ── 12 (output styles)
```

Phases 6, 10, 12 are independent — they can run in parallel with anything.

---

## 3. Detailed phases

### Phase 3 — Interactive Permission UI

**Objective.** When a permission rule has `ruleBehavior = "ask"`, surface the
request to a human in the runs page and wait for their decision instead of
falling through to deny.

**Files touched.**
- `drizzle/tables/agent-studio.ts` — new table `agsPendingPermissionRequests`
  (id, runtimeRunId, toolName, rawPayload, status enum: pending/allowed/denied,
  decidedBy, decidedAt, createdAt). One unique index on `(runtimeRunId, toolName, createdAt)`.
- `server/agent-studio/repository.ts` — CRUD: `createPendingPermissionRequest`,
  `listPendingPermissionRequests(runId)`, `decidePendingPermissionRequest`.
- `server/agent-studio/services/simulation.ts` — when the resolver returns
  `needs_human`, instead of recording a policy event and denying, write a
  pending-request row and **block** until the row's status flips. Use a short
  poll loop with a hard timeout (default 5 min) — no tRPC subscriptions.
- `server/agent-studio/api/router.ts` — new sub-router `permissions` with
  `listPending(runId)`, `decide(requestId, allowed)`. Mutation is
  `protectedProcedure`, not `governedProcedure` (the rule itself is the
  governance gate; the human is just answering it).
- `client/src/pages/agent-studio/AgentRunsPage.tsx` — when a run is in
  `running` state and has pending permission requests, show a banner with
  Allow / Deny buttons per request. Poll every 2s while the run is live.
- `shared/schemas.ts` — `decidePermissionRequestSchema`.

**Schema diff.** 1 table, 1 unique index, ~6 new repo functions, 3 procedures.

**Risk.** R3.1 — the simulation step blocks. Mitigation: hard timeout (5 min)
+ explicit cancel from the runs page that flips status to `denied`.

**Validation.**
1. Seed an agent with an `ask` rule for `Bash`.
2. Run a simulation that triggers `Bash`.
3. Confirm the runs page shows the banner.
4. Click Allow → confirm the run resumes and the trace records `allow`.
5. Re-run, click Deny → confirm openllm-agent2 sees the denial.
6. Re-run, do nothing for 6 min → confirm timeout records `denied` with
   reason "human did not respond".

**Effort.** ~250 LOC, 1 commit.

---

### Phase 4 — Hook event delivery

**Objective.** Make `agsDraftHooks` rows actually fire against the 27 lifecycle
events. Without this, the hooks page is decoration.

**Files touched.**
- `server/agent-studio/services/hook-runner.ts` — **NEW**. `runHook(input)`
  takes the hook row, the event payload, and the working directory, executes
  the `command` field as a child process, and returns the structured result
  (stdout/stderr/exitCode/durationMs). Honors `timeoutMs` and
  `requiresApproval` (the latter defers to Phase 3's pending-request flow).
- `server/agent-studio/services/simulation.ts` — at every place we currently
  emit a runtime event (tool call, memory op, policy event, output), look up
  matching hooks via `repo.listHooks(draftId)` filtered by `eventName` (and
  the `matcher` for PreToolUse/PostToolUse), then await `runHook` for each.
  Persist results into a new runtime trace table (below).
- `drizzle/tables/agent-studio.ts` — new table `agsRuntimeHookExecutions`
  (id, runId, hookId, eventName, matcher, exitCode, stdout, stderr,
  durationMs, createdAt).
- `server/agent-studio/repository.ts` — `appendRuntimeHookExecution`,
  `listRuntimeHookExecutions(runId)`.
- `server/agent-studio/api/router.ts` — extend the existing `runs` sub-router
  with `getHookExecutions(runId)`.
- `client/src/pages/agent-studio/AgentRunsPage.tsx` — new "Hooks" tab next to
  Tools / Memory / Policy showing the runtime hook executions.

**Schema diff.** 1 table, ~3 repo functions, 1 procedure, 1 service file.

**Security.** Hook commands run as child processes — this is a powerful
capability and the user already opts into it by writing the row. The runner
must:
- Use `spawn` (not `exec`) with explicit args
- Set `cwd` to the agent's `workingDirectories[0]` if any, else throw
- Refuse to run when `requiresApproval=true` and no Phase 3 approval exists
- Hard kill on `timeoutMs`
- Sanitize env (only forward a small allowlist of env vars)

**Validation.**
1. Add a `PreToolUse` hook with command `echo "tool=$1"` matched on `Bash`.
2. Run a simulation that calls Bash.
3. Confirm the new Hooks tab shows the execution with stdout `tool=Bash`.
4. Set `timeoutMs=100`, command `sleep 10`, run → confirm killed at 100ms.

**Effort.** ~400 LOC, 2 commits (one for runner+schema, one for UI tab).

---

### Phase 5 — Cost / token tracking

**Objective.** The live runtime adapter already receives `{type: "done", usage}`
from openllm-agent2. We currently throw the usage away. Persist it.

**Files touched.**
- `server/agent-studio/adapters/openllm-runtime-adapter.ts` — extend
  `OpenllmRuntimeResult` with `usage?: { inputTokens, outputTokens, totalTokens, costUsd? }`.
  Read it from the `done` message handler.
- `server/agent-studio/services/simulation.ts` — when `liveResult.usage` is
  set, write it to the runtime run's existing `cost_estimate` and a new
  `token_count` column.
- `drizzle/tables/agent-studio.ts` — add `inputTokens`, `outputTokens`,
  `totalTokens`, `costUsd` columns to `agsRuntimeRuns`. All nullable.
- `server/agent-studio/repository.ts` — extend `updateRuntimeRun` to accept
  the new fields.
- `client/src/pages/agent-studio/AgentRunsPage.tsx` — show token count and
  cost in the run header.

**Schema diff.** 4 nullable columns on existing table, 1 repo signature change.

**Validation.**
1. Run a live simulation against openllm-agent2.
2. Inspect the runtime run row in DB — confirm columns are populated.
3. Confirm the UI shows `1.2k tokens · $0.018`.

**Effort.** ~150 LOC, 1 commit.

---

### Phase 6 — Slash command parser

**Objective.** Parse operational commands (`/help`, `/clear`, `/compact`,
`/cost`, `/cancel`, `/cwd`) so users can control a live run from the runs page.
This is the "operator UI" piece openllm-agent2 has at the CLI.

**Files touched.**
- `server/agent-studio/services/slash-commands.ts` — **NEW**. Pure parser:
  `parseSlashCommand(input: string): { command, args } | null`. Plus an
  executor that maps each command to a service action:
  - `/help` → return list of available commands
  - `/clear` → clear current conversation context (no-op for now, tag as future)
  - `/compact` → call adapter with `{type: "compact"}` (Phase 11 dependency)
  - `/cost` → return current run's `cost_estimate`
  - `/cancel` → abort the run via the adapter's `AbortSignal`
  - `/cwd <path>` → update `agsAgents.workingDirectories`
- `server/agent-studio/api/router.ts` — new sub-router `slashCommands` with
  one procedure: `execute({ runtimeRunId, input })`. Returns the structured
  result.
- `client/src/pages/agent-studio/AgentRunsPage.tsx` — add a small input box
  at the bottom of a live run showing "/" autocomplete.

**Schema diff.** None.

**Validation.**
1. Type `/help` → confirm command list returned.
2. Type `/cost` mid-run → confirm cost shown.
3. Type `/cancel` → confirm the run terminates (ties into adapter's
   existing AbortSignal).

**Effort.** ~200 LOC, 1 commit.

---

### Phase 7 — MCP server lifecycle

**Objective.** Take `agsDraftMcpServers` rows from "decoration" to "actually
spawned and connected". Each transport (stdio / sse / http / sdk) gets a
real connector, and the discovered tools are exposed to the agent loop.

**Files touched.**
- `server/agent-studio/services/mcp/` — **NEW directory**. Files:
  - `mcp-manager.ts` — top-level: `connectMcpServer(row)`,
    `disconnectMcpServer(row)`, `listConnectedTools(draftId)`. Per-process
    in-memory map of `serverId → connection`.
  - `transports/stdio.ts` — spawn a child process with `command` + `args` + `env`,
    speak MCP JSON-RPC over stdin/stdout.
  - `transports/sse.ts` — open an EventSource to `url`, speak JSON-RPC over POST
    + SSE.
  - `transports/http.ts` — POST JSON-RPC requests to `url`.
  - `transports/sdk.ts` — in-process SDK (used for built-in MCP servers; deferred
    to a follow-up if no built-ins exist yet).
- `server/agent-studio/repository.ts` — extend `agsDraftMcpServers` updates
  to write `status` (pending → connected → error).
- `server/agent-studio/services/simulation.ts` — at run start, call
  `mcpManager.ensureConnected(draftId)` so live runs see tools from MCP
  servers in addition to the catalog tools. Pass discovered tools through
  to the openllm-agent2 adapter via a new `extraTools` field on the WS
  payload.
- `server/agent-studio/adapters/openllm-runtime-adapter.ts` — extend
  `OpenllmRuntimeRequest` with optional `extraTools`. Forward as part of
  the `message` payload.
- `client/src/pages/agent-studio/AgentMcpPage.tsx` — add Connect / Disconnect
  buttons that fire the new mutations and reflect `status` live.
- `server/agent-studio/api/router.ts` — extend the `mcp` sub-router with
  `connect(serverId)`, `disconnect(serverId)`, `listTools(serverId)`.

**Schema diff.** None — `status` column already exists from Phase 0a.

**Risk.** R7.1 — child processes can leak; the manager must register a
process exit handler that disconnects all servers.
R7.2 — openllm-agent2's `extraTools` payload is not yet documented; need to
verify the protocol before wiring. **Decision point #5.**

**Validation.**
1. Add a stdio MCP server pointing at a test echo binary.
2. Click Connect → status flips to `connected`, tools appear.
3. Run a simulation → confirm the agent can call the MCP tool.
4. Click Disconnect → confirm child process exits.
5. Kill the dev server → confirm child processes don't outlive it.

**Effort.** ~1,200 LOC across 4-5 commits (one per transport, one for the
manager, one for UI wiring).

---

### Phase 8 — Subagent execution

**Objective.** Allow a parent agent's loop to invoke an `agsDraftSubagents`
row as a child run. This is what makes "Task" tool delegation actually work.

**Files touched.**
- `server/agent-studio/services/subagent-runner.ts` — **NEW**. Takes a
  parent run id + subagent row + input, opens a NEW WebSocket via
  `runViaOpenllmAgent` with the subagent's `prompt`/`tools`/`model`/etc.
  applied as overrides, and returns the result. Records a parent_run_id
  link in the runtime run row.
- `drizzle/tables/agent-studio.ts` — add `parentRunId` (nullable integer)
  to `agsRuntimeRuns`. Index `(parentRunId)` for hierarchical queries.
- `server/agent-studio/services/simulation.ts` — when an agent emits
  `{type: "subagent_invoke", name}`, look up the subagent and call
  `subagentRunner.run(...)`. The result becomes a tool call result in the
  parent's trace.
- `server/agent-studio/api/router.ts` — extend `runs` sub-router with
  `getRunTree(runId)` returning parent + children.
- `client/src/pages/agent-studio/AgentRunsPage.tsx` — show child runs as
  collapsible nested rows.

**Schema diff.** 1 nullable column on existing table, 1 index.

**Validation.**
1. Define a "summarizer" subagent.
2. Run the parent agent and ask it to delegate a summarization.
3. Confirm a child run appears nested under the parent in the runs page.
4. Confirm the parent's trace includes the child's output as a tool result.

**Effort.** ~500 LOC, 2 commits.

---

### Phase 9 — Plugin loader

**Objective.** Load `agsDraftPlugins` rows from disk and expose their
contributions (tools, hooks, MCP servers) to the agent. Plugins are
self-contained directories that can extend any of the above.

**Files touched.**
- `server/agent-studio/services/plugin-loader.ts` — **NEW**. Read the path,
  parse a `plugin.json` manifest, validate against a Zod schema. Manifest
  declares: `tools[]`, `hooks[]`, `mcpServers[]`. The loader merges these
  with the draft's own tables at runtime (without persisting them — they
  remain plugin-owned).
- `server/agent-studio/services/simulation.ts` — at run start, after
  loading the draft's own tables, call `pluginLoader.applyPlugins(draftId)`
  to merge in plugin contributions.
- `server/agent-studio/api/router.ts` — extend `plugins` sub-router with
  `validate(path)` and `loadManifest(path)` so the UI can preview before
  enabling.
- `client/src/pages/agent-studio/AgentToolsPage.tsx` — Plugins tab gains a
  "Validate" button per row that shows the manifest contents.

**Schema diff.** None.

**Risk.** R9.1 — plugins are arbitrary disk paths and could be malicious.
Mitigation: the path field is set by the user via the UI, not auto-discovered.
The loader refuses paths outside the user's `workingDirectories`.

**Validation.**
1. Create a test plugin directory with a tool, hook, and MCP server.
2. Add it to the agent.
3. Click Validate → confirm manifest renders.
4. Run a simulation → confirm tool/hook/MCP all fire from the plugin.

**Effort.** ~500 LOC, 2 commits.

---

### Phase 10 — Cron / scheduled tasks

**Objective.** Trigger an agent run on a schedule. Reuse `server/routers/triggers.ts`
which already has `ingestionMode: "schedule"` — we need a small bridge that
calls `simulation.runSimulation(...)` when the trigger fires.

**Files touched.**
- `server/agent-studio/services/scheduler.ts` — **NEW**. Subscribe to the
  existing trigger system (the trigger's `targetType` becomes
  `"agent_studio_agent"`, the `targetId` is the agent id). When fired,
  call `simulation.runSimulation` with the trigger's payload as input.
- `drizzle/tables/agent-studio.ts` — add `scheduleConfig` jsonb to
  `agsAgentDrafts`: `{ enabled, cron, timezone, payload }`.
- `server/agent-studio/repository.ts` — `getScheduledAgents()` returns all
  agents with `scheduleConfig.enabled = true`.
- `server/agent-studio/api/router.ts` — extend `runtime` sub-router with
  `setSchedule(agentId, config)`.
- `server/_core/index.ts` — at boot, call `scheduler.start()` to register
  all enabled schedules with the trigger system.
- `client/src/pages/agent-studio/AgentRuntimePage.tsx` — add a "Schedule"
  section with a cron input + timezone dropdown + enable toggle.

**Schema diff.** 1 nullable jsonb column, 1 boot hook.

**Decision point #4** — do schedules survive a server restart? Yes (stored
in DB) — but the boot hook must handle stale schedules cleanly.

**Validation.**
1. Set a schedule of `*/5 * * * *` (every 5 min).
2. Restart server → confirm boot logs show "registered 1 scheduled agent".
3. Wait 5 min → confirm a runtime run appears.

**Effort.** ~300 LOC, 1 commit.

---

### Phase 11 — Resume / rewind / compact

**Objective.** Take a prior runtime run and use it as the starting state for
a new run. Also: compact the conversation history to free up context.

**Files touched.**
- `server/agent-studio/services/run-snapshot.ts` — **NEW**. Two functions:
  - `snapshotRun(runId)` returns the full message history (steps, tool calls,
    memory events) as a structured payload.
  - `resumeFromSnapshot(snapshot, newInput)` creates a new runtime run and
    pre-seeds it with the snapshot, then calls the live adapter with the
    snapshot serialized into the WS payload as `{type: "resume", history}`.
- `drizzle/tables/agent-studio.ts` — add `resumedFromRunId` (nullable) and
  `compactedFromRunId` (nullable) columns to `agsRuntimeRuns`.
- `server/agent-studio/api/router.ts` — extend `runs` sub-router with
  `resume(runId, input)` and `compact(runId)`.
- `client/src/pages/agent-studio/AgentRunsPage.tsx` — add Resume / Compact
  buttons to each completed run row.

**Schema diff.** 2 nullable columns on existing table.

**Risk.** R11.1 — openllm-agent2's WS protocol may not support `{type: "resume"}`.
**Decision point #6** — verify the protocol or build resume locally by
re-sending the prior message history as context.

**Validation.**
1. Run a simulation, completing successfully.
2. Click Resume with new input → confirm a new run starts with the old
   context as preamble.
3. Click Compact → confirm a new run starts with a summarized version of
   the old context.

**Effort.** ~500 LOC, 2 commits.

---

### Phase 12 — Output styles / status line / themes

**Objective.** UX customization parity. openllm-agent2 has output styles
(plain / markdown / json), a status line (current model + cost + time), and
themes (dark / light / monokai).

**Files touched.**
- `drizzle/tables/agent-studio.ts` — add `outputStyle`, `statusLineConfig`
  (jsonb), `theme` columns to `agsAgentDrafts`. All nullable.
- `client/src/pages/agent-studio/AgentRuntimePage.tsx` — three new form
  fields with previews.
- `client/src/pages/agent-studio/AgentRunsPage.tsx` — render runtime output
  according to `outputStyle`. Show the status line above each live run.
- `server/agent-studio/repository.ts` — extend `updateRuntimeConfig` patch.

**Schema diff.** 3 nullable columns on existing table.

**Validation.**
1. Set output style to `markdown` → confirm runs render markdown.
2. Set theme to `monokai` → confirm UI repaints (or skip if global theme).
3. Confirm status line shows model + cost + time.

**Effort.** ~250 LOC, 1 commit.

---

## 4. Cross-cutting concerns

### 4.1 Encryption

Phases 7 (MCP env vars) and 9 (plugin manifests) may carry secrets. Reuse
`server/_core/encryption.ts` like Phase 0d did for `providerConfig.apiKey`.

### 4.2 Existing-platform footprint

The 22-line additive footprint (App.tsx, MainLayout.tsx, drizzle/schema.ts,
server/routers.ts) must not grow. New tables get added to `drizzle/schema.ts`
via re-export — measure each phase's footprint diff in the commit message.

### 4.3 Governance gates

Most new mutations stay `protectedProcedure`. The exceptions:
- Phase 7 MCP `connect/disconnect` — `governedProcedure` (spawning child processes is sensitive)
- Phase 9 Plugin `validate/load` — `governedProcedure` (loading code from disk)
- Phase 10 Cron `setSchedule` — `protectedProcedure` (the user is configuring their own agent)

### 4.4 Test coverage

After every phase, the static checklist from `phase-0-plan.md` section 8
applies plus phase-specific items in each section above.

### 4.5 Pre-existing CI errors

CI is currently failing on ~22 zod-version errors in `shared/schemas.ts` plus
~8 errors in unrelated modules (`code-studio`, `prm`, `data-analysis`). These
are out of scope. Each phase's commit must NOT add new TypeScript errors —
verify with `git log -p` review of the failure list.

---

## 5. Decision points (need user confirmation before Builder starts)

| # | Decision | Options | My recommendation |
|---|---|---|---|
| 1 | **Phase order** | (a) sequential 3 → 12 (b) by impact: 3, 5, 6, 4, 10, 11, 7, 8, 9, 12 (c) parallelize indep phases (6/10/12) | **(b)** — front-load the small high-impact items, save the L-effort MCP + subagent + plugin work for last |
| 2 | **Phase 3 polling vs subscriptions** | (a) 2s poll on the runs page (b) add tRPC subscriptions infra | **(a)** — repo has zero subscription infra; adding it just for permissions is overkill |
| 3 | **Phase 4 hook security** | (a) any user can write any command (b) hooks require explicit approval per-add | **(a)** — the user is configuring their own agent; same trust as cron/triggers |
| 4 | **Phase 10 boot-time schedule registration** | (a) register on every boot (b) lazy-register when first viewed | **(a)** — schedules must survive restarts |
| 5 | **Phase 7 openllm-agent2 `extraTools` protocol** | verify before building | **investigate** — read openllm-agent2's `ws-bridge.ts` source before Phase 7 starts; may require an upstream PR |
| 6 | **Phase 11 resume protocol** | (a) WS-level (b) re-send history as preamble | **investigate** — same as #5; if WS doesn't support resume, fall back to (b) |
| 7 | **Phase 12 theme scope** | (a) per-agent (b) global studio theme | **(a)** — per-agent matches the openllm CLI output style model |
| 8 | **Skip any phase?** | drop 12 (low value), drop 9 (no plugins yet) | **keep all** — they round out the parity story |
| 9 | **Effort budget cap** | unbounded vs cap at 5 commits per phase | **cap at 5** — anything bigger gets re-planned |
| 10 | **CI green requirement** | (a) fix pre-existing errors first (b) only my new code must be clean | **(b)** — pre-existing errors are someone else's lane |

---

## 6. Risks (consolidated)

| # | Risk | Phase | Mitigation |
|---|---|---|---|
| R1  | Polling permission requests creates DB load | 3 | Cap to live runs only; 2s interval; auto-stop on terminal status |
| R2  | Hook child processes leak | 4 | Process registry + exit handler |
| R3  | Token usage shape varies by provider | 5 | Defensive parse; allow nulls |
| R4  | Slash commands collide with normal text | 6 | Strict `^/` prefix only |
| R5  | MCP child processes outlive dev server | 7 | Boot-time reaper + process.on('exit') hook |
| R6  | MCP `extraTools` protocol unknown | 7 | Verify upstream first (Decision #5) |
| R7  | Subagent recursion loops | 8 | Max depth = 3, tracked via `parentRunId` chain length |
| R8  | Plugin manifest is arbitrary code | 9 | Schema validation + path allowlist |
| R9  | Schedules fire after server restart create duplicates | 10 | Idempotency key on the trigger row |
| R10 | Resume protocol unsupported upstream | 11 | Fall back to history-as-preamble (Decision #6) |
| R11 | New columns break Phase 2 clone | 5/8/10/11/12 | Each phase must extend `cloneAgent` to copy the new columns |

---

## 7. Effort estimate (totals)

| Phase | LOC (new) | LOC (mod) | Commits |
|---|---|---|---|
| 3  Interactive perm UI       | 250   | 80   | 1 |
| 4  Hook delivery             | 400   | 100  | 2 |
| 5  Cost / token tracking     | 150   | 60   | 1 |
| 6  Slash commands            | 200   | 60   | 1 |
| 7  MCP lifecycle             | 1,200 | 200  | 5 |
| 8  Subagent execution        | 500   | 120  | 2 |
| 9  Plugin loader             | 500   | 100  | 2 |
| 10 Cron / scheduled          | 300   | 80   | 1 |
| 11 Resume / rewind / compact | 500   | 100  | 2 |
| 12 Output styles / status    | 250   | 80   | 1 |
| **Total**                    | **~4,250** | **~980** | **~18** |

Plus Reviewer/Tester/Governance pass commits: ~3-5 cleanup commits expected
across the full sequence. Final total: **~22 commits**.

---

## 8. What this plan does NOT do

- **It does not refactor the existing 51-tool catalog.** Tools added by MCP
  servers and plugins are merged at runtime, not persisted to the catalog.
- **It does not build a UI for editing the slash command list.** Commands
  are hardcoded for now.
- **It does not implement workspace/project switching from the runs page.**
  Working directories are still draft-level, not run-level.
- **It does not add multi-tenant isolation between agents.** All MCP child
  processes share the dev server's filesystem and env.
- **It does not fix the pre-existing CI errors.** Those are tracked
  separately.

---

## 9. Builder may NOT start until decision points 1-10 are answered.

Once answered, the Builder follows the order chosen in Decision #1, commits
each phase atomically, and runs the per-phase validation checklist before
moving on. After every phase, the Reviewer + Tester + Governance roles run
the `phase-0-plan.md` section 8 checklist plus the phase-specific items
above.
