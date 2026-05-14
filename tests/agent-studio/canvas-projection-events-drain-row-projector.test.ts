/**
 * V1+ 17-γ canvas projection events row-projector + projecting-
 * forwarder tests (PR-V1-67).
 *
 * Pure-function tests for the row→event projector + factory-output
 * tests for the projecting forwarder. No ASDB, no GraphRepository,
 * no ProjectionSyncWorker. Source-scan boundary asserts the
 * hard-rule imports stay clean.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it, vi } from "vitest";

import type { AgsCanvasProjectionEvent } from "../../drizzle/tables/agent-studio-canvas.js";

import {
  CANVAS_PROJECTION_EVENT_ROW_KINDS,
  projectAgsCanvasProjectionEventRow,
} from "../../server/agent-studio/services/canvas/projection-events-drain-row-projector.js";
import {
  createProjectingCanvasProjectionEventForwarder,
  type CanvasProjectionEventDispatch,
} from "../../server/agent-studio/services/canvas/projection-events-drain-projecting-forwarder.js";

function rowFixture(
  over: Partial<AgsCanvasProjectionEvent> = {},
): AgsCanvasProjectionEvent {
  return {
    id: 1,
    kind: "note_reference_changed",
    workspaceId: 100,
    canvasId: 7,
    canvasNodeId: 70,
    referencedNoteId: 700,
    metadata: null,
    createdAt: new Date(),
    ...over,
  } as AgsCanvasProjectionEvent;
}

describe("projectAgsCanvasProjectionEventRow — closed row-kind taxonomy", () => {
  it("exposes both known row kinds", () => {
    expect(CANVAS_PROJECTION_EVENT_ROW_KINDS).toEqual([
      "note_reference_changed",
      "note_reference_removed",
    ]);
  });
});

describe("projectAgsCanvasProjectionEventRow — happy paths", () => {
  it("projects a note_reference_changed row to canvas.note_reference_changed", () => {
    const event = projectAgsCanvasProjectionEventRow(
      rowFixture({
        kind: "note_reference_changed",
        canvasId: 7,
        canvasNodeId: 70,
        referencedNoteId: 700,
      }),
    );
    expect(event).toEqual({
      kind: "canvas.note_reference_changed",
      payload: {
        canvasId: 7,
        canvasNodeId: 70,
        referencedNoteId: 700,
      },
    });
  });

  it("projects a note_reference_removed row to canvas.note_reference_removed with priorReferencedNoteId", () => {
    const event = projectAgsCanvasProjectionEventRow(
      rowFixture({
        kind: "note_reference_removed",
        canvasId: 7,
        canvasNodeId: 70,
        referencedNoteId: 701,
      }),
    );
    expect(event).toEqual({
      kind: "canvas.note_reference_removed",
      payload: {
        canvasId: 7,
        canvasNodeId: 70,
        priorReferencedNoteId: 701,
      },
    });
  });
});

describe("projectAgsCanvasProjectionEventRow — defensive null branches", () => {
  it("returns null for an unknown row kind", () => {
    const event = projectAgsCanvasProjectionEventRow(
      rowFixture({ kind: "some.future.kind" }),
    );
    expect(event).toBeNull();
  });

  it("returns null for note_reference_changed with null referencedNoteId", () => {
    const event = projectAgsCanvasProjectionEventRow(
      rowFixture({
        kind: "note_reference_changed",
        referencedNoteId: null,
      }),
    );
    expect(event).toBeNull();
  });

  it("returns null for note_reference_removed with null referencedNoteId", () => {
    const event = projectAgsCanvasProjectionEventRow(
      rowFixture({
        kind: "note_reference_removed",
        referencedNoteId: null,
      }),
    );
    expect(event).toBeNull();
  });
});

describe("createProjectingCanvasProjectionEventForwarder — composition", () => {
  it("projects the row and dispatches the in-memory event for changed kind", async () => {
    const dispatch = vi.fn<CanvasProjectionEventDispatch>();
    const forward = createProjectingCanvasProjectionEventForwarder({ dispatch });

    await forward(
      rowFixture({
        kind: "note_reference_changed",
        canvasId: 7,
        canvasNodeId: 70,
        referencedNoteId: 700,
      }),
    );

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      kind: "canvas.note_reference_changed",
      payload: {
        canvasId: 7,
        canvasNodeId: 70,
        referencedNoteId: 700,
      },
    });
  });

  it("projects the row and dispatches for removed kind with priorReferencedNoteId", async () => {
    const dispatch = vi.fn<CanvasProjectionEventDispatch>();
    const forward = createProjectingCanvasProjectionEventForwarder({ dispatch });

    await forward(
      rowFixture({
        kind: "note_reference_removed",
        canvasId: 8,
        canvasNodeId: 80,
        referencedNoteId: 800,
      }),
    );

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      kind: "canvas.note_reference_removed",
      payload: {
        canvasId: 8,
        canvasNodeId: 80,
        priorReferencedNoteId: 800,
      },
    });
  });

  it("does NOT call dispatch for an unprojectable row (unknown kind)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const dispatch = vi.fn<CanvasProjectionEventDispatch>();
    const forward = createProjectingCanvasProjectionEventForwarder({ dispatch });

    await forward(rowFixture({ kind: "some.future.kind" }));

    expect(dispatch).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("does NOT call dispatch for an unprojectable row (null referencedNoteId)", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const dispatch = vi.fn<CanvasProjectionEventDispatch>();
    const forward = createProjectingCanvasProjectionEventForwarder({ dispatch });

    await forward(
      rowFixture({
        kind: "note_reference_changed",
        referencedNoteId: null,
      }),
    );

    expect(dispatch).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("propagates dispatch throws so the #808 drain halts at the failing row", async () => {
    const dispatch = vi
      .fn<CanvasProjectionEventDispatch>()
      .mockRejectedValue(new Error("downstream-busy"));
    const forward = createProjectingCanvasProjectionEventForwarder({ dispatch });

    await expect(
      forward(rowFixture({ kind: "note_reference_changed" })),
    ).rejects.toThrow(/downstream-busy/);
  });

  it("awaits an async dispatch and resolves cleanly", async () => {
    let resolved = false;
    const dispatch: CanvasProjectionEventDispatch = async () => {
      await new Promise((r) => setTimeout(r, 0));
      resolved = true;
    };
    const forward = createProjectingCanvasProjectionEventForwarder({ dispatch });

    await forward(rowFixture({ kind: "note_reference_changed" }));

    expect(resolved).toBe(true);
  });
});

describe("source-scan boundaries — hard-rule compliance", () => {
  const projectorSrc = readFileSync(
    resolve(
      __dirname,
      "../../server/agent-studio/services/canvas/projection-events-drain-row-projector.ts",
    ),
    "utf8",
  );
  const forwarderSrc = readFileSync(
    resolve(
      __dirname,
      "../../server/agent-studio/services/canvas/projection-events-drain-projecting-forwarder.ts",
    ),
    "utf8",
  );

  function stripComments(src: string): string {
    return src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => !/^\s*(?:\/\/|\*)/.test(line))
      .join("\n");
  }

  const FORBIDDEN_IMPORT_PATTERNS = [
    /from\s+["'][^"']*credential-resolver/,
    /from\s+["'][^"']*dispatchMcpToolCall/,
    /process\.env\.[A-Z0-9_]*_API_KEY\b/,
    /from\s+["']neo4j-driver/,
    /from\s+["'][^"']*openrouter/,
    /\bGraphRepository\b/,
    /from\s+["'][^"']*projection\/sync-worker/,
    /\bProjectionSyncWorker\b/,
  ];

  it("the row projector module has no forbidden imports", () => {
    const stripped = stripComments(projectorSrc);
    for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
      expect(pattern.test(stripped)).toBe(false);
    }
  });

  it("the projecting forwarder module has no forbidden imports", () => {
    const stripped = stripComments(forwarderSrc);
    for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
      expect(pattern.test(stripped)).toBe(false);
    }
  });
});
