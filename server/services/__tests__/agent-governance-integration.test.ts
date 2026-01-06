import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createSandbox, updateSandbox, listAgents } from "../agentService";
import { promoteToGoverned } from "../promotionService";
import { fetchSnapshot, hotReload } from "../policyService";
import { executeRevalidation } from "../revalidationWorkflow";
import { getGovernanceLogger } from "../governanceLogger";
import { getGovernanceMetrics } from "../governanceMetrics";

/**
 * Agent Governance Integration Tests
 * Phase 9: Comprehensive Testing
 * 
 * Tests the full governance lifecycle from sandbox to governed
 */

describe("Agent Governance Integration", () => {
  beforeEach(() => {
    // Reset metrics and logs before each test
    getGovernanceMetrics().reset();
    getGovernanceLogger().clear();
  });

  describe("Sandbox Agent Creation", () => {
    it("should create a sandbox agent with valid anatomy", async () => {
      const agent = await createSandbox({
        workspaceId: "test-workspace",
        name: "Test Agent",
        version: "1.0.0",
        description: "Test agent for integration testing",
        roleClass: "analysis",
        anatomy: {
          reasoning: {
            type: "llm",
            model: "gpt-4",
            temperature: 0.7,
          },
          inputs: ["text"],
          actions: [{ type: "respond", sideEffects: false }],
          memory: { shortTerm: true, longTerm: false },
        },
      });

      expect(agent).toBeDefined();
      expect(agent.mode).toBe("sandbox");
      expect(agent.governanceStatus).toBe("SANDBOX");
    });

    it("should reject sandbox agent with incomplete anatomy", async () => {
      await expect(
        createSandbox({
          workspaceId: "test-workspace",
          name: "Invalid Agent",
          version: "1.0.0",
          description: "Missing anatomy fields",
          roleClass: "analysis",
          anatomy: {
            reasoning: { type: "llm", model: "gpt-4", temperature: 0.7 },
            // Missing inputs, actions, memory
          },
        })
      ).rejects.toThrow("Incomplete anatomy");
    });
  });

  describe("Agent Promotion", () => {
    it("should promote sandbox agent to governed with valid policy", async () => {
      // Create sandbox agent
      const sandbox = await createSandbox({
        workspaceId: "test-workspace",
        name: "Promotable Agent",
        version: "1.0.0",
        description: "Agent ready for promotion",
        roleClass: "analysis",
        anatomy: {
          reasoning: { type: "llm", model: "gpt-4", temperature: 0.7 },
          inputs: ["text"],
          actions: [{ type: "respond", sideEffects: false }],
          memory: { shortTerm: true, longTerm: false },
        },
      });

      // Promote to governed
      const governed = await promoteToGoverned({
        agentId: sandbox.id,
        actorId: "test-admin",
        actorRole: "agent_admin",
        orgLimits: { maxMonthlyBudgetUsd: 1000 },
      });

      expect(governed).toBeDefined();
      expect(governed.mode).toBe("governed");
      expect(governed.governanceStatus).toBe("GOVERNED_VALID");
      expect(governed.governance?.proofBundle).toBeDefined();
      expect(governed.governance?.proofBundle?.signature).toBeDefined();

      // Verify metrics
      const metrics = getGovernanceMetrics();
      expect(metrics.get("promotion_attempts_total")).toBe(1);
    });

    it("should deny promotion if budget exceeds org limit", async () => {
      const sandbox = await createSandbox({
        workspaceId: "test-workspace",
        name: "Over Budget Agent",
        version: "1.0.0",
        description: "Agent with excessive budget",
        roleClass: "analysis",
        anatomy: {
          reasoning: { type: "llm", model: "gpt-4", temperature: 0.7 },
          inputs: ["text"],
          actions: [{ type: "respond", sideEffects: false }],
          memory: { shortTerm: true, longTerm: false },
        },
        economics: {
          monthlyBudgetUsd: 5000, // Exceeds org limit
        },
      });

      await expect(
        promoteToGoverned({
          agentId: sandbox.id,
          actorId: "test-admin",
          actorRole: "agent_admin",
          orgLimits: { maxMonthlyBudgetUsd: 1000 },
        })
      ).rejects.toThrow("budget");

      // Verify metrics
      const metrics = getGovernanceMetrics();
      expect(metrics.get("promotion_denies_total")).toBe(1);
    });

    it("should deny promotion if actor lacks permissions", async () => {
      const sandbox = await createSandbox({
        workspaceId: "test-workspace",
        name: "Test Agent",
        version: "1.0.0",
        description: "Test agent",
        roleClass: "analysis",
        anatomy: {
          reasoning: { type: "llm", model: "gpt-4", temperature: 0.7 },
          inputs: ["text"],
          actions: [{ type: "respond", sideEffects: false }],
          memory: { shortTerm: true, longTerm: false },
        },
      });

      await expect(
        promoteToGoverned({
          agentId: sandbox.id,
          actorId: "test-viewer",
          actorRole: "viewer", // Insufficient permissions
          orgLimits: { maxMonthlyBudgetUsd: 1000 },
        })
      ).rejects.toThrow("permission");
    });
  });

  describe("Policy Hot Reload", () => {
    it("should reload policy and revalidate all governed agents", async () => {
      // Create and promote multiple agents
      const agents = await Promise.all([
        createAndPromoteAgent("Agent 1"),
        createAndPromoteAgent("Agent 2"),
        createAndPromoteAgent("Agent 3"),
      ]);

      // Hot reload policy
      const oldSnapshot = await fetchSnapshot("test-workspace");
      const newPolicyHash = "new-policy-hash-123";
      
      await hotReload({
        workspaceId: "test-workspace",
        bundle: { hash: newPolicyHash, rules: [] },
        actor: "test-admin",
      });

      // Revalidate agents
      const result = await executeRevalidation(newPolicyHash);

      expect(result.total).toBe(3);
      expect(result.invalidated).toBeGreaterThan(0); // Some agents invalidated due to policy change

      // Verify metrics
      const metrics = getGovernanceMetrics();
      expect(metrics.get("policy_reload_success_total")).toBe(1);
      expect(metrics.get("agent_invalidation_events_total")).toBeGreaterThan(0);
    });
  });

  describe("Admission Control", () => {
    it("should allow starting valid governed agent", async () => {
      const governed = await createAndPromoteAgent("Valid Agent");

      // Simulate admission control check
      const admitted = await checkAdmission(governed);

      expect(admitted).toBe(true);

      // Verify metrics
      const metrics = getGovernanceMetrics();
      expect(metrics.get("agent_starts_allowed_total")).toBe(1);
    });

    it("should deny starting invalidated agent", async () => {
      const governed = await createAndPromoteAgent("Test Agent");

      // Invalidate agent by changing policy
      await executeRevalidation("different-policy-hash");

      // Simulate admission control check
      const admitted = await checkAdmission(governed);

      expect(admitted).toBe(false);

      // Verify metrics
      const metrics = getGovernanceMetrics();
      expect(metrics.get("agent_starts_denied_total")).toBeGreaterThan(0);
    });

    it("should deny starting agent with tampered spec", async () => {
      const governed = await createAndPromoteAgent("Test Agent");

      // Tamper with spec
      governed.anatomy.reasoning.temperature = 2.0; // Invalid temperature

      // Simulate admission control check
      const admitted = await checkAdmission(governed);

      expect(admitted).toBe(false);

      // Verify logs
      const logs = getGovernanceLogger().getLogsByAgent(governed.id);
      expect(logs.some((log) => log.code === "ADMISSION_DENY_SPEC_HASH_MISMATCH")).toBe(true);
    });
  });

  describe("Governance Lifecycle", () => {
    it("should complete full lifecycle: create → promote → revalidate → invalidate", async () => {
      // 1. Create sandbox agent
      const sandbox = await createSandbox({
        workspaceId: "test-workspace",
        name: "Lifecycle Agent",
        version: "1.0.0",
        description: "Full lifecycle test",
        roleClass: "analysis",
        anatomy: {
          reasoning: { type: "llm", model: "gpt-4", temperature: 0.7 },
          inputs: ["text"],
          actions: [{ type: "respond", sideEffects: false }],
          memory: { shortTerm: true, longTerm: false },
        },
      });

      expect(sandbox.mode).toBe("sandbox");
      expect(sandbox.governanceStatus).toBe("SANDBOX");

      // 2. Promote to governed
      const governed = await promoteToGoverned({
        agentId: sandbox.id,
        actorId: "test-admin",
        actorRole: "agent_admin",
        orgLimits: { maxMonthlyBudgetUsd: 1000 },
      });

      expect(governed.mode).toBe("governed");
      expect(governed.governanceStatus).toBe("GOVERNED_VALID");

      // 3. Revalidate with new policy
      const result = await executeRevalidation("new-policy-hash");

      expect(result.total).toBeGreaterThan(0);

      // 4. Verify invalidation
      const agents = await listAgents("test-workspace");
      const agent = agents.find((a) => a.id === governed.id);

      expect(agent?.governanceStatus).toBe("GOVERNED_INVALIDATED");
    });
  });
});

// Helper functions

async function createAndPromoteAgent(name: string) {
  const sandbox = await createSandbox({
    workspaceId: "test-workspace",
    name,
    version: "1.0.0",
    description: `Test agent: ${name}`,
    roleClass: "analysis",
    anatomy: {
      reasoning: { type: "llm", model: "gpt-4", temperature: 0.7 },
      inputs: ["text"],
      actions: [{ type: "respond", sideEffects: false }],
      memory: { shortTerm: true, longTerm: false },
    },
    localConstraints: {
      maxTokens: 2000,
      dailyBudget: 100,
      externalCalls: false,
      persistentWrites: false,
    },
  });

  return await promoteToGoverned({
    agentId: sandbox.id,
    actorId: "test-admin",
    actorRole: "agent_admin",
    orgLimits: { maxMonthlyBudgetUsd: 1000 },
  });
}

async function checkAdmission(agent: any): Promise<boolean> {
  // MVP: Simple admission check based on governance status
  return agent.governanceStatus === "GOVERNED_VALID";
}
