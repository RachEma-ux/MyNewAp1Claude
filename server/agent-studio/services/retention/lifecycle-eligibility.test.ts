import { describe, expect, it } from "vitest";

import {
  type ActiveHold,
  deriveApprovalStepEligibility,
  deriveNotePromotionEligibility,
  derivePublishRequestEligibility,
} from "./lifecycle-eligibility";

const NOW = new Date("2026-05-13T00:00:00.000Z");
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const SIXTY_DAYS_AGO = new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000);
const ONE_DAY_AGO = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);

const NO_HOLDS: ActiveHold[] = [];

const HOLD = (holdType: string): ActiveHold => ({
  id: 1,
  holdType,
  reason: null,
  setBy: null,
  setAt: NOW,
  holdUntil: null,
});

// ── publish-request happy path + every blocker ──────────────────────────────

describe("derivePublishRequestEligibility — happy path", () => {
  it("approved 60 days ago with no active link / no holds → eligible", () => {
    const result = derivePublishRequestEligibility({
      state: "approved",
      terminalAt: SIXTY_DAYS_AGO,
      now: NOW,
      retentionWindowMs: THIRTY_DAYS,
      activeHolds: NO_HOLDS,
      hasActiveReleaseLink: false,
    });
    expect(result.retentionEligible).toBe(true);
    expect(result.retentionBlockers).toEqual([]);
    expect(result.retentionEligibleAt).toEqual(new Date(SIXTY_DAYS_AGO.getTime() + THIRTY_DAYS));
  });
});

describe("derivePublishRequestEligibility — every blocker", () => {
  const BASE = {
    state: "approved" as const,
    terminalAt: SIXTY_DAYS_AGO,
    now: NOW,
    retentionWindowMs: THIRTY_DAYS,
    activeHolds: NO_HOLDS,
    hasActiveReleaseLink: false,
  };

  it("NON_TERMINAL_STATE: state=pending", () => {
    const result = derivePublishRequestEligibility({ ...BASE, state: "pending" as never });
    expect(result.retentionEligible).toBe(false);
    expect(result.retentionBlockers).toContain("NON_TERMINAL_STATE");
  });

  it("NO_TERMINAL_TIMESTAMP: terminalAt=null even when state is terminal", () => {
    const result = derivePublishRequestEligibility({ ...BASE, terminalAt: null });
    expect(result.retentionEligible).toBe(false);
    expect(result.retentionBlockers).toContain("NO_TERMINAL_TIMESTAMP");
  });

  it("ACTIVE_RELEASE_LINK: hasActiveReleaseLink=true", () => {
    const result = derivePublishRequestEligibility({ ...BASE, hasActiveReleaseLink: true });
    expect(result.retentionEligible).toBe(false);
    expect(result.retentionBlockers).toContain("ACTIVE_RELEASE_LINK");
  });

  it("MINIMUM_RETENTION_WINDOW_NOT_ELAPSED: terminalAt is 1 day ago, window is 30 days", () => {
    const result = derivePublishRequestEligibility({ ...BASE, terminalAt: ONE_DAY_AGO });
    expect(result.retentionEligible).toBe(false);
    expect(result.retentionBlockers).toContain("MINIMUM_RETENTION_WINDOW_NOT_ELAPSED");
  });

  it("LEGAL_HOLD: legal_hold present", () => {
    const result = derivePublishRequestEligibility({ ...BASE, activeHolds: [HOLD("legal_hold")] });
    expect(result.retentionBlockers).toContain("LEGAL_HOLD");
  });

  it("AUDIT_HOLD: audit_hold present", () => {
    const result = derivePublishRequestEligibility({ ...BASE, activeHolds: [HOLD("audit_hold")] });
    expect(result.retentionBlockers).toContain("AUDIT_HOLD");
  });

  it("GOVERNANCE_HOLD: governance_hold present", () => {
    const result = derivePublishRequestEligibility({
      ...BASE,
      activeHolds: [HOLD("governance_hold")],
    });
    expect(result.retentionBlockers).toContain("GOVERNANCE_HOLD");
  });

  it("OPEN_GOVERNANCE_REVIEW: governance_review hold type", () => {
    const result = derivePublishRequestEligibility({
      ...BASE,
      activeHolds: [HOLD("governance_review")],
    });
    expect(result.retentionBlockers).toContain("OPEN_GOVERNANCE_REVIEW");
  });

  it("UNRESOLVED_AUDIT_INVESTIGATION: audit_investigation hold type", () => {
    const result = derivePublishRequestEligibility({
      ...BASE,
      activeHolds: [HOLD("audit_investigation")],
    });
    expect(result.retentionBlockers).toContain("UNRESOLVED_AUDIT_INVESTIGATION");
  });

  it("unknown hold types fail-closed as GOVERNANCE_HOLD", () => {
    const result = derivePublishRequestEligibility({
      ...BASE,
      activeHolds: [HOLD("ceo_personal_hold")],
    });
    expect(result.retentionBlockers).toContain("GOVERNANCE_HOLD");
  });

  it("multiple blockers stack", () => {
    const result = derivePublishRequestEligibility({
      ...BASE,
      state: "pending" as never,
      terminalAt: null,
      hasActiveReleaseLink: true,
      activeHolds: [HOLD("legal_hold"), HOLD("audit_hold")],
    });
    expect(result.retentionEligible).toBe(false);
    expect(result.retentionBlockers).toEqual(
      expect.arrayContaining(["NON_TERMINAL_STATE", "NO_TERMINAL_TIMESTAMP", "ACTIVE_RELEASE_LINK", "LEGAL_HOLD", "AUDIT_HOLD"]),
    );
  });
});

