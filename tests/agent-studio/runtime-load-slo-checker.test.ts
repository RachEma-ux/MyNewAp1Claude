/**
 * Phase 12 (Roadmap V3) — runtime load certification: checker tests.
 *
 * Unit tests for the percentile math and the per-SLO assessment
 * logic. Pure synthetic inputs — no live load harness required.
 *
 * The checker is the load-bearing claim of Phase 12: given any
 * `LoadReportInput`, the assessment is deterministic and matches
 * the SLO doc. If a future SLO threshold tightens, this test fails
 * and the doc + checker update in lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  percentile,
  p50,
  p95,
  p99,
  mean,
  summarize,
  linearSlope,
} from "../../scripts/load/lib/metrics";
import { assessLoadReport, SLO_TARGETS } from "../../scripts/load/lib/slo-checker";
import { formatLoadReport } from "../../scripts/load/lib/report-formatter";
import type { LoadReportInput } from "../../scripts/load/lib/types";

describe("Phase 12 — load certification metrics math", () => {
  it("percentile of empty array is NaN (callers handle as UNKNOWN)", () => {
    expect(Number.isNaN(percentile([], 95))).toBe(true);
  });

  it("percentile of single sample returns the sample", () => {
    expect(percentile([42], 95)).toBe(42);
  });

  it("p50 / p95 / p99 of [1..100] match canonical interpolated values", () => {
    const samples = Array.from({ length: 100 }, (_, i) => i + 1);
    // Linear interpolation between order statistics:
    // p50 → rank 49.5 → between samples[49]=50 and samples[50]=51 → 50.5
    expect(p50(samples)).toBeCloseTo(50.5, 5);
    // p95 → rank 94.05 → between samples[94]=95 and samples[95]=96 → 95.05
    expect(p95(samples)).toBeCloseTo(95.05, 5);
    // p99 → rank 98.01 → between samples[98]=99 and samples[99]=100 → 99.01
    expect(p99(samples)).toBeCloseTo(99.01, 5);
  });

  it("percentile is invariant to input order (sorted internally)", () => {
    const a = p95([1, 5, 3, 9, 2, 4, 8, 6, 7]);
    const b = p95([9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(a).toBeCloseTo(b, 10);
  });

  it("rejects out-of-range p", () => {
    expect(() => percentile([1, 2], -1)).toThrow(/percentile p/);
    expect(() => percentile([1, 2], 101)).toThrow(/percentile p/);
  });

  it("mean handles empty + single-element correctly", () => {
    expect(Number.isNaN(mean([]))).toBe(true);
    expect(mean([7])).toBe(7);
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });

  it("summarize emits zeros / NaN when empty", () => {
    const s = summarize([]);
    expect(s.count).toBe(0);
    expect(Number.isNaN(s.p95)).toBe(true);
  });

  it("summarize captures min, max, count correctly", () => {
    const s = summarize([5, 1, 9, 3, 7]);
    expect(s.count).toBe(5);
    expect(s.min).toBe(1);
    expect(s.max).toBe(9);
  });

  it("linearSlope returns NaN for arrays of length < 2", () => {
    expect(Number.isNaN(linearSlope([]))).toBe(true);
    expect(Number.isNaN(linearSlope([42]))).toBe(true);
  });

  it("linearSlope detects upward trend (memory leak case)", () => {
    // y = 2x → slope 2
    const samples = [0, 2, 4, 6, 8, 10];
    expect(linearSlope(samples)).toBeCloseTo(2, 5);
  });

  it("linearSlope of flat data is 0 (clean stream)", () => {
    expect(linearSlope([100, 100, 100, 100])).toBeCloseTo(0, 5);
  });
});

describe("Phase 12 — SLO checker per-SLO assessments", () => {
  const baseInput = (): LoadReportInput => ({
    timestamp: "2026-05-10T14:30:00Z",
    environment: "test",
  });

  it("S1 PASS when peak concurrent ≥ 25", () => {
    const r = assessLoadReport({
      ...baseInput(),
      noToolStreams: {
        scenarioId: "ramp",
        peakConcurrent: 27,
        sustainedMs: 60000,
        totalDurationMs: 180000,
      },
    });
    const s1 = r.assessments.find((a) => a.sloId === "S1");
    expect(s1?.verdict).toBe("PASS");
  });

  it("S1 FAIL when peak below target", () => {
    const r = assessLoadReport({
      ...baseInput(),
      noToolStreams: {
        scenarioId: "ramp",
        peakConcurrent: 18,
        sustainedMs: 60000,
        totalDurationMs: 180000,
      },
    });
    const s1 = r.assessments.find((a) => a.sloId === "S1");
    expect(s1?.verdict).toBe("FAIL");
    expect(s1?.reason).toMatch(/18.*<.*25/);
  });

  it("S1 UNKNOWN when capture missing (NOT implicit PASS)", () => {
    const r = assessLoadReport(baseInput());
    const s1 = r.assessments.find((a) => a.sloId === "S1");
    expect(s1?.verdict).toBe("UNKNOWN");
  });

  it("S2 PASS when first-token p95 < 5s", () => {
    const r = assessLoadReport({
      ...baseInput(),
      firstTokenLatency: {
        scenarioId: "ramp",
        samplesMs: [800, 900, 1000, 1100, 1200, 1500, 2000, 3000, 4000, 4900],
      },
    });
    const s2 = r.assessments.find((a) => a.sloId === "S2");
    expect(s2?.verdict).toBe("PASS");
  });

  it("S2 FAIL when p95 ≥ 5s", () => {
    const r = assessLoadReport({
      ...baseInput(),
      firstTokenLatency: {
        scenarioId: "ramp",
        // 100 samples, the top 5% all exceed 5000ms
        samplesMs: [
          ...Array.from({ length: 90 }, () => 1000),
          ...Array.from({ length: 10 }, () => 6000),
        ],
      },
    });
    const s2 = r.assessments.find((a) => a.sloId === "S2");
    expect(s2?.verdict).toBe("FAIL");
  });

  it("S4 PASS for ≥100 rows/min throughput", () => {
    const r = assessLoadReport({
      ...baseInput(),
      traceThroughput: {
        scenarioId: "storm",
        eventCount: 600,
        windowMs: 300000, // 5 min → 120/min
      },
    });
    const s4 = r.assessments.find((a) => a.sloId === "S4");
    expect(s4?.verdict).toBe("PASS");
    expect(s4?.observed).toMatch(/120/);
  });

  it("S4 FAIL when rate too low", () => {
    const r = assessLoadReport({
      ...baseInput(),
      traceThroughput: { scenarioId: "storm", eventCount: 200, windowMs: 300000 },
    });
    const s4 = r.assessments.find((a) => a.sloId === "S4");
    expect(s4?.verdict).toBe("FAIL");
  });

  it("S5 PASS when memory slope is flat across full 2-min window", () => {
    const r = assessLoadReport({
      ...baseInput(),
      longRunMemory: {
        scenarioId: "long-run",
        // 60 samples of stable RSS over 2 min
        rssBytes: Array.from({ length: 60 }, () => 100_000_000),
        windowMs: 120_000,
      },
    });
    const s5 = r.assessments.find((a) => a.sloId === "S5");
    expect(s5?.verdict).toBe("PASS");
  });

  it("S5 FAIL on aggressive upward slope (memory leak)", () => {
    const r = assessLoadReport({
      ...baseInput(),
      longRunMemory: {
        scenarioId: "long-run",
        // Linear growth: 100MB → 1GB across 60 samples in 120s
        // = 15MB/sample = 7.5MB/sec → way over 1MB/s tolerance
        rssBytes: Array.from(
          { length: 60 },
          (_, i) => 100_000_000 + i * 15_000_000,
        ),
        windowMs: 120_000,
      },
    });
    const s5 = r.assessments.find((a) => a.sloId === "S5");
    expect(s5?.verdict).toBe("FAIL");
    expect(s5?.reason).toMatch(/slope/i);
  });

  it("S5 UNKNOWN when window < 2min (insufficient evidence)", () => {
    const r = assessLoadReport({
      ...baseInput(),
      longRunMemory: {
        scenarioId: "short",
        rssBytes: [100, 100, 100, 100],
        windowMs: 30_000, // only 30s — not enough
      },
    });
    const s5 = r.assessments.find((a) => a.sloId === "S5");
    expect(s5?.verdict).toBe("UNKNOWN");
  });

  it("S6 PASS when 100% of disconnects flagged", () => {
    const r = assessLoadReport({
      ...baseInput(),
      clientDisconnects: { scenarioId: "storm", expected: 80, observed: 80 },
    });
    const s6 = r.assessments.find((a) => a.sloId === "S6");
    expect(s6?.verdict).toBe("PASS");
  });

  it("S6 FAIL when disconnect flagging incomplete", () => {
    const r = assessLoadReport({
      ...baseInput(),
      clientDisconnects: { scenarioId: "storm", expected: 80, observed: 75 },
    });
    const s6 = r.assessments.find((a) => a.sloId === "S6");
    expect(s6?.verdict).toBe("FAIL");
  });

  it("S10 PASS when dispatcher failure rate < 1%", () => {
    const r = assessLoadReport({
      ...baseInput(),
      dispatcherFailures: { scenarioId: "load", eventCount: 5, windowMs: 600_000 },
      dispatcherTotal: { scenarioId: "load", eventCount: 1000, windowMs: 600_000 },
    });
    const s10 = r.assessments.find((a) => a.sloId === "S10");
    expect(s10?.verdict).toBe("PASS");
  });

  it("S10 FAIL when dispatcher failure rate ≥ 1%", () => {
    const r = assessLoadReport({
      ...baseInput(),
      dispatcherFailures: { scenarioId: "load", eventCount: 50, windowMs: 600_000 },
      dispatcherTotal: { scenarioId: "load", eventCount: 1000, windowMs: 600_000 },
    });
    const s10 = r.assessments.find((a) => a.sloId === "S10");
    expect(s10?.verdict).toBe("FAIL");
  });
});

describe("Phase 12 — overall summary semantics", () => {
  it("overallPass true only when ALL 10 SLOs PASS (zero UNKNOWNs)", () => {
    const r = assessLoadReport({
      timestamp: "now",
      environment: "test",
      noToolStreams: { scenarioId: "x", peakConcurrent: 30, sustainedMs: 60000, totalDurationMs: 180000 },
      firstTokenLatency: { scenarioId: "x", samplesMs: Array(100).fill(2000) },
      toolStreams: { scenarioId: "x", peakConcurrent: 12, sustainedMs: 60000, totalDurationMs: 180000 },
      traceThroughput: { scenarioId: "x", eventCount: 600, windowMs: 300000 },
      longRunMemory: { scenarioId: "x", rssBytes: Array(60).fill(100_000_000), windowMs: 120_000 },
      clientDisconnects: { scenarioId: "x", expected: 80, observed: 80 },
      idempotencyConflicts: { scenarioId: "x", expected: 100, observed: 0 },
      approvalWaitLatency: { scenarioId: "x", samplesMs: Array(100).fill(50_000) },
      racRetrievalLatency: { scenarioId: "x", samplesMs: Array(100).fill(500) },
      dispatcherFailures: { scenarioId: "x", eventCount: 1, windowMs: 600_000 },
      dispatcherTotal: { scenarioId: "x", eventCount: 1000, windowMs: 600_000 },
    });
    expect(r.summary.overallPass).toBe(true);
    expect(r.summary.pass).toBe(10);
    expect(r.summary.fail).toBe(0);
    expect(r.summary.unknown).toBe(0);
  });

  it("overallPass false when ANY SLO is UNKNOWN (no implicit pass)", () => {
    // Only S2 is captured; the other 9 are UNKNOWN.
    const r = assessLoadReport({
      timestamp: "now",
      environment: "test",
      firstTokenLatency: { scenarioId: "x", samplesMs: [1000, 1500, 2000] },
    });
    expect(r.summary.overallPass).toBe(false);
    expect(r.summary.unknown).toBeGreaterThan(0);
  });

  it("overallPass false on any FAIL", () => {
    const r = assessLoadReport({
      timestamp: "now",
      environment: "test",
      noToolStreams: { scenarioId: "x", peakConcurrent: 5, sustainedMs: 60000, totalDurationMs: 180000 },
    });
    expect(r.summary.overallPass).toBe(false);
    expect(r.summary.fail).toBeGreaterThan(0);
  });
});

describe("Phase 12 — SLO_TARGETS lockstep with the SLO doc", () => {
  // The doc at docs/operations/agent-studio-runtime-slo.md (Phase 11c)
  // is the authoritative source. The checker's targets must match
  // the doc — drift fails this test on either side.
  it("targets the canonical Gate 7 numerics", () => {
    expect(SLO_TARGETS.S1_minNoToolStreams).toBe(25);
    expect(SLO_TARGETS.S2_firstTokenP95Ms).toBe(5_000);
    expect(SLO_TARGETS.S3_minToolStreams).toBe(10);
    expect(SLO_TARGETS.S4_minTraceWritesPerMin).toBe(100);
    expect(SLO_TARGETS.S5_minWindowMs).toBe(120_000);
    expect(SLO_TARGETS.S6_minClientDisconnectFlagRate).toBe(1.0);
    expect(SLO_TARGETS.S7_maxIdempotencyConflictsPerSession).toBe(5);
    expect(SLO_TARGETS.S8_approvalWaitP95Ms).toBe(300_000);
    expect(SLO_TARGETS.S9_racRetrievalP95Ms).toBe(2_000);
    expect(SLO_TARGETS.S10_maxDispatcherFailureRate).toBe(0.01);
  });
});

describe("Phase 12 — markdown report formatter", () => {
  it("renders summary header + per-SLO table + source footer", () => {
    const r = assessLoadReport({
      timestamp: "2026-05-10T14:30:00Z",
      environment: "test",
      noToolStreams: { scenarioId: "x", peakConcurrent: 30, sustainedMs: 60000, totalDurationMs: 180000 },
    });
    const md = formatLoadReport(r);
    expect(md).toContain("# Runtime Load Certification Report");
    expect(md).toContain("**Environment:** test");
    expect(md).toContain("| SLO | Metric | Target | Observed | Verdict | Reason |");
    expect(md).toContain("S1");
    expect(md).toContain("✅ PASS");
    expect(md).toContain("⚠️ UNKNOWN");
    // UNKNOWN ⇒ explicit warning paragraph
    expect(md).toMatch(/UNKNOWN entries indicate/i);
    expect(md).toContain("Phase 12");
  });

  it("renders ❌ NOT PASS overall when any FAIL", () => {
    const r = assessLoadReport({
      timestamp: "now",
      environment: "test",
      noToolStreams: { scenarioId: "x", peakConcurrent: 5, sustainedMs: 60000, totalDurationMs: 180000 },
    });
    const md = formatLoadReport(r);
    expect(md).toContain("❌ **NOT PASS**");
  });
});
