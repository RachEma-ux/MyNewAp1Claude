/**
 * Phase B §T-X.6 — `summarizeExtensions` lockstep.
 *
 * Stable-shape aggregator over `ExtensionRecord[]`. Mirrors the
 * aggregator pattern from T-F.9 / T-F.12 / T-G.13 etc. with closed-
 * taxonomy stable-shape on governanceStatus / lifecycle / capability
 * lane axes plus signed + actor-audit gauges.
 */

import { describe, expect, it } from "vitest";
import {
  EXTENSION_LIFECYCLES,
  summarizeExtensions,
} from "../../server/agent-studio/services/extensions/extension-summary.js";
import {
  EXTENSION_CAPABILITY_LANES,
  EXTENSION_GOVERNANCE_STATUSES,
  type ExtensionCapabilityLane,
  type ExtensionGovernanceStatus,
  type ExtensionRecord,
} from "../../server/agent-studio/services/extensions/contracts.js";

function makeExt(
  overrides: Partial<ExtensionRecord> = {},
): ExtensionRecord {
  return {
    id: 1,
    workspaceId: 1,
    extensionKey: "test",
    name: "Test",
    version: "0.0.1",
    signingKeyId: null,
    governanceStatus: "pending_approval",
    capabilityLanes: [] as ReadonlyArray<ExtensionCapabilityLane>,
    declaredToolNames: [],
    config: null,
    installedAt: new Date(),
    approvedAt: null,
    disabledAt: null,
    installedByUserId: null,
    approvedByUserId: null,
    disabledByUserId: null,
    ...overrides,
  };
}

describe("summarizeExtensions — empty input", () => {
  it("zero on every axis when input is empty", () => {
    const s = summarizeExtensions([]);
    expect(s.total).toBe(0);
    expect(s.signedCount).toBe(0);
    expect(s.signedPercent).toBe(0);
    expect(s.actorAuditedCount).toBe(0);
    expect(s.actorAuditPercent).toBe(0);
    expect(s.zeroCapabilityCount).toBe(0);
    expect(s.byLaneCount).toEqual({});
  });

  it("byGovernanceStatus carries every closed status at 0 (stable shape)", () => {
    const s = summarizeExtensions([]);
    for (const status of EXTENSION_GOVERNANCE_STATUSES) {
      expect(s.byGovernanceStatus[status]).toBe(0);
    }
  });

  it("byLifecycle carries every closed lifecycle at 0 (stable shape)", () => {
    const s = summarizeExtensions([]);
    for (const lifecycle of EXTENSION_LIFECYCLES) {
      expect(s.byLifecycle[lifecycle]).toBe(0);
    }
  });

  it("byLane carries every closed lane at 0 (stable shape)", () => {
    const s = summarizeExtensions([]);
    for (const lane of EXTENSION_CAPABILITY_LANES) {
      expect(s.byLane[lane]).toBe(0);
    }
  });
});

describe("summarizeExtensions — single record", () => {
  it("counts a single approved extension on the correct axes", () => {
    const s = summarizeExtensions([
      makeExt({
        governanceStatus: "approved",
        capabilityLanes: ["retrieve", "compose"],
        signingKeyId: "sk-1",
        installedByUserId: 7,
      }),
    ]);
    expect(s.total).toBe(1);
    expect(s.byGovernanceStatus.approved).toBe(1);
    expect(s.byGovernanceStatus.pending_approval).toBe(0);
    expect(s.byLifecycle.active).toBe(1);
    expect(s.byLane.retrieve).toBe(1);
    expect(s.byLane.compose).toBe(1);
    expect(s.byLane.assemble).toBe(0);
    expect(s.byLane.tool).toBe(0);
    expect(s.byLaneCount[2]).toBe(1);
    expect(s.signedCount).toBe(1);
    expect(s.signedPercent).toBe(100);
    expect(s.actorAuditedCount).toBe(1);
    expect(s.actorAuditPercent).toBe(100);
    expect(s.zeroCapabilityCount).toBe(0);
  });
});

