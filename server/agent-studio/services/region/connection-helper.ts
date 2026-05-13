/**
 * Region-routed connection helper — V2 Phase MR-2.
 *
 * Phase MR-1 (#754) shipped the `agsRegions` table + pure router
 * (`resolveWorkspaceRegion`, `assertSameRegion`). MR-2 closes the
 * "any `import { db }` resolves via the region-routed connection
 * helper" acceptance criterion by introducing the **helper itself**
 * — `getDbForRegion(regionKey)` + `getDbForWorkspace(input)`.
 *
 * Migrating existing callers is a separate sub-arc; this PR is the
 * minimal foundation. The helper has three layers:
 *
 *   1. `getDbForRegion(regionKey, opts)` — given a regionKey,
 *      returns a Drizzle instance bound to the region's
 *      `postgresUri`. Pools are cached per regionKey so each region
 *      gets a single shared pool for the process lifetime.
 *
 *   2. `getDbForWorkspace(input, opts)` — composes the MR-1 pure
 *      router with #1. Caller supplies the workspace's pinned key +
 *      `availableRegions` (from the region-service); helper picks
 *      the right pool. Returns `null` if no active region matches
 *      (caller surfaces operator-action error).
 *
 *   3. `getNeo4jUriForRegion(regionKey)` — returns the region's
 *      configured Neo4j URI (or null). The graph repository hook
 *      that consumes this lives outside MR-2 scope.
 *
 * Single-region operational baseline preserved:
 *   - When the registry has only the `default` region, the helper
 *     behaves identically to the legacy `getAsDb()` path. The
 *     migration cost across the codebase is zero until a second
 *     region row exists.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - Postgres = source of truth. The region's `postgresUri` is a
 *     pool selector; it does not change the SoT contract.
 *   - No raw `process.env.*_API_KEY` reads. `postgresUri` is stored
 *     on the region row; secrets bind via `credentialBindingId`
 *     and resolve out-of-band (operator-supplied closure).
 *   - No `credential-resolver` import. Plan v3 D2 clean.
 *   - No `dispatchMcpToolCall` import — region routing is data-plane,
 *     not tool-execution.
 *   - No `neo4j-driver` import — `getNeo4jUriForRegion` returns a
 *     string; the GraphRepository wraps the driver. Source-scan tested.
 */

import { drizzle } from "drizzle-orm/node-postgres";

import * as agsSchema from "../../../../drizzle/tables/agent-studio";
import { resolveWorkspaceRegion } from "./region-router.js";
import type { RegionRecord } from "./types.js";

// ============================================================================
// Per-region pool cache
// ============================================================================

type AsDbInstance = ReturnType<typeof drizzle<typeof agsSchema>>;

const poolByRegion = new Map<string, AsDbInstance>();

export interface RegionConnectionOptions {
  /** Test seam — replace the drizzle factory. Default uses the
   *  real `node-postgres` adapter. */
  readonly drizzleFactory?: (
    url: string,
  ) => AsDbInstance;
}

function defaultFactory(url: string): AsDbInstance {
  return drizzle(url, { schema: agsSchema });
}

/**
 * Resolve a region by key to a Drizzle ASDB instance. Pools are
 * cached per regionKey for the process lifetime.
 *
 * Returns null when the registry has no matching active region.
 */
export function getDbForRegion(
  region: RegionRecord,
  options: RegionConnectionOptions = {},
): AsDbInstance | null {
  if (!region.isActive) return null;
  if (!region.postgresUri || region.postgresUri.length === 0) return null;
  const cached = poolByRegion.get(region.regionKey);
  if (cached) return cached;
  const factory = options.drizzleFactory ?? defaultFactory;
  let instance: AsDbInstance;
  try {
    instance = factory(region.postgresUri);
  } catch (err) {
    const masked = region.postgresUri.replace(/:([^:@]+)@/, ":****@");
    console.warn(
      `[ags-region-connection-helper] drizzle factory failed for region=${region.regionKey} url=${masked}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
  poolByRegion.set(region.regionKey, instance);
  return instance;
}

export interface GetDbForWorkspaceInput {
  readonly availableRegions: ReadonlyArray<RegionRecord>;
  readonly workspaceRegionKey: string | null;
}

/**
 * Compose `resolveWorkspaceRegion` with `getDbForRegion`. Returns a
 * `{ region, db }` pair when routed successfully; null when no
 * active region matches.
 */
export function getDbForWorkspace(
  input: GetDbForWorkspaceInput,
  options: RegionConnectionOptions = {},
): { region: RegionRecord; db: AsDbInstance } | null {
  const region = resolveWorkspaceRegion(input);
  if (!region) return null;
  const db = getDbForRegion(region, options);
  if (!db) return null;
  return { region, db };
}

/**
 * Return a region's Neo4j URI (or null when unconfigured). The
 * graph repository wraps the driver — this helper just surfaces
 * the URI so the wiring stays config-driven.
 */
export function getNeo4jUriForRegion(region: RegionRecord): string | null {
  if (!region.isActive) return null;
  if (!region.neo4jUri || region.neo4jUri.length === 0) return null;
  return region.neo4jUri;
}

/**
 * Test seam — drop every cached pool. Production code MUST NOT
 * call this. Source-scan tests pin the symbol's visibility.
 */
export function __resetRegionConnectionCacheForTests(): void {
  poolByRegion.clear();
}

/**
 * Operator inspection — return the keys of every cached region pool.
 * Useful for the future operator dashboard that surfaces "which
 * regions are warm".
 */
export function listWarmRegionPoolKeys(): string[] {
  return [...poolByRegion.keys()];
}
