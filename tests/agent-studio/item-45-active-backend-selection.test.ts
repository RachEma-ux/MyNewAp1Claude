/**
 * Item 45 — Live GRAPH_BACKEND=neo4j-ce smoke (deterministic half).
 *
 * Repository-selection invariant: when the operator sets
 * `GRAPH_BACKEND=neo4j-ce`, `getGraphRepository()` MUST return a
 * `Neo4jCommunityGraphRepository` (`backendKey === "neo4j-ce"`).
 * Without this guarantee the entire P0 / GraphRAG / Graph Agent
 * runtime stack runs against the wrong backend.
 *
 * This deterministic half covers the **selection** side of item 45;
 * the **live Cypher** half (health probe + projection write +
 * template execution + traversal + permission round-trip) requires a
 * credentialed CE container and remains operator-runnable via
 * `graph-p0-smoke-neo4j-ce.yml` (BLOCKED BY MISSING CREDENTIALS /
 * INFRA on dev boxes — honestly classified in the evidence doc).
 *
 * Per CLAUDE.md hard rules + PR #1397 lazy-load pattern: importing
 * `Neo4jCommunityGraphRepository` MUST NOT trigger a real
 * `neo4j-driver` load. The constructor stores config; the actual
 * driver loads via dynamic import only when a real Cypher call is
 * issued. This test runs on a dev box without `neo4j-driver`
 * installed locally and still passes — proving the boundary.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("Item 45 — GRAPH_BACKEND=neo4j-ce repository selection", () => {
  const prevBackend = process.env.GRAPH_BACKEND;
  const prevUri = process.env.NEO4J_URI;
  const prevUser = process.env.NEO4J_USER;
  const prevPass = process.env.NEO4J_PASSWORD;
  const prevDb = process.env.NEO4J_DATABASE;

  beforeEach(() => {
    // Force a fresh module + cache state per test so env mutations
    // pick up cleanly. Vitest's module cache survives between tests
    // inside the same file by default.
    delete process.env.GRAPH_BACKEND;
    delete process.env.NEO4J_URI;
    delete process.env.NEO4J_USER;
    delete process.env.NEO4J_PASSWORD;
    delete process.env.NEO4J_DATABASE;
  });

  afterEach(() => {
    if (prevBackend === undefined) delete process.env.GRAPH_BACKEND;
    else process.env.GRAPH_BACKEND = prevBackend;
    if (prevUri === undefined) delete process.env.NEO4J_URI;
    else process.env.NEO4J_URI = prevUri;
    if (prevUser === undefined) delete process.env.NEO4J_USER;
    else process.env.NEO4J_USER = prevUser;
    if (prevPass === undefined) delete process.env.NEO4J_PASSWORD;
    else process.env.NEO4J_PASSWORD = prevPass;
    if (prevDb === undefined) delete process.env.NEO4J_DATABASE;
    else process.env.NEO4J_DATABASE = prevDb;
  });

  it("GRAPH_BACKEND=neo4j-ce → getGraphRepository() returns a Neo4jCommunityGraphRepository", async () => {
    process.env.GRAPH_BACKEND = "neo4j-ce";
    const mod = await import(
      "../../server/agent-studio/services/graph/repository/index"
    );
    mod._resetGraphRepository();
    const repo = mod.getGraphRepository();
    expect(repo.backendKey).toBe("neo4j-ce");
    // The class is wrapped behind getGraphRepository; verify via
    // constructor name as a second signal that we got the right one.
    expect(repo.constructor.name).toBe("Neo4jCommunityGraphRepository");
  });

  it("GRAPH_BACKEND=test → returns TestGraphRepository (regression guard)", async () => {
    process.env.GRAPH_BACKEND = "test";
    const mod = await import(
      "../../server/agent-studio/services/graph/repository/index"
    );
    mod._resetGraphRepository();
    const repo = mod.getGraphRepository();
    expect(repo.constructor.name).toBe("TestGraphRepository");
  });

  it("unset GRAPH_BACKEND → defaults to postgres (does NOT auto-select neo4j-ce)", async () => {
    // The default is intentionally postgres — always-available
    // fallback, no driver install required. The wired class is
    // `AsdbPostgresGraphRepository` (the real Phase 7 Drizzle-backed
    // implementation, wired 2026-05-19; replaced the 176-LoC skeleton
    // that returned empty reads). Auto-selecting neo4j-ce on an
    // unset env var would break dev boxes; this test pins both the
    // default backendKey AND the concrete class.
    const mod = await import(
      "../../server/agent-studio/services/graph/repository/index"
    );
    mod._resetGraphRepository();
    const repo = mod.getGraphRepository();
    expect(repo.backendKey).toBe("postgres");
    expect(repo.constructor.name).toBe("AsdbPostgresGraphRepository");
  });

  it("Neo4jCommunityGraphRepository selection does NOT trigger eager neo4j-driver load", async () => {
    // PR #1397 introduced lazy-loading of the KGIA executor via
    // dynamic import inside the repository methods, NOT at the
    // class top. The selection-side test here would crash with
    // "Cannot find module 'neo4j-driver'" on dev boxes if that
    // invariant regressed. This test passing on the local Termux
    // box (where neo4j-driver is declared but not installed) is the
    // evidence that the lazy-load contract still holds.
    process.env.GRAPH_BACKEND = "neo4j-ce";
    process.env.NEO4J_URI = "bolt://localhost:7687";
    process.env.NEO4J_USER = "neo4j";
    process.env.NEO4J_PASSWORD = "devpassword";
    const mod = await import(
      "../../server/agent-studio/services/graph/repository/index"
    );
    mod._resetGraphRepository();
    // The construction itself must not throw — proves no eager
    // driver load. Calling actual methods (localGraph, etc.) WOULD
    // require the driver, but that's the live-Cypher half of item 45
    // and is BLOCKED BY MISSING CREDENTIALS / INFRA per evidence doc.
    const repo = mod.getGraphRepository();
    expect(repo.backendKey).toBe("neo4j-ce");
  });
});
