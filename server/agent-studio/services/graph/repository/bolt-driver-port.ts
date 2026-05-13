/**
 * Bolt driver port — abstract interface every Bolt-speaking backend
 * implementation in this directory binds to. The point of this
 * indirection is twofold:
 *
 *   1. Make the repositories that need to round-trip Cypher
 *      unit-testable without a live Memgraph / Neo4j container.
 *   2. Keep the `neo4j-driver` runtime import lazy so callers that
 *      do not select a Bolt-speaking backend (default `postgres`)
 *      pay zero cost.
 *
 * CLAUDE.md hard rule: `neo4j-driver` imports are allowed ONLY
 * inside this directory + `server/modules/kgia/**`. The default
 * factory at `default-bolt-driver-factory.ts` is the one place this
 * directory pulls the driver in.
 */

export interface BoltRecord {
  /** Column keys in declaration order. */
  readonly keys: ReadonlyArray<string>;
  /** Read a single column by key. */
  get(key: string): unknown;
  /** Project the record into a plain object. */
  toObject(): Record<string, unknown>;
}

export interface BoltResultSummary {
  /** Wall-clock duration the server took to make the first record available. */
  readonly resultAvailableAfter?: number;
  /** Wall-clock duration the server took to stream all records. */
  readonly resultConsumedAfter?: number;
}

export interface BoltResult {
  readonly records: ReadonlyArray<BoltRecord>;
  readonly summary: BoltResultSummary;
}

export interface BoltSession {
  /**
   * Execute a Cypher statement with named parameters. Returns the
   * full record set; consumers cap their own result counts to keep
   * memory bounded.
   */
  run(
    cypher: string,
    parameters?: Record<string, unknown>,
  ): Promise<BoltResult>;

  /** Release the session. Idempotent. */
  close(): Promise<void>;
}

export interface BoltDriver {
  /**
   * Open a read-only session. Memgraph + Neo4j community both
   * default to read sessions when no access mode is supplied.
   */
  session(opts?: { database?: string }): BoltSession;

  /**
   * Round-trip the server to confirm reachability + auth. Throws
   * on failure. Used by `health()` paths.
   */
  verifyConnectivity(): Promise<void>;

  /** Close the underlying pool. Idempotent. */
  close(): Promise<void>;
}

export interface BoltAuth {
  readonly username: string;
  readonly password: string;
}

export interface BoltDriverFactory {
  /**
   * Construct a driver bound to the given endpoint + auth. The
   * factory MUST NOT verify connectivity at construction time —
   * `verifyConnectivity()` is the explicit round-trip step.
   */
  createDriver(endpoint: string, auth: BoltAuth): BoltDriver;
}
