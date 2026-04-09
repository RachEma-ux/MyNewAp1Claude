# How to Seed a New Agent (Direct DB Inserts)

A step-by-step guide for creating a new agent in Agent Studio by writing directly to `asdb` — the Agent Studio dedicated Postgres database. Faster than clicking through the UI, useful for:

- Populating a fresh install with test data
- Reproducing a bug scenario quickly
- Scripting demo setups (e.g., the Phase 19 MCP Manager demo with 4 connected servers)
- CI fixtures

**This guide assumes:**
- `asdb` database exists (per `CLAUDE.md` Local App Launch Procedure step 3b)
- The 32 `ags_*` tables have been seeded by `server/agent-studio/db/seed.ts` (happens automatically at dev server boot)
- `psql` is in your `PATH`

---

## TL;DR — Minimum viable agent (2 tables, 3 rows)

The absolute minimum is an `ags_agents` row + an `ags_agent_drafts` row with `is_current = true` + an `UPDATE` to link them.

```sql
BEGIN;

-- 1. Agent row
INSERT INTO ags_agents (name, internal_key, description, agent_class, visibility, lifecycle_state, environment)
VALUES (
  'My Test Agent',
  'my-test-agent',         -- must be unique across all agents
  'A seeded test agent',
  'assistant',             -- or 'analyst' / 'writer' / 'custom' etc
  'private',
  'new',                   -- required; default 'new'
  'draft'
);

-- 2. Current draft row
WITH a AS (SELECT id FROM ags_agents WHERE internal_key = 'my-test-agent')
INSERT INTO ags_agent_drafts (agent_id, name, description, mission, role, scope, autonomy_level, is_current)
SELECT a.id, 'My Test Agent', 'Seeded draft', 'Demonstrate X', 'Test agent', 'Internal', 'supervised', true
FROM a;

-- 3. Wire current_draft_id back on the agent row
UPDATE ags_agents
SET current_draft_id = (
  SELECT d.id FROM ags_agent_drafts d
  JOIN ags_agents a ON a.id = d.agent_id
  WHERE a.internal_key = 'my-test-agent' AND d.is_current = true
)
WHERE internal_key = 'my-test-agent';

COMMIT;
```

Save as `seed.sql` and run: `psql -d asdb -f seed.sql`

After this, your agent appears at `/agent-studio` and opens at `/agent-studio/<id>/overview`.

---

## Table reference

### Core tables (required)

| Table | Purpose | Required columns |
|---|---|---|
| `ags_agents` | Root agent row, one per agent | `name` (text), `internal_key` (varchar 120, unique), `lifecycle_state` (varchar 32, default `'new'`) |
| `ags_agent_drafts` | Editable drafts, one `is_current=true` per agent | `agent_id` (integer) |

### Optional per-agent tables (attach as needed)

| Table | Purpose | Required columns |
|---|---|---|
| `ags_draft_mcp_servers` | MCP server bindings | `draft_id`, `name`, `transport` (`sdk` / `stdio` / `http` / `sse` / `websocket`) |
| `ags_draft_permission_rules` | allowedTools authz rules | `draft_id`, `rule_source`, `rule_behavior` (`allow` / `deny` / `ask`), `tool_pattern` |
| `ags_draft_tool_bindings` | Per-tool config (allowed/blocked actions) | `draft_id`, `tool_key`, `tool_name` |
| `ags_draft_skills` | Skills attached from the catalog | `draft_id`, `pack_key`, `skill_key`, `skill_name` |
| `ags_draft_knowledge_bindings` | Knowledge sources | `draft_id`, `source_type` |
| `ags_draft_memory_configs` | Memory configuration | `draft_id`, `memory_type` |
| `ags_draft_hooks` | Lifecycle hooks | `draft_id`, `event_name`, `command` |
| `ags_draft_subagents` | Child subagent definitions | `draft_id`, `name`, `prompt` |

Run `psql -d asdb -c "\d ags_draft_<table>"` for the full column list of any of these.

