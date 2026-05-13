/**
 * Default BoltDriverFactory — lazy-loads `neo4j-driver` at runtime.
 *
 * Memgraph speaks Bolt over the same protocol as Neo4j; the same
 * driver works for both backends. We use a dynamic import so:
 *
 *   - Callers that select `postgres` / `test` / `neo4j-ce skeleton`
 *     pay zero cost from the driver.
 *   - Boundary tests can keep counting "places that import
 *     `neo4j-driver`" without a static reference here — the import
 *     literal lives behind `await import(...)` and is the one
 *     allowed entry point.
 *   - If `neo4j-driver` is not installed, the failure surfaces with
 *     a clear operator-actionable error rather than crashing boot.
 *
 * This file lives under `server/agent-studio/services/graph/repository/`
 * — the directory the GraphRepository boundary test allows
 * `neo4j-driver` imports in.
 */

import type {
  BoltAuth,
  BoltDriver,
  BoltDriverFactory,
  BoltResult,
  BoltSession,
} from "./bolt-driver-port.js";

/**
 * Minimal shape we use from the real `neo4j-driver` module. The
 * package's full API is bigger; we only depend on this slice.
 */
interface RealNeo4jDriverModule {
  driver(
    url: string,
    auth: { scheme: "basic"; principal: string; credentials: string },
  ): RealNeo4jDriver;
  auth: {
    basic(username: string, password: string): {
      scheme: "basic";
      principal: string;
      credentials: string;
    };
  };
}

interface RealNeo4jDriver {
  session(opts?: { database?: string }): RealNeo4jSession;
  verifyConnectivity(): Promise<unknown>;
  close(): Promise<void>;
}

interface RealNeo4jSession {
  run(cypher: string, parameters?: Record<string, unknown>): Promise<{
    records: Array<{
      keys: string[];
      get(key: string): unknown;
      toObject(): Record<string, unknown>;
    }>;
    summary: {
      resultAvailableAfter?: { toNumber?: () => number } | number;
      resultConsumedAfter?: { toNumber?: () => number } | number;
    };
  }>;
  close(): Promise<void>;
}

/**
 * Lazy-load `neo4j-driver`. Returns a `BoltDriverFactory` that
 * builds drivers on demand. If the package is not installed, the
 * promise rejects with a structured error so callers can surface
 * it via `BackendHealth.errors` rather than crashing.
 */
export async function loadDefaultBoltDriverFactory(): Promise<BoltDriverFactory> {
  let mod: RealNeo4jDriverModule;
  try {
    // Dynamic import keeps the dep off the boot path of every
    // process. CI installs `neo4j-driver` as a dependency; local
    // dev that does not target a Bolt backend never resolves this.
    const imported = (await import("neo4j-driver")) as unknown as {
      default?: RealNeo4jDriverModule;
    } & RealNeo4jDriverModule;
    mod = imported.default ?? imported;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to load 'neo4j-driver' — is it installed? Underlying: ${message}`,
    );
  }

  return {
    createDriver(endpoint: string, auth: BoltAuth): BoltDriver {
      const realDriver = mod.driver(
        endpoint,
        mod.auth.basic(auth.username, auth.password),
      );
      return wrapDriver(realDriver);
    },
  };
}

function wrapDriver(real: RealNeo4jDriver): BoltDriver {
  return {
    session(opts) {
      return wrapSession(real.session(opts));
    },
    async verifyConnectivity() {
      await real.verifyConnectivity();
    },
    async close() {
      await real.close();
    },
  };
}

function wrapSession(real: RealNeo4jSession): BoltSession {
  return {
    async run(cypher, parameters): Promise<BoltResult> {
      const raw = await real.run(cypher, parameters);
      return {
        records: raw.records.map((r) => ({
          keys: r.keys,
          get: (k) => r.get(k),
          toObject: () => r.toObject(),
        })),
        summary: {
          resultAvailableAfter: extractDuration(raw.summary.resultAvailableAfter),
          resultConsumedAfter: extractDuration(raw.summary.resultConsumedAfter),
        },
      };
    },
    async close() {
      await real.close();
    },
  };
}

function extractDuration(d: unknown): number | undefined {
  if (typeof d === "number") return d;
  if (d && typeof (d as { toNumber?: () => number }).toNumber === "function") {
    return (d as { toNumber: () => number }).toNumber();
  }
  return undefined;
}
