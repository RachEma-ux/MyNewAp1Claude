/**
 * Autonomous Remediation Test Suite
 * 
 * Tests for auto-fixing safe drift violations
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { autoRemediate, canAutoRemediate, getRemediationHistory } from "./autonomous-remediation";

describe("Autonomous Remediation", () => {
  describe("canAutoRemediate", () => {
    it("should allow auto-remediation for budget adjustments", () => {
      const drift = {
        driftType: "policy_change",
        severity: "medium",
        details: { violation: "budget_exceeded" },
      };
      
      expect(canAutoRemediate(drift)).toBe(true);
    });

    it("should allow auto-remediation for capability removal", () => {
      const drift = {
        driftType: "policy_change",
        severity: "low",
        details: { violation: "forbidden_capability" },
      };
      
      expect(canAutoRemediate(drift)).toBe(true);
    });

    it("should block auto-remediation for spec tampering", () => {
      const drift = {
        driftType: "spec_tamper",
        severity: "critical",
        details: {},
      };
      
      expect(canAutoRemediate(drift)).toBe(false);
    });

    it("should block auto-remediation for expiry", () => {
      const drift = {
        driftType: "expired",
        severity: "high",
        details: {},
      };
      
      expect(canAutoRemediate(drift)).toBe(false);
    });

    it("should block auto-remediation for critical policy violations", () => {
      const drift = {
        driftType: "policy_change",
        severity: "critical",
        details: { violation: "security_breach" },
      };
      
      expect(canAutoRemediate(drift)).toBe(false);
    });
  });

  describe("autoRemediate", () => {
    it("should fix budget violations by reducing limits", async () => {
      const agentId = "test-agent-id";
      const drift = {
        driftType: "policy_change",
        severity: "medium",
        details: { violation: "budget_exceeded", currentBudget: 1000, maxBudget: 500 },
      };
      
      const result = await autoRemediate(agentId, drift);
      
      expect(result.success).toBe(true);
      expect(result.action).toContain("budget");
    });

    it("should remove forbidden capabilities", async () => {
      const agentId = "test-agent-id";
      const drift = {
        driftType: "policy_change",
        severity: "low",
        details: { violation: "forbidden_capability", capability: "file_write" },
      };
      
      const result = await autoRemediate(agentId, drift);
      
      expect(result.success).toBe(true);
      expect(result.action).toContain("capability");
    });

    it("should fail for non-remediable drift", async () => {
      const agentId = "test-agent-id";
      const drift = {
        driftType: "spec_tamper",
        severity: "critical",
        details: {},
      };
      
      const result = await autoRemediate(agentId, drift);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it("should log remediation actions", async () => {
      const agentId = "test-agent-id";
      const drift = {
        driftType: "policy_change",
        severity: "medium",
        details: { violation: "budget_exceeded" },
      };
      
      const result = await autoRemediate(agentId, drift);
      
      if (result.success) {
        expect(result.logId).toBeTruthy();
      }
    });

    it("should update agent status after remediation", async () => {
      const agentId = "test-agent-id";
      const drift = {
        driftType: "policy_change",
        severity: "medium",
        details: { violation: "budget_exceeded" },
      };
      
      const result = await autoRemediate(agentId, drift);
      
      if (result.success) {
        expect(result.newStatus).toBeTruthy();
      }
    });

    it("should handle remediation failures gracefully", async () => {
      const agentId = "non-existent-agent";
      const drift = {
        driftType: "policy_change",
        severity: "medium",
        details: { violation: "budget_exceeded" },
      };
      
      const result = await autoRemediate(agentId, drift);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
    });
  });

  describe("getRemediationHistory", () => {
    it("should return remediation history for agent", async () => {
      const agentId = "test-agent-id";
      const history = await getRemediationHistory(agentId);
      
      expect(Array.isArray(history)).toBe(true);
    });

    it("should include remediation timestamps", async () => {
      const agentId = "test-agent-id";
      const history = await getRemediationHistory(agentId);
      
      for (const record of history) {
        expect(record.remediatedAt).toBeInstanceOf(Date);
      }
    });

    it("should include remediation actions", async () => {
      const agentId = "test-agent-id";
      const history = await getRemediationHistory(agentId);
      
      for (const record of history) {
        expect(record.action).toBeTruthy();
        expect(typeof record.action).toBe("string");
      }
    });

    it("should limit history results", async () => {
      const agentId = "test-agent-id";
      const limit = 10;
      const history = await getRemediationHistory(agentId, limit);
      
      expect(history.length).toBeLessThanOrEqual(limit);
    });
  });
});