---

## Step-by-step guide

### Step 0 — Pre-flight

Make sure the Agent Studio dev server is running and has seeded the tables:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/health
# → 200

psql -d asdb -c "SELECT COUNT(*) FROM ags_agents;"
# → should return a row (0 or more)
```

If the table doesn't exist, boot the dev server once — the boot-time seed in `server/agent-studio/db/seed.ts` provisions all 32 tables idempotently and auto-heals column drift via `ALTER TABLE ADD COLUMN IF NOT EXISTS` for any columns added to the drizzle schema after the table was first created.

### Step 1 — Insert the agent row

```sql
INSERT INTO ags_agents (
  name,
  internal_key,
  description,
  agent_class,
  visibility,
  lifecycle_state,
  environment,
  metadata
)
VALUES (
  'Research Assistant',           -- display name
  'research-assistant',            -- unique key (slug-style, ≤120 chars)
  'Agent that summarizes research papers and extracts key findings',
  'analyst',                       -- 'assistant' | 'analyst' | 'writer' | 'custom'
  'private',                       -- 'private' | 'workspace' | 'org'
  'new',                           -- 'new' | 'active' | 'archived'
  'draft',                         -- 'draft' | 'staging' | 'production'
  '{"seeded": true, "source": "manual_seed"}'::jsonb
)
RETURNING id;
```

Note the returned `id` — you'll need it for Step 2.

### Step 2 — Insert the current draft row

```sql
INSERT INTO ags_agent_drafts (
  agent_id,
  name,
  description,
  agent_class,
  visibility,
  mission,
  role,
  scope,
  autonomy_level,
  system_instructions,
  role_instructions,
  output_contract,
  refusal_behavior,
  fallback_behavior,
  provider_config,
  governance_policy,
  is_current
)
VALUES (
  <the id from Step 1>,
  'Research Assistant',
  'Seeded draft for research assistant agent',
  'analyst',
  'private',
  'Help researchers by summarizing papers and extracting key findings',
  'Research analyst',
  'Academic papers, research reports, technical documentation',
  'supervised',                    -- 'autonomous' | 'supervised' | 'review_required'
  'You are a research assistant. Summarize papers concisely and extract key findings.',
  'Focus on methodology, findings, and implications. Cite sources.',
  'Return structured JSON with {summary, findings, citations}',
  'If the input is not a research paper, politely explain you only handle academic content',
  'If you cannot access the source, respond with a clear error explaining what went wrong',
  '{"provider": "openai", "model": "gpt-4", "temperature": 0.2}'::jsonb,
  '{"auditRequired": true, "killSwitchEnabled": true, "blockedActions": []}'::jsonb,
  true                             -- this is the CURRENT draft
)
RETURNING id;
```

The `provider_config` and `governance_policy` fields are `jsonb` with defaults of `{}`. Fill them in now if you want the agent to be runnable without further UI editing.

### Step 3 — Wire `current_draft_id` back on the agent row

The `ags_agents.current_draft_id` column points at the draft that's currently being edited. It must be set manually after the draft exists.

```sql
UPDATE ags_agents
SET current_draft_id = <the draft id from Step 2>
WHERE id = <the agent id from Step 1>;
```

### Step 4 — Verify via tRPC

The Agent Studio UI reads via tRPC, not direct SQL. Verify the agent is discoverable:

```bash
# List agents — your new agent should appear
curl -s "http://localhost:3000/api/trpc/agentStudio.agents.list?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%7D%7D%7D" | python3 -m json.tool

# Get the shell summary — should return the current draft's fields
curl -s "http://localhost:3000/api/trpc/agentStudio.shell.getShellSummary?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%22agentId%22%3A<id>%7D%7D%7D" | python3 -m json.tool
```

Then open `http://localhost:3000/agent-studio/<id>/overview` in the browser.

---

## Recipes — common add-ons

### Recipe A — Attach MCP servers to the draft

