/**
 * Phase B §T-B.1 — realtime-doc authorization deny-reason metadata
 * lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  REALTIME_DOC_AUTHORIZATION_DENY_REASONS,
  REALTIME_DOC_AUTHORIZATION_DENY_REASON_METADATA,
  getRealtimeDocAuthorizationDenyReasonMetadata,
} from "../../server/agent-studio/services/vault/realtime-doc-authorize.js";

describe("REALTIME_DOC_AUTHORIZATION_DENY_REASON_METADATA (T-B.1)", () => {
  it("has metadata for every closed-taxonomy reason", () => {
    for (const r of REALTIME_DOC_AUTHORIZATION_DENY_REASONS) {
      expect(
        REALTIME_DOC_AUTHORIZATION_DENY_REASON_METADATA[r],
      ).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(
      Object.keys(REALTIME_DOC_AUTHORIZATION_DENY_REASON_METADATA).length,
    ).toBe(REALTIME_DOC_AUTHORIZATION_DENY_REASONS.length);
  });

  it.each(REALTIME_DOC_AUTHORIZATION_DENY_REASONS)(
    "%s has non-empty label + description + remediation + valid classification",
    (r) => {
      const md = REALTIME_DOC_AUTHORIZATION_DENY_REASON_METADATA[r];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(md.remediation.length).toBeGreaterThan(30);
      expect([
        "auth_required",
        "policy_denial",
        "transient_failure",
      ]).toContain(md.classification);
    },
  );

  it.each(REALTIME_DOC_AUTHORIZATION_DENY_REASONS)(
    "getRealtimeDocAuthorizationDenyReasonMetadata(%s) returns table entry",
    (r) => {
      expect(getRealtimeDocAuthorizationDenyReasonMetadata(r)).toBe(
        REALTIME_DOC_AUTHORIZATION_DENY_REASON_METADATA[r],
      );
    },
  );

  it("missing_user_id is auth_required", () => {
    expect(
      REALTIME_DOC_AUTHORIZATION_DENY_REASON_METADATA.missing_user_id
        .classification,
    ).toBe("auth_required");
  });

  it("not_a_vault_member is policy_denial", () => {
    expect(
      REALTIME_DOC_AUTHORIZATION_DENY_REASON_METADATA.not_a_vault_member
        .classification,
    ).toBe("policy_denial");
  });

  it("vault_membership_lookup_failed is transient_failure", () => {
    expect(
      REALTIME_DOC_AUTHORIZATION_DENY_REASON_METADATA
        .vault_membership_lookup_failed.classification,
    ).toBe("transient_failure");
  });

  it("every classification has at least one reason assigned", () => {
    const used = new Set<string>();
    for (const r of REALTIME_DOC_AUTHORIZATION_DENY_REASONS) {
      used.add(
        REALTIME_DOC_AUTHORIZATION_DENY_REASON_METADATA[r].classification,
      );
    }
    expect(used.has("auth_required")).toBe(true);
    expect(used.has("policy_denial")).toBe(true);
    expect(used.has("transient_failure")).toBe(true);
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const r of REALTIME_DOC_AUTHORIZATION_DENY_REASONS) {
      labels.add(REALTIME_DOC_AUTHORIZATION_DENY_REASON_METADATA[r].label);
    }
    expect(labels.size).toBe(REALTIME_DOC_AUTHORIZATION_DENY_REASONS.length);
  });
});
