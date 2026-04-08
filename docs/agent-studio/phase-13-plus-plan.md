# Agent Studio — Phase 13+ Unified Plan

## Skills & Tools Catalog · Own Marketplace · MCP Full Potential · Brand Cleanup

**Status:** Planner deliverable (per AGENTS.md). Builder may NOT start until the
decision points in section 5 are answered.

**Baseline:** commit `e969e2e` — all of Phase 0 + 1 + 2 + 3-12 merged, CI green,
local stack running. This plan picks up after the unified Phase 3-12 batch.

---

## 0. Why this plan exists

After deploying Phase 0-12, three gaps became obvious:

1. **No authoring surface for skills or tools.** Tools are hardcoded (51 in
   `tool-catalog-adapter.ts`); skills are vendored `.md` files. Users can
   **attach** them to agents but can't **create** new ones through the UI.
2. **Our Phase 7 MCP work covered ~60% of what upstream openclaude supports.**
   We ship stdio + http transports; upstream has websocket, OAuth flow, and
   sdk transport as well. MCP tools are also first-class (hard-gated by the
   same permission system that gates built-in tools — confirmed by a deep dive
   into `openclaude/src/services/mcp/client.ts` and `SkillTool.ts`).
3. **The "openllm-agent2" seed still references "Claude-Code-style agent"**
   in its mission/role/prompts, and a few UI placeholders mention `claude-sonnet-4-5`
   as an example model ID. We need to eliminate every surface brand
   reference to **Claude** / **openclaude** from agent-studio code (DB names
   and vendor API strings stay, because they are identifiers, not brand copy).

The key findings from the openclaude code dive that drive this plan:

