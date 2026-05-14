/**
 * 17-γ canvas projection events drain fan-out tests (PR-V1-58).
 *
 * Covers `drainCanvasProjectionEventsAllWorkspaces` — the
 * multi-workspace orchestrator that composes the per-workspace
 * drain (#808) and mutates a caller-supplied cursor map.
 *
 * Uses DI seams (`getWorkspaceIds`, `getDb`) so tests run without
 * a live ASDB.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it, vi } from "vitest";

import {
  drainCanvasProjectionEventsAllWorkspaces,
  type CanvasProjectionEventForwarder,
} from "../../server/agent-studio/services/canvas/projection-events-drain-fanout.js";
import type { AgsCanvasProjectionEvent } from "../../../drizzle/tables/agent-studio-canvas.js";

function makeRow(id: number, workspaceId: number): AgsCanvasProjectionEvent {
  return {
    id,
    kind: "note_reference_changed",
    workspaceId,
    canvasId: 10,
    canvasNodeId: 100 + id,
    referencedNoteId: 500 + id,
    metadata: null,
    createdAt: new Date(),
  };
}

/**
 * Fake DB that returns the same page once per workspace, keyed
 * by the cumulative `.limit(n)` call. The drain calls `.limit()`
 * once per batch; multi-workspace fan-out calls it once per
 * workspace (when each is a single-batch catch-up).
 */
function makeFakeDb(pages: unknown[][]) {
  let i = 0;
  return {
    select() {
      return {
        from() {
          return {
            where() {
              return {
                orderBy() {
                  return {
                    async limit(_n: number) {
                      const page = pages[i] ?? [];
                      i++;
                      return page;
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}

describe("drainCanvasProjectionEventsAllWorkspaces — happy path", () => {
  it("drains across N workspaces and mutates cursor map", async () => {
    const cursorMap = new Map<number, number>();
    const db = makeFakeDb([
      [makeRow(1, 7), makeRow(2, 7)],
      [makeRow(3, 11)],
    ]);
    const forwarded: AgsCanvasProjectionEvent[] = [];
    const forward: CanvasProjectionEventForwarder = async (e) => {
      forwarded.push(e);
    };
    const result = await drainCanvasProjectionEventsAllWorkspaces(
      {
        cursorMap,
        forward,
        getWorkspaceIds: async () => [7, 11],
        limit: 10,
      },
      { getDb: () => db as never },
    );
    expect(result.workspacesScanned).toBe(2);
    expect(result.totalProcessed).toBe(3);
    expect(result.totalFailed).toBe(0);
    expect(result.anyHitMaxBatches).toBe(false);
    expect(cursorMap.get(7)).toBe(2);
    expect(cursorMap.get(11)).toBe(3);
    expect(forwarded.map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it("returns 0/0 with empty perWorkspace when no workspaces", async () => {
    const result = await drainCanvasProjectionEventsAllWorkspaces({
      cursorMap: new Map(),
      forward: async () => {},
      getWorkspaceIds: async () => [],
    });
    expect(result.workspacesScanned).toBe(0);
    expect(result.totalProcessed).toBe(0);
    expect(result.perWorkspace).toEqual([]);
  });
});

describe("drainCanvasProjectionEventsAllWorkspaces — cursor persistence", () => {
  it("uses existing cursor entry as the starting point", async () => {
    const cursorMap = new Map<number, number>([[7, 100]]);
    // Page-source returns one row id=200 — we only check that
    // the cursor map ends at 200 (advance from 100 → 200).
    const db = makeFakeDb([[makeRow(200, 7)]]);
    const result = await drainCanvasProjectionEventsAllWorkspaces(
      {
        cursorMap,
        forward: async () => {},
        getWorkspaceIds: async () => [7],
        limit: 10,
      },
      { getDb: () => db as never },
    );
    expect(cursorMap.get(7)).toBe(200);
    expect(result.totalProcessed).toBe(1);
  });

  it("defaults missing-key cursor to 0 (first-drain semantics)", async () => {
    const cursorMap = new Map<number, number>();
    const db = makeFakeDb([[makeRow(42, 99)]]);
    await drainCanvasProjectionEventsAllWorkspaces(
      {
        cursorMap,
        forward: async () => {},
        getWorkspaceIds: async () => [99],
        limit: 10,
      },
      { getDb: () => db as never },
    );
    expect(cursorMap.get(99)).toBe(42);
  });
});

describe("drainCanvasProjectionEventsAllWorkspaces — per-workspace isolation", () => {
  it("a forwarder failure on one workspace does not block others", async () => {
    const cursorMap = new Map<number, number>();
    const db = makeFakeDb([
      [makeRow(1, 7), makeRow(2, 7)], // workspace 7 — second row fails
      [makeRow(3, 11)],                 // workspace 11 — still drains
    ]);
    const forward: CanvasProjectionEventForwarder = async (e) => {
      if (e.workspaceId === 7 && e.id === 2)
        throw new Error("forward boom on 7/2");
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await drainCanvasProjectionEventsAllWorkspaces(
      {
        cursorMap,
        forward,
        getWorkspaceIds: async () => [7, 11],
        limit: 10,
      },
      { getDb: () => db as never },
    );
    expect(result.workspacesScanned).toBe(2);
    expect(result.totalProcessed).toBe(2); // 7/1 + 11/3
    expect(result.totalFailed).toBe(1);
    expect(cursorMap.get(7)).toBe(1); // halted at 1
    expect(cursorMap.get(11)).toBe(3);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("drainCanvasProjectionEventsAllWorkspaces — workspace discovery failure", () => {
  it("returns no-op result + WARN when getWorkspaceIds throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await drainCanvasProjectionEventsAllWorkspaces({
      cursorMap: new Map(),
      forward: async () => {},
      getWorkspaceIds: async () => {
        throw new Error("ASDB outage");
      },
    });
    expect(result.workspacesScanned).toBe(0);
    expect(result.totalProcessed).toBe(0);
    expect(result.perWorkspace).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("drainCanvasProjectionEventsAllWorkspaces — source-scan boundaries", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/canvas/projection-events-drain-fanout.ts",
  );
  const src = readFileSync(file, "utf8");
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/[^\n]*/g, "$1");

  it("does not import credential-resolver", () => {
    expect(/from\s+["'][^"']*credential-resolver/.test(code)).toBe(false);
  });

  it("does not import or call dispatchMcpToolCall", () => {
    expect(/dispatchMcpToolCall\s*\(/.test(code)).toBe(false);
    expect(/import[^;]*dispatchMcpToolCall/.test(code)).toBe(false);
  });

  it("does not read *_API_KEY env vars", () => {
    expect(/process\.env\.[A-Z_]*API_KEY/.test(code)).toBe(false);
  });

  it("does not import neo4j-driver / openrouter / GraphRepository", () => {
    expect(/from\s+["']neo4j-driver["']/.test(code)).toBe(false);
    expect(/from\s+["'][^"']*openrouter/.test(code)).toBe(false);
    expect(
      /from\s+["'][^"']*graph\/repository(\.|\/|["'])/.test(code),
    ).toBe(false);
  });

  it("has no insert/update/delete (fan-out is read + forward)", () => {
    expect(/\.insert\s*\(/.test(code)).toBe(false);
    expect(/\.update\s*\(/.test(code)).toBe(false);
    expect(/\.delete\s*\(/.test(code)).toBe(false);
  });
});