describe("summarizeExtensions — mixed records", () => {
  const records: ExtensionRecord[] = [
    makeExt({
      id: 1,
      governanceStatus: "approved",
      capabilityLanes: ["retrieve", "assemble", "compose"],
      signingKeyId: "sk-1",
      installedByUserId: 1,
    }),
    makeExt({
      id: 2,
      governanceStatus: "pending_approval",
      capabilityLanes: ["tool"],
      signingKeyId: null,
      installedByUserId: 2,
    }),
    makeExt({
      id: 3,
      governanceStatus: "disabled",
      capabilityLanes: [],
      signingKeyId: "sk-3",
      installedByUserId: null,
    }),
    makeExt({
      id: 4,
      governanceStatus: "revoked",
      capabilityLanes: ["retrieve"],
      signingKeyId: null,
      installedByUserId: 4,
    }),
  ];

  it("totals 4 records", () => {
    expect(summarizeExtensions(records).total).toBe(4);
  });

  it("per-status counts are correct (no zero-fill issues)", () => {
    const s = summarizeExtensions(records);
    expect(s.byGovernanceStatus.approved).toBe(1);
    expect(s.byGovernanceStatus.pending_approval).toBe(1);
    expect(s.byGovernanceStatus.disabled).toBe(1);
    expect(s.byGovernanceStatus.revoked).toBe(1);
    expect(s.byGovernanceStatus.rejected).toBe(0);
  });

  it("per-lifecycle counts roll up correctly across statuses", () => {
    const s = summarizeExtensions(records);
    expect(s.byLifecycle.active).toBe(1); // approved
    expect(s.byLifecycle.awaiting_decision).toBe(1); // pending_approval
    expect(s.byLifecycle.dormant).toBe(1); // disabled
    expect(s.byLifecycle.revoked).toBe(1); // revoked
  });

  it("per-lane counts sum across declared-lanes arrays", () => {
    const s = summarizeExtensions(records);
    expect(s.byLane.retrieve).toBe(2); // ext 1 + ext 4
    expect(s.byLane.assemble).toBe(1); // ext 1
    expect(s.byLane.compose).toBe(1); // ext 1
    expect(s.byLane.tool).toBe(1); // ext 2
  });

  it("byLaneCount is sparse and accurate", () => {
    const s = summarizeExtensions(records);
    expect(s.byLaneCount[3]).toBe(1); // ext 1
    expect(s.byLaneCount[1]).toBe(2); // ext 2 + ext 4
    expect(s.byLaneCount[0]).toBe(1); // ext 3
  });

  it("signed gauge counts non-null signingKeyId", () => {
    const s = summarizeExtensions(records);
    expect(s.signedCount).toBe(2); // ext 1 + ext 3
    expect(s.signedPercent).toBe(50);
  });

  it("actor-audit gauge counts non-null installedByUserId", () => {
    const s = summarizeExtensions(records);
    expect(s.actorAuditedCount).toBe(3); // ext 1 + 2 + 4
    expect(s.actorAuditPercent).toBe(75);
  });

  it("zeroCapability flags extensions with no lanes declared", () => {
    expect(summarizeExtensions(records).zeroCapabilityCount).toBe(1);
  });
});

describe("summarizeExtensions — percent rounding", () => {
  it("1/3 → 33.3", () => {
    const s = summarizeExtensions([
      makeExt({ signingKeyId: "k" }),
      makeExt({}),
      makeExt({}),
    ]);
    expect(s.signedPercent).toBe(33.3);
  });

  it("2/3 → 66.7", () => {
    const s = summarizeExtensions([
      makeExt({ signingKeyId: "k" }),
      makeExt({ signingKeyId: "k" }),
      makeExt({}),
    ]);
    expect(s.signedPercent).toBe(66.7);
  });

  it("0/N never returns NaN (defensive)", () => {
    const s = summarizeExtensions([
      makeExt({ installedByUserId: null }),
      makeExt({ installedByUserId: null }),
    ]);
    expect(s.actorAuditedCount).toBe(0);
    expect(s.actorAuditPercent).toBe(0);
    expect(Number.isNaN(s.actorAuditPercent)).toBe(false);
  });
});

describe("EXTENSION_LIFECYCLES — closed-taxonomy invariant", () => {
  it("contains exactly 4 lifecycle values", () => {
    expect(EXTENSION_LIFECYCLES.length).toBe(4);
  });

  it("matches the union from EXTENSION_GOVERNANCE_STATUS_METADATA", () => {
    expect(new Set(EXTENSION_LIFECYCLES)).toEqual(
      new Set(["awaiting_decision", "active", "dormant", "revoked"]),
    );
  });
});
