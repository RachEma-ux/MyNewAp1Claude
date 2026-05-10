/**
 * Phase 1.2 — TestGraphRepository sanity tests.
 *
 * Verifies the in-memory test backend behaves correctly for tests that
 * depend on it (Phase 7 typed graph store + projection sync MVP tests).
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  TestGraphRepository,
  type RuntimeContext,
} from "../../server/agent-studio/services/graph/repository/index.js";

describe("TestGraphRepository — basic invariants", () => {
  let repo: TestGraphRepository;
  const runtime: RuntimeContext = { userId: 1, userRole: "admin" };

  beforeEach(() => {
    repo = new TestGraphRepository();
  });

  it("upsertNode + neighborhood returns the node", async () => {
    await repo.upsertNode({
      typeKey: "Note",
      id: "note-1",
      properties: { title: "Hello" },
      provenance: {
        sourceType: "vault_note",
        sourceId: "1",
        lineageStatus: "asserted",
        governanceStatus: "active",
      },
    });
    const r = await repo.neighborhood("note-1", 1, runtime);
    expect(r.nodes.length).toBe(1);
    expect(r.nodes[0]?.id).toBe("note-1");
  });

  it("upsertEdge connects two nodes; localGraph traverses", async () => {
    await repo.upsertNode({
      typeKey: "Note",
      id: "note-a",
      properties: {},
      provenance: { sourceType: "vault_note", sourceId: "a", lineageStatus: "asserted", governanceStatus: "active" },
    });
    await repo.upsertNode({
      typeKey: "Note",
      id: "note-b",
      properties: {},
      provenance: { sourceType: "vault_note", sourceId: "b", lineageStatus: "asserted", governanceStatus: "active" },
    });
    await repo.upsertEdge({
      typeKey: "LINKS_TO",
      id: "edge-1",
      sourceNode: { typeKey: "Note", id: "note-a" },
      targetNode: { typeKey: "Note", id: "note-b" },
      properties: {},
      provenance: { sourceType: "vault_wikilink", sourceId: "1", lineageStatus: "derived", governanceStatus: "active" },
    });
    const r = await repo.localGraph("note-a", { maxDepth: 2, maxResults: 100 }, runtime);
    expect(r.nodes.map((n) => n.id).sort()).toEqual(["note-a", "note-b"]);
    expect(r.edges.length).toBe(1);
  });

  it("hidden nodes are filtered when governance filter excludes them", async () => {
    await repo.upsertNode({
      typeKey: "Note",
      id: "note-public",
      properties: {},
      provenance: { sourceType: "vault_note", sourceId: "p", lineageStatus: "asserted", governanceStatus: "active" },
    });
    await repo.upsertNode({
      typeKey: "Note",
      id: "note-hidden",
      properties: {},
      provenance: { sourceType: "vault_note", sourceId: "h", lineageStatus: "asserted", governanceStatus: "hidden" },
    });
    const filtered = await repo.filterByPermissions(
      [
        { typeKey: "Note", id: "note-public" },
        { typeKey: "Note", id: "note-hidden" },
      ],
      runtime,
    );
    expect(filtered.map((n) => n.id)).toEqual(["note-public"]);
  });

  it("shortestPath finds a path", async () => {
    for (const id of ["a", "b", "c"]) {
      await repo.upsertNode({
        typeKey: "Note",
        id,
        properties: {},
        provenance: { sourceType: "vault_note", sourceId: id, lineageStatus: "asserted", governanceStatus: "active" },
      });
    }
    await repo.upsertEdge({
      typeKey: "LINKS_TO",
      id: "ab",
      sourceNode: { typeKey: "Note", id: "a" },
      targetNode: { typeKey: "Note", id: "b" },
      properties: {},
      provenance: { sourceType: "vault_wikilink", sourceId: "1", lineageStatus: "derived" },
    });
    await repo.upsertEdge({
      typeKey: "LINKS_TO",
      id: "bc",
      sourceNode: { typeKey: "Note", id: "b" },
      targetNode: { typeKey: "Note", id: "c" },
      properties: {},
      provenance: { sourceType: "vault_wikilink", sourceId: "2", lineageStatus: "derived" },
    });
    const path = await repo.shortestPath("a", "c", runtime);
    expect(path).not.toBeNull();
    expect(path?.length).toBe(2);
    expect(path?.nodes.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });

  it("applyProjectionJob batches operations with counts", async () => {
    const result = await repo.applyProjectionJob([
      {
        kind: "upsert_node",
        node: {
          typeKey: "Note",
          id: "n1",
          properties: {},
          provenance: { sourceType: "v", sourceId: "1", lineageStatus: "asserted" },
        },
      },
      {
        kind: "upsert_node",
        node: {
          typeKey: "Note",
          id: "n2",
          properties: {},
          provenance: { sourceType: "v", sourceId: "2", lineageStatus: "asserted" },
        },
      },
      {
        kind: "upsert_edge",
        edge: {
          typeKey: "LINKS_TO",
          id: "e1",
          sourceNode: { typeKey: "Note", id: "n1" },
          targetNode: { typeKey: "Note", id: "n2" },
          properties: {},
          provenance: { sourceType: "w", sourceId: "1", lineageStatus: "derived" },
        },
      },
    ]);
    expect(result.nodesCreated).toBe(2);
    expect(result.edgesCreated).toBe(1);
    expect(result.errors).toEqual([]);
  });

  it("backendKey + capabilities are correct", async () => {
    expect(repo.backendKey).toBe("test");
    expect(repo.capabilities.supportsCypher).toBe(false);
    expect(repo.capabilities.supportsRecursiveTraversal).toBe(true);
  });

  it("health returns healthy", async () => {
    const h = await repo.health();
    expect(h.status).toBe("healthy");
  });
});
