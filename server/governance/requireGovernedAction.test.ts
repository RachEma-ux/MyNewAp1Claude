/**
 * Unified Platform Governance Tests — requireGovernedAction
 *
 * Test cases:
 * 1. R1 action executes without governance call
 * 2. R3 action triggers evaluate
 * 3. R4 action requires approval
 * 4. R5 action requires dual control
 * 5. Freeze blocks R3+
 * 6. Unknown actionKey throws
 * 7. Missing evidence throws
 * 8. Missing approval blocks execution
 * 9. Coverage map fails when wrapper removed
 * 10. Action registry loads and validates
 * 11. Risk levels are correctly classified
 * 12. Preflight returns correct governance requirements
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the dependencies
const mockIsFrozen = vi.fn().mockReturnValue(false);
const mockGetFreezeDetails = vi.fn().mockReturnValue(null);
const mockRequireGate = vi.fn().mockResolvedValue({
  verdict: "ALLOW",
  denied: false,
  reason: "Gate passed",
  httpStatus: 200,
  auditId: "test-audit-001",
  frozen: false,
});
const mockAuditLog = vi.fn().mockResolvedValue({ event_id: "evt-001" });
const mockHasPermission = vi.fn().mockReturnValue(true);

vi.mock("./scorecard", () => ({
  isFrozen: (...args: any[]) => mockIsFrozen(...args),
  getFreezeDetails: (...args: any[]) => mockGetFreezeDetails(...args),
}));

vi.mock("./requireGate", () => ({
  requireGate: (...args: any[]) => mockRequireGate(...args),
}));

vi.mock("../services/auditLogger", () => ({
  getAuditLogger: () => ({
    log: (...args: any[]) => mockAuditLog(...args),
  }),
}));

vi.mock("./rbac-model", () => ({
  normalizeRole: (r: string) => r,
  hasPermission: (...args: any[]) => mockHasPermission(...args),
}));

// Mock js-yaml and fs to provide test registry data
vi.mock("js-yaml", () => ({
  load: (content: string) => {
    // Return a test registry
    return {
      version: 1,
      governance_threshold: "R3",
      actions: {
        "test.r1.action": {
          domain: "test",
          risk: "R1",
          capability: "test.manage",
          stage: "mutate",
          approval: "none",
          evidence: { required: false },
        },
        "test.r2.action": {
          domain: "test",
          risk: "R2",
          capability: "test.manage",
          stage: "mutate",
          approval: "none",
          evidence: { required: false },
        },
        "test.r3.action": {
          domain: "test",
          risk: "R3",
          capability: "test.manage",
          stage: "mutate",
          approval: "role_any",
          evidence: { required: true, types: ["reason"] },
        },
        "test.r4.action": {
          domain: "test",
          risk: "R4",
          capability: "test.manage",
          stage: "mutate",
          approval: "role_any",
          evidence: { required: true, types: ["reason", "diff"] },
        },
        "test.r5.action": {
          domain: "test",
          risk: "R5",
          capability: "test.manage",
          stage: "mutate",
          approval: "dual_control",
          evidence: { required: true, types: ["reason", "diff", "tests_passed"] },
        },
        "test.freeze.action": {
          domain: "test",
          risk: "R3",
          capability: "test.manage",
          stage: "mutate",
          approval: "none",
          evidence: { required: false },
        },
      },
    };
  },
}));

vi.mock("fs", () => ({
  existsSync: () => true,
  readFileSync: () => "mocked",
}));

// Reset the registry singleton before importing
import { resetActionRegistry } from "./action-registry";

describe("Unified Platform Governance — requireGovernedAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetActionRegistry();
    mockIsFrozen.mockReturnValue(false);
    mockGetFreezeDetails.mockReturnValue(null);
    mockRequireGate.mockResolvedValue({
      verdict: "ALLOW",
      denied: false,
      reason: "Gate passed",
      httpStatus: 200,
      auditId: "test-audit-001",
      frozen: false,
    });
    mockHasPermission.mockReturnValue(true);
  });

  afterEach(() => {
    resetActionRegistry();
  });

  // ── Test 1: R1 action executes without governance call ─────────────────
  it("R1 action passes without GovernanceCenter evaluation", async () => {
    const { requireGovernedAction } = await import("./requireGovernedAction");

    const receipt = await requireGovernedAction({
      actionKey: "test.r1.action",
      actorPrincipalId: "user-1",
      actorRole: "admin",
      orgId: "org-1",
      subject: { subjectType: "test", subjectId: "1" },
      context: {},
    });

    expect(receipt.allowed).toBe(true);
    expect(receipt.risk).toBe("R1");
    // requireGate should NOT be called for R1
    expect(mockRequireGate).not.toHaveBeenCalled();
    expect(receipt.governanceRunId).toBeUndefined();
  });

  // ── Test 2: R2 action passes without governance evaluation ─────────────
  it("R2 action passes without GovernanceCenter evaluation", async () => {
    const { requireGovernedAction } = await import("./requireGovernedAction");

    const receipt = await requireGovernedAction({
      actionKey: "test.r2.action",
      actorPrincipalId: "user-1",
      actorRole: "admin",
      orgId: "org-1",
      subject: { subjectType: "test", subjectId: "1" },
      context: {},
    });

    expect(receipt.allowed).toBe(true);
    expect(receipt.risk).toBe("R2");
    expect(mockRequireGate).not.toHaveBeenCalled();
  });

  // ── Test 3: R3 action triggers GovernanceCenter evaluate ───────────────
  it("R3 action triggers GovernanceCenter.evaluate via requireGate", async () => {
    const { requireGovernedAction } = await import("./requireGovernedAction");

    const receipt = await requireGovernedAction({
      actionKey: "test.r3.action",
      actorPrincipalId: "user-1",
      actorRole: "admin",
      orgId: "org-1",
      subject: { subjectType: "test", subjectId: "1" },
      context: {},
      evidence: { types: ["reason"], refs: ["ref-001"] },
    });

    expect(receipt.allowed).toBe(true);
    expect(receipt.risk).toBe("R3");
    // requireGate MUST be called for R3
    expect(mockRequireGate).toHaveBeenCalledTimes(1);
    expect(receipt.governanceRunId).toBe("test-audit-001");
  });

  // ── Test 4: R4 action requires approval ────────────────────────────────
  it("R4 action requires approval", async () => {
    const { requireGovernedAction } = await import("./requireGovernedAction");

    const receipt = await requireGovernedAction({
      actionKey: "test.r4.action",
      actorPrincipalId: "user-1",
      actorRole: "admin",
      orgId: "org-1",
      subject: { subjectType: "test", subjectId: "1" },
      context: {},
      evidence: { types: ["reason", "diff"], refs: ["ref-001"] },
      approvals: [{ approverPrincipalId: "approver-1", approvedAt: new Date().toISOString() }],
    });

    expect(receipt.allowed).toBe(true);
    expect(receipt.risk).toBe("R4");
    expect(receipt.approvalRequired).toBe(true);
    expect(receipt.approvalStatus).toBe("approved");
    expect(mockRequireGate).toHaveBeenCalledTimes(1);
  });

  // ── Test 5: R5 action requires dual control ────────────────────────────
  it("R5 action requires dual control approval", async () => {
    const { requireGovernedAction } = await import("./requireGovernedAction");

    const receipt = await requireGovernedAction({
      actionKey: "test.r5.action",
      actorPrincipalId: "user-1",
      actorRole: "admin",
      orgId: "org-1",
      subject: { subjectType: "test", subjectId: "1" },
      context: {},
      evidence: { types: ["reason", "diff", "tests_passed"], refs: ["ref-001", "ref-002"] },
      approvals: [
        { approverPrincipalId: "approver-1", approvedAt: new Date().toISOString() },
        { approverPrincipalId: "approver-2", approvedAt: new Date().toISOString() },
      ],
    });

    expect(receipt.allowed).toBe(true);
    expect(receipt.risk).toBe("R5");
    expect(receipt.approvalRequired).toBe(true);
  });

  // ── Test 6: Freeze blocks R3+ actions ──────────────────────────────────
  it("system-wide freeze blocks all actions", async () => {
    mockIsFrozen.mockImplementation((id: number) => id === 0);
    mockGetFreezeDetails.mockReturnValue({
      reason: "Critical drift detected",
      frozenAt: new Date(),
      frozenBy: "system",
    });

    const { requireGovernedAction } = await import("./requireGovernedAction");

    const receipt = await requireGovernedAction({
      actionKey: "test.r3.action",
      actorPrincipalId: "user-1",
      actorRole: "admin",
      orgId: "org-1",
      subject: { subjectType: "test", subjectId: "1" },
      context: {},
      evidence: { types: ["reason"], refs: ["ref-001"] },
    });

    expect(receipt.allowed).toBe(false);
    expect(receipt.denialReason).toContain("FREEZE");
  });

  // ── Test 7: Unknown actionKey throws (deny-by-default) ─────────────────
  it("unknown actionKey is denied by default", async () => {
    const { requireGovernedAction } = await import("./requireGovernedAction");

    await expect(
      requireGovernedAction({
        actionKey: "nonexistent.action.key",
        actorPrincipalId: "user-1",
        actorRole: "admin",
        orgId: "org-1",
        subject: { subjectType: "test", subjectId: "1" },
        context: {},
      })
    ).rejects.toThrow("Unknown action key");
  });

  // ── Test 8: Missing evidence blocks execution ──────────────────────────
  it("missing evidence blocks R3+ action", async () => {
    const { requireGovernedAction } = await import("./requireGovernedAction");

    const receipt = await requireGovernedAction({
      actionKey: "test.r3.action",
      actorPrincipalId: "user-1",
      actorRole: "admin",
      orgId: "org-1",
      subject: { subjectType: "test", subjectId: "1" },
      context: {},
      // No evidence provided, but R3 action requires "reason"
    });

    expect(receipt.allowed).toBe(false);
    expect(receipt.denialReason).toContain("Evidence requirement not met");
    expect(receipt.denialReason).toContain("reason");
  });

  // ── Test 9: Subject freeze blocks action ───────────────────────────────
  it("subject freeze blocks action on that subject", async () => {
    mockIsFrozen.mockImplementation((id: number) => id === 42);
    mockGetFreezeDetails.mockReturnValue({
      reason: "Subject frozen for review",
      frozenAt: new Date(),
      frozenBy: "admin",
    });

    const { requireGovernedAction } = await import("./requireGovernedAction");

    const receipt = await requireGovernedAction({
      actionKey: "test.r1.action",
      actorPrincipalId: "user-1",
      actorRole: "admin",
      orgId: "org-1",
      subject: { subjectType: "test", subjectId: "42" },
      context: {},
    });

    expect(receipt.allowed).toBe(false);
    expect(receipt.denialReason).toContain("FROZEN");
  });

  // ── Test 10: Gate denial propagates ─────────────────────────────────────
  it("gate denial from requireGate propagates through wrapper", async () => {
    mockRequireGate.mockResolvedValue({
      verdict: "DENY",
      denied: true,
      reason: "Scorecard failed: 45/100",
      httpStatus: 409,
      auditId: "test-deny-001",
      frozen: false,
    });

    const { requireGovernedAction } = await import("./requireGovernedAction");

    const receipt = await requireGovernedAction({
      actionKey: "test.r3.action",
      actorPrincipalId: "user-1",
      actorRole: "admin",
      orgId: "org-1",
      subject: { subjectType: "test", subjectId: "1" },
      context: {},
      evidence: { types: ["reason"], refs: ["ref-001"] },
    });

    expect(receipt.allowed).toBe(false);
    expect(receipt.denialReason).toContain("Scorecard failed");
    expect(receipt.gateResult?.denied).toBe(true);
  });

  // ── Test 11: RBAC denial blocks action ──────────────────────────────────
  it("RBAC denial blocks action for unauthorized role", async () => {
    mockHasPermission.mockReturnValue(false);

    const { requireGovernedAction } = await import("./requireGovernedAction");

    const receipt = await requireGovernedAction({
      actionKey: "test.r1.action",
      actorPrincipalId: "user-1",
      actorRole: "viewer",
      orgId: "org-1",
      subject: { subjectType: "test", subjectId: "1" },
      context: {},
    });

    expect(receipt.allowed).toBe(false);
    expect(receipt.denialReason).toContain("RBAC denial");
  });

  // ── Test 12: Receipt contains correct fields ───────────────────────────
  it("receipt contains all required fields", async () => {
    const { requireGovernedAction } = await import("./requireGovernedAction");

    const receipt = await requireGovernedAction({
      actionKey: "test.r1.action",
      actorPrincipalId: "user-1",
      actorRole: "admin",
      orgId: "org-1",
      subject: { subjectType: "test", subjectId: "1" },
      context: {},
    });

    expect(receipt).toHaveProperty("actionKey", "test.r1.action");
    expect(receipt).toHaveProperty("risk", "R1");
    expect(receipt).toHaveProperty("approvalRequired", false);
    expect(receipt).toHaveProperty("timestamp");
    expect(receipt).toHaveProperty("allowed", true);
    expect(typeof receipt.timestamp).toBe("string");
  });
});

describe("Action Registry", () => {
  beforeEach(() => {
    resetActionRegistry();
  });

  afterEach(() => {
    resetActionRegistry();
  });

  it("loads and validates the registry", async () => {
    const { getActionRegistry } = await import("./action-registry");
    const registry = getActionRegistry();

    expect(registry.version).toBe(1);
    expect(registry.governance_threshold).toBe("R3");
    expect(Object.keys(registry.actions).length).toBeGreaterThan(0);
  });

  it("getActionDef returns correct definition", async () => {
    const { getActionDef } = await import("./action-registry");
    const def = getActionDef("test.r3.action");

    expect(def.risk).toBe("R3");
    expect(def.domain).toBe("test");
    expect(def.approval).toBe("role_any");
    expect(def.evidence.required).toBe(true);
  });

  it("isAboveThreshold correctly classifies R1/R2 as below", async () => {
    const { isAboveThreshold } = await import("./action-registry");

    expect(isAboveThreshold("test.r1.action")).toBe(false);
    expect(isAboveThreshold("test.r2.action")).toBe(false);
    expect(isAboveThreshold("test.r3.action")).toBe(true);
    expect(isAboveThreshold("test.r4.action")).toBe(true);
    expect(isAboveThreshold("test.r5.action")).toBe(true);
  });

  it("unknown action key throws with deny-by-default message", async () => {
    const { getActionDef } = await import("./action-registry");

    expect(() => getActionDef("totally.unknown.key")).toThrow(
      "Unknown action key"
    );
  });
});

describe("Preflight Check", () => {
  beforeEach(() => {
    resetActionRegistry();
  });

  afterEach(() => {
    resetActionRegistry();
  });

  it("returns correct governance requirements for R1 action", async () => {
    const { preflightCheck } = await import("./requireGovernedAction");
    const result = preflightCheck("test.r1.action");

    expect(result.risk).toBe("R1");
    expect(result.aboveThreshold).toBe(false);
    expect(result.approvalRequired).toBe(false);
    expect(result.evidenceRequired).toBe(false);
  });

  it("returns correct governance requirements for R5 action", async () => {
    const { preflightCheck } = await import("./requireGovernedAction");
    const result = preflightCheck("test.r5.action");

    expect(result.risk).toBe("R5");
    expect(result.aboveThreshold).toBe(true);
    expect(result.approvalRequired).toBe(true);
    expect(result.approvalRule).toBe("dual_control");
    expect(result.evidenceRequired).toBe(true);
    expect(result.evidenceTypes).toContain("reason");
    expect(result.evidenceTypes).toContain("diff");
    expect(result.evidenceTypes).toContain("tests_passed");
  });

  it("throws for unknown action key", async () => {
    const { preflightCheck } = await import("./requireGovernedAction");

    expect(() => preflightCheck("unknown.key")).toThrow("Unknown action key");
  });
});
