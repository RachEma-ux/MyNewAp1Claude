/**
 * Phase 25 §T-G.15 — summarizeSecurityFindings lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  SECURITY_FINDING_SEVERITIES,
  SECURITY_GRAPH_CANONICAL_IMPACT_PATH,
  summarizeSecurityFindings,
  type SecurityFindingSeverity,
} from "../../server/agent-studio/services/security-graph/public-api.js";

interface Finding {
  readonly id: string;
  readonly sev: SecurityFindingSeverity;
  readonly step?: string;
}

const getSev = (f: Finding) => f.sev;
const getStep = (f: Finding) => f.step;

describe("summarizeSecurityFindings (T-G.15)", () => {
  it("empty input → total=0, all keys at 0, mostSevereIndex=null", () => {
    const s = summarizeSecurityFindings<Finding>([], getSev, getStep);
    expect(s.total).toBe(0);
    expect(s.mostSevereIndex).toBeNull();
    for (const sev of SECURITY_FINDING_SEVERITIES) {
      expect(s.bySeverity[sev]).toBe(0);
    }
    for (const step of SECURITY_GRAPH_CANONICAL_IMPACT_PATH) {
      expect(s.byCanonicalPathStep[step]).toBe(0);
    }
  });

  it("counts severity correctly", () => {
    const s = summarizeSecurityFindings<Finding>(
      [
        { id: "a", sev: "low" },
        { id: "b", sev: "critical" },
        { id: "c", sev: "low" },
        { id: "d", sev: "high" },
      ],
      getSev,
      getStep,
    );
    expect(s.bySeverity.low).toBe(2);
    expect(s.bySeverity.critical).toBe(1);
    expect(s.bySeverity.high).toBe(1);
    expect(s.bySeverity.medium).toBe(0);
    expect(s.bySeverity.informational).toBe(0);
  });

  it("counts canonical-path steps and ignores non-canonical steps", () => {
    const s = summarizeSecurityFindings<Finding>(
      [
        { id: "a", sev: "low", step: "cve" },
        { id: "b", sev: "low", step: "package" },
        { id: "c", sev: "low", step: "cve" },
        { id: "d", sev: "low", step: "definitely_not_a_step" },
        { id: "e", sev: "low" }, // no step
      ],
      getSev,
      getStep,
    );
    expect(s.byCanonicalPathStep.cve).toBe(2);
    expect(s.byCanonicalPathStep.package).toBe(1);
    expect(s.byCanonicalPathStep.component).toBe(0);
    expect(s.total).toBe(5);
  });

  it("mostSevereIndex picks the first critical when present", () => {
    const findings: Finding[] = [
      { id: "a", sev: "low" },
      { id: "b", sev: "critical" },
      { id: "c", sev: "critical" },
    ];
    const s = summarizeSecurityFindings(findings, getSev, getStep);
    expect(s.mostSevereIndex).toBe(1);
  });

  it("mostSevereIndex returns first index on ties", () => {
    const findings: Finding[] = [
      { id: "a", sev: "high" },
      { id: "b", sev: "high" },
    ];
    const s = summarizeSecurityFindings(findings, getSev, getStep);
    expect(s.mostSevereIndex).toBe(0);
  });

  it("Σ bySeverity == total", () => {
    const findings: Finding[] = Array.from({ length: 17 }, (_, i) => ({
      id: `f${i}`,
      sev: SECURITY_FINDING_SEVERITIES[i % SECURITY_FINDING_SEVERITIES.length],
    }));
    const s = summarizeSecurityFindings(findings, getSev, getStep);
    const sum = Object.values(s.bySeverity).reduce((a, b) => a + b, 0);
    expect(sum).toBe(s.total);
  });

  it("stable-shape: every SECURITY_FINDING_SEVERITIES + every canonical step keyed", () => {
    const s = summarizeSecurityFindings<Finding>(
      [{ id: "a", sev: "low" }],
      getSev,
      getStep,
    );
    expect(Object.keys(s.bySeverity).length).toBe(
      SECURITY_FINDING_SEVERITIES.length,
    );
    expect(Object.keys(s.byCanonicalPathStep).length).toBe(
      SECURITY_GRAPH_CANONICAL_IMPACT_PATH.length,
    );
  });

  it("does not mutate input", () => {
    const findings: Finding[] = [{ id: "a", sev: "low" }];
    const before = [...findings];
    summarizeSecurityFindings(findings, getSev, getStep);
    expect(findings).toEqual(before);
  });
});
