/**
 * Workspace → Region pin service source-scan — V2 Phase MR-1 Phase-2
 * first slice. PR-V1-148.
 *
 * No DB / no boot: this is a structural integrity test on
 * `workspace-region-pin-service.ts` + the new
 * `agent-studio-workspace-region-pins.ts` table file. The behavioral
 * unit tests for the service against a live ASDB are a downstream
 * slice once the Phase-2 cache wiring lands.
 *
 * Covers:
 *   - Table file shape: pgTable name = `ags_workspace_region_pins`;
 *     columns workspaceId / regionKey / isReplicated / notes;
 *     uniqueIndex on workspaceId; barrel re-export from drizzle/schema.
 *   - Service file shape: imports getAsDb, agsWorkspaceRegionPins,
 *     and getRegionByKey for validation; exports the 4 public
 *     helpers + types.
 *   - Public-api barrel re-exports the new helpers + types.
 *   - Hard-rule compliance: no `process.env.*_API_KEY` reads, no
 *     `credential-resolver` / `dispatchMcpToolCall` / `neo4j-driver`
 *     imports in either file.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("MR-1 Phase-2 — workspace-region-pin table + service", () => {
  const tableFile = resolve(
    __dirname,
    "../../drizzle/tables/agent-studio-workspace-region-pins.ts",
  );
  const serviceFile = resolve(
    __dirname,
    "../../server/agent-studio/services/region/workspace-region-pin-service.ts",
  );
  const barrelFile = resolve(
    __dirname,
    "../../server/agent-studio/services/region/public-api.ts",
  );
  const drizzleSchema = resolve(__dirname, "../../drizzle/schema.ts");

  it("table file declares ags_workspace_region_pins with the expected columns + indices", () => {
    const src = readFileSync(tableFile, "utf8");
    expect(src).toContain('pgTable(\n  "ags_workspace_region_pins"');
    expect(src).toContain('workspaceId: integer("workspace_id").notNull()');
    expect(src).toContain(
      'regionKey: varchar("region_key", { length: 80 }).notNull()',
    );
    expect(src).toContain(
      'isReplicated: boolean("is_replicated").notNull().default(false)',
    );
    expect(src).toContain('notes: text("notes")');
    expect(src).toContain(
      'workspaceIdx: uniqueIndex("uniq_ags_workspace_region_pins_workspace")',
    );
    expect(src).toContain(
      'regionKeyIdx: index("idx_ags_workspace_region_pins_region_key")',
    );
    expect(src).toContain(
      'replicatedIdx: index("idx_ags_workspace_region_pins_replicated")',
    );
  });

  it("drizzle/schema.ts barrel re-exports the new table file", () => {
    const src = readFileSync(drizzleSchema, "utf8");
    expect(src).toContain(
      "export * from './tables/agent-studio-workspace-region-pins'",
    );
  });

  it("service file imports agsWorkspaceRegionPins + getAsDb + validates regionKey via getRegionByKey", () => {
    const src = readFileSync(serviceFile, "utf8");
    expect(
      /import\s*\{\s*agsWorkspaceRegionPins\s*\}\s*from\s+["']\.\.\/\.\.\/\.\.\/\.\.\/drizzle\/tables\/agent-studio-workspace-region-pins\.js["']/.test(
        src,
      ),
    ).toBe(true);
    expect(
      /import\s*\{\s*getAsDb\s*\}\s*from\s+["']\.\.\/\.\.\/db\/connection\.js["']/.test(
        src,
      ),
    ).toBe(true);
    expect(/getRegionByKey\s*\(\s*input\.regionKey\s*\)/.test(src)).toBe(true);
    expect(/throw\s+new\s+RegionNotFoundError/.test(src)).toBe(true);
  });

  it("service file exports the 4 public helpers + 2 types", () => {
    const src = readFileSync(serviceFile, "utf8");
    expect(/export\s+async\s+function\s+setWorkspaceRegionPin/.test(src)).toBe(
      true,
    );
    expect(/export\s+async\s+function\s+getWorkspaceRegionPin/.test(src)).toBe(
      true,
    );
    expect(
      /export\s+async\s+function\s+listAllWorkspaceRegionPins/.test(src),
    ).toBe(true);
    expect(
      /export\s+async\s+function\s+removeWorkspaceRegionPin/.test(src),
    ).toBe(true);
    expect(/export\s+interface\s+WorkspaceRegionPinRecord/.test(src)).toBe(
      true,
    );
    expect(/export\s+interface\s+SetWorkspaceRegionPinInput/.test(src)).toBe(
      true,
    );
  });

  it("public-api barrel re-exports the new helpers + types", () => {
    const src = readFileSync(barrelFile, "utf8");
    expect(src).toContain("setWorkspaceRegionPin");
    expect(src).toContain("getWorkspaceRegionPin");
    expect(src).toContain("listAllWorkspaceRegionPins");
    expect(src).toContain("removeWorkspaceRegionPin");
    expect(src).toContain("WorkspaceRegionPinRecord");
    expect(src).toContain("SetWorkspaceRegionPinInput");
    expect(src).toContain("./workspace-region-pin-service.js");
  });

  it("upsert path: existing row triggers UPDATE, missing triggers INSERT", () => {
    const src = readFileSync(serviceFile, "utf8");
    // Both branches must exist in setWorkspaceRegionPin.
    expect(/db\s*\n?\s*\.update\s*\(\s*agsWorkspaceRegionPins\s*\)/.test(src)).toBe(
      true,
    );
    expect(/db\s*\n?\s*\.insert\s*\(\s*agsWorkspaceRegionPins\s*\)/.test(src)).toBe(
      true,
    );
  });

  it("removeWorkspaceRegionPin is idempotent — returns false when no row matched, true on delete", () => {
    const src = readFileSync(serviceFile, "utf8");
    expect(/if\s*\(\s*!lookup\[0\]\s*\)\s*return\s+false/.test(src)).toBe(true);
    expect(/return\s+true\s*;?\s*\}\s*$/m.test(src)).toBe(true);
  });

  it("getWorkspaceRegionPin returns null when ASDB unavailable (single-region fallback semantics)", () => {
    const src = readFileSync(serviceFile, "utf8");
    // getWorkspaceRegionPin: returns null on no db, on no row — both
    // map to "fall back to the primary region".
    const idx = src.indexOf("export async function getWorkspaceRegionPin");
    expect(idx).toBeGreaterThan(-1);
    const body = src.slice(
      idx,
      src.indexOf("export ", idx + "export async function getWorkspaceRegionPin".length + 1),
    );
    expect(/if\s*\(\s*!db\s*\)\s*return\s+null/.test(body)).toBe(true);
    expect(/return\s+rows\[0\]\s*\?\s*rowToPin/.test(body)).toBe(true);
  });

  it("hard-rule compliance: no env reads / credential-resolver / dispatcher / neo4j-driver imports", () => {
    const tableSrc = readFileSync(tableFile, "utf8");
    const serviceSrc = readFileSync(serviceFile, "utf8");
    for (const src of [tableSrc, serviceSrc]) {
      expect(/process\.env\.[A-Z0-9_]+_API_KEY/.test(src)).toBe(false);
      expect(/credential-resolver/.test(src)).toBe(false);
      expect(/dispatchMcpToolCall/.test(src)).toBe(false);
      expect(/neo4j-driver/.test(src)).toBe(false);
    }
  });
});
