/**
 * T-F.2 Bases → Knowledge Graph projection — sync-worker + drain
 * translator + bases-service enqueue + projection bridge tests.
 *
 * Verifies:
 *   - `ProjectionEvent` union declares 5 new `base.*` event kinds.
 *   - `translatePendingRowToEvent` recognizes each new triggerEvent
 *     and validates payload shape.
 *   - `buildWrites` produces the expected `upsert_node` / `upsert_edge`
 *     / `delete_node` shapes for each event kind:
 *       - base.created/updated → upsert Base node
 *       - base.deleted        → delete Base node
 *       - base.row_changed    → upsert BaseRow + OF_BASE edge
 *                             + optional ROW_OF_NOTE (when noteId set)
 *       - base.row_removed    → delete BaseRow
 *   - `bases-service.ts` fires fire-and-forget projection enqueues
 *     on createBase/updateBase/createBaseRow/updateBaseRow/deleteBaseRow.
 *   - Source-scan: bases-service catches and warns on enqueue
 *     failures (never rolls back Postgres).
 *   - `enqueueBaseProjection` builds the canonical projectionKey
 *     `base:<id>` + carries the canonical payload shape.
 *   - Router exposes `deleteRow` procedure.
 */

import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve, join } from "path";

import { ProjectionSyncWorker } from "../../server/agent-studio/services/graph/projection/sync-worker";
import { translatePendingRowToEvent } from "../../server/agent-studio/services/graph/projection/queue-drain";

const REPO = resolve(__dirname, "../..");
const SYNC_WORKER = join(REPO, "server/agent-studio/services/graph/projection/sync-worker.ts");
const QUEUE_DRAIN = join(REPO, "server/agent-studio/services/graph/projection/queue-drain.ts");
const BASES_SERVICE = join(REPO, "server/agent-studio/services/bases/bases-service.ts");
const BASES_PROJECTION = join(REPO, "server/agent-studio/services/bases/graph-projection.ts");
const BASES_ROUTER = join(REPO, "server/agent-studio/services/bases/bases-router.ts");

function read(p: string): string {
  return readFileSync(p, "utf8");
}

// Stub repository — only `buildWrites` is exercised; `applyProjectionJob`
// is never invoked by the assertions below.
const stubRepo = {
  applyProjectionJob: vi.fn(),
  enqueueProjectionJob: vi.fn(),
} as never;

function makeWorker(): ProjectionSyncWorker {
  return new ProjectionSyncWorker({ repository: stubRepo });
}

// ────────────────────────────────────────────────────────────────────
// ProjectionEvent union declaration
// ────────────────────────────────────────────────────────────────────

describe("ProjectionEvent — new base.* event kinds declared", () => {
  const src = read(SYNC_WORKER);
  for (const kind of [
    "base.created",
    "base.updated",
    "base.deleted",
    "base.row_changed",
    "base.row_removed",
  ]) {
    it(`declares kind: "${kind}" in the union`, () => {
      expect(src).toMatch(new RegExp(`kind:\\s*"${kind.replace(/\./g, "\\.")}"`));
    });
  }
});

// ────────────────────────────────────────────────────────────────────
// translatePendingRowToEvent — closed taxonomy translator
// ────────────────────────────────────────────────────────────────────

