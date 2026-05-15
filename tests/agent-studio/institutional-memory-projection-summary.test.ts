/**
 * Phase 25 §T-G.22 — summarizeInstitutionalMemoryProjectionResult lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  INSTITUTIONAL_MEMORY_PROJECTION_SKIP_REASONS,
  projectInstitutionalMemoryNodes,
  summarizeInstitutionalMemoryProjectionResult,
} from "../../server/agent-studio/services/institutional-memory/public-api.js";

describe("summarizeInstitutionalMemoryProjectionResult (T-G.22)", () => {
  it("empty result → all zeros + 0% (no NaN)", () => {
    const s = summarizeInstitutionalMemoryProjectionResult({
      nodes: [],
      skippedByReason: {
        node_type_not_mapped_to_source_table: 0,
        row_missing_id_column: 0,
        row_missing_label_column: 0,
        row_id_not_stringifiable: 0,
      },
    });
    expect(s.totalRows).toBe(0);
    expect(s.projected).toBe(0);
    expect(s.skipped).toBe(0);
    expect(s.projectedPercent).toBe(0);
  });

  it("counts projected nodes correctly", () => {
    // person mapping projects from `users` table id+name
    const r = projectInstitutionalMemoryNodes("person", [
      { id: 1, username: "Alice" },
      { id: 2, username: "Bob" },
    ]);
    const s = summarizeInstitutionalMemoryProjectionResult(r);
    expect(s.projected).toBe(2);
    expect(s.skipped).toBe(0);
    expect(s.totalRows).toBe(2);
    expect(s.projectedPercent).toBe(100);
  });

  it("counts skipped-by-reason correctly when rows are malformed", () => {
    const r = projectInstitutionalMemoryNodes("person", [
      { id: 1, username: "Alice" },         // projected
      { username: "no_id" },                // row_missing_id_column
      { id: 2 },                        // row_missing_label_column
      { id: { obj: true }, username: "x" }, // row_id_not_stringifiable
    ]);
    const s = summarizeInstitutionalMemoryProjectionResult(r);
    expect(s.projected).toBe(1);
    expect(s.skipped).toBe(3);
    expect(s.totalRows).toBe(4);
    expect(s.skippedByReason.row_missing_id_column).toBe(1);
    expect(s.skippedByReason.row_missing_label_column).toBe(1);
    expect(s.skippedByReason.row_id_not_stringifiable).toBe(1);
  });

  it("projected + skipped == totalRows", () => {
    const r = projectInstitutionalMemoryNodes("person", [
      { id: 1, username: "Alice" },
      { username: "Bob" },
    ]);
    const s = summarizeInstitutionalMemoryProjectionResult(r);
    expect(s.projected + s.skipped).toBe(s.totalRows);
  });

  it("Σ skippedByReason == skipped", () => {
    const r = projectInstitutionalMemoryNodes("person", [
      { username: "no_id" },
      { id: 1 },
    ]);
    const s = summarizeInstitutionalMemoryProjectionResult(r);
    const sum = Object.values(s.skippedByReason).reduce((a, b) => a + b, 0);
    expect(sum).toBe(s.skipped);
  });

  it("projectedPercent has 1-decimal precision", () => {
    const r = projectInstitutionalMemoryNodes("person", [
      { id: 1, username: "a" },
      { id: 2, username: "b" },
      { username: "x" }, // skipped
    ]);
    const s = summarizeInstitutionalMemoryProjectionResult(r);
    // 2/3 = 66.666... rounded to 66.7
    expect(s.projectedPercent).toBe(66.7);
  });

  it("projectedPercent in [0, 100]", () => {
    const r = projectInstitutionalMemoryNodes("person", [
      { id: 1, username: "a" },
    ]);
    const s = summarizeInstitutionalMemoryProjectionResult(r);
    expect(s.projectedPercent).toBeGreaterThanOrEqual(0);
    expect(s.projectedPercent).toBeLessThanOrEqual(100);
  });

  it("stable-shape skippedByReason: every closed reason keyed", () => {
    const r = projectInstitutionalMemoryNodes("person", [
      { id: 1, username: "a" },
    ]);
    const s = summarizeInstitutionalMemoryProjectionResult(r);
    for (const reason of INSTITUTIONAL_MEMORY_PROJECTION_SKIP_REASONS) {
      expect(s.skippedByReason[reason]).toBeGreaterThanOrEqual(0);
    }
    expect(Object.keys(s.skippedByReason).length).toBe(
      INSTITUTIONAL_MEMORY_PROJECTION_SKIP_REASONS.length,
    );
  });
});