Pointing the draft at existing MCP servers (e.g., the built-in `studio.echo` SDK server, or `studio-self` which serves Studio's own catalog via `POST /api/mcp`):

```sql
INSERT INTO ags_draft_mcp_servers (draft_id, name, transport, command, url, args, env, status, enabled)
VALUES
  -- In-process SDK echo (ships with Phase 15c)
  (<draft_id>, 'echo', 'sdk', 'studio.echo', NULL, '[]'::jsonb, '{}'::jsonb, 'pending', true),

  -- HTTP pointing at Studio's own MCP endpoint (Phase 19 follow-up)
  (<draft_id>, 'studio-self', 'http', NULL, 'http://127.0.0.1:3000/api/mcp', '[]'::jsonb, '{}'::jsonb, 'pending', true),

  -- Stdio inline node MCP stub (works on Termux; avoids npx SELinux issue)
  (<draft_id>, 'inline-test', 'stdio', 'node', NULL,
    '["-e", "let buf=String();process.stdin.on(\"data\",c=>{buf+=c;let i;while((i=buf.indexOf(\"\\n\"))!==-1){const line=buf.slice(0,i);buf=buf.slice(i+1);try{const m=JSON.parse(line);if(m.id==null)continue;let r;if(m.method===\"initialize\")r={protocolVersion:\"2024-11-05\",capabilities:{tools:{}},serverInfo:{name:\"inline-test\",version:\"0.1.0\"}};else if(m.method===\"tools/list\")r={tools:[{name:\"hello\",description:\"Say hello\",inputSchema:{type:\"object\"}}]};else if(m.method===\"prompts/list\")r={prompts:[]};else if(m.method===\"resources/list\")r={resources:[]};else r={};process.stdout.write(JSON.stringify({jsonrpc:\"2.0\",id:m.id,result:r})+\"\\n\")}catch(e){}}});"]'::jsonb,
    '{}'::jsonb, 'pending', true);
```

After inserting, click Connect on each server in the MCP Manager page (`/agent-studio/mcp-manager`) or hit the tRPC endpoint directly:

```bash
curl -s -X POST -H "Content-Type: application/json" \
  "http://localhost:3000/api/trpc/agentStudio.mcp.connect?batch=1" \
  -d '{"0":{"json":{"serverId":<id>}}}'
```

Server state will flip through the FSM: `pending → connecting → connected` (or `failed` if the transport config is broken).

### Recipe B — Attach allowedTools permission rules

```sql
INSERT INTO ags_draft_permission_rules (draft_id, rule_source, rule_behavior, tool_pattern, description, enabled)
VALUES
  (<draft_id>, 'user', 'allow', 'WebFetch',          'Allow fetching web content',                true),
  (<draft_id>, 'user', 'allow', 'WebSearch',         'Allow web search',                          true),
  (<draft_id>, 'user', 'allow', 'mcp__*',            'Allow all MCP tools (wildcard)',            true),
  (<draft_id>, 'user', 'deny',  'Bash(rm*)',         'Block any rm command',                      true),
  (<draft_id>, 'user', 'ask',   'Bash',              'Prompt for any other bash invocation',      true);
```

`tool_pattern` uses the matcher from `simulation.ts:matchesToolPattern`:
- Exact: `Bash` matches `Bash`
- Parens form: `Bash(*)` matches `Bash` with any args
- Wildcard: `Web*` matches `WebFetch`, `WebSearch`
- `*` matches anything

`rule_behavior` is one of `allow` / `deny` / `ask` (see Phase 1c).

### Recipe C — Attach catalog skills

```sql
INSERT INTO ags_draft_skills (draft_id, pack_key, skill_key, skill_name, allowed_tools, requires_approval, enabled)
VALUES
  (<draft_id>, 'providers', 'ollama-health', 'Ollama health check', '["WebFetch"]'::jsonb, false, true),
  (<draft_id>, 'database',  'schema-review', 'Schema review',       '["Read","Grep"]'::jsonb, true, true);
```

The `pack_key` + `skill_key` must exist in the skill catalog (check `/agent-studio/catalog/skills` for available skills). The `allowed_tools` list is scoped to this skill — the dispatcher will only permit the tools listed here when the skill runs.

### Recipe D — Attach tool bindings (per-tool config)

```sql
INSERT INTO ags_draft_tool_bindings (draft_id, tool_key, tool_name, allowed_actions, requires_approval, audit_required)
VALUES
  (<draft_id>, 'WebFetch', 'WebFetch',
    '["read"]'::jsonb, false, true),
  (<draft_id>, 'Bash',     'Bash',
    '["execute"]'::jsonb, true,  true),  -- approval required, audited
  (<draft_id>, 'Write',    'Write',
    '["create","update"]'::jsonb, true, true);
```

---

## Full working example: Research Assistant with MCP + skills + permissions

This is the whole thing — run it once to get a fully-configured research agent.

```sql
BEGIN;

-- 1. Agent
INSERT INTO ags_agents (name, internal_key, description, agent_class, visibility, lifecycle_state, environment, metadata)
VALUES ('Research Assistant', 'research-assistant', 'Summarizes research papers', 'analyst', 'private', 'new', 'draft', '{"seeded": true}'::jsonb);

-- 2. Draft
WITH a AS (SELECT id FROM ags_agents WHERE internal_key = 'research-assistant')
INSERT INTO ags_agent_drafts (agent_id, name, mission, role, scope, autonomy_level, system_instructions, provider_config, governance_policy, is_current)
SELECT a.id,
  'Research Assistant',
  'Summarize research papers and extract key findings',
  'Research analyst',
  'Academic papers',
  'supervised',
  'You are a research assistant. Return structured JSON.',
  '{"provider":"openai","model":"gpt-4","temperature":0.2}'::jsonb,
  '{"auditRequired":true,"killSwitchEnabled":true}'::jsonb,
  true
FROM a;

-- 3. Wire current_draft_id
UPDATE ags_agents SET current_draft_id = (
  SELECT d.id FROM ags_agent_drafts d
  JOIN ags_agents a ON a.id = d.agent_id
  WHERE a.internal_key = 'research-assistant' AND d.is_current = true
) WHERE internal_key = 'research-assistant';

-- 4. MCP servers
WITH d AS (
  SELECT d.id FROM ags_agent_drafts d
  JOIN ags_agents a ON a.id = d.agent_id
  WHERE a.internal_key = 'research-assistant' AND d.is_current = true
)
INSERT INTO ags_draft_mcp_servers (draft_id, name, transport, command, url, args, env, status, enabled)
SELECT d.id, name, transport, command, url, args::jsonb, env::jsonb, 'pending', true
FROM d, (VALUES
  ('echo',        'sdk',  'studio.echo', NULL,                              '[]', '{}'),
  ('studio-self', 'http', NULL,          'http://127.0.0.1:3000/api/mcp',   '[]', '{}')
) AS v(name, transport, command, url, args, env);

-- 5. Permission rules
WITH d AS (
  SELECT d.id FROM ags_agent_drafts d
  JOIN ags_agents a ON a.id = d.agent_id
  WHERE a.internal_key = 'research-assistant' AND d.is_current = true
)
INSERT INTO ags_draft_permission_rules (draft_id, rule_source, rule_behavior, tool_pattern, description, enabled)
SELECT d.id, 'user', behavior, pattern, descr, true
FROM d, (VALUES
  ('allow', 'WebFetch',      'Allow fetching paper URLs'),
  ('allow', 'WebSearch',     'Allow searching for papers'),
  ('allow', 'Read',          'Allow reading local files'),
  ('allow', 'mcp__*',        'Allow all MCP tools'),
  ('deny',  'Bash',          'Block shell'),
  ('deny',  'Write',         'Block file writes by default')
) AS v(behavior, pattern, descr);

COMMIT;
```

Save as `seed-research-assistant.sql` and run `psql -d asdb -f seed-research-assistant.sql`. You'll get an agent with 2 MCP servers, 6 permission rules, a full draft config — ready to click Connect on both MCP servers and run a simulation.

---

## Cleanup

Deleting a seeded agent takes care of all child rows via cascade... except the Phase 7+ tables don't have ON DELETE CASCADE set (clone-safety). Explicit cleanup:

```sql
BEGIN;

-- Get the ids
WITH a AS (SELECT id FROM ags_agents WHERE internal_key = 'research-assistant'),
     d AS (SELECT id FROM ags_agent_drafts WHERE agent_id = (SELECT id FROM a))
-- Delete all draft-scoped child rows
DELETE FROM ags_draft_mcp_servers WHERE draft_id IN (SELECT id FROM d);
-- Repeat for every ags_draft_* table you populated
DELETE FROM ags_draft_permission_rules WHERE draft_id IN (SELECT id FROM ags_agent_drafts WHERE agent_id = (SELECT id FROM ags_agents WHERE internal_key = 'research-assistant'));
-- ... (skills, tool_bindings, hooks, memory_configs, knowledge_bindings, subagents, etc.)

-- Delete the drafts
DELETE FROM ags_agent_drafts WHERE agent_id = (SELECT id FROM ags_agents WHERE internal_key = 'research-assistant');

-- Delete the agent
DELETE FROM ags_agents WHERE internal_key = 'research-assistant';

COMMIT;
```

Or easier: use the UI's archive flow which tombstones the row (sets `archived_at`) and leaves the draft history intact for audit.

---

## Troubleshooting

**"duplicate key value violates unique constraint uniq_ags_agents_key"**
→ Your `internal_key` is already taken. Choose a different slug. `internal_key` is globally unique.

**Agent shows up in `/agent-studio` but opens to a broken state / blank overview**
→ You forgot Step 3 (`UPDATE ags_agents SET current_draft_id = ...`). The shell query expects a valid `current_draft_id`. Run Step 3 and refresh.

**"column 'oauth_config' does not exist" when querying MCP servers**
→ Your asdb was created before Phase 15b added the column, and Phase 19 follow-up `41f6a78` added auto-heal, but you haven't restarted the dev server since. Boot the dev server once — the seed's column-drift check will emit `ALTER TABLE ADD COLUMN IF NOT EXISTS oauth_config jsonb, oauth_state jsonb` automatically. Alternative: run the ALTER manually:
```sql
ALTER TABLE ags_draft_mcp_servers
  ADD COLUMN IF NOT EXISTS oauth_config jsonb,
  ADD COLUMN IF NOT EXISTS oauth_state jsonb;
```

**MCP server shows up but Connect fails with "this action is restricted for your current account"**
→ Pre-19 bug. Fixed in commit `43af4d9` by downgrading `mcp.connect` / `disconnect` / `oauthInitiate` / `oauthExchange` to `protectedProcedure`. Pull `main` and restart.

**MCP server stdio connect fails with "MCP server process closed"**
→ Pre-19 stdio transport had no stderr capture. Pull `main` (commit `0c708c4` adds stderr tail + exit code + signal in the error message). On Termux specifically, `npx`-based MCP servers will fail with `env: 'node': Permission denied` (exit 126) — use `node` directly with the package's main file instead, or ship an inline node MCP stub (see Recipe A).

**Tool doesn't appear in the Tools Catalog even though the MCP server is connected**
→ Pre-19 fix: `listMergedTools` only included MCP tools when a `draftId` was passed. Commit `00b063c` made the global catalog walk the Phase 19c registry for all connected servers. Pull `main` and the global Tools Catalog will show all MCP-discovered tools.

---

## Reference

- Schema: `drizzle/tables/agent-studio.ts`
- Seed runner: `server/agent-studio/db/seed.ts`
- tRPC routes: `server/agent-studio/api/router.ts`
- MCP manager chokepoint: `server/agent-studio/services/mcp/mcp-manager.ts`
- Phase 19 baseline: `docs/agent-studio/phase-19-mcp-manager-redesign.md`
