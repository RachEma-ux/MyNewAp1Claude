/**
 * Phase 16 §5-§7 — view-kind blueprint tests.
 *
 * Pure data + helper tests. No DB. Closes:
 *   - Entity views work
 *   - Runtime asset views work
 *   - Projection status views work
 */

import { describe, it, expect } from "vitest";
import {
  VIEW_KIND_BLUEPRINTS,
  getViewKindBlueprint,
  listViewKindBlueprints,
} from "../../server/agent-studio/services/vault/view-kind-blueprints";

const EXPECTED_KINDS = [
  "note_list",
  "entity_list",
  "runtime_asset_list",
  "graph_quality",
  "projection_status",
] as const;

describe("VIEW_KIND_BLUEPRINTS — Phase 16 §5-§7", () => {
  it("registers the 5 canonical view kinds", () => {
    const kinds = VIEW_KIND_BLUEPRINTS.map((b) => b.viewKind).sort();
    const expected = [...EXPECTED_KINDS].sort();
    expect(kinds).toEqual(expected);
  });

  it("every blueprint has non-empty defaultColumns + dataSource + displayName", () => {
    for (const b of VIEW_KIND_BLUEPRINTS) {
      expect(b.displayName.length).toBeGreaterThan(0);
      expect(b.defaultColumns.length).toBeGreaterThan(0);
      expect(b.dataSource.length).toBeGreaterThan(0);
    }
  });

  it("viewKind values are unique", () => {
    const kinds = VIEW_KIND_BLUEPRINTS.map((b) => b.viewKind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it("entity_list blueprint targets graph_entities + carries entity columns", () => {
    const b = getViewKindBlueprint("entity_list");
    expect(b).not.toBeNull();
    expect(b!.dataSource).toBe("graph_entities");
    expect(b!.defaultColumns).toContain("entityKey");
    expect(b!.defaultColumns).toContain("typeKey");
  });

  it("runtime_asset_list blueprint targets runtime_runs + carries trace columns", () => {
    const b = getViewKindBlueprint("runtime_asset_list");
    expect(b).not.toBeNull();
    expect(b!.dataSource).toBe("runtime_runs");
    expect(b!.defaultColumns).toContain("status");
    expect(b!.defaultColumns).toContain("durationMs");
  });

  it("projection_status blueprint targets graph_projection_jobs", () => {
    const b = getViewKindBlueprint("projection_status");
    expect(b).not.toBeNull();
    expect(b!.dataSource).toBe("graph_projection_jobs");
    expect(b!.defaultColumns).toContain("lastSyncAt");
  });

  it("getViewKindBlueprint returns null for unknown kinds", () => {
    expect(getViewKindBlueprint("nonexistent")).toBeNull();
  });

  it("listViewKindBlueprints returns the readonly array", () => {
    const list = listViewKindBlueprints();
    expect(list.length).toBe(EXPECTED_KINDS.length);
  });
});