describe("translatePendingRowToEvent — base.* event kinds", () => {
  it("translates base.created", () => {
    const event = translatePendingRowToEvent({
      triggerEvent: "base.created",
      triggerPayload: {
        baseId: 1,
        workspaceId: 7,
        vaultId: null,
        slug: "tasks",
        name: "Tasks",
      },
    } as never);
    expect(event?.kind).toBe("base.created");
    expect(event?.payload).toMatchObject({
      baseId: 1,
      workspaceId: 7,
      vaultId: null,
      slug: "tasks",
      name: "Tasks",
    });
  });

  it("translates base.updated with same payload shape", () => {
    const event = translatePendingRowToEvent({
      triggerEvent: "base.updated",
      triggerPayload: {
        baseId: 1,
        workspaceId: null,
        vaultId: 2,
        slug: "tasks-v2",
        name: "Tasks (renamed)",
      },
    } as never);
    expect(event?.kind).toBe("base.updated");
    expect(event?.payload).toMatchObject({ vaultId: 2, slug: "tasks-v2" });
  });

  it("returns null when base.created payload is incomplete", () => {
    const event = translatePendingRowToEvent({
      triggerEvent: "base.created",
      triggerPayload: { baseId: 1 }, // missing slug + name
    } as never);
    expect(event).toBeNull();
  });

  it("translates base.deleted", () => {
    const event = translatePendingRowToEvent({
      triggerEvent: "base.deleted",
      triggerPayload: { baseId: 42 },
    } as never);
    expect(event?.kind).toBe("base.deleted");
    expect(event?.payload).toEqual({ baseId: 42 });
  });

  it("translates base.row_changed with noteId carried through (number)", () => {
    const event = translatePendingRowToEvent({
      triggerEvent: "base.row_changed",
      triggerPayload: { rowId: 100, baseId: 1, noteId: 50 },
    } as never);
    expect(event?.kind).toBe("base.row_changed");
    expect(event?.payload).toEqual({ rowId: 100, baseId: 1, noteId: 50 });
  });

  it("translates base.row_changed with noteId null", () => {
    const event = translatePendingRowToEvent({
      triggerEvent: "base.row_changed",
      triggerPayload: { rowId: 100, baseId: 1 },
    } as never);
    expect(event?.payload).toEqual({ rowId: 100, baseId: 1, noteId: null });
  });

  it("returns null for base.row_changed missing required fields", () => {
    const event = translatePendingRowToEvent({
      triggerEvent: "base.row_changed",
      triggerPayload: { rowId: 100 }, // missing baseId
    } as never);
    expect(event).toBeNull();
  });

  it("translates base.row_removed", () => {
    const event = translatePendingRowToEvent({
      triggerEvent: "base.row_removed",
      triggerPayload: { rowId: 999 },
    } as never);
    expect(event?.kind).toBe("base.row_removed");
  });
});

// ────────────────────────────────────────────────────────────────────
// buildWrites — projection write shapes
// ────────────────────────────────────────────────────────────────────

describe("ProjectionSyncWorker.buildWrites — base.* projections", () => {
  const worker = makeWorker();

  it("base.created → upsert Base node", () => {
    const writes = worker.buildWrites({
      kind: "base.created",
      payload: {
        baseId: 1,
        workspaceId: 7,
        vaultId: null,
        slug: "tasks",
        name: "Tasks",
      },
    });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      kind: "upsert_node",
      node: {
        typeKey: "Base",
        id: "base:1",
        properties: { slug: "tasks", name: "Tasks" },
      },
    });
  });

  it("base.updated → upsert Base node (idempotent against created)", () => {
    const writes = worker.buildWrites({
      kind: "base.updated",
      payload: {
        baseId: 1,
        workspaceId: null,
        vaultId: 2,
        slug: "tasks-v2",
        name: "Tasks (renamed)",
      },
    });
    expect(writes[0]).toMatchObject({
      kind: "upsert_node",
      node: { id: "base:1", properties: { slug: "tasks-v2" } },
    });
  });

  it("base.deleted → delete Base node", () => {
    const writes = worker.buildWrites({
      kind: "base.deleted",
      payload: { baseId: 42 },
    });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      kind: "delete_node",
      node: { typeKey: "Base", id: "base:42" },
    });
  });

  it("base.row_changed (noteId set) → upsert BaseRow + OF_BASE + ROW_OF_NOTE (3 writes)", () => {
    const writes = worker.buildWrites({
      kind: "base.row_changed",
      payload: { rowId: 100, baseId: 1, noteId: 50 },
    });
    expect(writes).toHaveLength(3);
    expect(writes[0]).toMatchObject({
      kind: "upsert_node",
      node: { typeKey: "BaseRow", id: "base_row:100" },
    });
    expect(writes[1]).toMatchObject({
      kind: "upsert_edge",
      edge: {
        typeKey: "OF_BASE",
        sourceNode: { typeKey: "BaseRow", id: "base_row:100" },
        targetNode: { typeKey: "Base", id: "base:1" },
      },
    });
    expect(writes[2]).toMatchObject({
      kind: "upsert_edge",
      edge: {
        typeKey: "ROW_OF_NOTE",
        sourceNode: { typeKey: "BaseRow", id: "base_row:100" },
        targetNode: { typeKey: "Note", id: "note:50" },
      },
    });
  });

  it("base.row_changed (noteId null) → upsert BaseRow + OF_BASE only (2 writes, no ROW_OF_NOTE)", () => {
    const writes = worker.buildWrites({
      kind: "base.row_changed",
      payload: { rowId: 100, baseId: 1, noteId: null },
    });
    expect(writes).toHaveLength(2);
    expect(writes[0]?.kind).toBe("upsert_node");
    expect(writes[1]?.kind).toBe("upsert_edge");
    // No ROW_OF_NOTE edge.
    for (const w of writes) {
      if (w.kind === "upsert_edge") {
        expect(w.edge.typeKey).not.toBe("ROW_OF_NOTE");
      }
    }
  });

  it("base.row_removed → delete BaseRow node", () => {
    const writes = worker.buildWrites({
      kind: "base.row_removed",
      payload: { rowId: 99 },
    });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      kind: "delete_node",
      node: { typeKey: "BaseRow", id: "base_row:99" },
    });
  });
});

