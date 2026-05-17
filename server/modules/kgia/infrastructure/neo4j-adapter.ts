/**
 * KGIA Infrastructure — Neo4j Adapter
 *
 * Phase 7.5a (2026-05-17): wired against the real `neo4j-driver`
 * package. Pre-7.5a, this file was a stub that returned empty
 * record arrays + a logger line — see `docs/architecture/agent-studio-phase-7-5-neo4j-blocker.md`
 * for the verified-stubbed inventory + unblock sequence.
 *
 * Connection boundary adapter for Neo4j graph databases. Supports
 * both `bolt://` and `neo4j://` URIs. All queries default to
 * read-only access mode at the session level; mutations route
 * through the Phase 11.5 graph-change-proposal pipeline.
 *
 * Driver pooling: a single `Driver` instance is cached per
 * (endpoint, username, database) triple. Drivers are stateful and
 * the official Neo4j docs recommend one per application; the
 * cache keeps reuse honest across concurrent callers without
 * forcing them through a singleton boundary.
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - `neo4j-driver` imports are permitted here per the canonical
 *     allowlist (`server/modules/kgia/**` is one of two non-spike
 *     locations; the other is `server/agent-studio/services/graph/repository/**`).
 *   - This adapter does NOT call `dispatchMcpToolCall`.
 *   - No `process.env.*_API_KEY` reads (driver auth is per-GraphSource).
 */

import neo4j from "neo4j-driver";

// `neo4j-driver` 5.x exports `Driver` as both a class AND a
// namespace, which trips tsc's "Cannot use namespace as type"
// error (TS2709). Deriving the type from the factory function's
// return shape sidesteps the ambiguity without losing type safety.
type Driver = ReturnType<typeof neo4j.driver>;

import type { GraphSource } from "../domain/types";

// ── Types ────────────────────────────────────────────────────────

export interface Neo4jConnectionConfig {
  endpoint: string;
  username?: string;
  password?: string;
  database?: string;
}

export interface Neo4jQueryResult {
  records: Record<string, unknown>[];
  summary: {
    resultAvailableAfter: number;
    resultConsumedAfter: number;
    counters: Record<string, number>;
  };
}

// ── Driver pool ──────────────────────────────────────────────────

/**
 * Driver cache keyed by (endpoint, username, database). One Driver
 * per unique config so concurrent callers reuse the same connection
 * pool. Driver construction is expensive; reuse it.
 */
const driverCache = new Map<string, Driver>();

function driverKey(config: Neo4jConnectionConfig): string {
  return `${config.endpoint}||${config.username ?? ""}||${config.database ?? "neo4j"}`;
}

function getDriver(config: Neo4jConnectionConfig): Driver {
  const key = driverKey(config);
  const existing = driverCache.get(key);
  if (existing) return existing;
  const auth = config.username
    ? neo4j.auth.basic(config.username, config.password ?? "")
    : neo4j.auth.none();
  const driver = neo4j.driver(config.endpoint, auth);
  driverCache.set(key, driver);
  return driver;
}

/**
 * Graceful shutdown helper. Closes all cached drivers + clears
 * the cache. Call from process-shutdown handlers (or test
 * teardown) so the Node process can exit cleanly without
 * lingering bolt connections.
 */
export async function closeAllNeo4jDrivers(): Promise<void> {
  const drivers = Array.from(driverCache.values());
  driverCache.clear();
  await Promise.all(drivers.map((d) => d.close()));
}

// ── Schema Reader ────────────────────────────────────────────────

export async function readNeo4jSchema(
  source: GraphSource,
): Promise<Record<string, unknown>> {
  const config = parseNeo4jConfig(source);

  // Fast path: GraphSource carries a cached schema snapshot. The
  // schema-discovery query (CALL db.schema.visualization()) is
  // expensive enough that production code pre-bakes the result.
  if (source.schemaSnapshot) {
    return source.schemaSnapshot as unknown as Record<string, unknown>;
  }

  // Real schema discovery via Neo4j. `db.schema.visualization()`
  // returns one row with `{ nodes, relationships }` — both arrays
  // of internal Neo4j nodes. We surface them as-is; downstream
  // consumers reshape into the KGIA SchemaSlice format.
  const driver = getDriver(config);
  const session = driver.session({ database: config.database ?? "neo4j" });
  try {
    const result = await session.run("CALL db.schema.visualization()");
    const record = result.records[0];
    if (!record) {
      return {
        nodes: [],
        relationships: [],
        needsDiscovery: true,
        endpoint: config.endpoint,
      };
    }
    return {
      nodes: record.get("nodes"),
      relationships: record.get("relationships"),
      endpoint: config.endpoint,
    };
  } finally {
    await session.close();
  }
}