| Finding | Plan impact |
|---|---|
| `allowedTools` is a **hard gate** (injected into `alwaysAllowRules.command` on the sub-agent's `ToolPermissionContext`, enforced by `hasPermissionsToUseTool`) | Catalog UI **must** validate tool names at save time; silent typos = runtime denials |
| **No tool-name validation upstream** — skills can declare nonexistent tools and openclaude silently accepts them | We get to be stricter than upstream: our catalog UI cross-checks tool names against the live merged registry |
| **5 MCP transports exist upstream** (stdio, http, sse, websocket, sdk). We ship 2 real + 2 scaffolds | Complete 3 more transports in Phase 15 |
| **MCP tools become full `Tool` objects at runtime** — they go through the same permission system and can appear in `allowedTools` | Our skill editor must offer MCP-discovered tool names as selectable options |
| **No central skill marketplace exists upstream** — distribution is via plugins (NPM) or bare git clone | Building our own marketplace is a greenfield opportunity with a clear differentiator |
| **Skill versioning** is inert in upstream (field exists in frontmatter but never read for migration) | We can co-opt `version` for our own concept without breaking anything |
| **Tool versioning** doesn't exist upstream at all | Same — we can add it safely |
| **MCP servers can expose `prompts` that become skills** (`mcpSkillBuilders.ts`) | Bidirectional bridge — the "merge 3 sources" rule applies to **skills** too, not just tools |

---

## 1. Plan overview — 5 phases

| # | Phase | Core deliverable | Effort |
|---|---|---|---|
| **12.5** | **ASDB extraction** | Move all 32 `ags_*` tables from `mynewap1claude` to a dedicated `asdb` database. Per-module DB pattern matching wfdb/prmdb/psmdb/codedb. | M |
| 13 | **Catalog foundation** | DB-backed tool + skill catalog, `.md` file import, merged registry | L |
| 14 | **Marketplace** | Agent Studio's own marketplace — browse / install / publish. No external links. | L |
| 15 | **MCP completion** | Websocket transport + OAuth flow + real SDK transport + MCP-as-skill bridge + full tool integration | L |
| 16 | **Brand cleanup** | Remove every `claude` / `openclaude` reference from agent-studio code | S |

**Total estimate:** ~3,500 LOC, ~15 commits, 4 new tables + schema migration,
2 new top-level UI routes (`/agent-studio/catalog`, `/agent-studio/marketplace`),
no platform-file edits, no new runtime dependencies.

---

## 2. Dependency graph

```
baseline
   │
   ▼
┌─ 12.5 ASDB extraction ──────────────────────────────────────┐
│  (12.5a connection │ 12.5b create+migrate │ 12.5c repo cut  │
│   12.5d boot wire │ 12.5e local + deploy procedures)         │
└────────────────────────────────┬────────────────────────────┘
                                 │
               ┌─── 13a schema ──┴─ 13b skills service ─── 13d .md import ─── 13e Catalog UI
               │                     │
               │                     └─── 13c tools service ───┘
               │                              │
               │                              ▼
               │  ┌─────────── 14a marketplace schema ─── 14b service ─── 14c UI ─── 14d installer
               │  │                                                           │
               └──┼── 15a websocket ───┐                                       │
                  ├── 15b OAuth ───────┤                                       │
                  ├── 15c SDK real ────┼─── 15d tool-name merge ── 15e skill bridge
                  │                    │         │
                  └── 16 Brand cleanup (independent, can run in parallel)
                                                 ▼
                                          (13d tool validation uses this)
```

**12.5 is a hard prerequisite for 13/14** — every new table created in those
phases (`agsCatalogTools`, `agsCatalogSkills`, `agsMarketplaceItems`, etc.)
must land in `asdb`, not the main DB. Doing 13/14 first would mean migrating
twice. 15 and 16 are independent and could land before 12.5 if needed.

Critical path: `13a → 13b → 13c → 13e` must all land before `14c` (marketplace
UI needs a working catalog to install into). Phase 15 tool-name merge (`15d`)
feeds back into 13's tool validation — so 15 should complete at least its
transport work before 13 ships, but can overlap.

Phase 16 (brand cleanup) is fully independent and can be a single commit at
any point, but is listed last so the commit history reads cleanly.

---

## 3. Detailed phases

### Phase 12.5 — ASDB extraction (prerequisite)

**Objective.** Move every `ags_*` table out of the main `mynewap1claude`
database into a dedicated `asdb` (Agent Studio DB), matching the existing
per-module DB pattern (`wfdb`, `prmdb`, `psmdb`, `codedb`). After this
phase, `mynewap1claude` no longer contains any `ags_*` tables and Agent
Studio operates in full data isolation from the rest of the platform.

**Why.** Three concrete benefits:
1. **Data isolation** — Agent Studio backups, restores, and resets don't
   touch the main app
2. **Schema migration safety** — `db:push` on the main DB no longer needs
   to know about agent-studio tables (and vice versa). Eliminates the
   "drizzle-kit prompts for renames" issue we hit during local setup.
3. **Consistency with existing modules** — wfdb/prmdb/psmdb/codedb already
   follow this pattern. Agent Studio is the last big module living in the
   main DB.

**Pattern reference** (already in the repo): `server/sandbox-wf/connection.ts`,
`server/sandbox-wf/seed.ts`, `server/_core/index.ts:268-298`.

#### 12.5a — Connection module

**Files touched:**
- `server/agent-studio/db/connection.ts` — **NEW** (replaces or wraps the
  existing `server/db/connection.ts` import in agent-studio code)

```typescript
/**
 * ASDB — Agent Studio Dedicated DB Connection
 *
 * Connects to the `asdb` database, separate from the main app DB.
 * Uses DATABASE_URL_ASDB env var, falls back to replacing DB name in
 * DATABASE_URL.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import * as agsSchema from "../../../drizzle/tables/agent-studio";

let _asDb: ReturnType<typeof drizzle<typeof agsSchema>> | null = null;

const DEFAULT_AS_URL = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace(/\/[^/]+$/, "/asdb")
  : "postgresql://localhost:5432/asdb";

export function getAsDb() {
  if (!_asDb) {
    const url = process.env.DATABASE_URL_ASDB || DEFAULT_AS_URL;
    try {
      const masked = url.replace(/:([^:@]+)@/, ":****@");
      console.log("[ASDB] Connecting to:", masked);
      _asDb = drizzle(url, { schema: agsSchema });
      console.log("[ASDB] Drizzle instance created");
    } catch (error) {
      console.error("[ASDB] Connection failed:", error);
      _asDb = null;
    }
  }
  return _asDb;
}

/** Reset cached connection — called after seed/migration. */
export function resetAsDb() {
  _asDb = null;
}
```

This function name (`getAsDb`) replaces the `getDb()` import from
`server/db/connection.ts` everywhere in `server/agent-studio/`.

#### 12.5b — Create + migrate

**Files touched:**
- `server/agent-studio/db/seed.ts` — **NEW** — runs `CREATE TABLE IF NOT
  EXISTS` for all 32 ags_* tables (idempotent, same pattern as
  `server/sandbox-wf/seed.ts`)
- `scripts/create-ags-tables.mjs` — already exists from local debugging.
  Refactor into the seed module proper and delete the standalone script.

The seed module exports `seedAsDb()` which:
1. Calls `getAsDb()` (auto-creates the connection)
2. Runs the 32 `CREATE TABLE IF NOT EXISTS` statements via raw SQL — same
   approach as `server/sandbox-wf/seed.ts:196-331`. (We can't use
   `drizzle-kit push` here because it has the rename-prompt problem from
   the local stack issue.)
3. Creates indexes via `CREATE INDEX IF NOT EXISTS`
4. Logs `[ASDB] Tables created/verified` (mirrors existing modules)

The `CREATE TABLE` statements are auto-generated from the drizzle schema
via the same column-introspection script we wrote at
`scripts/create-ags-tables.mjs`. Refactor that script into a build-time
codegen that emits a TypeScript file with all the SQL embedded, OR just
inline the SQL by hand (32 tables × ~10 lines each = ~320 lines of SQL).
**Recommendation:** inline by hand — matches the wfdb/prmdb pattern
exactly and avoids a build-time codegen step.

#### 12.5c — Repository cut

**Files touched:**
- `server/agent-studio/repository.ts` — change every `getDb()` call to
  `getAsDb()`
- Any other agent-studio file that imports from `server/db/connection`

**Diff sample:**

```typescript
// Before
import { getDb } from "../db/connection";
function db() {
  const conn = getDb();
  if (!conn) throw new Error("[AgentStudio] Database not available");
  return conn;
}

// After
import { getAsDb } from "./db/connection";
function db() {
  const conn = getAsDb();
  if (!conn) throw new Error("[AgentStudio] ASDB not available");
  return conn;
}
```

This is a single-file mechanical change — `repository.ts` is the only
file that calls `getDb()` directly. The function alias `db()` stays so
the rest of the file is unchanged.

#### 12.5d — Boot wiring

**Files touched:**
- `server/_core/index.ts` — **+5 lines** following the existing
  wfdb/prmdb/psmdb/codedb pattern at lines 268-298. This is a platform
  file edit but within the precedent for sub-DB seeders.

```typescript
// Seed ASDB (dedicated Agent Studio database — idempotent)
try {
  const { seedAsDb } = await import("../agent-studio/db/seed");
  await seedAsDb();
} catch (error: any) {
  console.warn(`[ASDB] Seed skipped — ${error.message}`);
}
```

Insert this block right after the CODEDB block at line 298.

**Footprint impact:** The 22-line additive budget on platform files goes
from ~14 → ~19 (+5 lines). Phase 13 then adds 4, Phase 14 adds 2 → final
total ~25 lines. **This exceeds the budget by 3 lines.**

**Decision point** (added below as #11): accept the +3 line overrun, OR
move the seed wiring into a separate module that gets imported once from
`_core/index.ts` (1 line) and contains the 5-line block internally.

**Recommendation:** the 1-line wrapper option (`+1` instead of +5),
preserves the budget. New file: `server/agent-studio/boot.ts` exports a
`bootAgentStudio()` function that internally awaits `seedAsDb()` (and any
future Agent Studio boot work like the Phase 10 scheduler self-start —
which we can also formalize via this entry point instead of side-effect
import).

```typescript
// server/agent-studio/boot.ts
export async function bootAgentStudio() {
  try {
    const { seedAsDb } = await import("./db/seed");
    await seedAsDb();
  } catch (error: any) {
    console.warn(`[ASDB] Seed skipped — ${error.message}`);
  }
  // Phase 10 scheduler self-start (formalized — was a side-effect import)
  await import("./services/scheduler");
}

// server/_core/index.ts (1 line added)
await (await import("../agent-studio/boot")).bootAgentStudio();
```

**+1 line on platform file. Footprint stays at 15 → 16 → still under 22.**

#### 12.5e — Local + deploy procedures

**Files touched:**
- `CLAUDE.md` — update the "Local App Launch Procedure" to add
  `createdb asdb` after `createdb mynewap1claude`
- `MEMORY.md` — same update
- `scripts/create-ags-tables.mjs` — delete (replaced by 12.5b seed module)

**Local launch procedure** becomes:

```bash
# Step 3a (additional): ensure ASDB exists
psql -d asdb -c "SELECT 1;" 2>/dev/null && echo "ASDB OK" || createdb asdb
```

**Deploy procedure** (`builder-deploy.yml`) needs the same: a step that
creates `asdb` if it doesn't exist. Either:
- Add a shell step before `npm run dev` that runs `createdb asdb || true`
- OR rely on the seeder's create-table SQL — but it can't create the
  database itself; PostgreSQL needs the DB to exist before connecting

**Recommendation:** add a shell step in the deploy workflow. This is a
1-line `.github/workflows/builder-deploy.yml` edit which is platform infra,
not module code, so it doesn't count against the standalone footprint.

#### Migration of existing data

**For local dev:** The Agent Studio tables are currently empty (we just
created them via the manual script and haven't seeded the OpenLLM Agent
yet). **No data migration needed.** The seed step will recreate them in
asdb on next boot, the user clicks "Seed OpenLLM Agent" and they're back.

**For production / deployed instances:** If someone has an existing
deployed Agent Studio with data, we need a one-shot migration script that:
1. Connects to both `mynewap1claude` and `asdb`
2. For each `ags_*` table, copies rows from main DB to asdb (preserving
   IDs)
3. Verifies counts match
4. Drops the source tables from main DB

**Decision point** (#12 below): ship the migration script as part of 12.5,
or defer to a "one-time migration" runbook that the user runs manually?

**Recommendation:** ship the script. It's ~150 LOC and the deployed
instance does have data we don't want to lose.

#### Risks specific to 12.5

| # | Risk | Mitigation |
|---|---|---|
| R12.1 | ASDB connection fails on first boot, agent-studio routes 500 | Lazy connection (already in pattern) — first API hit retries. Logs make root cause obvious. |
| R12.2 | Cross-DB queries break (any join from ags_ to users) | Already verified — agent-studio has ZERO `.references()` calls. All `ownerId`/`triggeredBy` are plain integers. Same pattern as wfdb. |
| R12.3 | Tests / CI don't have asdb created | CI skips tests on this device. CI's build step doesn't run the server. Deploy step needs the createdb addition. |
| R12.4 | Drizzle introspection in `npm run db:push` (the broken main script) gets MORE confused, not less | After extraction, drizzle on the main DB no longer sees ags_ tables in the schema barrel. The rename-prompt mess from local setup may actually GET BETTER. **Test this explicitly in 12.5b validation.** |
| R12.5 | Production data loss during migration | Migration script does COPY first, verifies counts, only THEN drops. Wrap in a single transaction per table. |

#### Validation for Phase 12.5

1. Local: drop the existing ags_* tables from `mynewap1claude` (via psql)
2. Restart dev server → confirm `[ASDB] Connecting to: postgresql://...:****@localhost:5432/asdb` log line
3. Confirm `[ASDB] Tables created/verified` log line
4. Confirm `psql -d asdb -c "\dt ags_*"` shows all 32 tables
5. Confirm `psql -d mynewap1claude -c "\dt ags_*"` shows zero tables
6. Click **Seed OpenLLM Agent** in the UI → confirm seed works against asdb
7. Run a simulation against the seeded agent → confirm runtime trace tables
   write to asdb
8. CI build step still passes (no agent-studio TS errors)

**Effort:** ~600 LOC (mostly the inlined CREATE TABLE SQL), **3 commits**:
1. `12.5a+b` connection + seed module
2. `12.5c+d` repo cut + boot wiring + remove side-effect scheduler import
3. `12.5e` local procedures + deploy step + migration script

**Files touched summary:**
- 1 NEW: `server/agent-studio/db/connection.ts`
- 1 NEW: `server/agent-studio/db/seed.ts`
- 1 NEW: `server/agent-studio/boot.ts`
- 1 NEW: `scripts/migrate-ags-to-asdb.mjs` (one-shot, deletable after run)
- 1 MODIFIED: `server/agent-studio/repository.ts` (1 import + 1 function call)
- 1 MODIFIED: `server/_core/index.ts` (+1 line)
- 1 MODIFIED: `.github/workflows/builder-deploy.yml` (+1 line for createdb)
- 1 MODIFIED: `CLAUDE.md` + `MEMORY.md` (procedure docs)
- 1 DELETED: `scripts/create-ags-tables.mjs` (superseded)

---

### Phase 13 — Catalog foundation

**Objective.** A DB-backed catalog for tools and skills, a file-explorer
import path for user-authored skills, and a merged-registry service that
cross-checks tool names at save time so "typo → silent runtime denial"
becomes "typo → save rejected with a clear error."

#### 13a — Schema

**Files touched:**
- `drizzle/tables/agent-studio.ts` — 2 new tables

**New tables:**

```typescript
// User-authored tools. Merged with static 51 at runtime in
// tool-catalog-adapter.ts. Can NOT override a built-in — unique constraint
// ensures user keys don't collide with static keys.
agsCatalogTools {
  id, key (varchar 120), name, description, category (enum),
  defaultAllowedActions (jsonb string[]),
  hardBlockedActions (jsonb string[]),
  defaultRequiresApproval (boolean),
  destructive (boolean),
  /** How this tool is invoked at runtime:
   *    "shell"     → spawn a shell command with argv templated from input
   *    "http"      → POST JSON to a URL with headers
   *    "mcp_ref"   → proxy to an MCP server tool (serverId + toolName)
   *    "builtin"   → reserved; not user-creatable
   */
  invocationKind (varchar 32),
  invocationConfig (jsonb),
  /** Zod-compatible JSON schema for the tool's input */
  inputSchema (jsonb),
  version (varchar 32),
  createdBy (integer),
  createdAt, updatedAt
}

// User-authored skills. Merged with vendored 19 at runtime in
// skill-catalog-adapter.ts. Each row is the same shape as the .md
// frontmatter plus a `body` text column for the markdown.
agsCatalogSkills {
  id, packKey (varchar 64), skillKey (varchar 120), name, description,
  /** inline | fork */
  context (varchar 16),
  /** subagent type for forked context */
  agent (varchar 64),
  /** optional model override: sonnet | opus | haiku */
  model (varchar 32),
  allowedTools (jsonb string[]),
  argNames (jsonb string[]),
  /** high | medium | low */
  effort (varchar 16),
  body (text),
  version (varchar 32),
  /** source of this skill:
   *    "db"        → created in Catalog UI
   *    "imported"  → imported via 13d file explorer path
   *    "vendored"  → shadow entry for the 19 read-only vendored skills
   *                  (exists so the UI can list them uniformly)
   */
  source (varchar 16),
  /** For imported/vendored skills, the original file path */
  sourcePath (text),
  createdBy (integer),
  createdAt, updatedAt
}
```

**New indexes:**
- `uniq_ags_catalog_tools_key` on `agsCatalogTools(key)`
- `uniq_ags_catalog_skills_pack_key` on `agsCatalogSkills(packKey, skillKey)`

**Schema diff.** 2 tables, 2 unique indexes, ~4 additive enum values in
`shared/constants.ts` (new `AGS_TOOL_INVOCATION_KINDS = ["shell", "http", "mcp_ref", "builtin"]`).
All additive — zero impact on existing rows.

#### 13b — Skills catalog service + API

**Files touched:**
- `server/agent-studio/services/catalog-skills.ts` — **NEW**
- `server/agent-studio/repository.ts` — 5 new functions (CRUD + merged list)
- `server/agent-studio/adapters/skill-catalog-adapter.ts` — extend
  `listSkillCatalog()` to merge vendored + DB
- `server/agent-studio/api/router.ts` — new `catalog.skills` sub-router
- `server/agent-studio/shared/schemas.ts` — 4 new Zod schemas

**Service surface:**

```typescript
catalogSkills.listMerged()       → { vendored: [], db: [], all: [] }
catalogSkills.create(input)      → validates + inserts into agsCatalogSkills
catalogSkills.update(id, patch)  → partial update, version bump
catalogSkills.remove(id)         → only `source="db"` or `source="imported"`
                                   rows can be deleted; vendored shadows are
                                   immutable
catalogSkills.validate(input)    → dry-run validation (same checks as create
                                   but without the write); returns
                                   { ok, errors, warnings }
```

**Validation rules** (strict — more than upstream):
- `skillKey` must match `^[a-z][a-z0-9_-]*$`
- `packKey` must be one of the known packs OR a user-created pack
- `context` must be `inline` | `fork`
- `model` (if set) must be one of `AGS_MODEL_TIER_OPTIONS`
- `allowedTools` — **each entry must exist** in the merged tool registry
  (built-in 51 + agsCatalogTools + MCP-discovered-for-this-draft). This is
  the key improvement over upstream openclaude.
- `body` must include at least one non-whitespace character
- `body` may include `$ARGUMENTS` (warning if it doesn't — most skills do)

**API procedures** (6 new, all `protectedProcedure`):
- `catalog.skills.listMerged()`
- `catalog.skills.get(id)`
- `catalog.skills.create(input)`
- `catalog.skills.update(input)`
- `catalog.skills.remove(id)`
- `catalog.skills.validate(input)`

#### 13c — Tools catalog service + API

**Files touched:**
- `server/agent-studio/services/catalog-tools.ts` — **NEW**
- `server/agent-studio/adapters/tool-catalog-adapter.ts` — extend to merge
  static 51 + agsCatalogTools + per-draft MCP-discovered tools
- `server/agent-studio/api/router.ts` — new `catalog.tools` sub-router
- `server/agent-studio/shared/schemas.ts` — 4 new Zod schemas

**Service surface:**

```typescript
catalogTools.listMerged(opts?)   → {
  builtin: [],    // static 51, source="builtin", read-only
  db: [],         // user-created via 13b
  mcp: [],        // discovered from MCP connections if draftId passed
  all: [],        // flattened, sorted by category → name
}
catalogTools.create(input)       → only for "shell" | "http" | "mcp_ref"
                                   invocation kinds. "builtin" rejected.
catalogTools.update(id, patch)   → only user-created rows
catalogTools.remove(id)          → only user-created rows (built-in 51 immutable)
catalogTools.validate(input)     → dry-run
catalogTools.getByKey(key)       → merged lookup (built-in | db | mcp)
```

**Validation rules:**
- `key` must match `^[A-Z][A-Za-z0-9_]*$` (PascalCase, matches openclaude
  naming: `BashTool`, `FileReadTool`, etc.)
- `key` must not collide with any built-in 51 key
- `invocationKind` determines required fields in `invocationConfig`:
  - `shell` → `{ argv: string[], env?: Record<string,string> }`
  - `http` → `{ url: string, method: string, headers?: Record<string,string> }`
  - `mcp_ref` → `{ serverId: number, toolName: string }`
- `inputSchema` must be valid JSON Schema (parse with `zod-to-json-schema`'s
  reverse or a small JSON Schema validator)

#### 13d — `.md` file import from file explorer

**Files touched:**
- `server/agent-studio/services/skill-importer.ts` — **NEW**
- `server/agent-studio/api/router.ts` — `catalog.skills.importFromMarkdown`
- `client/src/pages/agent-studio/AgentSkillCatalogPage.tsx` — **NEW** (part of 13e)

**User flow:**
1. Click **Import Skill** in the Skills Catalog page header
2. Hidden `<input type="file" accept=".md" multiple />` fires on click
3. Selected files are read via `FileReader` (client-side), then sent to
   `catalog.skills.importFromMarkdown({ fileName, content }[])`
4. Server parses frontmatter via the existing Phase 0c parser
   (`skill-catalog-adapter.ts`), cross-validates `allowedTools` against
   the merged tool registry, and inserts into `agsCatalogSkills` with
   `source="imported"` + `sourcePath=<fileName>`
5. Per-file result rendered as a table: ✓ imported / ✗ rejected (with
   reason) / ⚠ warning (e.g., unknown tool names)

**Import schema:**

```typescript
importFromMarkdownSchema = z.object({
  files: z.array(z.object({
    fileName: z.string().min(1).max(500),
    content: z.string().min(1).max(200_000),  // 200 KB cap per file
  })).min(1).max(50),                           // batch cap
  packKey: z.string().optional(),               // override pack, defaults
                                                // to "imported"
  overwrite: z.boolean().default(false),        // allow overwriting
                                                // same skillKey?
})
```

**Result shape:**

```typescript
{
  results: Array<{
    fileName: string,
    ok: boolean,
    skillId?: number,     // set if inserted
    skillKey?: string,
    errors?: string[],
    warnings?: string[],  // e.g., "tool 'FooBar' not found in registry"
  }>,
  summary: { imported: N, failed: M, warned: K },
}
```

#### 13e — Catalog UI

**Files touched:**
- `client/src/pages/agent-studio/AgentSkillCatalogPage.tsx` — **NEW**
- `client/src/pages/agent-studio/AgentToolCatalogPage.tsx` — **NEW**
- `client/src/App.tsx` — 2 new routes (within the 22-line additive budget)
- `client/src/components/agent-studio/AgentStudioSidebar.tsx` — 2 new entries
  under a new "Catalog" group

**Skills Catalog page layout:**

```
┌──────────────────────────────────────────────────────────┐
│ Skills Catalog                       [Import .md] [New]  │
├──────────────────────────────────────────────────────────┤
│ Filter: [ All packs ▼ ] [ Source: all | db | imported |  │
│                              vendored ] [ Search... ]    │
├──────────────┬───────────────────────────────────────────┤
│ Pack tree    │ Skill list (virtualized table)            │
│              │                                           │
│ • agents (1) │ key         pack      source    tools  ⋮  │
│ • autom. (2) │ sync-keys   providers vendored  3      ⋮  │
│ • chat (2)   │ lint-sql    imported  imported  2      ⋮  │
│ ...          │ my-audit    db        db        5      ⋮  │
│              │                                           │
│ + New pack   │                                           │
└──────────────┴───────────────────────────────────────────┘
```

Clicking a row opens the **Skill Editor** in a slideout:

```
┌──────────────────────────────────────────┐
│ Edit: my-audit                  [Save]  │
├──────────────────────────────────────────┤
│ Name:        [...................]      │
│ Description: [...................]      │
│ Pack:        [ db ▼ ]                    │
│ Context:     ( ) inline  (●) fork        │
│ Agent:       [ general-purpose ▼ ]       │
│ Model:       [ (inherit) ▼ ]             │
│ Effort:      [ (none) ▼ ]                │
│ Allowed tools: [ multi-select ............  │
│   Bash × Read × Grep × Glob × +           │
│   (autocomplete from merged registry) ]  │
├──────────────────────────────────────────┤
│ Body (markdown editor, $ARGUMENTS hint): │
│ ┌──────────────────────────────────────┐ │
│ │ You are a ...                         │ │
│ │ Focus: $ARGUMENTS                     │ │
│ └──────────────────────────────────────┘ │
│ [Validate] [Save] [Save & Attach to...]  │
└──────────────────────────────────────────┘
```

**Tools Catalog page layout:**

```
┌──────────────────────────────────────────────────────────┐
│ Tools Catalog                          [+ New Tool]      │
├──────────────────────────────────────────────────────────┤
│ Source: [ All ] [ Built-in ] [ DB ] [ MCP ]              │
│ Category: [ All ▼ ]   [ Search... ]                      │
├──────────────────────────────────────────────────────────┤
│ key          category    source    destructive  actions │
│ Bash         shell       builtin   yes          view    │
│ Read         filesystem  builtin   no           view    │
│ mcp__gh__pr  mcp         mcp       no           view    │
│ my-linter    shell       db        no           edit    │
└──────────────────────────────────────────────────────────┘
```

**Create Tool flow** (new button):
- Dropdown: invocation kind (`shell` | `http` | `mcp_ref`)
- Form adapts to kind:
  - shell: argv textarea + env key/value pairs
  - http: url + method + headers
  - mcp_ref: server picker (from the current draft's MCP servers) + tool picker
- JSON Schema editor for `inputSchema` (textarea with live validation)
- Category dropdown
- Permissions section (allowedActions, hardBlockedActions, destructive flag)

**Decision points** (§5): should tool creation be `protectedProcedure` or
`governedProcedure`? Creating a `shell` tool is effectively creating a Bash
hook by another name — the plan recommends **governed** for shell/http kinds,
protected for `mcp_ref` (wraps an existing MCP tool).

**Validation plan for Phase 13:**
1. Create a custom skill via the UI, attach to the seeded OpenLLM Agent, run a
   simulation — confirm it executes
2. Import a `.md` file via the file picker — confirm it parses, validates,
   inserts
3. Try importing a skill with a typo in `allowedTools` — confirm it rejects
   with a clear error naming the bad tool
4. Create a custom shell tool (e.g., wraps `wc -l`) — confirm it appears in
   the Tools page's attach modal when editing an agent
5. Run the agent with the custom tool attached — confirm the simulation
   engine honors it

**Effort:** ~1,500 LOC, 5 commits (one per sub-phase 13a-e).

---

### Phase 14 — Agent Studio's own marketplace

**Objective.** A self-contained marketplace where users browse, install, and
publish skill packs + tool bundles. **No link to Claude's marketplace. No
pull from NPM registry. Distribution is via our own local + remote registry
format.**

#### 14a — Schema

**Files touched:**
- `drizzle/tables/agent-studio.ts` — 3 new tables

```typescript
agsMarketplaceItems {
  id,
  /** globally unique — "<author>/<itemKey>" */
  itemKey (varchar 180),
  /** "skill" | "skill_pack" | "tool" | "tool_pack" | "bundle" */
  itemType (varchar 32),
  displayName, description, author (varchar 120),
  version (varchar 32),
  /** jsonb — the full serialized payload (tool defs, skill defs, plugin
   *  manifests) — see §14b for shape */
  payload (jsonb),
  /** tags for search */
  tags (jsonb string[]),
  /** SHA-256 of payload for integrity + dedupe */
  contentHash (varchar 64),
  /** source of this item:
   *    "local"      → created in this instance (local authoring)
   *    "imported"   → pulled from a remote registry (14c)
   *    "published"  → created here AND published to a remote registry
   */
  source (varchar 16),
  /** usage stats — bumped on install, not on view */
  installCount (integer default 0),
  createdBy (integer),
  createdAt, updatedAt
}

agsMarketplaceCollections {
  id, key (varchar 120), name, description,
  /** ordered list of itemKey strings */
  itemKeys (jsonb string[]),
  isOfficial (boolean default false),
  createdBy, createdAt
}

agsMarketplaceInstalls {
  id, itemId (integer),
  /** Which agent was this installed onto? Null for global catalog installs */
  agentId (integer, nullable),
  /** What did the install create? References to catalog tables */
  createdSkillIds (jsonb number[]),
  createdToolIds (jsonb number[]),
  installedBy (integer),
  installedAt (timestamp),
}
```

**New indexes:**
- `uniq_ags_marketplace_items_key_version` on `agsMarketplaceItems(itemKey, version)`
- `idx_ags_marketplace_items_type` on `agsMarketplaceItems(itemType)`
- `idx_ags_marketplace_installs_agent` on `agsMarketplaceInstalls(agentId)`

#### 14b — Service + API

**Files touched:**
- `server/agent-studio/services/marketplace.ts` — **NEW**
- `server/agent-studio/api/router.ts` — new `marketplace` sub-router
- `server/agent-studio/shared/schemas.ts` — 6 new Zod schemas

**Payload format** (what's stored inside `agsMarketplaceItems.payload`):

```typescript
// itemType = "skill"
{ kind: "skill", skill: <catalogSkillsInsert shape> }

// itemType = "skill_pack"
{ kind: "skill_pack", packKey: string, packName: string, skills: [...] }

// itemType = "tool"
{ kind: "tool", tool: <catalogToolsInsert shape> }

// itemType = "tool_pack"
{ kind: "tool_pack", tools: [...] }

// itemType = "bundle"
{ kind: "bundle", skills: [...], tools: [...], hooks: [...], mcpServers: [...] }
```

**Service surface:**

```typescript
marketplace.list(filter?)         → paginated, filterable by type/author/tag
marketplace.get(itemKey, version) → single item with payload
marketplace.install(input)        → creates rows in catalog tables
                                     from the payload; records install
marketplace.publish(input)        → packages selected local catalog
                                     rows into a marketplace item
marketplace.unpublish(itemId)     → only for source="local"|"published"
marketplace.uninstall(installId)  → reverses an install (deletes created
                                     rows, decrements install count)
marketplace.search(query)         → full-text over displayName + description
                                     + tags
marketplace.listCollections()     → for the "curated" landing page
```

**Distribution model — three layers, all owned by us:**

1. **Local-only** (works offline, always)
   - User creates a skill/tool in the catalog → clicks **Publish to Local
     Marketplace** → row inserted into `agsMarketplaceItems` with
     `source="local"`
   - Anyone on the same Studio instance can browse and install

2. **Remote registry** (optional, opt-in)
   - A remote registry is any HTTP endpoint that serves our
     `/marketplace-registry.json` format. We bundle one official registry
     URL (hardcoded to our repo's `docs/agent-studio/marketplace/registry.json`
     served via GitHub Pages or similar)
   - Users can add additional registry URLs in the marketplace settings
   - Pull model: `marketplace.refresh()` fetches each configured registry,
     dedupes by `contentHash`, upserts into `agsMarketplaceItems` with
     `source="imported"`
   - Push model: out of scope for Phase 14 — publishing to a remote registry
     requires write auth and is a follow-up

3. **Bundled seed** (the "official" collection)
   - At migration time, we write a fixed set of marketplace items into the
     table from a JSON file in `server/agent-studio/seeds/marketplace-seed.json`
   - This seed includes the 19 vendored skills as `skill_pack` items and the
     51 built-in tools as a single `tool_pack` reference item (read-only, can't
     be uninstalled). Gives the marketplace a populated state on day one.

**Registry JSON format** (served by us, consumed by us, no third party):

```json
{
  "version": "1.0",
  "name": "Agent Studio Official",
  "description": "Curated skills and tools",
  "updatedAt": "2026-04-08T20:00:00Z",
  "items": [
    {
      "itemKey": "agent-studio/providers-pack",
      "itemType": "skill_pack",
      "displayName": "Provider review pack",
      "description": "3 skills for auditing LLM provider configs",
      "author": "agent-studio",
      "version": "1.0.0",
      "tags": ["providers", "audit"],
      "contentHash": "abc123...",
      "payload": { "kind": "skill_pack", "...": "..." }
    }
  ]
}
```

#### 14c — Marketplace UI

**Files touched:**
- `client/src/pages/agent-studio/AgentMarketplacePage.tsx` — **NEW**
- `client/src/pages/agent-studio/AgentMarketplaceItemPage.tsx` — **NEW**
- `client/src/App.tsx` — 2 new routes (within the 22-line budget; we'll
  budget these with the 13e route additions to stay under 22 lines total)

**Marketplace home layout:**

```
┌──────────────────────────────────────────────────────────┐
│ Marketplace                 [Refresh] [Add Registry] [+] │
├──────────────────────────────────────────────────────────┤
│ [ Featured ] [ Skills ] [ Tools ] [ Bundles ] [ All ]    │
├──────────────────────────────────────────────────────────┤
│ Featured Collections                                      │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐              │
│ │Provider│ │Database│ │Governa.│ │Frontend│              │
│ │ pack   │ │ pack   │ │ pack   │ │ pack   │              │
│ │3 skills│ │2 skills│ │2 skills│ │2 skills│              │
│ │[Install│ │[Install│ │[Install│ │[Install│              │
│ └────────┘ └────────┘ └────────┘ └────────┘              │
├──────────────────────────────────────────────────────────┤
│ All items (table with search)                             │
└──────────────────────────────────────────────────────────┘
```

**Item detail page:**

```
┌──────────────────────────────────────────────────────────┐
│ ← Back              Provider review pack  v1.0.0         │
├──────────────────────────────────────────────────────────┤
│ Author: agent-studio                                      │
│ Tags: providers, audit                                    │
│ Installs: 0                                               │
│                                                           │
│ Description: 3 skills for auditing LLM provider configs. │
│                                                           │
│ Contents:                                                 │
│   • Skill: review-provider                                │
│   • Skill: sync-keys                                      │
│   • Skill: test-connection                                │
│                                                           │
│ [Install to Catalog] [Install to Agent ▼]                │
└──────────────────────────────────────────────────────────┘
```

**Publish flow** (from Catalog page):
- Select rows (checkbox) in Skills Catalog or Tools Catalog → button
  **Publish to Marketplace**
- Modal: displayName, description, version, author, tags
- Server computes `contentHash`, inserts `agsMarketplaceItems` row with
  `source="local"`
- Optional: "Also submit to Official Registry" is grayed out with tooltip
  "Registry submission requires approval — file a PR at <repo-url>"
  (this is the cheapest way to avoid implementing registry auth in Phase 14)

#### 14d — Installer

**Files touched:**
- `server/agent-studio/services/marketplace-installer.ts` — **NEW**

The installer is the thing that takes a marketplace item's `payload` and
materializes it into the catalog (and optionally onto an agent). It handles:

- **Skill install** — insert into `agsCatalogSkills` with
  `source="imported"`, `sourcePath="marketplace://<itemKey>@<version>"`
- **Tool install** — insert into `agsCatalogTools`
- **Pack install** — iterate
- **Bundle install** — iterate skills + tools + (if agentId provided) also
  create agsDraftHooks / agsDraftMcpServers rows on the target draft
- **Conflict resolution** — if a skill with the same `(packKey, skillKey)`
  already exists, prompt the user:
  - `skip` (default)
  - `overwrite` — replace and bump version
  - `rename` — append `-imported-<timestamp>` to the skillKey
- **Record** — insert into `agsMarketplaceInstalls` for traceability and for
  the uninstall path

**Uninstall flow:** reads `agsMarketplaceInstalls.createdSkillIds` and
`createdToolIds`, deletes those rows (with user confirmation), decrements the
install count, deletes the install record.

**Validation for Phase 14:**
1. Browse the marketplace on a fresh install — see 9 seeded skill packs
2. Click a pack → see its 2-3 skills listed → click Install to Catalog
3. Go to Skills Catalog — confirm the 3 skills appear with `source="imported"`
4. Go to an agent → Tools → Skills tab — confirm the new skills are
   attachable
5. Create a custom skill in the catalog → Publish to Marketplace → confirm
   it appears in the marketplace table with `source="local"`
6. Add a fake remote registry URL → Refresh → confirm the pull behavior
   (should fail gracefully with a clear error for a non-existent URL)
7. Uninstall the provider pack → confirm the 3 skills are removed

**Effort:** ~1,200 LOC, 4 commits.

---

### Phase 15 — MCP full potential

**Objective.** Complete the 40% of MCP support we're missing vs upstream,
and use the "MCP tools are first-class" finding to its full effect: merge
discovered tools into the tool-name validation layer (13b) and surface MCP
`prompts` as skills (the `mcpSkillBuilders.ts` bridge upstream).

#### 15a — Websocket transport

**Files touched:**
- `server/agent-studio/services/mcp/transports/websocket.ts` — **NEW** (replace scaffold)
- `server/agent-studio/services/mcp/mcp-manager.ts` — dispatch case

The stdlib `ws` package is already installed for the Phase 1b openllm-agent2
runtime adapter. Reuse it here — same JSON-RPC-over-frames pattern as stdio,
but over a WebSocket instead of child process stdin/stdout.

**Upstream reference:** `openclaude/src/services/mcp/client.ts` uses the same
`McpWebSocketServerConfig` shape — we'll mirror it in our
`agsDraftMcpServers.transport` enum (already supports "websocket" as a value).

#### 15b — OAuth flow

**Files touched:**
- `server/agent-studio/services/mcp/auth.ts` — **NEW** (mirrors
  `openclaude/src/services/mcp/auth.ts`)
- `drizzle/tables/agent-studio.ts` — add `oauthConfig` (jsonb, nullable) and
  `oauthState` (jsonb, nullable) columns to `agsDraftMcpServers`
- `client/src/pages/agent-studio/AgentMcpPage.tsx` — OAuth connect button +
  callback handler

The openclaude OAuth flow for MCP is:
1. Client hits `mcp.connect` with `transport=http` and an OAuth config
2. Server responds with a provider auth URL + PKCE challenge
3. Client opens the URL in a new tab; user authorizes; provider redirects
   back to a callback endpoint we expose at `/api/agent-studio/mcp/oauth/callback`
4. Server exchanges code for tokens, stores them encrypted in `oauthState`
5. Subsequent `mcp.connect` calls use the stored token

Reusing the platform `encryption.ts` helpers for token storage (same pattern
as Phase 0a `providerConfig.apiKey`).

**Decision point #3:** do we need a callback endpoint on the platform side?
This WOULD mean editing `server/_core/index.ts` which violates the standalone
constraint. Alternative: use a fragment-based callback that bounces through a
static HTML file served from the module. **Recommendation:** static HTML
approach — avoids the platform edit.

#### 15c — SDK transport real

**Files touched:**
- `server/agent-studio/services/mcp/transports/sdk.ts` — replace scaffold

Wire an in-process MCP server bridge. This exists upstream for cases where
the MCP server is a library rather than an external binary (e.g., a built-in
"studio knowledge" server that exposes the `agsDraftKnowledgeBindings` as
MCP tools). For Phase 15 we ship the transport shell; actual built-in SDK
servers are a follow-up.

#### 15d — Tool-name merge (feeds back into 13b)

**Files touched:**
- `server/agent-studio/services/catalog-tools.ts` — `listMerged` extension
- `server/agent-studio/services/catalog-skills.ts` — validation uses merged
  list

When validating a skill's `allowedTools` at save time, the merged registry
must include:
1. Built-in 51 from `tool-catalog-adapter.ts`
2. User-created from `agsCatalogTools`
3. **MCP-discovered for the draft the skill is being attached to** — this
   is the feedback loop. Skills are global, so for the validation pass we
   use the union of all currently-connected MCP servers' tool lists.

#### 15e — MCP-as-skill bridge

**Files touched:**
- `server/agent-studio/services/catalog-skills.ts` — add `mcp` source type
- `server/agent-studio/services/mcp/mcp-manager.ts` — `listConnectedPrompts()`

openclaude's `mcpSkillBuilders.ts` takes prompts exposed by MCP servers
(via `prompts/list` JSON-RPC) and wraps them as skills named
`mcp__<serverName>__<promptName>`. We replicate:

1. When an MCP server connects, additionally call `prompts/list` (new RPC)
2. Parse each prompt into our skill shape (name, description, arguments)
3. Expose them in `skill-catalog-adapter.listMerged()` with
   `source="mcp_prompt"` — read-only, not editable, disappears when the
   server disconnects

**Effort:** ~1,000 LOC, 4 commits (one per 15a-e, with 15d + 15e as a single
commit).

---

### Phase 16 — Brand cleanup

**Objective.** Remove every `claude` / `openclaude` / `Claude-Code-style`
reference from agent-studio code. DB names (`mynewap1claude`) and vendor API
model IDs (`claude-sonnet-4-5`) stay — those are identifiers, not brand copy.

**Audit results** (already done — 8 concrete references across 4 files):

| File | Line | Current | After |
|---|---|---|---|
| `tool-catalog-adapter.ts` | 261 | `"Get or set Claude Code / OpenLLM configuration"` | `"Get or set OpenLLM Agent runtime configuration"` |
| `openllm-agent2-defaults.ts` | 19 | `"Canonical OpenLLM Agent — a Claude-Code-style coding agent..."` | `"Canonical OpenLLM Agent — a coding-agent loop backed by OpenLLM Agent2..."` |
| `openllm-agent2-defaults.ts` | 33 | `"...Operate as a Claude-Code-style agent loop with..."` | `"...Operate as a tool-aware coding agent loop with..."` |
| `openllm-agent2-defaults.ts` | 75 | `"You are the OpenLLM Agent, a Claude-Code-style coding agent..."` | `"You are the OpenLLM Agent, a tool-aware coding agent..."` |
| `AgentRuntimePage.tsx` | 213 | `"e.g. gpt-4o-mini, claude-sonnet-4-5, sonnet"` | `"e.g. gpt-4o-mini, llama3.2, mistral-small"` |
| `AgentSubagentsPage.tsx` | 43 | `"user (~/.claude/agent-memory)"` | `"user (~/.agent-studio/memory)"` |
| `AgentSubagentsPage.tsx` | 44 | `"project (.claude/agent-memory)"` | `"project (.agent-studio/memory)"` |
| `AgentSubagentsPage.tsx` | 45 | `"local (.claude/agent-memory-local)"` | `"local (.agent-studio/memory-local)"` |

**Files touched:** 4
**Lines changed:** 8
**Risk:** zero — all changes are copy-only, no behavior change

**Also:**
- Audit `docs/agent-studio/*.md` for mentions — expected to be high (the
  plan docs I wrote reference openclaude and Claude Code extensively).
  **Decision:** plan docs are historical research artifacts and can keep
  references to sources. ONLY the code gets cleaned. Plans stay honest
  about where the ideas came from.
- Grep for `#openllm-agent2` and verify it's the correct brand (it is —
  openllm ≠ openclaude).

**Validation for Phase 16:**
```bash
# After the commit, this must return 0:
grep -rnI "Claude-Code\|claude-code\|openclaude" server/agent-studio/ client/src/pages/agent-studio/ client/src/components/agent-studio/
# This must only return the DB name:
grep -rnI -w "claude" server/agent-studio/ client/src/pages/agent-studio/ client/src/components/agent-studio/ | grep -v mynewap1claude | grep -v "claude-sonnet\|claude-opus\|claude-haiku"
```

**Effort:** ~50 LOC, 1 commit.

---

## 4. Cross-cutting concerns

### 4.1 Standalone module footprint

The 22-line platform-file budget (App.tsx, MainLayout.tsx, drizzle/schema.ts,
server/routers.ts) is currently at ~14 lines from previous phases. Phase 13
adds ~4 lines (2 new routes), Phase 14 adds ~2 lines (1 new route + submenu).
**New total: ~20 lines, still under 22.** Phase 15 and 16 add zero.

### 4.2 Encryption

Phase 15b (OAuth tokens) and marketplace items that contain secrets must use
`server/_core/encryption.ts`. No new encryption infra.

### 4.3 Governance

New mutations and their trust levels:

| Mutation | Trust | Why |
|---|---|---|
| `catalog.skills.create/update/remove/import` | `protectedProcedure` | User's own authoring surface |
| `catalog.tools.create/update/remove` (shell/http kinds) | `governedProcedure` | Creates executable commands — same sensitivity as MCP connect |
| `catalog.tools.create` (mcp_ref kind) | `protectedProcedure` | Just a pointer to an already-authorized MCP server |
| `marketplace.install/uninstall` | `protectedProcedure` | Scoped to the caller's agents |
| `marketplace.publish/unpublish` | `protectedProcedure` | Local marketplace only in Phase 14 |
| `marketplace.refresh` (remote fetch) | `governedProcedure` | External network call |
| `mcp.connect/disconnect` | `governedProcedure` (unchanged) | Phase 7 precedent |
| `mcp.oauth.initiate/callback` | `governedProcedure` | Token storage |

### 4.4 Tests

Static validation per phase (no live tests on device per CLAUDE.md). Key
items:

- Phase 13: confirm merged-registry validation rejects typo'd tool names;
  confirm `.md` import round-trips frontmatter fields correctly
- Phase 14: confirm install → uninstall is fully reversible (no orphaned
  rows in catalog tables after uninstall)
- Phase 15: confirm websocket transport's close handlers release resources;
  confirm OAuth state is encrypted at rest
- Phase 16: the grep assertions above return 0

### 4.5 CI

Every phase commit must compile cleanly (TypeScript + build step). The
repo is currently at 0 agent-studio errors (commit `aef4c67` / `fc68a11` /
`c4ff326`) — do not regress. Pre-existing errors in unrelated modules are
out of scope.

---

## 5. Decision points (need user confirmation before Builder starts)

| # | Decision | Options | My recommendation |
|---|---|---|---|
| 1 | **Phase order** | (a) 13 → 14 → 15 → 16 (b) 15 first (MCP complete), then 13/14 (c) 16 first (clean brand), then 13/14/15 | **(a)** — catalog is the user's most-asked feature; MCP completion can slot in via 15d feedback after 13 ships |
| 2 | **Tool creation in UI: shell/http kinds** | (a) governed (b) protected | **(a)** — these create executable commands; same sensitivity as Phase 4 hooks |
| 3 | **OAuth callback endpoint** | (a) edit server/_core/index.ts (platform edit) (b) static HTML with fragment-based callback (standalone) | **(b)** — preserves the standalone constraint |
| 4 | **Remote marketplace registry** | (a) ship with 1 hardcoded official URL (b) ship with zero URLs, user adds them (c) no remote at all, local-only | **(a)** — official URL hardcoded to our repo's GitHub Pages or a static JSON file in the repo itself. Zero third-party dependencies, zero external services to maintain. |
| 5 | **Marketplace item format** | (a) JSON (our own schema) (b) adopt openclaude's plugin manifest (c) adopt NPM package.json | **(a)** — our own schema. Not tied to openclaude or NPM. Trivial to evolve. |
| 6 | **MCP OAuth — which providers to ship** | (a) none, generic OAuth2 only (b) GitHub + generic (c) GitHub + Google + generic | **(a)** — generic OAuth2 covers anything with a standard flow. Provider-specific adapters are a follow-up. |
| 7 | **Publishing to remote registry** | (a) in scope for Phase 14 (b) out of scope, file a PR | **(b)** — registry write auth is a big scope-creep; start with file-a-PR instructions in the UI |
| 8 | **Conflict resolution on skill import** | (a) always prompt (b) always skip (c) user-configurable default | **(c)** — prompt the first time, remember the choice in localStorage for the session |
| 9 | **Tool catalog invocation kinds** | (a) shell + http + mcp_ref + builtin (b) mcp_ref + builtin only (c) shell + http + builtin (no mcp_ref) | **(a)** — all four. mcp_ref is the cleanest way to surface "create a shortcut to this MCP tool under a friendly name" |
| 10 | **Brand cleanup scope** | (a) only agent-studio code (b) whole repo (c) agent-studio + docs | **(a)** — scope discipline. Plan docs reference sources honestly. |
| **11** | **ASDB boot wiring** | (a) +5 lines in `_core/index.ts` matching the wfdb pattern verbatim (b) +1 line that calls a `bootAgentStudio()` wrapper exported from `server/agent-studio/boot.ts` | **(b)** — preserves the 22-line additive footprint budget; also formalizes the Phase 10 scheduler self-start which currently relies on a side-effect import |
| **12** | **Existing data migration** | (a) ship a one-shot `scripts/migrate-ags-to-asdb.mjs` that copies rows from `mynewap1claude` → `asdb` (b) skip migration — production has no data we care about, just re-seed | **(a)** — the deployed instance has data we don't want to lose. Script is ~150 LOC, deletable after one run. |
| **13** | **Phase 12.5 ordering** | (a) before Phase 13 (prerequisite) (b) after 13/14 (migrate the new tables too) (c) optional, only if we want isolation | **(a)** — doing it AFTER 13/14 means migrating ~5 more tables. Doing it FIRST is the cheapest path. |

---

## 6. Risks

| # | Risk | Phase | Mitigation |
|---|---|---|---|
| R1 | Tool-name validation breaks existing skill attachments | 13b | Validation only runs on **save**, not on attach. Existing attached skills with bad tool names stay attached but get a warning badge. |
| R2 | `.md` import lets users inject malicious markdown that exploits the skill renderer | 13d | Markdown is only rendered in the editor preview (sanitized); at runtime it's passed as a prompt, not executed. No XSS surface. |
| R3 | Tool `shell` invocation kind = new executable command surface | 13c | `governedProcedure` on create, working-directory constraint inherited from Phase 4 hook runner, spawn (not exec), sanitized env. |
| R4 | Marketplace items can carry arbitrary payloads | 14a | `payload` is parsed via strict Zod schemas at install time, not at load time. An invalid payload can't be installed. |
| R5 | Remote registry refresh can fetch malicious content | 14b | Content hash verification on install; registry URLs are user-added and governed. |
| R6 | MCP websocket transport leaks connections on server restart | 15a | Same `process.on("exit")` cleanup pattern as Phase 7 stdio transport. |
| R7 | OAuth tokens stored unencrypted | 15b | Mandatory encryption via existing `server/_core/encryption.ts`. `validateProductionEnv()` already gates this in production. |
| R8 | Brand cleanup breaks seed idempotency | 16 | Identity fields in the seed row (e.g., `description`) change between runs. Mitigation: the seeder is idempotent on `internalKey`, not content. Changing copy re-creates cleanly because the seed re-applies on next deploy. |
| R9 | Marketplace seed creates duplicate catalog rows | 14d | Unique index on `agsCatalogSkills(packKey, skillKey)` prevents duplicates. Idempotent by design. |
| R10 | Phase 15 websocket transport + Phase 1b openllm adapter both use `ws` package, version drift possible | 15a | Single `ws` dependency, no change. |

---

## 7. Effort estimate

| Phase | LOC (new) | LOC (mod) | Commits |
|---|---|---|---|
| **12.5 ASDB extraction** | **600** | **30** | **3** |
| 13 Catalog foundation | 1,500 | 150 | 5 |
| 14 Marketplace | 1,200 | 80 | 4 |
| 15 MCP completion | 1,000 | 120 | 4 |
| 16 Brand cleanup | 50 | 50 | 1 |
| **Total** | **~4,350** | **~430** | **~17** |

Plus ~2 cleanup commits expected across the sequence. Final total: **~19 commits**.

**New tables:** 5 (agsCatalogTools, agsCatalogSkills, agsMarketplaceItems,
agsMarketplaceCollections, agsMarketplaceInstalls)

**New UI pages:** 3 (AgentSkillCatalogPage, AgentToolCatalogPage, AgentMarketplacePage + AgentMarketplaceItemPage)

**New sub-routers:** 3 (catalog.skills, catalog.tools, marketplace)

---

## 8. What this plan does NOT do

- **Does NOT implement skill versioning migrations.** Version field exists but
  no migration logic (matching upstream openclaude precedent).
- **Does NOT build a social marketplace.** No ratings, no reviews, no
  comments, no user profiles beyond `author` (free-text field).
- **Does NOT implement registry write auth.** Publishing to the remote
  registry is "file a PR" — cheapest possible auth story for Phase 14.
- **Does NOT touch the openllm-agent2 runtime path.** The live runtime
  adapter stays exactly as shipped in Phase 1b. Catalog-authored tools are
  NOT passed to the openllm runtime yet — they're usable in simulation only.
  Live runtime integration is a Phase 17+ concern.
- **Does NOT add support for tool/skill dependencies.** Packs are flat.
- **Does NOT add test scaffolding for user-authored tools.** Users are
  responsible for correctness.
- **Does NOT build a skill marketplace registry server.** The official
  registry is a static JSON file served from GitHub Pages.
- **Does NOT implement "claude" → "anthropic" rename in provider config.**
  Model IDs like `claude-sonnet-4-5` stay because they're API identifiers,
  not brand copy. Only user-facing surface text gets cleaned.

---

## 9. Decision summary needed from user

Answer the 10 decision points in section 5. My recommendations are marked.
Once approved, Builder starts Phase 13a (schema) as a single commit, then
13b, then 13c, etc. Each phase is atomically committable and CI-clean.

Until decisions are answered, Builder does NOT start.
