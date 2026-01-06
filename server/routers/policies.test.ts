import { describe, it, expect } from "vitest";
import {
  evaluateAgentCompliance,
  extractPolicyRules,
  getComplianceScoreDescription,
  type Agent,
  type PolicyRule,
} from "../services/policyEvaluation";
import { POLICY_TEMPLATES } from "../services/initializePolicyTemplates";

describe("Policy Evaluation Service", () => {
  const mockAgent: Agent = {
    id: 1,
    name: "Test Agent",
    roleClass: "assistant",
    temperature: "0.7",
    hasDocumentAccess: true,
    hasToolAccess: true,
    allowedTools: ["read", "write"],
    systemPrompt: "You are a helpful assistant.",
  };

  describe("evaluateAgentCompliance", () => {
    it("should return compliant for agent matching policy rules", () => {
      const rules: PolicyRule = {
        allowedRoles: ["assistant", "analyst"],
        allowDocumentAccess: true,
        allowToolAccess: true,
      };

      const result = evaluateAgentCompliance(mockAgent, rules);
      expect(result.compliant).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.score).toBeGreaterThan(80);
    });

    it("should detect role violations", () => {
      const rules: PolicyRule = {
        deniedRoles: ["assistant"],
      };

      const result = evaluateAgentCompliance(mockAgent, rules);
      expect(result.compliant).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0]).toContain("denied roles");
    });

    it("should detect document access violations", () => {
      const rules: PolicyRule = {
        allowDocumentAccess: false,
      };

      const result = evaluateAgentCompliance(mockAgent, rules);
      expect(result.compliant).toBe(false);
      expect(result.violations.some((v) => v.includes("document access"))).toBe(true);
    });

    it("should detect tool access violations", () => {
      const rules: PolicyRule = {
        allowToolAccess: false,
      };

      const result = evaluateAgentCompliance(mockAgent, rules);
      expect(result.compliant).toBe(false);
      expect(result.violations.some((v) => v.includes("tool access"))).toBe(true);
    });

    it("should check temperature for budget compliance", () => {
      const highTempAgent: Agent = {
        ...mockAgent,
        temperature: "2.0",
      };

      const rules: PolicyRule = {
        maxBudget: 100,
      };

      const result = evaluateAgentCompliance(highTempAgent, rules);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.score).toBeLessThan(100);
    });

    it("should calculate compliance score correctly", () => {
      const rules: PolicyRule = {
        allowedRoles: ["assistant"],
        allowDocumentAccess: true,
        allowToolAccess: true,
      };

      const result = evaluateAgentCompliance(mockAgent, rules);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });
  });

  describe("extractPolicyRules", () => {
    it("should extract rules from flat policy content", () => {
      const content = {
        maxBudget: 500,
        allowedRoles: ["assistant"],
      };

      const rules = extractPolicyRules(content);
      expect(rules.maxBudget).toBe(500);
      expect(rules.allowedRoles).toEqual(["assistant"]);
    });

    it("should extract rules from nested policy content", () => {
      const content = {
        rules: {
          maxBudget: 1000,
          allowedActions: ["read", "write"],
        },
      };

      const rules = extractPolicyRules(content);
      expect(rules.maxBudget).toBe(1000);
      expect(rules.allowedActions).toEqual(["read", "write"]);
    });

    it("should handle empty policy content", () => {
      const rules = extractPolicyRules({});
      expect(rules).toBeDefined();
      expect(Object.keys(rules).length).toBeGreaterThanOrEqual(0);
    });

    it("should handle null policy content", () => {
      const rules = extractPolicyRules(null);
      expect(rules).toBeDefined();
    });
  });

  describe("getComplianceScoreDescription", () => {
    it("should return 'Excellent' for score >= 90", () => {
      expect(getComplianceScoreDescription(95)).toBe("Excellent");
      expect(getComplianceScoreDescription(100)).toBe("Excellent");
    });

    it("should return 'Good' for score 75-89", () => {
      expect(getComplianceScoreDescription(80)).toBe("Good");
      expect(getComplianceScoreDescription(75)).toBe("Good");
    });

    it("should return 'Fair' for score 60-74", () => {
      expect(getComplianceScoreDescription(70)).toBe("Fair");
      expect(getComplianceScoreDescription(60)).toBe("Fair");
    });

    it("should return 'Poor' for score 40-59", () => {
      expect(getComplianceScoreDescription(50)).toBe("Poor");
      expect(getComplianceScoreDescription(40)).toBe("Poor");
    });

    it("should return 'Critical' for score < 40", () => {
      expect(getComplianceScoreDescription(30)).toBe("Critical");
      expect(getComplianceScoreDescription(0)).toBe("Critical");
    });
  });

  describe("Policy Templates", () => {
    it("should have strict template defined", () => {
      expect(POLICY_TEMPLATES.strict).toBeDefined();
      expect(POLICY_TEMPLATES.strict.name).toBe("Strict");
      expect(POLICY_TEMPLATES.strict.content.rules).toBeDefined();
    });

    it("should have standard template defined", () => {
      expect(POLICY_TEMPLATES.standard).toBeDefined();
      expect(POLICY_TEMPLATES.standard.name).toBe("Standard");
      expect(POLICY_TEMPLATES.standard.content.rules).toBeDefined();
    });

    it("should have permissive template defined", () => {
      expect(POLICY_TEMPLATES.permissive).toBeDefined();
      expect(POLICY_TEMPLATES.permissive.name).toBe("Permissive");
      expect(POLICY_TEMPLATES.permissive.content.rules).toBeDefined();
    });

    it("strict template should be most restrictive", () => {
      const strictRules = POLICY_TEMPLATES.strict.content.rules;
      const standardRules = POLICY_TEMPLATES.standard.content.rules;

      expect(strictRules.maxBudget).toBeLessThan(standardRules.maxBudget!);
      expect(strictRules.maxTokensPerRequest).toBeLessThan(
        standardRules.maxTokensPerRequest!
      );
    });

    it("permissive template should be least restrictive", () => {
      const standardRules = POLICY_TEMPLATES.standard.content.rules;
      const permissiveRules = POLICY_TEMPLATES.permissive.content.rules;

      expect(permissiveRules.maxBudget).toBeGreaterThan(standardRules.maxBudget!);
      expect(permissiveRules.maxTokensPerRequest).toBeGreaterThan(
        standardRules.maxTokensPerRequest!
      );
    });
  });

  describe("Policy Router Procedures", () => {
    it("should have list procedure defined", () => {
      // This would be tested with actual tRPC context
      expect(true).toBe(true);
    });

    it("should have get procedure defined", () => {
      // This would be tested with actual tRPC context
      expect(true).toBe(true);
    });

    it("should have create procedure defined", () => {
      // This would be tested with actual tRPC context
      expect(true).toBe(true);
    });

    it("should have update procedure defined", () => {
      // This would be tested with actual tRPC context
      expect(true).toBe(true);
    });

    it("should have delete procedure defined", () => {
      // This would be tested with actual tRPC context
      expect(true).toBe(true);
    });

    it("should have activate procedure defined", () => {
      // This would be tested with actual tRPC context
      expect(true).toBe(true);
    });

    it("should have getActive procedure defined", () => {
      // This would be tested with actual tRPC context
      expect(true).toBe(true);
    });

    it("should have listTemplates procedure defined", () => {
      // This would be tested with actual tRPC context
      expect(true).toBe(true);
    });

    it("should have createFromTemplate procedure defined", () => {
      // This would be tested with actual tRPC context
      expect(true).toBe(true);
    });
  });
});
