/**
 * Phase 25 §T-G.14 — institutional-memory coverage summary lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  INSTITUTIONAL_MEMORY_NODE_TYPES,
  listMappedInstitutionalMemoryNodeTypes,
  listUnmappedInstitutionalMemoryNodeTypes,
  summarizeInstitutionalMemoryCoverage,
} from "../../server/agent-studio/services/institutional-memory/public-api.js";

describe("summarizeInstitutionalMemoryCoverage (T-G.14)", () => {
  it("returns total matching INSTITUTIONAL_MEMORY_NODE_TYPES.length", () => {
    const s = summarizeInstitutionalMemoryCoverage();
    expect(s.total).toBe(INSTITUTIONAL_MEMORY_NODE_TYPES.length);
  });

  it("mapped + unmapped sums to total", () => {
    const s = summarizeInstitutionalMemoryCoverage();
    expect(s.mapped + s.unmapped).toBe(s.total);
  });

  it("mapped matches listMappedInstitutionalMemoryNodeTypes().length", () => {
    const s = summarizeInstitutionalMemoryCoverage();
    expect(s.mapped).toBe(listMappedInstitutionalMemoryNodeTypes().length);
  });

  it("unmapped matches listUnmappedInstitutionalMemoryNodeTypes().length", () => {
    const s = summarizeInstitutionalMemoryCoverage();
    expect(s.unmapped).toBe(
      listUnmappedInstitutionalMemoryNodeTypes().length,
    );
  });

  it("coveragePercent is in [0, 100]", () => {
    const s = summarizeInstitutionalMemoryCoverage();
    expect(s.coveragePercent).toBeGreaterThanOrEqual(0);
    expect(s.coveragePercent).toBeLessThanOrEqual(100);
  });

  it("coveragePercent rounds to 1 decimal", () => {
    const s = summarizeInstitutionalMemoryCoverage();
    const rounded = Math.round(s.coveragePercent * 10) / 10;
    expect(s.coveragePercent).toBe(rounded);
  });

  it("coveragePercent equals 100 * mapped / total (within 0.1)", () => {
    const s = summarizeInstitutionalMemoryCoverage();
    const expected =
      s.total === 0 ? 0 : Math.round((s.mapped / s.total) * 1000) / 10;
    expect(s.coveragePercent).toBe(expected);
  });

  it("is pure — returns the same value across calls", () => {
    const a = summarizeInstitutionalMemoryCoverage();
    const b = summarizeInstitutionalMemoryCoverage();
    expect(a).toEqual(b);
  });
});
