/**
 * T-F.1 Bases MVP — data model + service + router mount tests.
 *
 * Verifies:
 *   - Table file declares all 3 tables (`ags_bases`, `ags_base_columns`,
 *     `ags_base_rows`) + the 7-value closed taxonomy
 *     `AGS_BASE_COLUMN_DATA_TYPES`.
 *   - schema.ts re-exports the new table module so the reconciler
 *     picks it up.
 *   - seed.ts imports `agsBasesSchema` and spreads it into
 *     `combinedSchema`.
 *   - public-api barrel re-exports the service + types + errors.
 *   - Router mount: `bases: basesRouter` is registered under
 *     `agentStudioRouter`.
 *   - Service source-scan: no neo4j-driver / openrouter /
 *     dispatchMcpToolCall / process.env.*_API_KEY reads.
 *   - Router source-scan: all writes route through bases-service
 *     functions; no direct `db.insert(agsBases…)` from the router.
 *   - Closed taxonomy at the boundary: dataType is z.enum-gated.
 *   - Closed taxonomy is the canonical 7-value list (the same as
 *     the table module's `AGS_BASE_COLUMN_DATA_TYPES`).
 *   - `isAgsBaseColumnDataType` and `BaseColumnDataTypeError`
 *     classifier helper behavior.
 *   - `BaseRowUnknownColumnsError` carries the unknown keys.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve, join } from "path";

import {
  AGS_BASE_COLUMN_DATA_TYPES,
  isAgsBaseColumnDataType,
  BaseColumnDataTypeError,
  BaseNotFoundError,
  BaseRowNotFoundError,
  BaseRowUnknownColumnsError,
} from "../../server/agent-studio/services/bases/public-api";

const REPO = resolve(__dirname, "../..");
const TABLE = join(REPO, "drizzle/tables/agent-studio-bases.ts");
const SCHEMA = join(REPO, "drizzle/schema.ts");
const SEED = join(REPO, "server/agent-studio/db/seed.ts");
const SERVICE = join(REPO, "server/agent-studio/services/bases/bases-service.ts");
const ROUTER_MODULE = join(REPO, "server/agent-studio/services/bases/bases-router.ts");
const API_ROUTER = join(REPO, "server/agent-studio/api/router.ts");
const PUBLIC_API = join(REPO, "server/agent-studio/services/bases/public-api.ts");

function read(p: string): string {
  return readFileSync(p, "utf8");
}

// ────────────────────────────────────────────────────────────────────
// Closed taxonomy
// ────────────────────────────────────────────────────────────────────

describe("AGS_BASE_COLUMN_DATA_TYPES — closed taxonomy", () => {
  it("contains the canonical 7 values", () => {
    expect(AGS_BASE_COLUMN_DATA_TYPES).toEqual([
      "text",
      "number",
      "date",
      "checkbox",
      "select",
      "multiselect",
      "note_link",
    ]);
  });

  it("isAgsBaseColumnDataType accepts canonical members", () => {
    for (const t of AGS_BASE_COLUMN_DATA_TYPES) {
      expect(isAgsBaseColumnDataType(t)).toBe(true);
    }
  });

  it("isAgsBaseColumnDataType rejects unknown values and non-strings", () => {
    expect(isAgsBaseColumnDataType("formula")).toBe(false);
    expect(isAgsBaseColumnDataType(null)).toBe(false);
    expect(isAgsBaseColumnDataType(42)).toBe(false);
    expect(isAgsBaseColumnDataType(undefined)).toBe(false);
  });

  it("BaseColumnDataTypeError carries the canonical list in its message", () => {
    const err = new BaseColumnDataTypeError("formula");
    expect(err.message).toContain("formula");
    for (const t of AGS_BASE_COLUMN_DATA_TYPES) {
      expect(err.message).toContain(t);
    }
  });
});

// ────────────────────────────────────────────────────────────────────
// Domain errors
// ────────────────────────────────────────────────────────────────────

describe("Bases — domain errors", () => {
  it("BaseNotFoundError exposes baseId in the message", () => {
    const err = new BaseNotFoundError(42);
    expect(err.message).toContain("42");
    expect(err.name).toBe("BaseNotFoundError");
  });

  it("BaseRowNotFoundError exposes rowId in the message", () => {
    const err = new BaseRowNotFoundError(99);
    expect(err.message).toContain("99");
    expect(err.name).toBe("BaseRowNotFoundError");
  });

  it("BaseRowUnknownColumnsError carries the unknown keys", () => {
    const err = new BaseRowUnknownColumnsError(7, ["foo", "bar"]);
    expect(err.unknownKeys).toEqual(["foo", "bar"]);
    expect(err.message).toContain("foo");
    expect(err.message).toContain("bar");
  });
});

// ────────────────────────────────────────────────────────────────────
// Table file integrity
// ────────────────────────────────────────────────────────────────────

describe("agent-studio-bases.ts — table integrity", () => {
  const src = read(TABLE);

  it("declares ags_bases table", () => {
    expect(src).toMatch(/pgTable\(\s*"ags_bases"/);
  });

  it("declares ags_base_columns table", () => {
    expect(src).toMatch(/pgTable\(\s*"ags_base_columns"/);
  });

  it("declares ags_base_rows table", () => {
    expect(src).toMatch(/pgTable\(\s*"ags_base_rows"/);
  });

  it("declares the 7-value AGS_BASE_COLUMN_DATA_TYPES `as const` array", () => {
    expect(src).toMatch(
      /AGS_BASE_COLUMN_DATA_TYPES\s*=\s*\[\s*[\s\S]*?"note_link"[\s\S]*?\]\s*as\s+const/,
    );
  });

  it("ags_base_columns enforces a unique (baseId, key) index", () => {
    expect(src).toMatch(
      /uniqueIndex\("idx_ags_base_columns_key"\)\.on\(t\.baseId,\s*t\.key\)/,
    );
  });

  it("ags_base_rows.cells column is non-null JSON", () => {
    expect(src).toMatch(/cells:\s*json\("cells"\)[\s\S]*?\.notNull\(\)/);
  });

  it("ags_base_rows has an idx for note linkage", () => {
    expect(src).toMatch(
      /index\("idx_ags_base_rows_note"\)\.on\(t\.noteId\)/,
    );
  });
});

// ────────────────────────────────────────────────────────────────────
// Reconciler registration
// ────────────────────────────────────────────────────────────────────

describe("reconciler registration", () => {
  it("schema.ts re-exports the bases table module", () => {
    expect(read(SCHEMA)).toMatch(
      /export \* from ['"]\.\/tables\/agent-studio-bases['"]/,
    );
  });

  it("seed.ts imports agsBasesSchema and spreads it into combinedSchema", () => {
    const src = read(SEED);
    expect(src).toMatch(
      /import \* as agsBasesSchema from ["']\.\.\/\.\.\/\.\.\/drizzle\/tables\/agent-studio-bases["']/,
    );
    expect(src).toMatch(/\.\.\.agsBasesSchema,/);
  });
});

// ────────────────────────────────────────────────────────────────────
// Service hard-rule compliance
// ────────────────────────────────────────────────────────────────────

describe("bases-service — hard-rule compliance", () => {
  const src = read(SERVICE);
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");

  it("does not import neo4j-driver", () => {
    expect(stripped).not.toMatch(/from\s+["']neo4j-driver["']/);
  });

  it("does not import openrouter", () => {
    expect(stripped).not.toMatch(/from\s+["'][^"']*openrouter[^"']*["']/);
  });

  it("does not call dispatchMcpToolCall", () => {
    expect(stripped).not.toMatch(/\bdispatchMcpToolCall\s*\(/);
  });

  it("does not read process.env.*_API_KEY", () => {
    expect(stripped).not.toMatch(/process\.env\.[A-Z0-9_]*_API_KEY/);
  });
});

// ────────────────────────────────────────────────────────────────────
// Router source-scan + mount
// ────────────────────────────────────────────────────────────────────

describe("bases-router — source-scan", () => {
  const src = read(ROUTER_MODULE);

  it("z-enums dataType against AGS_BASE_COLUMN_DATA_TYPES", () => {
    expect(src).toMatch(/z\.enum\(AGS_BASE_COLUMN_DATA_TYPES\)/);
  });

  it("does NOT directly touch the agsBases / agsBaseColumns / agsBaseRows tables", () => {
    // Router must route through the service; direct drizzle inserts
    // would indicate a bypass.
    expect(src).not.toMatch(/from\s+["'][^"']*tables\/agent-studio-bases/);
    expect(src).not.toMatch(/db\.insert\(\s*agsBase/);
  });

  it("exposes all 8 procedures (create, list, getSnapshot, update, createColumn, listColumns, createRow, updateRow, listRows)", () => {
    for (const proc of [
      "create:",
      "list:",
      "getSnapshot:",
      "update:",
      "createColumn:",
      "listColumns:",
      "createRow:",
      "updateRow:",
      "listRows:",
    ]) {
      expect(src, `router must expose ${proc}`).toMatch(proc);
    }
  });

  it("maps BaseNotFoundError → NOT_FOUND", () => {
    expect(src).toMatch(/BaseNotFoundError[\s\S]*?code:\s*"NOT_FOUND"/);
  });

  it("maps BaseRowUnknownColumnsError → BAD_REQUEST", () => {
    expect(src).toMatch(
      /BaseRowUnknownColumnsError[\s\S]*?code:\s*"BAD_REQUEST"/,
    );
  });
});

describe("agentStudioRouter mount", () => {
  const src = read(API_ROUTER);

  it("imports basesRouter from the bases service", () => {
    expect(src).toMatch(
      /import\s*\{\s*basesRouter\s*\}\s*from\s*["']\.\.\/services\/bases\/bases-router["']/,
    );
  });

  it("mounts basesRouter at `bases:` key", () => {
    expect(src).toMatch(/^\s*bases:\s*basesRouter,/m);
  });
});

// ────────────────────────────────────────────────────────────────────
// Public-api barrel completeness
// ────────────────────────────────────────────────────────────────────

describe("public-api barrel", () => {
  const src = read(PUBLIC_API);
  it("re-exports the canonical service surface", () => {
    for (const sym of [
      "createBase",
      "listBases",
      "getBaseSnapshot",
      "updateBase",
      "createBaseColumn",
      "createBaseRow",
      "updateBaseRow",
      "BaseRowUnknownColumnsError",
      "AGS_BASE_COLUMN_DATA_TYPES",
      "isAgsBaseColumnDataType",
      "AsdbUnavailableError",
      "BaseNotFoundError",
      "BaseColumnDataTypeError",
      "BaseRowNotFoundError",
    ]) {
      expect(src, `barrel must re-export ${sym}`).toMatch(
        new RegExp(`\\b${sym}\\b`),
      );
    }
  });
});
