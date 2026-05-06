/**
 * RAC P10 — `computeRacReadiness` matrix tests.
 *
 * Drives every D-TOOL-4 + D-SBX-2 row through both pass and fail variants
 * with a fixed `computedAt` so reasons + status are stable across runs.
 */

import { describe, it, expect } from "vitest";
import { computeRacReadiness } from "./rac-readiness";

const FIXED_AT = new Date("2026-05-06T00:00:00.000Z");
const HEALTHY = { ok: true, impl: "node-vm" };
const UNHEALTHY = { ok: false, impl: "node-vm" };

describe("computeRacReadiness — D-TOOL-4 ladder", () => {
  it("read_only-only agent → ready, no reasons", () => {
    const r = computeRacReadiness({
      toolRiskClasses: ["read_only", "read_only"],
      sandboxHealth: HEALTHY,
      computedAt: FIXED_AT,
    });
    expect(r.status).toBe("ready");
    expect(r.reasons).toEqual([]);
    expect(r.toolRisk.classes).toEqual(["read_only"]); // dedup
    expect(r.toolRisk.hasReadOnly).toBe(true);
    expect(r.toolRisk.hasRisky).toBe(false);
    expect(r.toolRisk.hasCodeExecution).toBe(false);
    expect(r.toolRisk.hasQuarantined).toBe(false);
  });

  it("agent with no tools → ready (vacuous)", () => {
    const r = computeRacReadiness({
      toolRiskClasses: [],
      sandboxHealth: HEALTHY,
      computedAt: FIXED_AT,
    });
    expect(r.status).toBe("ready");
    expect(r.toolRisk.classes).toEqual([]);
  });
});

describe("computeRacReadiness — hard-block (D-SBX-2 + D-TOOL-1)", () => {
  it("code_execution + null sandbox → blocked with sandbox_required", () => {
    const r = computeRacReadiness({
      toolRiskClasses: ["code_execution"],
      sandboxHealth: null,
      computedAt: FIXED_AT,
    });
    expect(r.status).toBe("blocked");
    expect(r.reasons).toEqual(["sandbox_required"]);
    expect(r.sandboxHealth).toBeNull();
  });

  it("code_execution + unhealthy sandbox → blocked with sandbox_unhealthy", () => {
    const r = computeRacReadiness({
      toolRiskClasses: ["code_execution"],
      sandboxHealth: UNHEALTHY,
      computedAt: FIXED_AT,
    });
    expect(r.status).toBe("blocked");
    expect(r.reasons).toEqual(["sandbox_unhealthy"]);
  });

  it("code_execution + healthy sandbox → ready (D-TOOL-4 row 4 pass)", () => {
    const r = computeRacReadiness({
      toolRiskClasses: ["code_execution"],
      sandboxHealth: HEALTHY,
      computedAt: FIXED_AT,
    });
    expect(r.status).toBe("ready");
    expect(r.reasons).toEqual([]);
  });

  it("quarantined tool always blocks (D-TOOL-1 default-deny)", () => {
    const r = computeRacReadiness({
      toolRiskClasses: ["read_only", "quarantined"],
      sandboxHealth: HEALTHY,
      computedAt: FIXED_AT,
    });
    expect(r.status).toBe("blocked");
    expect(r.reasons).toContain("quarantined_tool");
    expect(r.toolRisk.hasQuarantined).toBe(true);
  });

  it("quarantined wins over degraded — block reasons listed first", () => {
    const r = computeRacReadiness({
      toolRiskClasses: ["write", "quarantined"],
      sandboxHealth: HEALTHY,
      computedAt: FIXED_AT,
    });
    expect(r.status).toBe("blocked");
    expect(r.reasons[0]).toBe("quarantined_tool");
  });

  it("multiple block triggers stack in stable order (quarantined → sandbox)", () => {
    const r = computeRacReadiness({
      toolRiskClasses: ["quarantined", "code_execution"],
      sandboxHealth: null,
      computedAt: FIXED_AT,
    });
    expect(r.status).toBe("blocked");
    expect(r.reasons).toEqual(["quarantined_tool", "sandbox_required"]);
  });
});

describe("computeRacReadiness — degraded path", () => {
  it("write tool → degraded", () => {
    const r = computeRacReadiness({
      toolRiskClasses: ["read_only", "write"],
      sandboxHealth: HEALTHY,
      computedAt: FIXED_AT,
    });
    expect(r.status).toBe("degraded");
    expect(r.reasons).toEqual(["write_requires_approval"]);
  });

  it("destructive tool → degraded with destructive reason", () => {
    const r = computeRacReadiness({
      toolRiskClasses: ["destructive"],
      sandboxHealth: HEALTHY,
      computedAt: FIXED_AT,
    });
    expect(r.status).toBe("degraded");
    expect(r.reasons).toEqual(["destructive_requires_approval"]);
  });

  it("multiple side-effect classes → all reasons in declared order", () => {
    const r = computeRacReadiness({
      toolRiskClasses: [
        "credential_sensitive",
        "write",
        "external_side_effect",
        "destructive",
        "governance_sensitive",
      ],
      sandboxHealth: HEALTHY,
      computedAt: FIXED_AT,
    });
    expect(r.status).toBe("degraded");
    expect(r.reasons).toEqual([
      "write_requires_approval",
      "external_side_effect_requires_approval",
      "destructive_requires_approval",
      "governance_sensitive_requires_approval",
      "credential_sensitive_requires_secret_path",
    ]);
  });

  it("degraded + code_execution + healthy sandbox → degraded (sandbox row passes)", () => {
    const r = computeRacReadiness({
      toolRiskClasses: ["code_execution", "write"],
      sandboxHealth: HEALTHY,
      computedAt: FIXED_AT,
    });
    expect(r.status).toBe("degraded");
    // code_execution is satisfied by the healthy sandbox; only the write
    // class drives the degraded reason.
    expect(r.reasons).toEqual(["write_requires_approval"]);
  });

  it("degraded + code_execution + unhealthy sandbox → blocked wins over degraded", () => {
    const r = computeRacReadiness({
      toolRiskClasses: ["code_execution", "write"],
      sandboxHealth: UNHEALTHY,
      computedAt: FIXED_AT,
    });
    expect(r.status).toBe("blocked");
    expect(r.reasons).toEqual(["sandbox_unhealthy"]);
  });
});

describe("computeRacReadiness — snapshot fields", () => {
  it("preserves the sandboxHealth snapshot verbatim", () => {
    const probe = { ok: true, impl: "node-vm" };
    const r = computeRacReadiness({
      toolRiskClasses: [],
      sandboxHealth: probe,
      computedAt: FIXED_AT,
    });
    expect(r.sandboxHealth).toEqual(probe);
  });

  it("computedAt defaults to now() when omitted", () => {
    const before = Date.now();
    const r = computeRacReadiness({
      toolRiskClasses: [],
      sandboxHealth: HEALTHY,
    });
    const ts = new Date(r.computedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(Date.now() + 1);
  });

  it("classes list is deduplicated and sorted", () => {
    const r = computeRacReadiness({
      toolRiskClasses: ["write", "read_only", "write", "read_only"],
      sandboxHealth: HEALTHY,
      computedAt: FIXED_AT,
    });
    expect(r.toolRisk.classes).toEqual(["read_only", "write"]);
  });
});
