/**
 * Phase 25 §T-G.32 — institutional-memory projection skip-reason metadata
 * lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  INSTITUTIONAL_MEMORY_PROJECTION_SKIP_REASONS,
  INSTITUTIONAL_MEMORY_PROJECTION_SKIP_REASON_METADATA,
  getInstitutionalMemoryProjectionSkipReasonMetadata,
} from "../../server/agent-studio/services/institutional-memory/public-api.js";

describe("INSTITUTIONAL_MEMORY_PROJECTION_SKIP_REASON_METADATA (T-G.32)", () => {
  it("has metadata for every closed-taxonomy reason", () => {
    for (const r of INSTITUTIONAL_MEMORY_PROJECTION_SKIP_REASONS) {
      expect(
        INSTITUTIONAL_MEMORY_PROJECTION_SKIP_REASON_METADATA[r],
      ).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(
      Object.keys(INSTITUTIONAL_MEMORY_PROJECTION_SKIP_REASON_METADATA).length,
    ).toBe(INSTITUTIONAL_MEMORY_PROJECTION_SKIP_REASONS.length);
  });

  it.each(INSTITUTIONAL_MEMORY_PROJECTION_SKIP_REASONS)(
    "%s has non-empty label + description + remediation + valid classification",
    (r) => {
      const m = INSTITUTIONAL_MEMORY_PROJECTION_SKIP_REASON_METADATA[r];
      expect(m.label.length).toBeGreaterThan(2);
      expect(m.description.length).toBeGreaterThan(20);
      expect(m.remediation.length).toBeGreaterThan(20);
      expect([
        "taxonomy_gap",
        "source_row_defect",
        "source_schema_drift",
      ]).toContain(m.classification);
    },
  );

  it.each(INSTITUTIONAL_MEMORY_PROJECTION_SKIP_REASONS)(
    "getInstitutionalMemoryProjectionSkipReasonMetadata(%s) returns table entry",
    (r) => {
      expect(getInstitutionalMemoryProjectionSkipReasonMetadata(r)).toBe(
        INSTITUTIONAL_MEMORY_PROJECTION_SKIP_REASON_METADATA[r],
      );
    },
  );

  it("classification taxonomy is fully covered (every class has ≥1 reason)", () => {
    const used = new Set<string>();
    for (const r of INSTITUTIONAL_MEMORY_PROJECTION_SKIP_REASONS) {
      used.add(
        INSTITUTIONAL_MEMORY_PROJECTION_SKIP_REASON_METADATA[r].classification,
      );
    }
    expect(used.has("taxonomy_gap")).toBe(true);
    expect(used.has("source_row_defect")).toBe(true);
    expect(used.has("source_schema_drift")).toBe(true);
  });

  it("only node_type_not_mapped_to_source_table is taxonomy_gap", () => {
    expect(
      INSTITUTIONAL_MEMORY_PROJECTION_SKIP_REASON_METADATA
        .node_type_not_mapped_to_source_table.classification,
    ).toBe("taxonomy_gap");
  });

  it("only row_id_not_stringifiable is source_schema_drift", () => {
    expect(
      INSTITUTIONAL_MEMORY_PROJECTION_SKIP_REASON_METADATA
        .row_id_not_stringifiable.classification,
    ).toBe("source_schema_drift");
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const r of INSTITUTIONAL_MEMORY_PROJECTION_SKIP_REASONS) {
      labels.add(
        INSTITUTIONAL_MEMORY_PROJECTION_SKIP_REASON_METADATA[r].label,
      );
    }
    expect(labels.size).toBe(
      INSTITUTIONAL_MEMORY_PROJECTION_SKIP_REASONS.length,
    );
  });
});
