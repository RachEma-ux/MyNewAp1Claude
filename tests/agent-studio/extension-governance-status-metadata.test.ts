/**
 * Phase X §T-X.1 — extension governance-status metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  EXTENSION_GOVERNANCE_STATUSES,
  EXTENSION_GOVERNANCE_STATUS_METADATA,
  getExtensionGovernanceStatusMetadata,
} from "../../server/agent-studio/services/extensions/contracts.js";

describe("EXTENSION_GOVERNANCE_STATUS_METADATA (T-X.1)", () => {
  it("has metadata for every closed-taxonomy status", () => {
    for (const s of EXTENSION_GOVERNANCE_STATUSES) {
      expect(EXTENSION_GOVERNANCE_STATUS_METADATA[s]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(EXTENSION_GOVERNANCE_STATUS_METADATA).length).toBe(
      EXTENSION_GOVERNANCE_STATUSES.length,
    );
  });

  it.each(EXTENSION_GOVERNANCE_STATUSES)(
    "%s has non-empty label + description + booleans + valid lifecycle",
    (s) => {
      const md = EXTENSION_GOVERNANCE_STATUS_METADATA[s];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(typeof md.invocable).toBe("boolean");
      expect(["awaiting_decision", "active", "dormant", "revoked"]).toContain(
        md.lifecycle,
      );
    },
  );

  it.each(EXTENSION_GOVERNANCE_STATUSES)(
    "getExtensionGovernanceStatusMetadata(%s) returns table entry",
    (s) => {
      expect(getExtensionGovernanceStatusMetadata(s)).toBe(
        EXTENSION_GOVERNANCE_STATUS_METADATA[s],
      );
    },
  );

  it("only `approved` is invocable", () => {
    expect(EXTENSION_GOVERNANCE_STATUS_METADATA.approved.invocable).toBe(true);
    expect(
      EXTENSION_GOVERNANCE_STATUS_METADATA.pending_approval.invocable,
    ).toBe(false);
    expect(EXTENSION_GOVERNANCE_STATUS_METADATA.rejected.invocable).toBe(
      false,
    );
    expect(EXTENSION_GOVERNANCE_STATUS_METADATA.disabled.invocable).toBe(
      false,
    );
    expect(EXTENSION_GOVERNANCE_STATUS_METADATA.revoked.invocable).toBe(false);
  });

  it("active lifecycle ⇔ invocable", () => {
    for (const s of EXTENSION_GOVERNANCE_STATUSES) {
      const md = EXTENSION_GOVERNANCE_STATUS_METADATA[s];
      if (md.lifecycle === "active") {
        expect(md.invocable).toBe(true);
      } else {
        expect(md.invocable).toBe(false);
      }
    }
  });

  it("revoked is the only `revoked` lifecycle", () => {
    expect(EXTENSION_GOVERNANCE_STATUS_METADATA.revoked.lifecycle).toBe(
      "revoked",
    );
    for (const s of EXTENSION_GOVERNANCE_STATUSES) {
      if (s !== "revoked") {
        expect(EXTENSION_GOVERNANCE_STATUS_METADATA[s].lifecycle).not.toBe(
          "revoked",
        );
      }
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const s of EXTENSION_GOVERNANCE_STATUSES) {
      labels.add(EXTENSION_GOVERNANCE_STATUS_METADATA[s].label);
    }
    expect(labels.size).toBe(EXTENSION_GOVERNANCE_STATUSES.length);
  });
});
