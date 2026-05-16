/**
 * Phase G §T-G.39 — Drift-class metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  DRIFT_CLASSES,
  DRIFT_CLASS_METADATA,
  getDriftClassMetadata,
} from "../../server/agent-studio/services/graph/projection/drift-detector.js";

const VALID_SEVERITIES = ["warning", "critical"] as const;

describe("DRIFT_CLASS_METADATA (T-G.39)", () => {
  it("has metadata for every closed-taxonomy class", () => {
    for (const c of DRIFT_CLASSES) {
      expect(DRIFT_CLASS_METADATA[c]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(DRIFT_CLASS_METADATA).length).toBe(
      DRIFT_CLASSES.length,
    );
  });

  it.each(DRIFT_CLASSES)(
    "%s has non-empty label + description + valid severity + boolean isSecurityRelevant",
    (c) => {
      const md = DRIFT_CLASS_METADATA[c];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(VALID_SEVERITIES).toContain(md.severity);
      expect(typeof md.isSecurityRelevant).toBe("boolean");
    },
  );

  it.each(DRIFT_CLASSES)(
    "getDriftClassMetadata(%s) returns table entry",
    (c) => {
      expect(getDriftClassMetadata(c)).toBe(DRIFT_CLASS_METADATA[c]);
    },
  );

  it("permission_leak is the only critical severity", () => {
    const critical = DRIFT_CLASSES.filter(
      (c) => DRIFT_CLASS_METADATA[c].severity === "critical",
    );
    expect(critical).toEqual(["permission_leak"]);
  });

  it("permission_leak is the only security-relevant class", () => {
    const sec = DRIFT_CLASSES.filter(
      (c) => DRIFT_CLASS_METADATA[c].isSecurityRelevant,
    );
    expect(sec).toEqual(["permission_leak"]);
  });

  it("isSecurityRelevant is true iff severity === critical", () => {
    for (const c of DRIFT_CLASSES) {
      const md = DRIFT_CLASS_METADATA[c];
      expect(md.isSecurityRelevant).toBe(md.severity === "critical");
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const c of DRIFT_CLASSES) {
      labels.add(DRIFT_CLASS_METADATA[c].label);
    }
    expect(labels.size).toBe(DRIFT_CLASSES.length);
  });
});
