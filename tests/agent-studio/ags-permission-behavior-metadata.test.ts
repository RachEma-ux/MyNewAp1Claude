/**
 * Phase S §T-S.12 — AGS permission-behavior metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  AGS_PERMISSION_BEHAVIORS,
  AGS_PERMISSION_BEHAVIOR_METADATA,
  getAgsPermissionBehaviorMetadata,
} from "../../server/agent-studio/shared/constants.js";

describe("AGS_PERMISSION_BEHAVIOR_METADATA (T-S.12)", () => {
  it("has metadata for every closed-taxonomy behavior", () => {
    for (const b of AGS_PERMISSION_BEHAVIORS) {
      expect(AGS_PERMISSION_BEHAVIOR_METADATA[b]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(AGS_PERMISSION_BEHAVIOR_METADATA).length).toBe(
      AGS_PERMISSION_BEHAVIORS.length,
    );
  });

  it.each(AGS_PERMISSION_BEHAVIORS)(
    "%s has non-empty label + description + booleans",
    (b) => {
      const md = AGS_PERMISSION_BEHAVIOR_METADATA[b];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.proceeds).toBe("boolean");
      expect(typeof md.prompts).toBe("boolean");
    },
  );

  it.each(AGS_PERMISSION_BEHAVIORS)(
    "getAgsPermissionBehaviorMetadata(%s) returns table entry",
    (b) => {
      expect(getAgsPermissionBehaviorMetadata(b)).toBe(
        AGS_PERMISSION_BEHAVIOR_METADATA[b],
      );
    },
  );

  it("only `allow` proceeds", () => {
    expect(AGS_PERMISSION_BEHAVIOR_METADATA.allow.proceeds).toBe(true);
    expect(AGS_PERMISSION_BEHAVIOR_METADATA.deny.proceeds).toBe(false);
    expect(AGS_PERMISSION_BEHAVIOR_METADATA.ask.proceeds).toBe(false);
  });

  it("only `ask` prompts", () => {
    expect(AGS_PERMISSION_BEHAVIOR_METADATA.allow.prompts).toBe(false);
    expect(AGS_PERMISSION_BEHAVIOR_METADATA.deny.prompts).toBe(false);
    expect(AGS_PERMISSION_BEHAVIOR_METADATA.ask.prompts).toBe(true);
  });

  it("proceeds and prompts are never both true", () => {
    for (const b of AGS_PERMISSION_BEHAVIORS) {
      const md = AGS_PERMISSION_BEHAVIOR_METADATA[b];
      expect(md.proceeds && md.prompts).toBe(false);
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const b of AGS_PERMISSION_BEHAVIORS) {
      labels.add(AGS_PERMISSION_BEHAVIOR_METADATA[b].label);
    }
    expect(labels.size).toBe(AGS_PERMISSION_BEHAVIORS.length);
  });
});