// ── Query Executor ───────────────────────────────────────────────

export async function executeNeo4jQuery(
  source: GraphSource,
  queryText: string,
  params?: Record<string, unknown>,
): Promise<Neo4jQueryResult> {
  return runWithMode(source, queryText, params, neo4j.session.READ);
}

/**
 * Phase 7.5b write-mode sibling of `executeNeo4jQuery`. Required
 * by `Neo4jCommunityGraphRepository.applyProjectionJob` (graph
 * projection writes from Postgres source-of-truth into Neo4j).
 *
 * Identical session + result handling to `executeNeo4jQuery`,
 * only difference is `defaultAccessMode: neo4j.session.WRITE`.
 * Splitting on access mode (rather than threading a parameter
 * into `executeNeo4jQuery`) keeps the read-only invariant of the
 * KGIA query path explicit at the call site.
 */
export async function executeNeo4jWrite(
  source: GraphSource,
  queryText: string,
  params?: Record<string, unknown>,
): Promise<Neo4jQueryResult> {
  return runWithMode(source, queryText, params, neo4j.session.WRITE);
}

async function runWithMode(
  source: GraphSource,
  queryText: string,
  params: Record<string, unknown> | undefined,
  mode: typeof neo4j.session.READ | typeof neo4j.session.WRITE,
): Promise<Neo4jQueryResult> {
  const config = parseNeo4jConfig(source);
  const driver = getDriver(config);
  const session = driver.session({
    database: config.database ?? "neo4j",
    defaultAccessMode: mode,
  });
  const startTime = Date.now();
  try {
    const result = await session.run(queryText, params ?? {});
    return {
      records: result.records.map(
        (r) => r.toObject() as Record<string, unknown>,
      ),
      summary: {
        resultAvailableAfter:
          typeof result.summary.resultAvailableAfter?.toNumber === "function"
            ? result.summary.resultAvailableAfter.toNumber()
            : (result.summary.resultAvailableAfter as unknown as number) ??
              (Date.now() - startTime),
        resultConsumedAfter:
          typeof result.summary.resultConsumedAfter?.toNumber === "function"
            ? result.summary.resultConsumedAfter.toNumber()
            : (result.summary.resultConsumedAfter as unknown as number) ??
              (Date.now() - startTime),
        counters: extractCounters(result.summary.counters),
      },
    };
  } finally {
    await session.close();
  }
}

/**
 * Neo4j's QueryStatistics surfaces counters as a structured object
 * (nodesCreated, relationshipsCreated, etc.). Flatten the
 * non-zero counters into a plain key→count record for the
 * Neo4jQueryResult contract.
 */
function extractCounters(
  counters: unknown,
): Record<string, number> {
  const out: Record<string, number> = {};
  if (!counters || typeof counters !== "object") return out;
  // neo4j-driver QueryStatistics exposes both `_stats` and direct
  // methods like `nodesCreated()`. Read the `_stats` field when
  // present (driver internal shape that matches release 5.x).
  const stats = (counters as { _stats?: Record<string, number> })._stats;
  if (stats && typeof stats === "object") {
    for (const [k, v] of Object.entries(stats)) {
      if (typeof v === "number" && v !== 0) out[k] = v;
    }
  }
  return out;
}

// ── Connection Test ──────────────────────────────────────────────

export async function testNeo4jConnection(
  source: GraphSource,
): Promise<{ connected: boolean; version?: string; error?: string }> {
  const config = parseNeo4jConfig(source);

  try {
    const driver = getDriver(config);
    await driver.verifyConnectivity();
    // Fetch the running Neo4j version via dbms.components(). One
    // row per component; the kernel row carries the version array.
    const session = driver.session({
      database: config.database ?? "neo4j",
    });
    try {
      const result = await session.run(
        "CALL dbms.components() YIELD name, versions WHERE name = 'Neo4j Kernel' RETURN versions[0] AS version",
      );
      const versionRecord = result.records[0];
      const version =
        (versionRecord?.get("version") as string | undefined) ?? "unknown";
      return { connected: true, version };
    } finally {
      await session.close();
    }
  } catch (err) {
    return {
      connected: false,
      error: (err as Error).message,
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function parseNeo4jConfig(source: GraphSource): Neo4jConnectionConfig {
  const creds = (source.credentials ?? {}) as Record<string, string>;
  return {
    endpoint: source.endpoint,
    username: creds.username,
    password: creds.password,
    database: creds.database ?? "neo4j",
  };
}
