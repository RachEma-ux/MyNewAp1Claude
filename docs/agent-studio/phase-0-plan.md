# Phase 0 — Native parity for openllm-agent2 in Agent Studio

**Author:** Planner Agent
**Status:** awaiting green light (per AGENTS.md, Builder may NOT start until approved)
**Source of truth:** `docs/agent-studio/openllm-agent2-mapping-matrix.md`

---

## 1. Objective

Bring AI Agent Studio's data model + UI to **lossless parity** with openllm-agent2's native primitives, so that:

1. An openllm-agent2 agent can be imported into Studio with **zero field loss**.
2. New agents can be created in Studio that target openllm-agent2 as their runtime.
3. The Studio UI honestly represents what an openllm-agent2 agent **is**, not a partial subset.

This pass adds the **data model + UI surfaces** for the 9 missing primitives. It does **NOT** wire the live WebSocket runtime channel — that's Phase 1, after Phase 0 lands and stabilizes.

## 2. Out of scope (deferred to Phase 1+)

- Live WebSocket runtime adapter (`/ws` connection to openllm-agent2)
- Real LLM execution inside `simulation.ts`
- Importing the openllm-agent2 row itself (the seed)
- Cron / scheduled tasks
- Resume / rewind / compact
- Slash command parser (operational commands)
- Real cost/token tracking from runs
- Output styles, status line, themes (UI customization)

## 3. Touched files

### Schema (1 file)
- `drizzle/tables/agent-studio.ts` — **6 new tables** + **8 new columns** on `agsAgentDrafts`.

### Server module (4 files modified, 0 new)
- `server/agent-studio/repository.ts` — ~30 new CRUD functions (one set per new table)
- `server/agent-studio/api/router.ts` — 6 new sub-routers (`hooks`, `mcp`, `skills`, `subagents`, `plugins`, `permissionRules`); extend `identity`, `governance`, `tools` routers
- `server/agent-studio/shared/schemas.ts` — ~25 new Zod schemas for the procedures
- `server/agent-studio/shared/constants.ts` — 4 new enums: `HOOK_EVENTS` (27), `PERMISSION_MODES` (5), `MCP_TRANSPORTS` (4), `PROVIDER_KEYS` (15)

### Adapters (1 modified, 1 new)
- `server/agent-studio/adapters/tool-catalog-adapter.ts` — **expand from 12 → 51 tools** with the real openllm-agent2 catalog
- `server/agent-studio/adapters/skill-catalog-adapter.ts` — **NEW** — reads vendored skill `.md` files from `server/agent-studio/skills/` (local-first per the user requirement)

### Vendored skill content (9 directories, ~30 files)
- `server/agent-studio/skills/agents/` — agent management skills
- `server/agent-studio/skills/automation/`
- `server/agent-studio/skills/chat/`
- `server/agent-studio/skills/database/`
- `server/agent-studio/skills/documents/`
- `server/agent-studio/skills/frontend/`
- `server/agent-studio/skills/general/`
- `server/agent-studio/skills/governance/`
- `server/agent-studio/skills/providers/`

Each pack contains a `pack.json` manifest + per-skill `<name>.md` with YAML frontmatter (`name`, `description`, `allowed_tools`, `requires_approval`, `args`).

**Source:** these files are seeded from `~/openllm-skills` if it exists locally, otherwise stub `pack.json` files for the 9 packs are created and the user populates them later. **Zero network calls at runtime.**

### Frontend (5 modified, 5 new)
- `client/src/components/agent-studio/AgentStudioSidebar.tsx` — add 5 new sidebar entries under existing groups
- `client/src/components/agent-studio/AgentStudioShell.tsx` — register 5 new routes in `parseRoute()`, lazy-import 5 new pages
- `client/src/pages/agent-studio/AgentIdentityPage.tsx` — add `effort`, `maxTurns`, `background`, `initialPrompt`, `criticalSystemReminder`, `workingDirectories` form fields
- `client/src/pages/agent-studio/AgentGovernancePage.tsx` — add `permissionMode` enum dropdown + permission rules table
- `client/src/pages/agent-studio/AgentToolsPage.tsx` — add Tabs: **Tools | Skills | Plugins**

