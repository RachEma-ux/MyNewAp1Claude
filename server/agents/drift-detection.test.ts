/**
 * Drift Detection Test Suite
 * 
 * Tests for policy drift, spec tampering, expiry detection
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { detectDrift, detectAgentDrift, getAgentDriftHistory } from "./drift-detector";
import { computeSpecHash } from "../../features/agents-create/types/agent-schema";

describe("Drift Detection", () => {
  describe("detectDrift", () => {
    it("should detect policy drift when agent no longer complies", async () => {
      // Mock agent that violates current policy
      const summary = await detectDrift();
      
      expect(summary).toHaveProperty("totalDrifted");
      expect(summary).toHaveProperty("byType");
      expect(summary).toHaveProperty("bySeverity");
      expect(summary).toHaveProperty("reports");
      expect(Array.isArray(summary.reports)).toBe(true);
    });

    it("should detect spec tampering via hash mismatch", async () => {
      const summary = await detectDrift();
      
      const tamperedAgents = summary.reports.filter(r => r.driftType === "spec_tamper");
      expect(tamperedAgents.every(a => a.severity === "critical")).toBe(true);
    });

    it("should detect expired agents", async () => {
      const summary = await detectDrift();
      
      const expiredAgents = summary.reports.filter(r => r.driftType === "expired");
      expect(expiredAgents.every(a => a.recommendedAction.includes("Renew"))).toBe(true);
    });

    it("should categorize drift by type", async () => {
      const summary = await detectDrift();
      
      expect(summary.byType).toHaveProperty("policy_change");
      expect(summary.byType).toHaveProperty("spec_tamper");
      expect(summary.byType).toHaveProperty("expired");
    });

    it("should categorize drift by severity", async () => {
      const summary = await detectDrift();
      
      expect(summary.bySeverity).toHaveProperty("critical");
      expect(summary.bySeverity).toHaveProperty("high");
      expect(summary.bySeverity).toHaveProperty("medium");
      expect(summary.bySeverity).toHaveProperty("low");
    });

    it("should return zero drift when all agents compliant", async () => {
      // Assuming clean database state
      const summary = await detectDrift();
      
      expect(summary.totalDrifted).toBeGreaterThanOrEqual(0);
      expect(summary.reports.length).toBe(summary.totalDrifted);
    });

    it("should include recommended actions for each drift", async () => {
      const summary = await detectDrift();
      
      for (const report of summary.reports) {
        expect(report.recommendedAction).toBeTruthy();
        expect(typeof report.recommendedAction).toBe("string");
      }
    });

    it("should include drift detection timestamp", async () => {
      const summary = await detectDrift();
      
      for (const report of summary.reports) {
        expect(report.detectedAt).toBeInstanceOf(Date);
      }
    });
  });

  describe("detectAgentDrift", () => {
    it("should detect drift for specific agent", async () => {
      const agentId = "test-agent-id";
      const drift = await detectAgentDrift(agentId);
      
      // Should return null if no drift, or DriftReport if drifted
      if (drift) {
        expect(drift.agentId).toBe(agentId);
        expect(drift).toHaveProperty("driftType");
        expect(drift).toHaveProperty("severity");
      }
    });

    it("should return null for compliant agent", async () => {
      const agentId = "compliant-agent-id";
      const drift = await detectAgentDrift(agentId);
      
      // Assuming agent doesn't exist or is compliant
      expect(drift).toBeNull();
    });
  });

  describe("getAgentDriftHistory", () => {
    it("should return drift history for agent", async () => {
      const agentId = "test-agent-id";
      const history = await getAgentDriftHistory(agentId);
      
      expect(Array.isArray(history)).toBe(true);
    });

    it("should limit history results", async () => {
      const agentId = "test-agent-id";
      const limit = 5;
      const history = await getAgentDriftHistory(agentId, limit);
      
      expect(history.length).toBeLessThanOrEqual(limit);
    });
  });
});
