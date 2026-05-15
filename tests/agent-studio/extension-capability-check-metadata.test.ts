/**
 * Phase X §T-X.3 — extension capability-check metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  EXTENSION_CAPABILITY_CHECKS,
  EXTENSION_CAPABILITY_CHECK_METADATA,
  getExtensionCapabilityCheckMetadata,
} from "../../server/agent-studio/services/extensions/contracts.js";

describe("EXTENSION_CAPABILITY_CHECK_METADATA (T-X.3)", () => {
  it("has metadata for every closed-taxonomy check", () => {
    for (const c of EXTENSION_CAPABILITY_CHECKS) {
      expect(EXTENSION_CAPABILITY_CHECK_METADATA[c]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(EXTENSION_CAPABILITY_CHECK_METADATA).length).toBe(
      EXTENSION_CAPABILITY_CHECKS.length,
    );
  });

  it.each(EXTENSION_CAPABILITY_CHECKS)(
    "%s has non-empty label + description + proceeds boolean + nullable denialReason",
    (c) => {
      const md = EXTENSION_CAPABILITY_CHECK_METADATA[c];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.proceeds).toBe("boolean");
      expect([
        null,
        "manifest_mismatch",
        "governance_revoked",
        "operator_disabled",
      ]).toContain(md.denialReason);
    },
  );

  it.each(EXTENSION_CAPABILITY_CHECKS)(
    "getExtensionCapabilityCheckMetadata(%s) returns table entry",
    (c) => {
      expect(getExtensionCapabilityCheckMetadata(c)).toBe(
        EXTENSION_CAPABILITY_CHECK_METADATA[c],
      );
    },
  );

  it("only `allowed` proceeds", () => {
    expect(EXTENSION_CAPABILITY_CHECK_METADATA.allowed.proceeds).toBe(true);
    expect(EXTENSION_CAPABILITY_CHECK_METADATA.denied_undeclared.proceeds).toBe(
      false,
    );
    expect(EXTENSION_CAPABILITY_CHECK_METADATA.denied_revoked.proceeds).toBe(
      false,
    );
    expect(EXTENSION_CAPABILITY_CHECK_METADATA.denied_disabled.proceeds).toBe(
      false,
    );
  });

  it("proceeds=true ⇔ denialReason=null", () => {
    for (const c of EXTENSION_CAPABILITY_CHECKS) {
      const md = EXTENSION_CAPABILITY_CHECK_METADATA[c];
      if (md.proceeds) {
        expect(md.denialReason).toBeNull();
      } else {
        expect(md.denialReason).not.toBeNull();
      }
    }
  });

  it("each denial check has a distinct denialReason", () => {
    expect(
      EXTENSION_CAPABILITY_CHECK_METADATA.denied_undeclared.denialReason,
    ).toBe("manifest_mismatch");
    expect(
      EXTENSION_CAPABILITY_CHECK_METADATA.denied_revoked.denialReason,
    ).toBe("governance_revoked");
    expect(
      EXTENSION_CAPABILITY_CHECK_METADATA.denied_disabled.denialReason,
    ).toBe("operator_disabled");
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const c of EXTENSION_CAPABILITY_CHECKS) {
      labels.add(EXTENSION_CAPABILITY_CHECK_METADATA[c].label);
    }
    expect(labels.size).toBe(EXTENSION_CAPABILITY_CHECKS.length);
  });
});
