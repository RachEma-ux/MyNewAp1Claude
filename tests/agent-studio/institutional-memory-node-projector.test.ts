/**
 * Institutional Memory node projector — Phase 25 §T-G.10.
 *
 * Pure-function tests; no DB I/O.
 */

import { describe, it, expect } from "vitest";
import {
  projectInstitutionalMemoryNode,
  projectInstitutionalMemoryNodeWithReason,
  projectInstitutionalMemoryNodes,
  isInstitutionalMemoryMappable,
  INSTITUTIONAL_MEMORY_SOURCE_MAPPING,
} from "../../server/agent-studio/services/institutional-memory/public-api";

describe("projectInstitutionalMemoryNode — happy path", () => {
  it("projects a users row into a `person` node", () => {
    const node = projectInstitutionalMemoryNode("person", {
      id: 42,
      username: "alice",
      email: "alice@example.com",
    });
    expect(node).toEqual({ typeKey: "person", id: "42", label: "alice" });
  });

  it("projects a workspaces row into a `project` node", () => {
    const node = projectInstitutionalMemoryNode("project", {
      id: 7,
      name: "Workspace Foo",
    });
    expect(node).toEqual({ typeKey: "project", id: "7", label: "Workspace Foo" });
  });

  it("projects a workflows row into a `workflow` node", () => {
    const node = projectInstitutionalMemoryNode("workflow", {
      id: 99,
      name: "Weekly digest",
    });
    expect(node).toEqual({
      typeKey: "workflow",
      id: "99",
      label: "Weekly digest",
    });
  });

  it("coerces a string id verbatim", () => {
    const node = projectInstitutionalMemoryNode("document", {
      id: "doc:abc",
      title: "Some title",
    });
    expect(node).toEqual({
      typeKey: "document",
      id: "doc:abc",
      label: "Some title",
    });
  });

  it("coerces a bigint id", () => {
    const node = projectInstitutionalMemoryNode("decision", {
      id: 12345678901234567890n,
      request_kind: "approve_release",
    });
    expect(node?.id).toBe("12345678901234567890");
    expect(node?.label).toBe("approve_release");
  });
});

describe("projectInstitutionalMemoryNodeWithReason — skip reasons", () => {
  it("returns node_type_not_mapped_to_source_table for unmapped types", () => {
    const outcome = projectInstitutionalMemoryNodeWithReason("system", {
      id: 1,
      name: "anything",
    });
    expect(outcome).toEqual({
      ok: false,
      reason: "node_type_not_mapped_to_source_table",
    });
  });

  it("returns row_missing_id_column when id column is absent", () => {
    const outcome = projectInstitutionalMemoryNodeWithReason("person", {
      username: "alice",
      // No `id` key.
    });
    expect(outcome).toEqual({ ok: false, reason: "row_missing_id_column" });
  });

  it("returns row_missing_id_column when id column is null", () => {
    const outcome = projectInstitutionalMemoryNodeWithReason("person", {
      id: null,
      username: "alice",
    });
    expect(outcome).toEqual({ ok: false, reason: "row_missing_id_column" });
  });

  it("returns row_missing_label_column when label column is absent", () => {
    const outcome = projectInstitutionalMemoryNodeWithReason("person", {
      id: 1,
      // No `username` key.
    });
    expect(outcome).toEqual({ ok: false, reason: "row_missing_label_column" });
  });

  it("returns row_id_not_stringifiable for object id", () => {
    const outcome = projectInstitutionalMemoryNodeWithReason("person", {
      id: { weird: "object" },
      username: "alice",
    });
    expect(outcome).toEqual({
      ok: false,
      reason: "row_id_not_stringifiable",
    });
  });

  it("returns row_id_not_stringifiable for array id", () => {
    const outcome = projectInstitutionalMemoryNodeWithReason("person", {
      id: [1, 2, 3],
      username: "alice",
    });
    expect(outcome).toEqual({
      ok: false,
      reason: "row_id_not_stringifiable",
    });
  });
});

describe("projectInstitutionalMemoryNodes — bulk", () => {
  it("partitions projectable + skipped rows and counts reasons", () => {
    const result = projectInstitutionalMemoryNodes("person", [
      { id: 1, username: "alice" },
      { id: 2, username: "bob" },
      { username: "carol" }, // missing id
      { id: 4 }, // missing label
      { id: { x: 1 }, username: "dave" }, // unstringifiable id
      { id: 5, username: "eve" },
    ]);
    expect(result.nodes).toHaveLength(3);
    expect(result.nodes.map((n) => n.id)).toEqual(["1", "2", "5"]);
    expect(result.skippedByReason).toEqual({
      node_type_not_mapped_to_source_table: 0,
      row_missing_id_column: 1,
      row_missing_label_column: 1,
      row_id_not_stringifiable: 1,
    });
  });

  it("returns empty + zero counts for empty input", () => {
    const result = projectInstitutionalMemoryNodes("person", []);
    expect(result.nodes).toEqual([]);
    expect(
      Object.values(result.skippedByReason).every((c) => c === 0),
    ).toBe(true);
  });

  it("skippedByReason has stable shape (all 4 reasons keyed)", () => {
    const result = projectInstitutionalMemoryNodes("person", [
      { id: 1, username: "alice" },
    ]);
    expect(Object.keys(result.skippedByReason).sort()).toEqual(
      [
        "node_type_not_mapped_to_source_table",
        "row_id_not_stringifiable",
        "row_missing_id_column",
        "row_missing_label_column",
      ].sort(),
    );
  });

  it("bulk projection of unmapped type accumulates count, returns no nodes", () => {
    const result = projectInstitutionalMemoryNodes("responsibility", [
      { id: 1, name: "x" },
      { id: 2, name: "y" },
    ]);
    expect(result.nodes).toEqual([]);
    expect(result.skippedByReason.node_type_not_mapped_to_source_table).toBe(2);
  });
});

describe("isInstitutionalMemoryMappable", () => {
  it("returns true for mapped types", () => {
    expect(isInstitutionalMemoryMappable("person")).toBe(true);
    expect(isInstitutionalMemoryMappable("project")).toBe(true);
    expect(isInstitutionalMemoryMappable("workflow")).toBe(true);
    expect(isInstitutionalMemoryMappable("document")).toBe(true);
  });

  it("returns false for unmapped types", () => {
    expect(isInstitutionalMemoryMappable("system")).toBe(false);
    expect(isInstitutionalMemoryMappable("service")).toBe(false);
    expect(isInstitutionalMemoryMappable("responsibility")).toBe(false);
    expect(isInstitutionalMemoryMappable("team")).toBe(false);
  });

  it("matches the contract mapping (mapped iff sourceTable + idColumn + labelColumn all non-null)", () => {
    for (const [type, mapping] of Object.entries(
      INSTITUTIONAL_MEMORY_SOURCE_MAPPING,
    )) {
      const expectedMappable =
        mapping.sourceTable !== null &&
        mapping.idColumn !== null &&
        mapping.labelColumn !== null;
      expect(
        isInstitutionalMemoryMappable(
          type as Parameters<typeof isInstitutionalMemoryMappable>[0],
        ),
      ).toBe(expectedMappable);
    }
  });
});
