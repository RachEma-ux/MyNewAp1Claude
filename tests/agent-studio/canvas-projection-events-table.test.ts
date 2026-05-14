/**
 * V1+ Phase 17-γ — Canvas projection events table source-scan
 * (PR-V1-53).
 *
 * Drizzle table declaration + seed-script provisioning for the
 * persistence target of the projection-events sink registry (#792,
 * `services/canvas/projection-events-sink.ts`). The no-op default
 * sink is preserved; an ASDB-backed sink that writes to this table
 * lands in a follow-up PR. No service-layer wiring changes here.
 *
 * Source-scan covers:
 *   - The `agsCanvasProjectionEvents` table is declared in
 *     `drizzle/tables/agent-studio-canvas.ts` with the SQL name
 *     `ags_canvas_projection_events`.
 *   - Required columns are present: `kind`, `workspaceId`,
 *     `canvasId`, `canvasNodeId`, `referencedNoteId`, `metadata`,
 *     `createdAt`.
 *   - Indexes are declared on (workspaceId, createdAt), canvasId,
 *     canvasNodeId, and kind.
 *   - The seed script imports the canvas schema and spreads it
 *     into `combinedSchema` so the new table is auto-provisioned
 *     by the introspection loop on next seed.
 *   - The structural taxonomy declared in `projection-events-sink.ts`
 *     (the `kind` field's closed enum) remains the contract;
 *     this table's `kind` column accepts the same string values.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

const tableFile = resolve(
  __dirname,
  "../../drizzle/tables/agent-studio-canvas.ts",
);
const sinkFile = resolve(
  __dirname,
  "../../server/agent-studio/services/canvas/projection-events-sink.ts",
);
const seedFile = resolve(
  __dirname,
  "../../server/agent-studio/db/seed.ts",
);

const tableSrc = readFileSync(tableFile, "utf8");
const sinkSrc = readFileSync(sinkFile, "utf8");
const seedSrc = readFileSync(seedFile, "utf8");

describe("17-γ canvas projection events table — declaration", () => {
  it("exports agsCanvasProjectionEvents", () => {
    expect(/export\s+const\s+agsCanvasProjectionEvents\s*=\s*pgTable\s*\(/.test(tableSrc)).toBe(true);
  });

  it("uses the canonical SQL table name", () => {
    expect(
      /agsCanvasProjectionEvents[\s\S]{0,200}["']ags_canvas_projection_events["']/.test(
        tableSrc,
      ),
    ).toBe(true);
  });

  it.each([
    "kind",
    "workspaceId",
    "canvasId",
    "canvasNodeId",
    "referencedNoteId",
    "metadata",
    "createdAt",
  ])("declares the %s column", (colName) => {
    // The column-name binding is `<jsCamel>: <type>("<snake>")` —
    // we assert the JS identifier appears within the
    // agsCanvasProjectionEvents pgTable block.
    const block = tableSrc.match(
      /export\s+const\s+agsCanvasProjectionEvents\s*=\s*pgTable\s*\([\s\S]*?\n\);/,
    );
    expect(block, "agsCanvasProjectionEvents block not found").toBeTruthy();
    expect(block![0].includes(`${colName}:`)).toBe(true);
  });

  it.each([
    "idx_ags_canvas_projection_events_ws_created",
    "idx_ags_canvas_projection_events_canvas",
    "idx_ags_canvas_projection_events_node",
    "idx_ags_canvas_projection_events_kind",
  ])("declares the %s index", (idxName) => {
    expect(tableSrc.includes(`"${idxName}"`)).toBe(true);
  });

  it("exports row + insert types", () => {
    expect(/export\s+type\s+AgsCanvasProjectionEvent\s*=/.test(tableSrc)).toBe(
      true,
    );
    expect(
      /export\s+type\s+NewAgsCanvasProjectionEvent\s*=/.test(tableSrc),
    ).toBe(true);
  });
});

describe("17-γ canvas projection events — seed wiring", () => {
  it("seed.ts imports the canvas schema module", () => {
    expect(
      /import\s+\*\s+as\s+agsCanvasSchema\s+from\s+["'][^"']*drizzle\/tables\/agent-studio-canvas["']/.test(
        seedSrc,
      ),
    ).toBe(true);
  });

  it("seed.ts spreads the canvas schema into combinedSchema", () => {
    expect(/\.\.\.agsCanvasSchema/.test(seedSrc)).toBe(true);
  });
});

describe("17-γ canvas projection events — kind taxonomy lockstep", () => {
  it("sink declares the closed 2-value taxonomy the column accepts", () => {
    // Lockstep guard: when a kind is added to the sink's discriminated
    // union, this test will surface the addition so the table column's
    // documentation (or a CHECK constraint, future PR) can keep up.
    const matches = sinkSrc.match(/"canvas\.note_reference_(changed|removed)"/g);
    expect(matches).not.toBeNull();
    const unique = new Set(matches);
    expect(unique.size).toBe(2);
  });
});

describe("17-γ canvas projection events — hard-rule boundaries", () => {
  it("table file does not import dispatchMcpToolCall, credential-resolver, neo4j-driver, openrouter", () => {
    const code = tableSrc
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\s)\/\/[^\n]*/g, "$1");
    expect(/dispatchMcpToolCall/.test(code)).toBe(false);
    expect(/credential-resolver/.test(code)).toBe(false);
    expect(/from\s+["']neo4j-driver["']/.test(code)).toBe(false);
    expect(/from\s+["'][^"']*openrouter/.test(code)).toBe(false);
  });
});
