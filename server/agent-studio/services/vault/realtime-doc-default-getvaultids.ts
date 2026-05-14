/**
 * Realtime-doc — production `getVaultIdsForUser` factory.
 *
 * Closes the V1+ named follow-up "Production `getVaultIdsForUser`
 * wiring" surfaced by PR-V1-37 (`realtime-doc-authorize`) and
 * PR-V1-38 (`realtime-doc-websocket-bridge`):
 *
 *   - PR-V1-37 (#787) introduced the `GetVaultIdsForUserFn` DI seam
 *     consumed by `authorizeRealtimeDocConnection`.
 *   - PR-V1-38 (#789) wired the seam into the WebSocket bridge but
 *     ships with no default — operators are expected to supply
 *     `installRealtimeDocUpgradeOnServer(server, { getVaultIdsForUser })`.
 *
 * This module supplies the canonical production closure: it consults
 * `VaultRepository.listVaultsForUser(userId)` (already a Category B
 * read-only path in MR-3 inventory) and returns the row ids.
 *
 * DI seam (`getRepo`) lets tests inject a stub repository without
 * touching ASDB. Production defaults to `new AsdbVaultRepository()`
 * lazily so tests that never call the factory don't pay the import
 * cost.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - No `credential-resolver` / `dispatchMcpToolCall` / `*_API_KEY`
 *     / `neo4j-driver` / `openrouter` imports.
 *   - Read-only: the closure only calls `listVaultsForUser`.
 */

import type { GetVaultIdsForUserFn } from "./realtime-doc-authorize.js";
import type { VaultRepository } from "./repository.js";

export interface CreateDefaultGetVaultIdsForUserOptions {
  /**
   * Test seam — override the repository accessor. The accessor is
   * invoked once per closure-construction; production should use the
   * default (lazy `new AsdbVaultRepository()`).
   */
  readonly getRepo?: () => Pick<VaultRepository, "listVaultsForUser">;
}

/**
 * Returns the production `getVaultIdsForUser` closure. The closure
 * calls `VaultRepository.listVaultsForUser(userId)` and projects the
 * row ids; no mutation, no other side effects.
 *
 * Lookup failures (repository throws) propagate to the upgrade
 * handler, which translates them to the closed deny taxonomy
 * (`vault_membership_lookup_failed` → close code 4500). Defensive
 * deny on lookup throw is load-bearing — a duplex realtime channel
 * cannot afford a silent allow on read failure.
 */
export function createDefaultGetVaultIdsForUser(
  options: CreateDefaultGetVaultIdsForUserOptions = {},
): GetVaultIdsForUserFn {
  let cachedRepo: Pick<VaultRepository, "listVaultsForUser"> | null = null;
  const getRepo = options.getRepo;
  return async (userId: number): Promise<readonly number[]> => {
    if (!cachedRepo) {
      if (getRepo) {
        cachedRepo = getRepo();
      } else {
        // Lazy import so unit tests + non-realtime call sites never
        // pay the cost of constructing the ASDB-backed repo.
        const mod = await import("./repository-asdb.js");
        cachedRepo = new mod.AsdbVaultRepository();
      }
    }
    const rows = await cachedRepo.listVaultsForUser(userId);
    return rows.map((row) => row.id);
  };
}
