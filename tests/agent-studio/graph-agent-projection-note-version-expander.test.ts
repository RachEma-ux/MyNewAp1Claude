/**
 * Phase 14 §6/§7 — runtime note-version edge expander tests.
 *
 * Pure unit coverage. Verifies dedup, edge fan-out per referenceKind,
 * and shape invariants.
 */

import { describe, it, expect, vi } from "vitest";
import {
  expandRuntimeNoteVersionEdges,
  loadRuntimeNoteReferencesForRun,
  type RuntimeNoteReferenceRow,
} from "../../server/agent-studio/services/graph-agent/projection-note-version-expander";

function row(
  overrides: Partial<RuntimeNoteReferenceRow> & { noteVersionId: number },
): RuntimeNoteReferenceRow {
  return {
    noteId: overrides.noteId ?? (Math.floor(overrides.noteVersionId / 10) || 1),
    noteVersionId: overrides.noteVersionId,
    referenceKind: overrides.referenceKind ?? "cag_block",
  };
}

describe("expandRuntimeNoteVersionEdges — Phase 14 §6/§7", () => {
  it("emits one (:NoteVersion) node + one REFERENCES_NOTE_VERSION edge per distinct row", () => {
    const writes = expandRuntimeNoteVersionEdges(42, [
      row({ noteVersionId: 10, referenceKind: "cag_block" }),
      row({ noteVersionId: 20, referenceKind: "graph_skill" }),
    ]);
    expect(writes.filter((w) => w.kind === "upsert_node")).toHaveLength(2);
    expect(writes.filter((w) => w.kind === "upsert_edge")).toHaveLength(2);
  });

  it("dedups (:NoteVersion) node when the same version is referenced multiple times", () => {
    const writes = expandRuntimeNoteVersionEdges(42, [
      row({ noteVersionId: 10, referenceKind: "cag_block" }),
      row({ noteVersionId: 10, referenceKind: "graph_skill" }),
    ]);
    expect(writes.filter((w) => w.kind === "upsert_node")).toHaveLength(1);
    // Two edges because the kinds differ.
    expect(writes.filter((w) => w.kind === "upsert_edge")).toHaveLength(2);
  });

  it("collapses identical (noteVersionId, referenceKind) pairs into a single edge", () => {
    const writes = expandRuntimeNoteVersionEdges(42, [
      row({ noteVersionId: 10, referenceKind: "cag_block" }),
      row({ noteVersionId: 10, referenceKind: "cag_block" }),
      row({ noteVersionId: 10, referenceKind: "cag_block" }),
    ]);
    expect(writes.filter((w) => w.kind === "upsert_node")).toHaveLength(1);
    expect(writes.filter((w) => w.kind === "upsert_edge")).toHaveLength(1);
  });

  it("(:NoteVersion) node id is stable on noteVersionId; carries noteId in properties", () => {
    const writes = expandRuntimeNoteVersionEdges(42, [
      row({ noteVersionId: 99, noteId: 7 }),
    ]);
    const node = writes.find((w) => w.kind === "upsert_node")!.node;
    expect(node?.id).toBe("note_version:99");
    expect(node?.sourceId).toBe("99");
    expect(node?.properties).toMatchObject({ noteId: 7 });
  });

  it("REFERENCES_NOTE_VERSION edge id encodes (runId, noteVersionId, referenceKind)", () => {
    const writes = expandRuntimeNoteVersionEdges(42, [
      row({ noteVersionId: 99, referenceKind: "cag_block" }),
    ]);
    const edge = writes.find((w) => w.kind === "upsert_edge")!.edge;
    expect(edge?.id).toBe("references_note_version:42:99:cag_block");
    expect(edge?.typeKey).toBe("REFERENCES_NOTE_VERSION");
    expect(edge?.sourceNode).toEqual({
      typeKey: "RuntimeTrace",
      id: "runtime_trace:42",
    });
    expect(edge?.targetNode).toEqual({
      typeKey: "NoteVersion",
      id: "note_version:99",
    });
    expect(edge?.properties).toMatchObject({ referenceKind: "cag_block" });
  });

  it("empty input → empty output", () => {
    expect(expandRuntimeNoteVersionEdges(1, [])).toEqual([]);
  });

  it("provenance is lineageStatus=derived + governanceStatus=active on every write", () => {
    const writes = expandRuntimeNoteVersionEdges(42, [
      row({ noteVersionId: 10, referenceKind: "rac" }),
    ]);
    for (const w of writes) {
      const prov = w.node?.provenance ?? w.edge?.provenance;
      expect(prov?.lineageStatus).toBe("derived");
      expect(prov?.governanceStatus).toBe("active");
    }
  });

  it("node-emission order is first-seen for each noteVersionId", () => {
    const writes = expandRuntimeNoteVersionEdges(42, [
      row({ noteVersionId: 20 }),
      row({ noteVersionId: 10 }),
      row({ noteVersionId: 20 }),
      row({ noteVersionId: 30 }),
    ]);
    const nodeIds = writes
      .filter((w) => w.kind === "upsert_node")
      .map((w) => w.node?.id);
    expect(nodeIds).toEqual([
      "note_version:20",
      "note_version:10",
      "note_version:30",
    ]);
  });
});

describe("loadRuntimeNoteReferencesForRun — ASDB reader", () => {
  it("returns empty array when ASDB is unavailable", async () => {
    const rows = await loadRuntimeNoteReferencesForRun(42, {
      getDb: () => null as never,
    });
    expect(rows).toEqual([]);
  });

  it("returns rows from the SELECT query", async () => {
    const select = vi.fn(() => ({
      from: () => ({
        where: async () => [
          { noteId: 1, noteVersionId: 10, referenceKind: "cag_block" },
          { noteId: 2, noteVersionId: 20, referenceKind: "graph_skill" },
        ],
      }),
    }));
    const rows = await loadRuntimeNoteReferencesForRun(42, {
      getDb: () => ({ select } as never),
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      noteVersionId: 10,
      referenceKind: "cag_block",
    });
  });
});
