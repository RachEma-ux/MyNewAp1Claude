/**
 * Phase S §T-S.15 — AGS permission-source metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  AGS_PERMISSION_SOURCES,
  AGS_PERMISSION_SOURCE_METADATA,
  getAgsPermissionSourceMetadata,
} from "../../server/agent-studio/shared/constants.js";

describe("AGS_PERMISSION_SOURCE_METADATA (T-S.15)", () => {
  it("has metadata for every closed-taxonomy source", () => {
    for (const s of AGS_PERMISSION_SOURCES) {
      expect(AGS_PERMISSION_SOURCE_METADATA[s]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(AGS_PERMISSION_SOURCE_METADATA).length).toBe(
      AGS_PERMISSION_SOURCES.length,
    );
  });

  it.each(AGS_PERMISSION_SOURCES)(
    "%s has non-empty label + description + valid precedence + boolean persistent",
    (s) => {
      const md = AGS_PERMISSION_SOURCE_METADATA[s];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect([0, 1, 2, 3, 4]).toContain(md.precedence);
      expect(typeof md.persistent).toBe("boolean");
    },
  );

  it.each(AGS_PERMISSION_SOURCES)(
    "getAgsPermissionSourceMetadata(%s) returns table entry",
    (s) => {
      expect(getAgsPermissionSourceMetadata(s)).toBe(
        AGS_PERMISSION_SOURCE_METADATA[s],
      );
    },
  );

  it("precedence order matches declaration order (0..4)", () => {
    AGS_PERMISSION_SOURCES.forEach((s, idx) => {
      expect(AGS_PERMISSION_SOURCE_METADATA[s].precedence).toBe(idx);
    });
  });

  it("precedence is unique across sources", () => {
    const precedences = new Set<number>();
    for (const s of AGS_PERMISSION_SOURCES) {
      precedences.add(AGS_PERMISSION_SOURCE_METADATA[s].precedence);
    }
    expect(precedences.size).toBe(AGS_PERMISSION_SOURCES.length);
  });

  it("settings tiers are persistent; cliArg and session are not", () => {
    expect(AGS_PERMISSION_SOURCE_METADATA.userSettings.persistent).toBe(true);
    expect(AGS_PERMISSION_SOURCE_METADATA.projectSettings.persistent).toBe(
      true,
    );
    expect(AGS_PERMISSION_SOURCE_METADATA.localSettings.persistent).toBe(true);
    expect(AGS_PERMISSION_SOURCE_METADATA.cliArg.persistent).toBe(false);
    expect(AGS_PERMISSION_SOURCE_METADATA.session.persistent).toBe(false);
  });

  it("non-persistent sources have higher precedence than persistent ones", () => {
    for (const s of AGS_PERMISSION_SOURCES) {
      const md = AGS_PERMISSION_SOURCE_METADATA[s];
      if (!md.persistent) {
        expect(md.precedence).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const s of AGS_PERMISSION_SOURCES) {
      labels.add(AGS_PERMISSION_SOURCE_METADATA[s].label);
    }
    expect(labels.size).toBe(AGS_PERMISSION_SOURCES.length);
  });
});
