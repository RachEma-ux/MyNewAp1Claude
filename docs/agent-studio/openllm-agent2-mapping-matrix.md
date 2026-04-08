# openllm-agent2 → AI Agent Studio — Field & Capability Mapping Matrix

**Goal:** verify that every concept, field, and step of openllm-agent2 has a clear home inside AI Agent Studio. Identify gaps before building the integration.

**Sources inspected:**
- `~/openllm-agent2/src/entrypoints/sdk/coreSchemas.ts` — `AgentDefinitionSchema` (canonical agent shape)
- `~/openllm-agent2/src/types/permissions.ts` — `PermissionMode`, `PermissionRule`, `PermissionUpdate`
- `~/openllm-agent2/src/web/server.ts` + `~/openllm-agent2/src/web/ws-bridge.ts` — runtime protocol
- `~/openllm-agent2/SkillsTools.md` — 51 tools, ~40 slash commands, 15 providers
- `~/openllm-agent2/src/skills/`, `~/openllm-agent2/src/tools/`, `~/openllm-agent2/src/commands/`, `~/openllm-agent2/src/hooks/`
- `drizzle/tables/agent-studio.ts` — `agsAgents` + `agsAgentDrafts` schemas
- `client/src/pages/agent-studio/Agent*.tsx` — Identity / Behavior / Prompts / Tools / Knowledge / Memory / Workflows / Governance / Runs / Versions / Publish UI

Status legend: ✅ = exact match · 🟡 = partial / needs adapter · ❌ = missing in studio · ➕ = studio has it but openllm doesn't (no gap, just noted)

---

## A. Agent identity

| openllm-agent2 field | Studio field | Status | Notes / gap |
|---|---|---|---|
| `description` (natural language "when to use") | `agsAgents.description` + `agsAgentDrafts.description` | ✅ | exact match |
| `prompt` (system prompt) | `agsAgentDrafts.systemInstructions` | ✅ | exact match |
| `model` (alias or full ID) | `runtimeConfig.model` (jsonb sub-field, no UI) | 🟡 | jsonb exists, no form field, no picker |
| `effort` (reasoning level) | — | ❌ | no equivalent — needs `runtimeConfig.effort` field + UI |
| `maxTurns` (agentic round-trips) | — | ❌ | no equivalent — needs `runtimeConfig.maxTurns` field + UI |
| `background` (fire-and-forget) | — | ❌ | no equivalent — needs `runtimeConfig.background` boolean |
| `initialPrompt` (auto-submitted first turn) | — | ❌ | missing — needs `agsAgentDrafts.initialPrompt` text field |
| `criticalSystemReminder_EXPERIMENTAL` | — | ❌ | missing — minor (experimental); could go in `promptExamples` jsonb |
| `agsAgents.internalKey` | (no equivalent in openllm — slug derived from filename) | ➕ | studio extension; fine |
| `agsAgents.lifecycleState` | (no equivalent — openllm agents are file-based, no lifecycle) | ➕ | studio extension; fine |
| `agsAgents.environment` | (no equivalent) | ➕ | studio extension; fine |
| `agsAgents.visibility` | (no equivalent — openllm is local-only) | ➕ | studio extension; fine |

**Gaps in identity:** `effort`, `maxTurns`, `background`, `initialPrompt`, `criticalSystemReminder_EXPERIMENTAL`.

---

## B. Tools & Permissions

| openllm-agent2 concept | Studio concept | Status | Notes / gap |
|---|---|---|---|
| `tools: string[]` (allow-list of tool names) | `agsDraftToolBindings` rows with `allowedActions` | 🟡 | studio models tools as bindings with allow/block per binding; openllm uses a single name array. The studio model is **richer**, but we need to seed the 51 openllm tools as catalog entries (currently the catalog has 12 generic ones) |
| `disallowedTools: string[]` | `agsDraftToolBindings.blockedActions` | ✅ | conceptually equivalent |
| `PermissionMode` (5 values: default, acceptEdits, bypassPermissions, plan, dontAsk) | — | ❌ | **missing** — studio has `governancePolicy.approvalRequired` boolean but no permission-mode enum. Needs `governancePolicy.permissionMode` field |
| `PermissionRule { source, behavior, ruleValue }` | — | ❌ | **missing** — studio doesn't model per-rule permission updates with source tracking |
| `PermissionRuleSource` (userSettings / projectSettings / localSettings / cliArg / session) | — | ❌ | **missing** — no source tracking |
| `PermissionUpdate` operations (addRules / replaceRules / removeRules / setMode / addDirectories / removeDirectories) | — | ❌ | **missing** — studio has no programmatic permission update API |
| `addDirectories` (working dir allow-list) | — | ❌ | **missing** — no concept of "working directories" in studio |
| `mcpServers` (per-agent MCP servers) | — | ❌ | **missing** — studio has no MCP server bindings |