New page files:
- `client/src/pages/agent-studio/AgentHooksPage.tsx`
- `client/src/pages/agent-studio/AgentMcpPage.tsx`
- `client/src/pages/agent-studio/AgentSubagentsPage.tsx`
- `client/src/pages/agent-studio/AgentRuntimePage.tsx` (provider/model/apiKey picker — separate from Identity)
- `client/src/pages/agent-studio/AgentSkillsPage.tsx` *(or merged into Tools as a tab — see decision point #2 below)*

### Routes (1 file modified)
- `client/src/App.tsx` — add new routes for Hooks / MCP / Subagents / Runtime / Skills (5 lines)

**Total:** 1 schema file, 4 backend files, 2 adapter files (1 new), ~30 vendored skill files, 10 frontend files (5 new + 5 modified), 1 route file. **~21 file edits + ~30 vendored content files**.

## 4. Schema additions

### New tables

```typescript
// 1. Hooks — 27 lifecycle events
agsDraftHooks {
  id, draftId, eventName (enum HOOK_EVENTS),
  command (text), timeoutMs (integer), requiresApproval (boolean),
  matcher (text — for PreToolUse/PostToolUse tool name patterns),
  enabled (boolean default true),
  createdAt, updatedAt
}

// 2. MCP servers
agsDraftMcpServers {
  id, draftId, name,
  transport (enum: stdio | sse | http | sdk),
  command (text), args (jsonb string[]), env (jsonb), url (text),
  status (enum: pending | connected | disconnected | error),
  enabled (boolean default true),
  createdAt, updatedAt
}

// 3. Skills (could reuse tool bindings with kind:'skill', but separate is cleaner)
agsDraftSkills {
  id, draftId, packKey, skillKey, skillName,
  allowedTools (jsonb string[]), blockedTools (jsonb string[]),
  requiresApproval (boolean), argsSchema (jsonb),
  enabled (boolean default true),
  createdAt
}

// 4. Subagents
agsDraftSubagents {
  id, draftId, name, description,
  prompt (text), tools (jsonb string[]), disallowedTools (jsonb string[]),
  model (text), maxTurns (integer), background (boolean),
  effort (text), permissionMode (enum PERMISSION_MODES),
  memory (text — user|project|local),
  initialPrompt (text), createdAt
}

// 5. Plugins
agsDraftPlugins {
  id, draftId, type (enum: local), path (text),
  enabled (boolean default true), createdAt
}

// 6. Permission rules
agsDraftPermissionRules {
  id, draftId, ruleSource (enum: userSettings | projectSettings | localSettings | cliArg | session),
  ruleBehavior (enum: allow | deny | ask),
  toolPattern (text), contentPattern (text),
  createdAt
}
```

### New columns on `agsAgentDrafts`

```typescript
{
  // Identity extensions
  effort (varchar 32),                 // low | medium | high | max | <integer>
  maxTurns (integer),                  // agentic round-trips
  background (boolean default false),  // fire-and-forget
  initialPrompt (text),                // auto-submitted first turn
  criticalSystemReminder (text),       // experimental field

  // Governance / runtime
  permissionMode (varchar 32),         // PERMISSION_MODES enum
  workingDirectories (jsonb string[]), // addDirectories permission

  // Provider / runtime config
  providerConfig (jsonb), // { provider, model, apiKey, baseUrl, additionalHeaders }
}
```

All columns are nullable. Existing rows keep working with no migration data.

### New unique indexes
- `agsDraftHooks (draftId, eventName, matcher)` — prevent duplicate hook+event+matcher
- `agsDraftMcpServers (draftId, name)` — prevent duplicate MCP server names
- `agsDraftSkills (draftId, packKey, skillKey)` — prevent duplicate skill attachments
- `agsDraftSubagents (draftId, name)` — prevent duplicate subagent names
- `agsDraftPlugins (draftId, path)` — prevent duplicate plugin paths

## 5. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Schema migration on existing data** | All new tables are independent; all new columns are nullable. Migration is purely additive. Zero risk to existing rows. |
| R2 | **Tool catalog expansion (12→51) breaks existing tool bindings** | New entries are additive. Existing 12 keys are preserved. Existing `ags_draft_tool_bindings` rows still resolve. |
| R3 | **Skill .md vendoring without `~/openllm-skills` checked out** | Plan creates 9 stub `pack.json` files if local source missing; user populates later. No build break. |
| R4 | **New sidebar entries crowding the rail** | Group them under existing **Design** group. Each is a sub-route, not a top-level tab. |
| R5 | **Permission rules conflict with existing `governancePolicy.blockedActions`** | New `agsDraftPermissionRules` table is additive. Existing `blockedActions` jsonb stays. UI shows both. |
| R6 | **Backwards compat for existing agents** | Existing `agsAgents` rows have all new draft columns NULL. UI shows empty form fields, never crashes. |
| R7 | **Zod schema enum drift** | All new enums (`HOOK_EVENTS`, `PERMISSION_MODES`, `MCP_TRANSPORTS`, `PROVIDER_KEYS`) are constants in `shared/constants.ts`, single source of truth. |
| R8 | **Frontend bundle size from 5 new pages** | Lazy-loaded via `lazy(() => import(...))` like the existing 17 pages. No bundle impact for unused routes. |
| R9 | **API key plaintext storage in `providerConfig`** | **DECISION POINT #1** — encrypted at rest using existing platform encryption helpers (`server/_core/encryption.ts`) before persisting. The repo already has `validateProductionEnv()` enforcing keys exist. |
| R10 | **Studio tRPC router count growing past tooling limits** | Currently 65 procedures across 16 sub-routers; this pass adds ~25 procedures across 6 new sub-routers (total ~90 across 22 sub-routers). Well within tRPC's practical limits. |

## 6. Decision points (need user confirmation before Builder starts)

| # | Decision | Options | My recommendation |
|---|---|---|---|
| 1 | **API key encryption at rest** | (a) plaintext jsonb (b) encrypted via platform encryption helpers | **(b)** — the repo already mandates encryption; reusing the helpers is the only safe choice |
| 2 | **Skills UI placement** | (a) new dedicated `AgentSkillsPage` (b) tab on `AgentToolsPage` | **(b)** — skills are conceptually a kind of tool capability; one fewer page in the sidebar |
| 3 | **Subagents UI placement** | (a) new dedicated `AgentSubagentsPage` (b) sub-section on `AgentWorkflowsPage` | **(a)** — subagents are first-class agent definitions, not workflow steps |
| 4 | **Plugins UI placement** | (a) new page (b) section on `AgentToolsPage` | **(b)** — plugins are tool/skill bundles; goes under Tools |
| 5 | **Permission rules UI placement** | (a) new page (b) section on `AgentGovernancePage` | **(b)** — permission rules are governance, belong on Governance page |
| 6 | **MCP UI placement** | (a) new page (b) section on `AgentToolsPage` | **(a)** — MCP is an entire transport/server model, deserves its own page |
| 7 | **Identity page vs new Runtime page for `effort`/`maxTurns`/`background`/`providerConfig`** | (a) extend Identity (b) new Runtime page | **(b)** — Identity should stay about *who*, Runtime is about *how*. Cleaner |
| 8 | **Hook UI** | (a) new page with cards per event (b) section on Governance | **(a)** — 27 events is too many for a section; deserves its own page |
| 9 | **Skill content seed source** | (a) read `~/openllm-skills` now and copy in (b) generate 9 stub `pack.json` files | **(a) if `~/openllm-skills` has content, fall back to (b) otherwise** |
| 10 | **Sidebar grouping for new entries** | reuse existing Design/Runtime/Evaluation/Release | **add Hooks, MCP, Skills (as Tools sub), Subagents to Design; add Runtime page to Design; permission rules stays on Governance** |

## 7. Implementation order (Builder phases)

**Phase 0a — Schema only** (1 commit)
1. Add 6 new tables to `drizzle/tables/agent-studio.ts`
2. Add 8 new columns to `agsAgentDrafts`
3. Add 5 new unique indexes
4. Add 4 new constant enums to `shared/constants.ts`

→ Stop. CI runs `npm run db:push`. Verify tables exist.

**Phase 0b — Repository + Router** (1 commit)
1. ~30 new repo functions (CRUD per new table + the new draft column updates)
2. 6 new sub-routers in `api/router.ts`
3. ~25 new Zod schemas in `shared/schemas.ts`
4. Compose new sub-routers into `agentStudioRouter`

→ Stop. Verify tRPC paths reachable via type-check.

**Phase 0c — Adapters + Vendored skills** (1 commit)
1. Replace tool catalog with 51 real openllm tools
2. Create `server/agent-studio/skills/` directory + 9 pack manifests
3. New `skill-catalog-adapter.ts` reads from disk

→ Stop. Verify catalog endpoints return new shapes.

**Phase 0d — Identity + Runtime + Governance UI extensions** (1 commit)
1. `AgentIdentityPage` — add 5 missing fields (`effort`, `maxTurns`, `background`, `initialPrompt`, `criticalSystemReminder`, `workingDirectories`)
2. New `AgentRuntimePage` — provider/model/apiKey/effort form
3. `AgentGovernancePage` — `permissionMode` dropdown + permission rules table
4. Sidebar: add Runtime entry under Design

→ Stop. Verify forms save and load correctly.

**Phase 0e — Hooks + MCP + Subagents pages** (1 commit)
1. `AgentHooksPage` — cards per event, attach/edit/remove
2. `AgentMcpPage` — server list with attach/connect/disconnect
3. `AgentSubagentsPage` — subagent definitions
4. Sidebar: add 3 new entries
5. Routes in `App.tsx`
6. Shell: register in `parseRoute()` + `renderContent()`

→ Stop. Verify all pages render with empty state, accept input, save.

**Phase 0f — Skills + Plugins as tabs on Tools page** (1 commit)
1. `AgentToolsPage` — convert to Tabs: **Tools | Skills | Plugins**
2. Skills tab reads from skill catalog adapter
3. Plugins tab is simple table (type + path + enabled toggle)

→ Stop. Verify all 3 tabs work and don't break existing tools binding flow.

**Phase 0g — Reviewer + Tester + Governance final pass** (1 commit if needed)
- Static checks per AGENTS.md
- Verify all governed mutations preserved
- Verify no regression in existing 65 procedures
- Verify existing 17 pages still render

**7 Builder commits total. Each independently committable and reversible.**

## 8. Validation plan (per AGENTS.md Tester role)

After each Builder phase, statically verify:

1. **Schema phase (0a):**
   - `drizzle/tables/agent-studio.ts` parses without TS errors
   - All new tables exported from the barrel `drizzle/schema.ts`
   - All new constants exported from `shared/constants.ts`

2. **Router phase (0b):**
   - All new repo functions referenced by the router actually exist (`comm -23` check)
   - All new client tRPC paths in any future UI will resolve
   - Zero existing procedure renamed (regression check)
   - Total procedures: 65 → ~90

3. **Adapters phase (0c):**
   - `tool-catalog-adapter.ts` returns 51 entries (was 12)
   - `skill-catalog-adapter.ts` returns 9 packs from disk
   - No network calls in either adapter

4. **UI phase 0d/0e/0f:**
   - All 17 existing pages still parse (`grep -c "<div" + "</div>"` balance)
   - All new pages import from `@/components/agent-studio/ui` (consistent with polish pass)
   - All new routes in App.tsx in correct order (literal → 3-segment → 2-segment → 1-segment)
   - All new sidebar entries don't break existing nav

5. **End-to-end:**
   - Existing 58 client tRPC paths still resolve
   - 4 governed procedures still gated (rollback, publishVersion, archive, decideApproval)
   - Existing 22-line additive footprint on platform files unchanged
   - Module file count grows from 36 → ~50

## 9. Governance / safety check (per AGENTS.md Governance role)

| Check | How verified |
|---|---|
| Module remains standalone | grep for cross-module imports — must stay zero |
| No backend changes outside `server/agent-studio/` | git diff path scope |
| Existing-platform file edits unchanged at 22 lines | git diff stat |
| API key encryption at rest | code review of `providerConfig` write paths |
| 4 governed mutations untouched | grep for `governedProcedure` count |
| New procedures correctly classified (read vs governed) | code review checklist |
| Permission rules don't bypass existing governance gates | code review of governance evaluator |
| All new mutations invalidate the right caches | code review of UI mutations |

## 10. Effort estimate (LOC + commits)

| Phase | New LOC | Modified LOC | Commits |
|---|---|---|---|
| 0a Schema | ~250 | ~30 | 1 |
| 0b Repo + Router | ~450 | ~80 | 1 |
| 0c Adapters + skills | ~350 | ~200 | 1 |
| 0d Identity + Runtime + Governance UI | ~280 | ~150 | 1 |
| 0e Hooks + MCP + Subagents pages | ~600 | ~50 | 1 |
| 0f Skills + Plugins tabs | ~250 | ~100 | 1 |
| **Total** | **~2,200** | **~610** | **6** |

Plus ~30 vendored skill `.md` files (depends on `~/openllm-skills` content).

## 11. What this plan does NOT do

To be honest about the boundary:

- **It does not make openllm-agent2 actually run from Studio.** That's Phase 1 (live WebSocket adapter).
- **It does not import the openllm-agent2 row.** That's also Phase 1.
- **It does not ship a working slash command parser.** Operational commands (`/clear`, `/compact`, `/cost`) come later.
- **It does not implement real cost tracking from runs.** Only the schema field.
- **It does not implement worktree creation logic.** Only the field for `addDirectories`.
- **It does not implement memory file auto-loading.** Only the schema scope enum.

These are deliberate. Phase 0 is about **representational parity** — making sure the data model can hold everything openllm-agent2 has. Phase 1 makes the runtime real.

---

## 12. Builder may NOT start until all 10 decision points in section 6 are answered.

Per AGENTS.md hard role boundaries:
- Planner plans only — this document is the deliverable
- Builder implements only — needs explicit green light + decision answers
- Reviewer audits only — runs after Builder
- Tester validates only — runs after Reviewer
- Governance enforces only — runs last

---

*Generated 2026-04-08 by Planner pass per AGENTS.md protocol.*
