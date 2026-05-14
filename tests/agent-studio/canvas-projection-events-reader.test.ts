/**
 * 17-γ canvas projection events reader tests (PR-V1-56).
 *
 * Covers `readCanvasProjectionEventsAfter` — pure keyset-pagination
 * read helper for the future drain consumer.
 *
 * Uses DI seam (`getDb`) so tests run without a live ASDB. The
 * fake DB captures the chained call shape — we assert the
 * intended `.select / .from / .where / .orderBy / .limit` chain
 * lands on the expected arguments without actually executing
 * SQL.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

import {
  READ_CANVAS_PROJECTION_EVENTS_HARD_LIMIT,
  readCanvasProjectionEventsAfter,
} from "../../server/agent-studio/services/canvas/projection-events-reader.js";

function makeFakeDb(rows: unknown[] = []) {
  const captured: {
    selectShape?: Record<string, unknown>;
    fromTable?: unknown;
    whereCondition?: unknown;
    orderByArgs?: unknown[];
    limit?: number;
  } = {};
  const db = {
    select(shape: Record<string, unknown>) {
      captured.selectShape = shape;
      return {
        from(t: unknown) {
          captured.fromTable = t;
          return {
            where(cond: unknown) {
              captured.whereCondition = cond;
              return {
                orderBy(...args: unknown[]) {
                  captured.orderByArgs = args;
                  return {
                    async limit(n: number) {
                      captured.limit = n;
                      return rows;
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
  return { db, captured };
}

describe("readCanvasProjectionEventsAfter — happy path", () => {
  it("returns rows from the fake DB", async () => {
    const fakeRows = [
      {
        id: 1,
        kind: "note_reference_changed",
        workspaceId: 7,
        canvasId: 10,
        canvasNodeId: 100,
        referencedNoteId: 555,
        metadata: null,
        createdAt: new Date(),
      },
    ];
    const { db } = makeFakeDb(fakeRows);
    const rows = await readCanvasProjectionEventsAfter(
      { workspaceId: 7, lastSeenId: 0, limit: 10 },
      { getDb: () => db as unknown as Parameters<typeof readCanvasProjectionEventsAfter>[1]["getDb"] extends infer T ? T extends () => infer R ? R : never : never },
    );
    expect(rows).toEqual(fakeRows);
  });

  it("applies the requested limit", async () => {
    const { db, captured } = makeFakeDb([]);
    await readCanvasProjectionEventsAfter(
      { workspaceId: 1, lastSeenId: 0, limit: 25 },
      { getDb: () => db as never },
    );
    expect(captured.limit).toBe(25);
  });

  it("orders by id ASC (single arg)", async () => {
    const { db, captured } = makeFakeDb([]);
    await readCanvasProjectionEventsAfter(
      { workspaceId: 1, lastSeenId: 0, limit: 10 },
      { getDb: () => db as never },
    );
    expect(captured.orderByArgs).toBeDefined();
    expect(captured.orderByArgs!.length).toBe(1);
  });
});

describe("readCanvasProjectionEventsAfter — limit clamping", () => {
  it("caps at the hard limit (1000)", async () => {
    const { db, captured } = makeFakeDb([]);
    await readCanvasProjectionEventsAfter(
      { workspaceId: 1, lastSeenId: 0, limit: 999999 },
      { getDb: () => db as never },
    );
    expect(captured.limit).toBe(READ_CANVAS_PROJECTION_EVENTS_HARD_LIMIT);
  });

  it("clamps below-1 to 1", async () => {
    const { db, captured } = makeFakeDb([]);
    await readCanvasProjectionEventsAfter(
      { workspaceId: 1, lastSeenId: 0, limit: 0 },
      { getDb: () => db as never },
    );
    expect(captured.limit).toBe(1);
  });

  it("truncates floats", async () => {
    const { db, captured } = makeFakeDb([]);
    await readCanvasProjectionEventsAfter(
      { workspaceId: 1, lastSeenId: 0, limit: 17.7 },
      { getDb: () => db as never },
    );
    expect(captured.limit).toBe(17);
  });
});

describe("readCanvasProjectionEventsAfter — ASDB-unavailable", () => {
  it("returns [] when getDb() returns null (no throw)", async () => {
    const rows = await readCanvasProjectionEventsAfter(
      { workspaceId: 1, lastSeenId: 0, limit: 10 },
      { getDb: () => null },
    );
    expect(rows).toEqual([]);
  });
});

describe("readCanvasProjectionEventsAfter — source-scan boundaries", () => {
  const file = resolve(
    __dirname,
    "../../server/agent-studio/services/canvas/projection-events-reader.ts",
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

  it("does not import neo4j-driver", () => {
    expect(/from\s+["']neo4j-driver["']/.test(code)).toBe(false);
  });

  it("does not import openrouter", () => {
    expect(/from\s+["'][^"']*openrouter/.test(code)).toBe(false);
  });

  it("does not import GraphRepository", () => {
    expect(
      /from\s+["'][^"']*graph\/repository(\.|\/|["'])/.test(code),
    ).toBe(false);
  });

  it("is read-only — no insert/update/delete operations", () => {
    expect(/\.insert\s*\(/.test(code)).toBe(false);
    expect(/\.update\s*\(/.test(code)).toBe(false);
    expect(/\.delete\s*\(/.test(code)).toBe(false);
  });
});