**Gaps in tools/permissions (major):**
- All 51 openllm tools missing from catalog (currently 12 generic placeholders)
- `PermissionMode` enum (5 modes)
- `PermissionRule` with source tracking
- `PermissionUpdate` operations
- Working directory allow-list
- MCP server bindings

---

## C. Skills

| openllm-agent2 concept | Studio concept | Status | Notes / gap |
|---|---|---|---|
| `skills: string[]` (preloaded skill names) | — | ❌ | **missing** — studio has no skill concept at all |
| Skill discovery from `~/.claude/skills/` and `.claude/skills/` directories | — | ❌ | **missing** — no skill registry |
| Skill packs (9 packs in `RachEma-ux/openllm-skills`) | — | ❌ | **missing** — no pack model |
| Skill metadata (`name`, `description`, `allowed-tools`, `disable-model-invocation`, `args`) | — | ❌ | **missing** |
| `/<skill-name>` slash invocation | — | ❌ | **missing** — no slash command parser |
| Skill output style references | — | ❌ | **missing** |

**Gaps in skills (critical):** the entire skill subsystem is missing from studio.

---

## D. Memory

| openllm-agent2 concept | Studio concept | Status | Notes / gap |
|---|---|---|---|
| `memory: 'user' \| 'project' \| 'local'` (file-based memory scope) | `agsDraftMemoryConfigs` rows with `memoryType` (session / persistent / episodic / preference / shared) | 🟡 | **different model** — openllm uses filesystem scopes (`~/.claude/agent-memory/<type>/`), studio uses semantic memory types. Both valid; need a mapping. |
| Auto-loaded `CLAUDE.md` files in scopes | — | ❌ | **missing** — no auto-loaded markdown memory |
| `MemoryHookEvents` | — | ❌ | **missing** — no memory lifecycle hooks |
| `agsDraftMemoryConfigs.retentionDays` | — | ➕ | studio extension |
| `agsDraftMemoryConfigs.deletionPolicy` | — | ➕ | studio extension |
| `agsDraftMemoryConfigs.privacyRules` | — | ➕ | studio extension |

**Gaps in memory:** filesystem-scoped memory, CLAUDE.md auto-loading, memory hooks.

---

## E. Hooks (Lifecycle Events)

openllm-agent2 has **27 hook events**. Studio has **none**.

| openllm hook event | Studio equivalent | Status |
|---|---|---|
| `PreToolUse` | — | ❌ |
| `PostToolUse` | — | ❌ |
| `PostToolUseFailure` | — | ❌ |
| `Notification` | — | ❌ |
| `UserPromptSubmit` | — | ❌ |
| `SessionStart` | — | ❌ |
| `SessionEnd` | — | ❌ |
| `Stop` | — | ❌ |
| `StopFailure` | — | ❌ |
| `SubagentStart` | — | ❌ |
| `SubagentStop` | — | ❌ |
| `PreCompact` | — | ❌ |
| `PostCompact` | — | ❌ |
| `PermissionRequest` | — | ❌ |
| `PermissionDenied` | — | ❌ |
| `Setup` | — | ❌ |
| `TeammateIdle` | — | ❌ |
| `TaskCreated` | — | ❌ |
| `TaskCompleted` | — | ❌ |
| `Elicitation` | — | ❌ |
| `ElicitationResult` | — | ❌ |
| `ConfigChange` | — | ❌ |
| `WorktreeCreate` | — | ❌ |
| `WorktreeRemove` | — | ❌ |
| `InstructionsLoaded` | — | ❌ |
| `CwdChanged` | — | ❌ |
| `FileChanged` | — | ❌ |

**Gaps in hooks (critical):** all 27 hook events missing. Studio has no `agsDraftHooks` table at all.

---

## F. Providers & Models

| openllm-agent2 concept | Studio concept | Status | Notes / gap |
|---|---|---|---|
| 15 providers (Ollama, OpenAI, Anthropic, Gemini, DeepSeek, Groq, Together, Fireworks, Mistral, OpenRouter, GitHub Models, LM Studio, Bedrock, Vertex, Atomic Chat) | `runtimeConfig` jsonb (no schema) | 🟡 | jsonb can hold it but no UI, no enum, no validation |
| `/api/manifest` runtime model catalog (live from openllm-agent2) | — | ❌ | no equivalent — studio has no model picker |
| Model alias system (sonnet/opus/haiku) | — | ❌ | no alias resolver |
| Per-agent API key | — | 🟡 | jsonb but no encryption, no UI, no key-rotation |
| `noKeyNeeded` flag for local providers | — | ❌ | no equivalent |
| `configured` flag (provider has key set) | — | ❌ | no equivalent |

