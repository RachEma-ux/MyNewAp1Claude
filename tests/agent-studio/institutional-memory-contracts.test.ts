/**
 * Institutional Memory Lens contracts — Phase 25 §T-G.1.
 *
 * Tests the 13-node-type closed taxonomy + SoT mapping. Concrete
 * lens-runner that reads from the mapped tables lands in T-G.1.b.
 */

import { describe, it, expect } from "vitest";
import {
  INSTITUTIONAL_MEMORY_NODE_TYPES,
  INSTITUTIONAL_MEMORY_SOURCE_MAPPING,
  isInstitutionalMemoryNodeType,
  listMappedInstitutionalMemoryNodeTypes,
  listUnmappedInstitutionalMemoryNodeTypes,
} from "../../server/agent-studio/services/institutional-memory/public-api";

describe("Closed institutional-memory node-type taxonomy", () => {
  it("contains exactly 13 roadmap-named types", () => {
    expect([...INSTITUTIONAL_MEMORY_NODE_TYPES]).toEqual([
      "person",
      "team",
      "project",
      "system",
      "service",
      "decision",
      "policy",
      "workflow",
      "document",
      "outcome",
      "responsibility",
      "timeline_event",
      "governance_record",
    ]);
  });

  it("isInstitutionalMemoryNodeType narrows to closed taxonomy", () => {
    expect(isInstitutionalMemoryNodeType("person")).toBe(true);
    expect(isInstitutionalMemoryNodeType("governance_record")).toBe(true);
    expect(isInstitutionalMemoryNodeType("custom_type")).toBe(false);
    expect(isInstitutionalMemoryNodeType(42)).toBe(false);
    expect(isInstitutionalMemoryNodeType(undefined)).toBe(false);
  });

  it("ids are unique", () => {
    expect(new Set(INSTITUTIONAL_MEMORY_NODE_TYPES).size).toBe(
      INSTITUTIONAL_MEMORY_NODE_TYPES.length,
    );
  });
});

describe("Source-table mapping coverage", () => {
  it("every node type has a mapping entry", () => {
    for (const t of INSTITUTIONAL_MEMORY_NODE_TYPES) {
      expect(INSTITUTIONAL_MEMORY_SOURCE_MAPPING[t]).toBeDefined();
    }
  });

  it("mapped types point to real existing tables", () => {
    const expected = new Map<string, string>([
      ["person", "users"],
      ["team", "workspace_members"],
      ["project", "workspaces"],
      ["decision", "ags_approval_steps"],
      ["policy", "ags_governance_records"],
      ["workflow", "workflows"],
      ["document", "ags_vault_notes"],
      ["outcome", "ags_runtime_runs"],
      ["timeline_event", "ags_runtime_runs"],
      ["governance_record", "ags_governance_records"],
    ]);
    for (const [type, table] of expected.entries()) {
      expect(
        INSTITUTIONAL_MEMORY_SOURCE_MAPPING[
          type as keyof typeof INSTITUTIONAL_MEMORY_SOURCE_MAPPING
        ].sourceTable,
      ).toBe(table);
    }
  });

  it("system / service / responsibility / team-id are stubs (null mappings) pending Phase 25.x SoT tables", () => {
    expect(INSTITUTIONAL_MEMORY_SOURCE_MAPPING.system.sourceTable).toBe(null);
    expect(INSTITUTIONAL_MEMORY_SOURCE_MAPPING.service.sourceTable).toBe(null);
    expect(INSTITUTIONAL_MEMORY_SOURCE_MAPPING.responsibility.sourceTable).toBe(
      null,
    );
    // Team has a synthesized source (workspace_members) but no
    // first-class id column — still considered unmapped for our
    // coverage purposes because the lens-runner needs a real id.
    expect(INSTITUTIONAL_MEMORY_SOURCE_MAPPING.team.idColumn).toBe(null);
  });

  it("every mapping carries a `notes` field documenting the projection", () => {
    for (const t of INSTITUTIONAL_MEMORY_NODE_TYPES) {
      const mapping = INSTITUTIONAL_MEMORY_SOURCE_MAPPING[t];
      expect(typeof mapping.notes).toBe("string");
      expect((mapping.notes as string).length).toBeGreaterThan(20);
    }
  });

  it("policy and governance_record point to same table with different label-scope (lens-runner emits two nodes per row)", () => {
    expect(INSTITUTIONAL_MEMORY_SOURCE_MAPPING.policy.sourceTable).toBe(
      INSTITUTIONAL_MEMORY_SOURCE_MAPPING.governance_record.sourceTable,
    );
  });

  it("outcome and timeline_event point to ags_runtime_runs (timeline unions in lens-runner)", () => {
    expect(INSTITUTIONAL_MEMORY_SOURCE_MAPPING.outcome.sourceTable).toBe(
      "ags_runtime_runs",
    );
    expect(
      INSTITUTIONAL_MEMORY_SOURCE_MAPPING.timeline_event.sourceTable,
    ).toBe("ags_runtime_runs");
  });
});

describe("Coverage helpers", () => {
  it("listMappedInstitutionalMemoryNodeTypes returns types with non-null sourceTable", () => {
    const mapped = listMappedInstitutionalMemoryNodeTypes();
    expect(mapped).toContain("person");
    expect(mapped).toContain("decision");
    expect(mapped).not.toContain("system");
    expect(mapped).not.toContain("service");
  });

  it("listUnmappedInstitutionalMemoryNodeTypes returns types with null sourceTable", () => {
    const unmapped = listUnmappedInstitutionalMemoryNodeTypes();
    expect(unmapped).toContain("system");
    expect(unmapped).toContain("service");
    expect(unmapped).toContain("responsibility");
    expect(unmapped).not.toContain("person");
  });

  it("mapped + unmapped partition is exhaustive and disjoint", () => {
    const mapped = new Set(listMappedInstitutionalMemoryNodeTypes());
    const unmapped = new Set(listUnmappedInstitutionalMemoryNodeTypes());
    expect(mapped.size + unmapped.size).toBe(
      INSTITUTIONAL_MEMORY_NODE_TYPES.length,
    );
    for (const t of INSTITUTIONAL_MEMORY_NODE_TYPES) {
      expect(mapped.has(t) || unmapped.has(t)).toBe(true);
      expect(mapped.has(t) && unmapped.has(t)).toBe(false);
    }
  });

  it("at least 9 of 13 types are mapped (real coverage gate — falls below this = regression)", () => {
    expect(listMappedInstitutionalMemoryNodeTypes().length).toBeGreaterThanOrEqual(9);
  });
});
