/**
 * Vault — search service contract.
 *
 * The production implementation (`AsdbVaultSearchService` in
 * `search-asdb.ts`) is backed by a parameterized Postgres tsvector
 * query against `ags_vault_note_versions.content_md` (current version
 * per note) with a permission join on `ags_vault_members`. The stub
 * here is used by `process.env.AGS_VAULT_REPO === "stub"` callers
 * (unit tests + dev modes that don't boot ASDB).
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
 * Stub for unit tests + `AGS_VAULT_REPO=stub` dev mode. Returns no
 * hits regardless of input. Production code routes through
 * `AsdbVaultSearchService`.
 */
export class VaultSearchServiceStub implements VaultSearchService {
  async search(_input: SearchInput, _runtime: { userId?: number }): Promise<SearchHit[]> {
    return [];
  }
}