**Gaps in providers/models:** model picker, alias resolver, key storage with encryption, configured-state badge.

---

## G. Slash Commands

openllm-agent2 has **~40 slash commands** (`/add-dir`, `/agents`, `/branch`, `/clear`, `/compact`, `/config`, `/context`, `/copy`, `/cost`, `/diff`, `/doctor`, `/exit`, `/fast`, `/files`, `/help`, `/ide`, `/init`, `/keybindings`, `/memory`, `/model`, `/mcp`, `/onboard-github`, `/permissions`, `/plan`, `/plugin`, `/pr-comments`, `/provider`, `/reload-plugins`, `/rename`, `/resume`, `/review`, `/session`, `/skills`, `/status`, `/tasks`, `/theme`, `/usage`, `/vim`).

Studio: **0 slash commands**.

| Command category | Studio equivalent | Status |
|---|---|---|
| Core operational (`/clear`, `/compact`, `/cost`, `/help`) | — | ❌ |
| Configuration (`/config`, `/permissions`, `/provider`, `/model`) | partial via UI forms | 🟡 |
| Sessions (`/session`, `/resume`, `/exit`) | — | ❌ |
| Plan mode (`/plan`) | — | ❌ |
| Skills/agents (`/agents`, `/skills`, `/init`) | — | ❌ |
| MCP (`/mcp`) | — | ❌ |
| IDE / theme / keybindings | not relevant for studio | ➕ |

**Gaps:** no slash command surface, no command parser. Some are settings-equivalent (model/provider/permissions handled by UI forms), but ~30 have no studio equivalent.

---

## H. MCP (Model Context Protocol)

| openllm-agent2 concept | Studio concept | Status |
|---|---|---|
| `mcpServers` per-agent (stdio / SSE / http / SDK / claudeAIProxy transports) | — | ❌ |
| `McpServerStatusSchema` (config + status + connectionState + tools + resources) | — | ❌ |
| `setMcpServers` operation | — | ❌ |
| `ListMcpResources` / `ReadMcpResource` tools | — | ❌ |
| MCP-loaded tools merged into agent tool set | — | ❌ |

**Gaps in MCP (critical for "real" Claude Code-style agent):** entire MCP layer missing.

---

## I. Plugins

| openllm-agent2 concept | Studio concept | Status |
|---|---|---|
| `SdkPluginConfigSchema` (`type: 'local', path: string`) | — | ❌ |
| `/plugin` and `/reload-plugins` commands | — | ❌ |
| Plugin-bundled tools/skills/commands | — | ❌ |

**Gaps in plugins:** entire plugin model missing.

---

## J. Sessions & State

| openllm-agent2 concept | Studio concept | Status | Notes |
|---|---|---|---|
| `session_id` (per-conversation persistent state) | `agsRuntimeRuns.id` per execution | 🟡 | studio's runs are per-execution, not per-conversation |
| `parent_tool_use_id` | — | ❌ | no parent-tool tracking in trace events |
| Resume/rewind (`/resume`, `/rewind`) | — | ❌ | studio has no resume/rewind |
| `RewindFilesResultSchema` | — | ❌ | no file-snapshot rewind |
| Compact (`/compact`, `PreCompact`/`PostCompact` hooks) | — | ❌ | no context compaction |
| Cost tracking (`/cost`, `cost_usd` in done events) | `agsSimulationRuns.costEstimate` | 🟡 | studio has cost field but no real cost tracking from runs |
| Token usage (`input_tokens`, `output_tokens`) | — | ❌ | not stored in runtime runs |

**Gaps:** parent-tool tracking, resume/rewind, compaction, real cost/token tracking.

---

## K. Subagents & Teams

| openllm-agent2 concept | Studio concept | Status |
|---|---|---|
| `Agent` tool (launches subagents) | — | ❌ — tools/agents has it as a planned tool catalog entry |
| `TeamCreate` / `TeamDelete` tools | — | ❌ |
| `SendMessage` between agents | — | ❌ |
| `SubagentStart` / `SubagentStop` hooks | — | ❌ |
| Background agents (`background: true`) | — | ❌ |
| `ListPeers` (peer agents in swarm) | — | ❌ |

**Gaps in multi-agent:** entire subagent + team model missing. Studio's "Workflows" page has nodes/edges but doesn't model live subagent invocation.

---

## L. Output formatting & status

| openllm-agent2 concept | Studio concept | Status |
|---|---|---|
| `OutputFormat` (json_schema) | `agsAgentDrafts.outputContract` (free text) | 🟡 | studio has free-text contract; openllm has structured JSON Schema |
| `outputStyles` directory (custom output formatters) | — | ❌ |
| `statusline` (custom status line script) | — | ❌ |
| `theme`, `keybindings`, `vim mode` | not relevant | ➕ |

