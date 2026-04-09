# Agent Studio — Example Seeds

Runnable SQL files that create fully-configured example agents directly in `asdb`. Companion reference for [`../seed-new-agent-guide.md`](../seed-new-agent-guide.md) — the guide documents the pattern, these files apply it to real scenarios.

Each example is a single `psql -d asdb -f <file>` away from appearing in `/agent-studio` with draft, MCP bindings, permission rules, and tool allowlists wired in.

## Examples

| File | Agent | Class | Purpose |
|---|---|---|---|
| [`agent-studio-expert.sql`](./agent-studio-expert.sql) | **Agent Studio Expert** | `custom` | Meta-agent that designs + creates new agents from user prompts. Knows the 32 `ags_*` data model, the Phase 19 MCP architecture, the seed guide, and the permission rule syntax. Self-referential: uses `studio-self` MCP server to introspect the Studio itself. |

## Usage

```bash
# 1. Make sure asdb is up (the dev server seed provisions all tables)
curl -s http://localhost:3000/api/health    # should return 200

# 2. Run the example seed
psql -d asdb -f docs/agent-studio/examples/agent-studio-expert.sql

# 3. Discover the new agent id
curl -s "http://localhost:3000/api/trpc/agentStudio.home.listAgents?batch=1&input=%7B%220%22%3A%7B%22json%22%3A%7B%7D%7D%7D" \
  | python3 -m json.tool

# 4. Open it in the browser (substitute the actual id)
xdg-open "http://localhost:3000/agent-studio/<id>/overview"
```

## Provider API keys

**None of these examples store literal API keys in `provider_config`.** They all use the `apiKeyEnvVar` convention which resolves at runtime via `resolveProviderApiKey` in `server/agent-studio/adapters/openllm-runtime-adapter.ts`.

The fallback chain:
1. `providerConfig.apiKey` (literal — discouraged, only for legacy/per-agent overrides)
2. `providerConfig.apiKeyEnvVar` (explicit env var name override — what the examples use)
3. Convention map `provider → PROVIDER_ENV_VAR[provider]`:
   - `openai` → `OPENAI_API_KEY`
   - `anthropic` → `ANTHROPIC_API_KEY`
   - `google` → `GOOGLE_API_KEY`
   - `groq` → `GROQ_API_KEY`
   - `mistral` → `MISTRAL_API_KEY`
   - `deepseek` → `DEEPSEEK_API_KEY`

**Where the env vars come from:**
- **Deployed** (Cloudflare tunnel via `builder-deploy.yml`): injected from GitHub Secrets at lines 476, 487, 600 of the workflow. Set the secrets once in `Settings → Secrets and variables → Actions → Repository secrets` and every deploy picks them up automatically.
- **Local dev**: set in `.env` at the repo root, or exported in the shell that runs `npm run dev`:
  ```bash
  # .env
  OPENAI_API_KEY=sk-...
  ```

**Never commit literal API keys** — the governance scan in `scripts/governance/check-invariants.ts` will flag them, and the Governance Gate CI workflow blocks merge on critical violations.

## Cleanup

Every example SQL file ships with a commented-out `CLEANUP BLOCK` at the bottom. To remove a seeded agent:

1. Open the SQL file
2. Uncomment the `CLEANUP BLOCK` section
3. Run `psql -d asdb -f <file>` again (or just the uncommented block)

This does NOT cascade delete by default — the Phase 7+ `ags_*` tables were built clone-safe without ON DELETE CASCADE, so the cleanup block explicitly deletes every draft-scoped child row (MCP servers, permission rules, tool bindings, etc.) before dropping the agent row.

## Adding new examples

1. Write the seed SQL following the pattern in [`../seed-new-agent-guide.md`](../seed-new-agent-guide.md#full-working-example) — TL;DR structure:
   - `BEGIN;`
   - Step 1: `INSERT INTO ags_agents ...`
   - Step 2: `INSERT INTO ags_agent_drafts ... is_current = true`
   - Step 3: `UPDATE ags_agents SET current_draft_id = ...` (back-link!)
   - Steps 4+: optional per-draft attachments (MCP, permissions, tools, skills, etc.)
   - `COMMIT;`
   - Commented-out `CLEANUP BLOCK` at the bottom
2. File header must document:
   - What the agent does
   - Which env vars are required at runtime (e.g., `OPENAI_API_KEY`)
   - How to verify after running (curl + browser URL)
3. Use `apiKeyEnvVar` in `provider_config`, NEVER a literal key
4. Add an entry to the table above
5. Commit + push

## Related docs

- [`../seed-new-agent-guide.md`](../seed-new-agent-guide.md) — step-by-step guide for writing your own seed from scratch
- [`../phase-19-mcp-manager-redesign.md`](../phase-19-mcp-manager-redesign.md) — the dispatcher / FSM / registry architecture the agents run on top of
- [`../option-a-openllm-mcp-patch-plan.md`](../option-a-openllm-mcp-patch-plan.md) — live-runtime MCP unlock (Phase 18)
- [Studio-as-MCP-server source](../../../server/agent-studio/services/mcp/studio-mcp-server.ts) — the server that `studio-self` points at
