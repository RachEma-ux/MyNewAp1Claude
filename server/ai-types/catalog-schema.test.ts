/**
 * Phase 23 — catalog_entries schema verification.
 *
 * Asserts the catalog_entries Drizzle table definition has every
 * column the Plan v3 spec requires. This is a structural test —
 * it doesn't touch a real database; it inspects the table's
 * `_.columns` introspection map that Drizzle exposes.
 */

import { describe, it, expect } from "vitest";
import { catalogEntries } from "../../drizzle/tables/catalog";

const COLUMNS = (catalogEntries as any)[Symbol.for("drizzle:Columns")] ?? {};
const COLUMN_NAMES = new Set(Object.keys(COLUMNS));

function assertColumn(name: string) {
  expect(
    COLUMN_NAMES.has(name),
    `catalog_entries is missing column "${name}"`,
  ).toBe(true);
}

describe("catalog_entries — Phase 23 spec columns", () => {
  it("has entryType (entry-of-record discriminator)", () => {
    assertColumn("entryType");
  });

  it("has sourceType (source module / kind)", () => {
    assertColumn("sourceType");
  });

  it("has sourceId (source domain row pointer)", () => {
    assertColumn("sourceId");
  });

  it("has activeSourceVersionId (Phase 23 — versioned source pointer)", () => {
    assertColumn("activeSourceVersionId");
  });

  it("has legacyImportState (Phase 23 — legacy classification)", () => {
    assertColumn("legacyImportState");
  });

  it("has both sourceType and sourceId so (sourceType, sourceId) is queryable", () => {
    // The composite index `idx_catalog_entry_source` is defined in
    // drizzle/tables/catalog.ts; rather than introspect Drizzle's
    // private index config (which has changed shape across versions),
    // we assert the underlying columns it indexes are both present.
    assertColumn("sourceType");
    assertColumn("sourceId");
  });
});
