/**
 * Phase S §T-S.2 — AGS agent-class metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  AGS_AGENT_CLASSES,
  AGS_AGENT_CLASS_METADATA,
  AGS_AUTONOMY_LEVELS,
  getAgsAgentClassMetadata,
} from "../../server/agent-studio/shared/constants.js";

describe("AGS_AGENT_CLASS_METADATA (T-S.2)", () => {
  it("has metadata for every closed-taxonomy class", () => {
    for (const c of AGS_AGENT_CLASSES) {
      expect(AGS_AGENT_CLASS_METADATA[c]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(AGS_AGENT_CLASS_METADATA).length).toBe(
      AGS_AGENT_CLASSES.length,
    );
  });

  it.each(AGS_AGENT_CLASSES)(
    "%s has non-empty label + description + boolean + valid autonomy floor",
    (c) => {
      const md = AGS_AGENT_CLASS_METADATA[c];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.invokesOtherAgents).toBe("boolean");
      expect(AGS_AUTONOMY_LEVELS).toContain(md.recommendedAutonomyFloor);
    },
  );

  it.each(AGS_AGENT_CLASSES)(
    "getAgsAgentClassMetadata(%s) returns table entry",
    (c) => {
      expect(getAgsAgentClassMetadata(c)).toBe(AGS_AGENT_CLASS_METADATA[c]);
    },
  );

  it("orchestrator and automation invoke other agents", () => {
    expect(AGS_AGENT_CLASS_METADATA.orchestrator.invokesOtherAgents).toBe(
      true,
    );
    expect(AGS_AGENT_CLASS_METADATA.automation.invokesOtherAgents).toBe(true);
  });

  it("assistant/specialist/researcher/auditor do not invoke other agents", () => {
    expect(AGS_AGENT_CLASS_METADATA.assistant.invokesOtherAgents).toBe(false);
    expect(AGS_AGENT_CLASS_METADATA.specialist.invokesOtherAgents).toBe(false);
    expect(AGS_AGENT_CLASS_METADATA.researcher.invokesOtherAgents).toBe(false);
    expect(AGS_AGENT_CLASS_METADATA.auditor.invokesOtherAgents).toBe(false);
  });

  it("auditor's recommended autonomy floor is manual (read-only)", () => {
    expect(
      AGS_AGENT_CLASS_METADATA.auditor.recommendedAutonomyFloor,
    ).toBe("manual");
  });

  it("automation's recommended autonomy floor is autonomous", () => {
    expect(
      AGS_AGENT_CLASS_METADATA.automation.recommendedAutonomyFloor,
    ).toBe("autonomous");
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const c of AGS_AGENT_CLASSES) {
      labels.add(AGS_AGENT_CLASS_METADATA[c].label);
    }
    expect(labels.size).toBe(AGS_AGENT_CLASSES.length);
  });
});