// ────────────────────────────────────────────────────────────────────
// Source-scan — service wires the projection bridge
// ────────────────────────────────────────────────────────────────────

describe("bases-service.ts — projection bridge wiring", () => {
  const src = read(BASES_SERVICE);

  it("imports the enqueue helpers", () => {
    expect(src).toMatch(/from\s+["']\.\/graph-projection\.js["']/);
    expect(src).toMatch(/enqueueBaseProjection/);
    expect(src).toMatch(/enqueueBaseRowProjection/);
    expect(src).toMatch(/enqueueBaseRowRemoval/);
  });

  it("uses fire-and-forget pattern (void + .catch())", () => {
    expect(src).toMatch(/void enqueueBaseProjection\([\s\S]*?\)\.catch\(/);
    expect(src).toMatch(/void enqueueBaseRowProjection\([\s\S]*?\)\.catch\(/);
    expect(src).toMatch(/void enqueueBaseRowRemoval\([\s\S]*?\)\.catch\(/);
  });

  it("createBase fires base.created projection", () => {
    expect(src).toMatch(/fireBaseProjection\(\s*inserted,\s*"base\.created"\s*\)/);
  });

  it("updateBase fires base.updated projection", () => {
    expect(src).toMatch(/fireBaseProjection\(\s*updated,\s*"base\.updated"\s*\)/);
  });

  it("createBaseRow + updateBaseRow + deleteBaseRow all fire", () => {
    expect(src).toMatch(/fireBaseRowProjection\(\s*inserted\s*\)/);
    expect(src).toMatch(/fireBaseRowProjection\(\s*updated\s*\)/);
    expect(src).toMatch(/fireBaseRowRemoval\(\s*rowId\s*\)/);
  });

  it("deleteBaseRow exists as an exported function", () => {
    expect(src).toMatch(/export async function deleteBaseRow\(/);
  });
});

// ────────────────────────────────────────────────────────────────────
// graph-projection.ts — projectionKey + payload shape
// ────────────────────────────────────────────────────────────────────

describe("bases graph-projection bridge — canonical shapes", () => {
  const src = read(BASES_PROJECTION);

  it("base enqueue uses projectionKey `base:<id>`", () => {
    expect(src).toMatch(/projectionKey:\s*`base:\$\{input\.baseId\}`/);
  });

  it("base-row enqueue uses projectionKey `base_row:<id>`", () => {
    expect(src).toMatch(/projectionKey:\s*`base_row:\$\{input\.rowId\}`/);
  });

  it("does not import neo4j-driver / openrouter / dispatchMcpToolCall", () => {
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");
    expect(stripped).not.toMatch(/from\s+["']neo4j-driver["']/);
    expect(stripped).not.toMatch(/from\s+["'][^"']*openrouter[^"']*["']/);
    expect(stripped).not.toMatch(/\bdispatchMcpToolCall\s*\(/);
  });
});

describe("bases-router.ts — deleteRow procedure", () => {
  const src = read(BASES_ROUTER);

  it("exposes deleteRow as protectedProcedure", () => {
    expect(src).toMatch(/deleteRow:\s*protectedProcedure/);
  });

  it("deleteRow maps BaseRowNotFoundError → NOT_FOUND", () => {
    expect(src).toMatch(
      /deleteRow:[\s\S]*?BaseRowNotFoundError[\s\S]*?code:\s*"NOT_FOUND"/,
    );
  });
});

// ────────────────────────────────────────────────────────────────────
// Queue-drain switch case completeness
// ────────────────────────────────────────────────────────────────────

describe("queue-drain switch — base.* cases present", () => {
  const src = read(QUEUE_DRAIN);
  for (const kind of [
    "base.created",
    "base.updated",
    "base.deleted",
    "base.row_changed",
    "base.row_removed",
  ]) {
    it(`switch handles "${kind}"`, () => {
      expect(src).toMatch(new RegExp(`case\\s+"${kind.replace(/\./g, "\\.")}"`));
    });
  }
});
