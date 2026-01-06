/**
 * Compliance Export Test Suite
 * 
 * Tests for SOC2/ISO27001/HIPAA/GDPR attestation reports
 */

import { describe, it, expect, beforeEach } from "vitest";
import { exportCompliance, generateAttestationReport } from "./compliance-exporter";

describe("Compliance Export", () => {
  describe("exportCompliance", () => {
    it("should export SOC2 compliance report", async () => {
      const report = await exportCompliance({
        framework: "SOC2",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-01-31"),
        format: "json",
      });
      
      expect(report).toHaveProperty("framework", "SOC2");
      expect(report).toHaveProperty("attestations");
      expect(Array.isArray(report.attestations)).toBe(true);
    });

    it("should export ISO27001 compliance report", async () => {
      const report = await exportCompliance({
        framework: "ISO27001",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-01-31"),
        format: "json",
      });
      
      expect(report).toHaveProperty("framework", "ISO27001");
      expect(report.attestations.length).toBeGreaterThanOrEqual(0);
    });

    it("should export HIPAA compliance report", async () => {
      const report = await exportCompliance({
        framework: "HIPAA",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-01-31"),
        format: "json",
      });
      
      expect(report).toHaveProperty("framework", "HIPAA");
    });

    it("should export GDPR compliance report", async () => {
      const report = await exportCompliance({
        framework: "GDPR",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-01-31"),
        format: "json",
      });
      
      expect(report).toHaveProperty("framework", "GDPR");
    });

    it("should include agent governance events", async () => {
      const report = await exportCompliance({
        framework: "SOC2",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-01-31"),
        format: "json",
      });
      
      expect(report).toHaveProperty("agentEvents");
      expect(Array.isArray(report.agentEvents)).toBe(true);
    });

    it("should include policy version history", async () => {
      const report = await exportCompliance({
        framework: "SOC2",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-01-31"),
        format: "json",
      });
      
      expect(report).toHaveProperty("policyVersions");
    });

    it("should support CSV export format", async () => {
      const report = await exportCompliance({
        framework: "SOC2",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-01-31"),
        format: "csv",
      });
      
      expect(typeof report).toBe("string");
      expect(report).toContain(","); // CSV delimiter
    });

    it("should filter by date range", async () => {
      const startDate = new Date("2026-01-01");
      const endDate = new Date("2026-01-31");
      
      const report = await exportCompliance({
        framework: "SOC2",
        startDate,
        endDate,
        format: "json",
      });
      
      for (const event of report.agentEvents) {
        const eventDate = new Date(event.timestamp);
        expect(eventDate.getTime()).toBeGreaterThanOrEqual(startDate.getTime());
        expect(eventDate.getTime()).toBeLessThanOrEqual(endDate.getTime());
      }
    });
  });

  describe("generateAttestationReport", () => {
    it("should generate attestation for agent lifecycle", async () => {
      const attestation = await generateAttestationReport({
        type: "agent_lifecycle",
        agentId: "test-agent-id",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-01-31"),
      });
      
      expect(attestation).toHaveProperty("type", "agent_lifecycle");
      expect(attestation).toHaveProperty("summary");
      expect(attestation).toHaveProperty("events");
    });

    it("should generate attestation for policy compliance", async () => {
      const attestation = await generateAttestationReport({
        type: "policy_compliance",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-01-31"),
      });
      
      expect(attestation).toHaveProperty("type", "policy_compliance");
      expect(attestation).toHaveProperty("complianceRate");
    });

    it("should generate attestation for promotion workflow", async () => {
      const attestation = await generateAttestationReport({
        type: "promotion_workflow",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-01-31"),
      });
      
      expect(attestation).toHaveProperty("type", "promotion_workflow");
      expect(attestation).toHaveProperty("totalPromotions");
      expect(attestation).toHaveProperty("approvalRate");
    });

    it("should include cryptographic proofs", async () => {
      const attestation = await generateAttestationReport({
        type: "agent_lifecycle",
        agentId: "test-agent-id",
        startDate: new Date("2026-01-01"),
        endDate: new Date("2026-01-31"),
      });
      
      expect(attestation).toHaveProperty("proofs");
      expect(Array.isArray(attestation.proofs)).toBe(true);
    });
  });
});
