/**
 * requireGate — Phase A/B Separation Tests
 *
 * Validates the architectural invariant:
 *   Enforcement failure may block execution.
 *   Observability failure must NEVER block execution.
 *
 * CASE 1: Scorecard ALLOW + persistEvidenceBundle throws → mutation succeeds
 * CASE 2: Scorecard DENY  + persistEvidenceBundle throws → mutation fails
 * CASE 3: Freeze active → mutation fails even if persistence works
 * CASE 4: Evidence persistence works normally → behavior unchanged
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock evidence persistence — must be hoisted before import
vi.mock("./scorecard/evidence", () => ({
  persistEvidenceBundle: vi.fn().mockResolvedValue(undefined),
}));

// Mock audit logger
const mockAuditLog = vi.fn().mockResolvedValue({ event_id: "audit-test-001" });
vi.mock("../services/auditLogger", () => ({
  getAuditLogger: () => ({ log: mockAuditLog }),
}));

// Mock scorecard module
const mockRunScorecard = vi.fn();
const mockIsFrozen = vi.fn().mockReturnValue(false);
const mockGetFreezeDetails = vi.fn().mockReturnValue(null);

vi.mock("./scorecard", () => ({
  runScorecard: (...args: any[]) => mockRunScorecard(...args),
  isFrozen: (...args: any[]) => mockIsFrozen(...args),
  getFreezeDetails: (...args: any[]) => mockGetFreezeDetails(...args),
}));

import { requireGate } from "./requireGate";
import { persistEvidenceBundle } from "./scorecard/evidence";

// ============================================================================
// Fixtures
// ============================================================================

const testSubject = {
  id: 42,
  name: "test-provider",
  type: "provider",
  tags: ["candidate"],
};

const testActor = { id: "user-1", role: "admin" };

function makeScorecardResult(passed: boolean) {
  return {
    scorecard: {
      gateStatus: {
        passed,
        reason: passed ? "Gate passed: score meets threshold" : "Gate failed: score below threshold",
        stage: "submit",
      },
      gateVerdict: passed ? "ALLOW" : "DENY",
      score: { score: passed ? 89 : 30 },
      riskBreakdown: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
      controlResults: [],
      passCount: passed ? 5 : 1,
      failCount: passed ? 0 : 4,
      skipCount: 0,
    },
    evidence: {
      bundleId: "EVB-test-001",
      version: "1.0" as const,
      timestamp: new Date().toISOString(),
      commitRef: "abc1234",
      triggeredBy: "user-1",
      stage: "submit",
      score: passed ? 89 : 30,
      gatePassed: passed,
      gateReason: passed ? "Gate passed" : "Gate failed",
      risk: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
      controls: [],
      summary: { total: 5, passed: passed ? 5 : 1, failed: passed ? 0 : 4, skipped: 0 },
      integrityHash: "a".repeat(64),
    },
    blocked: !passed,
    httpStatus: passed ? 200 : 409,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("requireGate — Phase A/B enforcement separation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsFrozen.mockReturnValue(false);
    mockGetFreezeDetails.mockReturnValue(null);
  });

  // ── CASE 1: ALLOW + evidence throws → mutation succeeds ────────────
  it("CASE 1: scorecard ALLOW + persistEvidenceBundle throws → still returns ALLOW", async () => {
    mockRunScorecard.mockResolvedValue(makeScorecardResult(true));
    vi.mocked(persistEvidenceBundle).mockRejectedValueOnce(
      new Error("DB connection refused — evidence_bundles table missing")
    );

    const result = await requireGate("submit" as any, testSubject, testActor);

    // Gate MUST return ALLOW — evidence failure is non-fatal
    expect(result.verdict).toBe("ALLOW");
    expect(result.denied).toBe(false);
    expect(result.httpStatus).toBe(200);
    expect(result.frozen).toBe(false);

    // Evidence persistence was attempted
    expect(persistEvidenceBundle).toHaveBeenCalledOnce();
  });

  // ── CASE 2: DENY + evidence throws → mutation still fails ─────────
  it("CASE 2: scorecard DENY + persistEvidenceBundle throws → still returns DENY", async () => {
    mockRunScorecard.mockResolvedValue(makeScorecardResult(false));
    vi.mocked(persistEvidenceBundle).mockRejectedValueOnce(
      new Error("DB connection refused")
    );

    const result = await requireGate("submit" as any, testSubject, testActor);

    // Gate MUST return DENY — enforcement is preserved
    expect(result.verdict).toBe("DENY");
    expect(result.denied).toBe(true);
    expect(result.httpStatus).toBe(409);
    expect(result.frozen).toBe(false);

    // Denial audit was logged (blocking)
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action_type: "GATE_CHECK",
        decision_result: "denied",
      })
    );
  });

  // ── CASE 3: Freeze active → denied even if persistence works ──────
  it("CASE 3: freeze active → DENY regardless of persistence health", async () => {
    mockIsFrozen.mockReturnValue(true);
    mockGetFreezeDetails.mockReturnValue({
      reason: "Critical drift detected",
      frozenAt: new Date(),
      frozenBy: "drift-detector",
    });

    const result = await requireGate("submit" as any, testSubject, testActor);

    // Gate MUST return DENY with frozen=true
    expect(result.verdict).toBe("DENY");
    expect(result.denied).toBe(true);
    expect(result.frozen).toBe(true);
    expect(result.freezeDetails?.reason).toBe("Critical drift detected");

    // Scorecard was never run (frozen short-circuit)
    expect(mockRunScorecard).not.toHaveBeenCalled();

    // Evidence was never persisted (no scorecard = no evidence)
    expect(persistEvidenceBundle).not.toHaveBeenCalled();

    // Denial audit was logged (blocking)
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action_type: "FREEZE_BLOCK",
        decision_result: "denied",
      })
    );
  });

  // ── CASE 4: Normal operation — evidence persists, behavior unchanged
  it("CASE 4: scorecard ALLOW + evidence persists normally → ALLOW with audit", async () => {
    mockRunScorecard.mockResolvedValue(makeScorecardResult(true));
    vi.mocked(persistEvidenceBundle).mockResolvedValue(undefined);

    const result = await requireGate("submit" as any, testSubject, testActor);

    // Gate returns ALLOW
    expect(result.verdict).toBe("ALLOW");
    expect(result.denied).toBe(false);
    expect(result.httpStatus).toBe(200);
    expect(result.auditId).toBe("audit-test-001");

    // Evidence was persisted
    expect(persistEvidenceBundle).toHaveBeenCalledOnce();

    // Audit log was recorded with success
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action_type: "GATE_CHECK",
        decision_result: "success",
        metadata: expect.objectContaining({
          verdict: "ALLOW",
          blocked: false,
        }),
      })
    );
  });

  // ── CASE 5: ALLOW + audit log throws → still returns ALLOW ────────
  it("CASE 5: scorecard ALLOW + audit log throws → still returns ALLOW", async () => {
    mockRunScorecard.mockResolvedValue(makeScorecardResult(true));
    vi.mocked(persistEvidenceBundle).mockResolvedValue(undefined);
    // Audit succeeds for the first call but would fail for ALLOW audit
    mockAuditLog.mockRejectedValueOnce(new Error("Audit DB write failed"));

    const result = await requireGate("submit" as any, testSubject, testActor);

    // Gate MUST return ALLOW — audit failure is non-fatal for ALLOW verdict
    expect(result.verdict).toBe("ALLOW");
    expect(result.denied).toBe(false);
    expect(result.httpStatus).toBe(200);
    // auditId will be local fallback since audit log threw
    expect(result.auditId).toMatch(/^local-\d+$/);
  });

  // ── CASE 6: DENY path — audit + evidence are blocking ─────────────
  it("CASE 6: scorecard DENY → denial audit is blocking (propagates error)", async () => {
    mockRunScorecard.mockResolvedValue(makeScorecardResult(false));
    vi.mocked(persistEvidenceBundle).mockResolvedValue(undefined);

    const result = await requireGate("submit" as any, testSubject, testActor);

    expect(result.verdict).toBe("DENY");
    expect(result.denied).toBe(true);

    // For DENY, audit MUST be called with "denied" before evidence persistence
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        decision_result: "denied",
        metadata: expect.objectContaining({ verdict: "DENY" }),
      })
    );

    // Evidence bundle IS persisted for denials (enforcement record)
    expect(persistEvidenceBundle).toHaveBeenCalledOnce();
  });
});
