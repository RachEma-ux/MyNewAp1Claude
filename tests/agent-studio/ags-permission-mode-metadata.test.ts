/**
 * Phase S §T-S.11 — AGS permission-mode metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  AGS_PERMISSION_MODES,
  AGS_PERMISSION_MODE_METADATA,
  getAgsPermissionModeMetadata,
} from "../../server/agent-studio/shared/constants.js";

describe("AGS_PERMISSION_MODE_METADATA (T-S.11)", () => {
  it("has metadata for every closed-taxonomy mode", () => {
    for (const m of AGS_PERMISSION_MODES) {
      expect(AGS_PERMISSION_MODE_METADATA[m]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(AGS_PERMISSION_MODE_METADATA).length).toBe(
      AGS_PERMISSION_MODES.length,
    );
  });

  it.each(AGS_PERMISSION_MODES)(
    "%s has non-empty label + description + 3 booleans",
    (m) => {
      const md = AGS_PERMISSION_MODE_METADATA[m];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.allowsToolExecution).toBe("boolean");
      expect(typeof md.promptsOnDangerous).toBe("boolean");
      expect(typeof md.requiresBypassFlag).toBe("boolean");
    },
  );

  it.each(AGS_PERMISSION_MODES)(
    "getAgsPermissionModeMetadata(%s) returns table entry",
    (m) => {
      expect(getAgsPermissionModeMetadata(m)).toBe(
        AGS_PERMISSION_MODE_METADATA[m],
      );
    },
  );

  it("only `plan` blocks tool execution", () => {
    for (const m of AGS_PERMISSION_MODES) {
      const expected = m !== "plan";
      expect(AGS_PERMISSION_MODE_METADATA[m].allowsToolExecution).toBe(
        expected,
      );
    }
  });

  it("only `default` prompts on dangerous", () => {
    for (const m of AGS_PERMISSION_MODES) {
      const expected = m === "default";
      expect(AGS_PERMISSION_MODE_METADATA[m].promptsOnDangerous).toBe(
        expected,
      );
    }
  });

  it("only `bypassPermissions` requires the bypass flag", () => {
    for (const m of AGS_PERMISSION_MODES) {
      const expected = m === "bypassPermissions";
      expect(AGS_PERMISSION_MODE_METADATA[m].requiresBypassFlag).toBe(
        expected,
      );
    }
  });

  it("requiresBypassFlag=true implies allowsToolExecution=true", () => {
    for (const m of AGS_PERMISSION_MODES) {
      const md = AGS_PERMISSION_MODE_METADATA[m];
      if (md.requiresBypassFlag) {
        expect(md.allowsToolExecution).toBe(true);
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const m of AGS_PERMISSION_MODES) {
      labels.add(AGS_PERMISSION_MODE_METADATA[m].label);
    }
    expect(labels.size).toBe(AGS_PERMISSION_MODES.length);
  });
});
