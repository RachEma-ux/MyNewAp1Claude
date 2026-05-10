/**
 * Vault — search service skeleton.
 *
 * Phase 6 MVP. Backed by Postgres tsvector for full-text;
 * tag / property filters via Drizzle joins.
 *
 * MVP skeleton uses VaultRepositoryStub for in-memory dev mode.
 */

import type { SearchInput } from "./contracts.js";

export interface SearchHit {
  readonly noteId: number;
  readonly vaultId: number;
  readonly title: string;
  readonly slug: string;
  readonly snippet: string;
  readonly score: number;
}

export interface VaultSearchService {
  search(input: SearchInput, runtime: { userId?: number }): Promise<SearchHit[]>;
}

/**
 * Phase 6 production implementation uses tsvector:
 *
 *   SELECT n.id, n.vault_id, n.title, n.slug,
 *          ts_headline('english', v.content_md, query) AS snippet,
 *          ts_rank(to_tsvector('english', v.content_md), query) AS score
 *   FROM ags_vault_notes n
 *   JOIN ags_vault_note_versions v ON n.current_version_id = v.id
 *   , websearch_to_tsquery('english', $query) query
 *   WHERE to_tsvector('english', v.content_md) @@ query
 *     AND ($vaultId IS NULL OR n.vault_id = $vaultId)
 *     AND n.governance_status = 'active'
 *   ORDER BY score DESC
 *   LIMIT $limit;
 *
 * Plus permission filter at app boundary against ags_vault_members.
 */
export class VaultSearchServiceStub implements VaultSearchService {
  async search(_input: SearchInput, _runtime: { userId?: number }): Promise<SearchHit[]> {
    return [];
  }
}
