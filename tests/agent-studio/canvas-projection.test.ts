/**
 * Canvas projection helper tests — V1+ Phase 17-β.
 *
 * Covers:
 *   - buildCanvasReferenceProjection emits the 4-write bundle:
 *     Canvas + CanvasNode + CONTAINS_CANVAS_NODE + CANVAS_REFERENCES_NOTE
 *   - typeKey, id, source/target shapes are deterministic
 *   - provenance defaults: governanceStatus="active", lineageStatus
 *     ∈ {"asserted","derived"}
 *   - buildCanvasReferenceRemoval emits the 3-write delete bundle
 *     (CANVAS_REFERENCES_NOTE + CONTAINS_CANVAS_NODE + CanvasNode);
 *     Canvas node is preserved
 *   - buildAllCanvasReferenceProjections composes per-ref writes
 *   - ProjectionSyncWorker.buildWrites integration for the two new
 *     event kinds (canvas.note_reference_changed + .removed)
 *   - source-scan boundary: no neo4j-driver / credential-resolver /
 *     dispatchMcpToolCall / raw *_API_KEY in projection.ts
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

import {
  buildAllCanvasReferenceProjections,
  buildCanvasReferenceProjection,
  buildCanvasReferenceRemoval,
} from "../../server/agent-studio/services/canvas/projection.js";
import { ProjectionSyncWorker } from "../../server/agent-studio/services/graph/projection/sync-worker.js";

describe("buildCanvasReferenceProjection — happy path", () => {
  it("emits exactly 4 writes: Canvas + CanvasNode + 2 edges", () => {
    const writes = buildCanvasReferenceProjection({
      canvasId: 7,
      canvasNodeId: 42,
      referencedNoteId: 1001,
    });
    expect(writes).toHaveLength(4);
    expect(writes.map((w) => w.kind)).toEqual([
      "upsert_node",
      "upsert_node",
      "upsert_edge",
      "upsert_edge",
    ]);
  });

  it("Canvas node has deterministic typeKey + id", () => {
    const [canvasWrite] = buildCanvasReferenceProjection({
      canvasId: 7,
      canvasNodeId: 42,
      referencedNoteId: 1001,
    });
    expect(canvasWrite.kind).toBe("upsert_node");
    expect(canvasWrite.node?.typeKey).toBe("Canvas");
    expect(canvasWrite.node?.id).toBe("canvas:7");
    expect(canvasWrite.node?.provenance.lineageStatus).toBe("asserted");
    expect(canvasWrite.node?.provenance.governanceStatus).toBe("active");
  });

  it("CanvasNode write carries kind='note_ref' property", () => {
    const writes = buildCanvasReferenceProjection({
      canvasId: 7,
      canvasNodeId: 42,
      referencedNoteId: 1001,
    });
    const canvasNodeWrite = writes[1];
    expect(canvasNodeWrite.node?.typeKey).toBe("CanvasNode");
    expect(canvasNodeWrite.node?.id).toBe("canvas_node:42");
    expect(canvasNodeWrite.node?.properties.kind).toBe("note_ref");
  });

  it("CONTAINS_CANVAS_NODE edge connects Canvas → CanvasNode", () => {
    const writes = buildCanvasReferenceProjection({
      canvasId: 7,
      canvasNodeId: 42,
      referencedNoteId: 1001,
    });
    const containsEdge = writes[2];
    expect(containsEdge.kind).toBe("upsert_edge");
    expect(containsEdge.edge?.typeKey).toBe("CONTAINS_CANVAS_NODE");
    expect(containsEdge.edge?.id).toBe("contains_canvas_node:42");
    expect(containsEdge.edge?.sourceNode).toEqual({
      typeKey: "Canvas",
      id: "canvas:7",
    });
    expect(containsEdge.edge?.targetNode).toEqual({
      typeKey: "CanvasNode",
      id: "canvas_node:42",
    });
    expect(containsEdge.edge?.provenance.lineageStatus).toBe("derived");
  });

  it("CANVAS_REFERENCES_NOTE edge connects CanvasNode → Note", () => {
    const writes = buildCanvasReferenceProjection({
      canvasId: 7,
      canvasNodeId: 42,
      referencedNoteId: 1001,
    });
    const referencesEdge = writes[3];
    expect(referencesEdge.kind).toBe("upsert_edge");
    expect(referencesEdge.edge?.typeKey).toBe("CANVAS_REFERENCES_NOTE");
    expect(referencesEdge.edge?.id).toBe("canvas_references_note:42");
    expect(referencesEdge.edge?.sourceNode).toEqual({
      typeKey: "CanvasNode",
      id: "canvas_node:42",
    });
    expect(referencesEdge.edge?.targetNode).toEqual({
      typeKey: "Note",
      id: "note:1001",
    });
    expect(referencesEdge.edge?.provenance.lineageStatus).toBe("asserted");
  });

  it("re-emission with same input is deterministic (idempotent ids)", () => {
    const a = buildCanvasReferenceProjection({
      canvasId: 7,
      canvasNodeId: 42,
      referencedNoteId: 1001,
    });
    const b = buildCanvasReferenceProjection({
      canvasId: 7,
      canvasNodeId: 42,
      referencedNoteId: 1001,
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("buildCanvasReferenceRemoval", () => {
  it("emits 2 edge deletes + 1 CanvasNode delete; Canvas preserved", () => {
    const writes = buildCanvasReferenceRemoval({ canvasNodeId: 42 });
    expect(writes).toHaveLength(3);
    expect(writes.map((w) => w.kind)).toEqual([
      "delete_edge",
      "delete_edge",
      "delete_node",
    ]);
    expect(writes[0].edge?.typeKey).toBe("CANVAS_REFERENCES_NOTE");
    expect(writes[1].edge?.typeKey).toBe("CONTAINS_CANVAS_NODE");
    expect(writes[2].node?.typeKey).toBe("CanvasNode");
    // No Canvas-node deletion — Canvas may host other CanvasNodes.
    expect(writes.find((w) => w.node?.typeKey === "Canvas")).toBeUndefined();
  });
});

describe("buildAllCanvasReferenceProjections", () => {
  it("composes per-reference writes for an empty list", () => {
    const writes = buildAllCanvasReferenceProjections({
      canvasId: 7,
      references: [],
    });
    expect(writes).toEqual([]);
  });

  it("composes per-reference writes for 3 references — 12 writes total", () => {
    const writes = buildAllCanvasReferenceProjections({
      canvasId: 7,
      references: [
        { nodeId: 100, noteId: 200 },
        { nodeId: 101, noteId: 201 },
        { nodeId: 102, noteId: 202 },
      ],
    });
    expect(writes).toHaveLength(12);
    expect(writes.filter((w) => w.edge?.typeKey === "CANVAS_REFERENCES_NOTE")).toHaveLength(3);
    expect(writes.filter((w) => w.edge?.typeKey === "CONTAINS_CANVAS_NODE")).toHaveLength(3);
  });
});

describe("ProjectionSyncWorker.buildWrites — canvas event kinds", () => {
  it("canvas.note_reference_changed returns the 4-write bundle", () => {
    const stubRepo = {
      applyProjectionJob: async () => ({
        nodesCreated: 0,
        nodesUpdated: 0,
        nodesDeleted: 0,
        edgesCreated: 0,
        edgesUpdated: 0,
        edgesDeleted: 0,
        durationMs: 0,
        errors: [],
      }),
    } as unknown as ConstructorParameters<typeof ProjectionSyncWorker>[0]["repository"];

    const worker = new ProjectionSyncWorker({ repository: stubRepo });
    const writes = worker.buildWrites({
      kind: "canvas.note_reference_changed",
      payload: { canvasId: 7, canvasNodeId: 42, referencedNoteId: 1001 },
    });
    expect(writes).toHaveLength(4);
    const referencesEdge = writes.find(
      (w) => w.edge?.typeKey === "CANVAS_REFERENCES_NOTE",
    );
    expect(referencesEdge?.edge?.targetNode.id).toBe("note:1001");
  });

  it("canvas.note_reference_removed returns the 3-write delete bundle", () => {
    const stubRepo = {
      applyProjectionJob: async () => ({
        nodesCreated: 0,
        nodesUpdated: 0,
        nodesDeleted: 0,
        edgesCreated: 0,
        edgesUpdated: 0,
        edgesDeleted: 0,
        durationMs: 0,
        errors: [],
      }),
    } as unknown as ConstructorParameters<typeof ProjectionSyncWorker>[0]["repository"];

    const worker = new ProjectionSyncWorker({ repository: stubRepo });
    const writes = worker.buildWrites({
      kind: "canvas.note_reference_removed",
      payload: { canvasNodeId: 42 },
    });
    expect(writes).toHaveLength(3);
    expect(writes.every((w) => w.kind.startsWith("delete_"))).toBe(true);
  });
});

describe("source-scan boundary — projection.ts", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/canvas/projection.ts",
  );
  const src = readFileSync(file, "utf8");
  const code = src
    .split("\n")
    .filter((l) => !/^\s*\*?\s*\/\//.test(l) && !/^\s*\*/.test(l))
    .join("\n");

  it("does not import neo4j-driver", () => {
    expect(/from\s+["']neo4j-driver["']/.test(code)).toBe(false);
  });

  it("does not import credential-resolver", () => {
    expect(/credential-resolver/.test(code)).toBe(false);
  });

  it("does not import the MCP dispatcher", () => {
    expect(
      /import[^;]*dispatchMcpToolCall[^;]*from\s+["'][^"']*mcp\/dispatcher/.test(
        code,
      ),
    ).toBe(false);
  });

  it("does not read process.env.*_API_KEY raw", () => {
    expect(/process\.env\.[A-Z_]*_API_KEY/.test(code)).toBe(false);
  });

  it("does not call applyProjectionJob directly (helper is pure write-builder)", () => {
    expect(/applyProjectionJob/.test(code)).toBe(false);
  });
});
