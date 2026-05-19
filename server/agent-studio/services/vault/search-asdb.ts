/**
 * Vault — ASDB-backed search service.
 *
 * Replaces `VaultSearchServiceStub`. Backs `agentStudio.vault.search`
 * with a Postgres tsvector full-text query against
 * `ags_vault_note_versions.content_md` (current version per note) +
 * permission filter against `ags_vault_members`.
 *
 * Why raw SQL: Drizzle has no first-class binding for
 * `websearch_to_tsquery` / `ts_headline` / `ts_rank`. The query is
 * parameterized through the underlying pg client; no string
 * interpolation of user input.
 *
 * Result shape mirrors the existing `SearchHit` contract so the router
 * does not need to remap fields.
 */

import { sql } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import type { VaultSearchService, SearchHit } from "./search.js";
import type { SearchInput } from "./contracts.js";

export class AsdbVaultSearchService implements VaultSearchService {
  constructor(
    private readonly getDb: typeof getAsDb = getAsDb,
  ) {}

  async search(
    input: SearchInput,
    runtime: { userId?: number },
  ): Promise<SearchHit[]> {
    const db = this.getDb();
    const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);

    // Build the parameterized SQL. Drizzle's `sql` template binds each
    // `${value}` as a parameter, so the user query string never reaches
    // Postgres as part of the SQL text — it rides as a bound parameter
    // to `websearch_to_tsquery`.
    const rows = await db.execute<{
      note_id: number;
      vault_id: number;
      title: string;
      slug: string;
      snippet: string;
      score: number;
    }>(sql`
      WITH q AS (
        SELECT websearch_to_tsquery('english', ${input.query}) AS query
      )
      SELECT
        n.id          AS note_id,
        n.vault_id    AS vault_id,
        n.title       AS title,
        n.slug        AS slug,
        ts_headline(
          'english',
          v.content_md,
          (SELECT query FROM q),
          'MaxFragments=1, MaxWords=20, MinWords=5'
        )            AS snippet,
        ts_rank(
          to_tsvector('english', v.content_md),
          (SELECT query FROM q)
        )            AS score
      FROM ags_vault_notes n
      JOIN ags_vault_note_versions v
        ON v.id = n.current_version_id
      JOIN ags_vault_members m
        ON m.vault_id = n.vault_id
       AND m.user_id  = ${runtime.userId ?? -1}
      WHERE to_tsvector('english', v.content_md) @@ (SELECT query FROM q)
        AND n.governance_status = 'active'
        AND n.deleted_at IS NULL
        AND (${input.vaultId ?? null}::integer IS NULL OR n.vault_id = ${input.vaultId ?? null}::integer)
      ORDER BY score DESC, n.updated_at DESC
      LIMIT ${limit}
    `);

    // drizzle .execute returns either a pg-native rowset (.rows on
    // node-postgres) or an array (postgres-js). Normalize.
    const list: Array<{
      note_id: number;
      vault_id: number;
      title: string;
      slug: string;
      snippet: string;
      score: number;
    }> = Array.isArray(rows)
      ? (rows as unknown as Array<{
          note_id: number;
          vault_id: number;
          title: string;
          slug: string;
          snippet: string;
          score: number;
        }>)
      : ((rows as { rows?: Array<{
          note_id: number;
          vault_id: number;
          title: string;
          slug: string;
          snippet: string;
          score: number;
        }> }).rows ?? []);

    return list.map((r) => ({
      noteId: Number(r.note_id),
      vaultId: Number(r.vault_id),
      title: r.title,
      slug: r.slug,
      snippet: r.snippet,
      score: Number(r.score),
    }));
  }
}