// ── approval-step deriver ───────────────────────────────────────────────────

describe("deriveApprovalStepEligibility", () => {
  const BASE = {
    state: "approved",
    terminalAt: SIXTY_DAYS_AGO,
    now: NOW,
    retentionWindowMs: THIRTY_DAYS,
    activeHolds: NO_HOLDS,
    parentPublishRequestState: "approved",
    parentPublishRequestTerminalAt: SIXTY_DAYS_AGO,
    parentHasActiveReleaseLink: false,
  };

  it("happy path: parent terminal, no link, no holds → eligible", () => {
    const result = deriveApprovalStepEligibility(BASE);
    expect(result.retentionEligible).toBe(true);
  });

  it("PENDING_APPROVAL_CHAIN: parent state is pending", () => {
    const result = deriveApprovalStepEligibility({
      ...BASE,
      parentPublishRequestState: "pending",
    });
    expect(result.retentionEligible).toBe(false);
    expect(result.retentionBlockers).toContain("PENDING_APPROVAL_CHAIN");
  });

  it("step cannot outlive parent: own terminalAt 60d ago, parent terminalAt today → not eligible", () => {
    const result = deriveApprovalStepEligibility({
      ...BASE,
      terminalAt: SIXTY_DAYS_AGO,
      parentPublishRequestTerminalAt: NOW,
    });
    expect(result.retentionEligible).toBe(false);
    expect(result.retentionBlockers).toContain("MINIMUM_RETENTION_WINDOW_NOT_ELAPSED");
  });

  it("inherits ACTIVE_RELEASE_LINK from parent", () => {
    const result = deriveApprovalStepEligibility({ ...BASE, parentHasActiveReleaseLink: true });
    expect(result.retentionEligible).toBe(false);
    expect(result.retentionBlockers).toContain("ACTIVE_RELEASE_LINK");
  });

  it("own terminalAt=null is a blocker even if parent is terminal", () => {
    const result = deriveApprovalStepEligibility({ ...BASE, terminalAt: null });
    expect(result.retentionBlockers).toContain("NO_TERMINAL_TIMESTAMP");
  });

  it("inherits parent-level holds: a legal_hold on the parent publish-request protects the step", () => {
    // Loader contract: own-holds + parent-holds are concatenated before
    // reaching the deriver. Test by passing a parent-hold via activeHolds
    // and confirming the deriver classifies it the same way as own-holds.
    const result = deriveApprovalStepEligibility({
      ...BASE,
      activeHolds: [HOLD("legal_hold")],
    });
    expect(result.retentionEligible).toBe(false);
    expect(result.retentionBlockers).toContain("LEGAL_HOLD");
  });
});

