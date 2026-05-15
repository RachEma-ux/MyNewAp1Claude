/**
 * Phase 21 catalog gap #18 — `timeline_event` projection-helper readiness.
 *
 * The Phase 21 §7.3 refresh (#1021) marked gap #18 (graph-temporal-
 * observations) as "projection helper shipped @ #1010; only runtime
 * caller remains." This test locks that claim: the
 * `projectInstitutionalMemoryNode` helper is exported, callable with
 * `timeline_event` as the node-type, and produces a properly-shaped
 * projection when fed a representative `ags_runtime_runs`-shaped
 * row.
 *
 * If a future PR breaks the projection helper for `timeline_event`,
 * this test trips BEFORE the catalog claim becomes stale.
 */

import { describe, it, expect } from "vitest";
import {
  projectInstitutionalMemoryNode,
  isInstitutionalMemoryMappable,
  INSTITUTIONAL_MEMORY_SOURCE_MAPPING,
} from "../../server/agent-studio/services/institutional-memory/public-api";

describe("Phase 21 gap #18 — timeline_event projection-helper readiness", () => {
  it("timeline_event is mapped to a SoT table (per #994 contract)", () => {
    expect(isInstitutionalMemoryMappable("timeline_event")).toBe(true);
    expect(
      INSTITUTIONAL_MEMORY_SOURCE_MAPPING["timeline_event"].sourceTable,
    ).not.toBe(null);
    expect(
      INSTITUTIONAL_MEMORY_SOURCE_MAPPING["timeline_event"].idColumn,
    ).not.toBe(null);
    expect(
      INSTITUTIONAL_MEMORY_SOURCE_MAPPING["timeline_event"].labelColumn,
    ).not.toBe(null);
  });

  it("projects a representative ags_runtime_runs row into a timeline_event node", () => {
    // ags_runtime_runs row shape — the existing institutional-memory
    // contract maps timeline_event → ags_runtime_runs with idColumn=id
    // and labelColumn=agent_key.
    const runtimeRunRow = {
      id: 42,
      agent_key: "graph-agent-lite",
      created_at: new Date("2026-05-15T18:00:00Z"),
      final_status: "completed",
    };
    const projected = projectInstitutionalMemoryNode(
      "timeline_event",
      runtimeRunRow,
    );
    expect(projected).not.toBe(null);
    expect(projected).toEqual({
      typeKey: "timeline_event",
      id: "42",
      label: "graph-agent-lite",
    });
  });

  it("projects multiple runtime-run rows into timeline_event nodes in order", () => {
    const rows = [
      { id: 1, agent_key: "graph-agent-lite", created_at: new Date() },
      { id: 2, agent_key: "graph-quality-agent", created_at: new Date() },
      { id: 3, agent_key: "graph-quality-agent", created_at: new Date() },
    ];
    const projected = rows.map((r) =>
      projectInstitutionalMemoryNode("timeline_event", r),
    );
    expect(projected.every((p) => p !== null)).toBe(true);
    expect(projected.map((p) => p!.id)).toEqual(["1", "2", "3"]);
  });

  it("returns null for rows missing required columns (caught by skip-reason)", () => {
    // ags_runtime_runs row WITHOUT agent_key — labelColumn missing
    expect(
      projectInstitutionalMemoryNode("timeline_event", {
        id: 99,
        created_at: new Date(),
      }),
    ).toBe(null);
    // ags_runtime_runs row without id — idColumn missing
    expect(
      projectInstitutionalMemoryNode("timeline_event", {
        agent_key: "test",
      }),
    ).toBe(null);
  });

  it("gap closure note in Phase 21 catalog references #1010", () => {
    // Cross-doc consistency check: if a future PR claims to close
    // the projection helper, the catalog still attributes the
    // helper shipment to #1010. This is a soft assertion — the
    // numeric reference must be in the catalog file because the
    // §7.3 row says "Projection helper shipped @ #1010".
    const { readFileSync } = require("fs");
    const { resolve } = require("path");
    const catalog = readFileSync(
      resolve(
        __dirname,
        "../../docs/implementation/agent-studio-phase-21-continuous-graph-testing-catalog.md",
      ),
      "utf8",
    );
    expect(catalog).toContain("Projection helper shipped @ #1010");
  });
});
