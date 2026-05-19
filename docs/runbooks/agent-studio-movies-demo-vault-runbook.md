# Movies Demo Vault — Operator Runbook

**Author:** Native Graph Workspace integration · 2026-05-19
**Script:** `scripts/demos/seed-movies-demo-vault.ts`
**Dataset:** `scripts/demos/data/movies.cypher` (Apache-2.0, Neo4j, Inc. — see `movies-attribution.md`)

## What this runbook does

Materializes the canonical Neo4j Movies dataset (32 movies / 131 people / ~253 relationships) as Agent Studio vault notes with `[[wikilinks]]`, then lets the existing Vault → Knowledge Graph projection chain populate Neo4j organically. After running:

- A new vault `Movies Demo` (slug `movies-demo`) exists in ASDB
- One note per Movie + one note per Person (~163 notes total)
- Every relationship (`ACTED_IN`, `DIRECTED`, `PRODUCED`, `WROTE`, `REVIEWED`, `FOLLOWS`) is encoded as a wikilink between notes
- `ags_graph_projection_sync_jobs` carries ~163 `note.created` jobs + ~250 `wikilink.changed` jobs
- The projection drain cron (or manual admin drain) writes `Note` + `NoteVersion` + `LINKS_TO` nodes/edges into Neo4j CE

This exercises the documented operator-visible path end-to-end. **No Cypher is replayed against Neo4j** — the seed runs entirely through the vault service, and the standard projection chain does the graph population. That's the point of the demo.

## Prerequisites

- ASDB Postgres reachable (`DATABASE_URL_ASDB`)
- Neo4j CE projection backend reachable (or running with stub graph repo — projection jobs will queue regardless)
- Dev server can be running or stopped; the script does not depend on it
- User id `1` exists in ASDB (default `createdByUserId` — adjust the constant in the script if needed)

## Run

```bash
pnpm tsx scripts/demos/seed-movies-demo-vault.ts
```

Expected output:

```
[movies-demo-seed] parsed 32 movies / 131 people / 253 edges from .../movies.cypher
[movies-demo-seed] created vault id=N slug=movies-demo
[movies-demo-seed] +movie movie-the-matrix
[movies-demo-seed] +person person-keanu-reeves
... (one log line per note)
[movies-demo-seed] DONE — vaultId=N created=163 skipped=0 total-entities=163
```

Re-running is idempotent: the vault is reused (slug-keyed), notes whose slugs already exist are skipped.

## Verify

1. **Vault + notes** — open `/agent-studio/graph-workspace` and select the "Movies Demo" vault. ~163 notes should be listed.
2. **Wikilink resolution** — open `[[movie-the-matrix]]` (rendered as "The Matrix"). The note body should link to cast members; each link should resolve to a Person note (no red "missing target" badge).
3. **Projection queue** — query ASDB:

   ```sql
   SELECT event_kind, status, COUNT(*) FROM ags_graph_projection_sync_jobs
   WHERE payload->>'demo' = 'movies' OR payload->>'vault_slug' = 'movies-demo'
   GROUP BY 1, 2;
   ```

   Expect rows for both `note.created` and `wikilink.changed` event kinds. After the drain cron runs (`*/5 * * * *`), `status` should transition `pending` → `succeeded`.

4. **Lens browser** — open `/agent-studio/graph-lens-browser`. Render the **Institutional Memory** lens against the workspace; should surface Movies Demo nodes after projection has drained.

5. **Backlinks panel** — open `[[person-keanu-reeves]]`. The DB-backed backlinks panel (per the Vault → KG chain documentation in CLAUDE.md) should list every Movie note that wikilinks back.

## Rollback

To wipe the demo vault without affecting other vaults:

```sql
WITH demo AS (SELECT id FROM ags_vaults WHERE slug = 'movies-demo')
DELETE FROM ags_vault_notes WHERE vault_id IN (SELECT id FROM demo);
DELETE FROM ags_vaults WHERE slug = 'movies-demo';
```

The projection chain handles `note.deleted` events identically — Neo4j nodes/edges projected from these notes will be removed by the drain.

## Failure modes

- **`role "root" does not exist`** — `psql` was invoked without a role. Use `PGUSER=u0_a296` per the local dev convention (see `~/.claude/projects/-root/memory/reference_local_asdb_role_mismatch.md`).
- **`A lens runner is already registered for kind=…`** — Step 3.35 stub-runners installed before the per-kind real-runner step. Either flip stubs off (`AGS_GRAPH_LENS_STUB_RUNNERS_INSTALL=off`) and keep per-kind real flags on, or accept stub runners for this demo.
- **Notes created but Neo4j shows no nodes** — the projection cron is disabled (`AGS_PROJECTION_DRAIN_CRON_DISABLED=true`) or the graph repo isn't pointing at a real Neo4j instance. Check `ags_graph_projection_sync_jobs.status` — `pending` rows mean queued but undrained.

## Attribution

Dataset © Neo4j, Inc., licensed under Apache-2.0. See `scripts/demos/data/movies-attribution.md`.