// ── note-promotion deriver ──────────────────────────────────────────────────

describe("deriveNotePromotionEligibility", () => {
  const BASE = {
    state: "approved",
    terminalAt: SIXTY_DAYS_AGO,
    now: NOW,
    retentionWindowMs: THIRTY_DAYS,
    activeHolds: NO_HOLDS,
    hasActiveVersion: false,
  };

  it("happy path: terminal + no active version + no holds → eligible", () => {
    const result = deriveNotePromotionEligibility(BASE);
    expect(result.retentionEligible).toBe(true);
  });

  it("ACTIVE_PROMOTION_VERSION: hasActiveVersion=true blocks", () => {
    const result = deriveNotePromotionEligibility({ ...BASE, hasActiveVersion: true });
    expect(result.retentionEligible).toBe(false);
    expect(result.retentionBlockers).toContain("ACTIVE_PROMOTION_VERSION");
  });

  it("rolled_back is terminal (not blocked by NON_TERMINAL_STATE)", () => {
    const result = deriveNotePromotionEligibility({
      ...BASE,
      state: "rolled_back",
    });
    expect(result.retentionBlockers).not.toContain("NON_TERMINAL_STATE");
  });

  it("in_review state is NON_TERMINAL_STATE", () => {
    const result = deriveNotePromotionEligibility({ ...BASE, state: "in_review" });
    expect(result.retentionBlockers).toContain("NON_TERMINAL_STATE");
  });

  it("rolled_back + active version + governance_review hold → preserved", () => {
    const result = deriveNotePromotionEligibility({
      ...BASE,
      state: "rolled_back",
      hasActiveVersion: true,
      activeHolds: [HOLD("governance_review")],
    });
    expect(result.retentionEligible).toBe(false);
    expect(result.retentionBlockers).toEqual(
      expect.arrayContaining(["ACTIVE_PROMOTION_VERSION", "OPEN_GOVERNANCE_REVIEW"]),
    );
  });
});

// ── retention-eligibleAt timing ─────────────────────────────────────────────

describe("retentionEligibleAt computation", () => {
  it("equals terminalAt + retentionWindowMs", () => {
    const terminalAt = new Date("2026-01-01T00:00:00Z");
    const result = derivePublishRequestEligibility({
      state: "approved",
      terminalAt,
      now: NOW,
      retentionWindowMs: THIRTY_DAYS,
      activeHolds: NO_HOLDS,
      hasActiveReleaseLink: false,
    });
    expect(result.retentionEligibleAt).toEqual(new Date(terminalAt.getTime() + THIRTY_DAYS));
  });

  it("is null when terminalAt is null", () => {
    const result = derivePublishRequestEligibility({
      state: "approved",
      terminalAt: null,
      now: NOW,
      retentionWindowMs: THIRTY_DAYS,
      activeHolds: NO_HOLDS,
      hasActiveReleaseLink: false,
    });
    expect(result.retentionEligibleAt).toBeNull();
  });

  it("approval-step uses MAX(own, parent) terminalAt for eligibleAt", () => {
    const ownTerm = SIXTY_DAYS_AGO;
    const parentTerm = ONE_DAY_AGO;
    const result = deriveApprovalStepEligibility({
      state: "approved",
      terminalAt: ownTerm,
      now: NOW,
      retentionWindowMs: THIRTY_DAYS,
      activeHolds: NO_HOLDS,
      parentPublishRequestState: "approved",
      parentPublishRequestTerminalAt: parentTerm,
      parentHasActiveReleaseLink: false,
    });
    expect(result.retentionEligibleAt).toEqual(new Date(parentTerm.getTime() + THIRTY_DAYS));
  });
});