**Gaps:** structured output schema, output styles, status line.

---

## M. Worktrees & Sandboxing

| openllm-agent2 concept | Studio concept | Status |
|---|---|---|
| `EnterWorktree` / `ExitWorktree` tools | — | ❌ |
| `WorktreeCreate` / `WorktreeRemove` hooks | — | ❌ |
| Working directory tracking (`addDirectories` permission) | — | ❌ |
| Sandbox toggle (`/sandbox-toggle`) | — | ❌ |

**Gaps:** entire worktree + sandbox model missing.

---

## N. Communication channels

| openllm-agent2 protocol | Studio equivalent | Status |
|---|---|---|
| WebSocket `/ws` with `{type:"message", content, provider, model, apiKey}` | — | ❌ — studio has no live runtime channel; simulation is deterministic |
| Streaming `{type:"token"}` chunks | — | ❌ |
| `{type:"permission_request"}` mid-stream | — | ❌ |
| `{type:"cancel"}` | — | ❌ |
| `Notification` events | — | ❌ |
| `PushNotificationTool` | — | ❌ |
| `Brief` tool (status updates to user) | — | ❌ |

**Gaps:** no live runtime channel at all.

---

## O. Background tasks & scheduling

| openllm-agent2 concept | Studio concept | Status |
|---|---|---|
| `TaskCreate` / `TaskList` / `TaskGet` / `TaskUpdate` / `TaskStop` / `TaskOutput` tools | — | ❌ |
| `ScheduleCron` / `CronCreate` / `CronDelete` / `CronList` tools | — | ❌ |
| `RemoteTrigger` tool (manage scheduled remote agents) | — | ❌ |
| `background: true` agent flag | — | ❌ |

**Gaps:** no task system, no cron, no background execution.

---

# Summary — what Agent Studio is missing to be a "fully native" host for openllm-agent2

## Critical (blocks "fully native")
1. **51 tools as a real catalog** (currently 12 generic placeholders)
2. **Skills subsystem** — registry, packs, slash invocation, allowed-tools per skill
3. **27 hook events** — `agsDraftHooks` table + UI section
4. **MCP server bindings** — `agsDraftMcpServers` table + UI section
5. **PermissionMode** enum + `PermissionRule` model + `PermissionUpdate` operations
6. **Plugin loader** — `agsDraftPlugins` table + UI section
7. **Live runtime channel** — WebSocket adapter to openllm-agent2's `/ws`
8. **Subagent + team model** — `agsDraftSubagents` table + invocation
9. **Worktree + working directory model** — `agsDraftWorktrees` table

## High (needed for parity but not blocking)
10. **Provider/model picker** — runtime config form with provider enum + live model list
11. **API key storage** — encrypted, per-agent
12. **`effort`, `maxTurns`, `background`, `initialPrompt`, `criticalSystemReminder`** identity fields
13. **CLAUDE.md auto-loaded memory** — 3 scopes (user/project/local)
14. **Output style + status line** support
15. **Real cost/token tracking** in runtime runs
16. **Session resume/rewind/compact**

## Medium (UX/operational)
17. **Slash command parser** — at least the operational commands (`/clear`, `/compact`, `/cost`, `/help`, `/plan`)
18. **Background tasks + cron** — `agsBackgroundTasks` table
19. **Notification + Brief surfaces**

## Studio extensions to keep (no openllm equivalent — by design)
- Lifecycle states (`new` → `published`)
- Versioning (immutable snapshots)
- Publish/release flow with approval steps
- Governance verdict + readiness score
- Workspace/visibility model

---

# Recommended next step

Before building the integration, **add these 9 missing primitives to Agent Studio's data model and UI**:

1. `agsDraftHooks` table + Hooks tab
2. `agsDraftMcpServers` table + MCP tab
3. `agsDraftSkills` table (or reuse tool bindings with `kind:'skill'`) + Skills tab
4. `agsDraftSubagents` table + Subagents tab
5. `agsDraftPlugins` table + Plugins tab
6. `agsDraftWorktrees` table (or `runtimeConfig.workingDirectories: string[]`)
7. Identity fields: `effort`, `maxTurns`, `background`, `initialPrompt`
8. Governance fields: `permissionMode` enum, `permissionRules` array
9. `agsAgentDrafts.providerConfig` jsonb (provider/model/apiKey/effort) + UI form

Then the openllm-agent2 import becomes a one-to-one field copy. **Without these, importing openllm-agent2 is lossy** — the studio agent record can't represent half of what openllm-agent2 actually is.

---

*Generated 2026-04-08 from inspection of openllm-agent2 source + agent studio schema.*
