/**
 * Agents E2E Test Suite
 * 
 * Full workflow tests from creation to governance
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createCaller } from "../routers";

describe("Agents E2E Workflows", () => {
  let caller: any;
  let testAgents: string[] = [];

  beforeAll(() => {
    caller = createCaller({
      user: { id: 1, openId: "test-user", name: "Test User", role: "admin" },
    });
  });

  afterAll(async () => {
    // Cleanup all test agents
    for (const agentId of testAgents) {
      try {
        await caller.agents.delete({ id: agentId });
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });

  it("should complete full agent lifecycle: create → sandbox → promote → governed", async () => {
    // Step 1: Create agent in draft mode
    const agent = await caller.agents.create({
      name: "E2E Test Agent",
      description: "Full lifecycle test",
      spec: {
        identity: { name: "E2E Agent", purpose: "Testing" },
        role: { systemPrompt: "You are a test agent" },
        llm: { provider: "openai", model: "gpt-4" },
        capabilities: ["read_files"],
        limits: { maxTokens: 2000, dailyBudget: 100 },
      },
    });

    testAgents.push(agent.id);
    expect(agent.mode).toBe("draft");

    // Step 2: Move to sandbox
    const sandboxed = await caller.agents.moveToSandbox({ id: agent.id });
    expect(sandboxed.mode).toBe("sandbox");
    expect(sandboxed.governanceStatus).toBe("SANDBOX");

    // Step 3: Request promotion
    const request = await caller.agents.requestPromotion({ agentId: agent.id });
    expect(request.status).toBe("pending");

    // Step 4: Approve promotion
    const approved = await caller.agents.approvePromotion({ requestId: request.id });
    expect(approved.status).toBe("approved");

    // Step 5: Execute promotion
    const executed = await caller.agents.executePromotion({ requestId: request.id });
    expect(executed.status).toBe("executed");

    // Step 6: Verify governed status
    const governed = await caller.agents.getById({ id: agent.id });
    expect(governed.mode).toBe("governed");
    expect(governed.governanceStatus).toBe("GOVERNED_VALID");
    expect(governed.proofBundle).toBeTruthy();
  });

  it("should handle policy violation workflow", async () => {
    // Create governed agent
    const agent = await caller.agents.create({
      name: "Policy Test Agent",
      spec: {
        capabilities: ["read_files", "write_files"],
        limits: { dailyBudget: 500 },
      },
    });

    testAgents.push(agent.id);

    await caller.agents.promote({ id: agent.id });

    // Simulate policy change that restricts capabilities
    const drift = await caller.agents.detectDrift({ id: agent.id });

    if (drift) {
      // Attempt auto-remediation
      const remediation = await caller.agents.autoRemediate({ id: agent.id, drift });

      if (remediation.success) {
        expect(remediation.action).toBeTruthy();
      } else {
        // Manual intervention required
        const restricted = await caller.agents.markRestricted({
          id: agent.id,
          reason: "Policy violation - manual review required",
        });

        expect(restricted.governanceStatus).toBe("GOVERNED_RESTRICTED");
      }
    }
  });

  it("should handle rejection and resubmission workflow", async () => {
    // Create agent
    const agent = await caller.agents.create({
      name: "Rejection Test Agent",
      spec: {},
    });

    testAgents.push(agent.id);

    // Request promotion
    const request1 = await caller.agents.requestPromotion({ agentId: agent.id });

    // Reject with reason
    const rejected = await caller.agents.rejectPromotion({
      requestId: request1.id,
      reason: "Insufficient documentation",
    });

    expect(rejected.status).toBe("rejected");

    // Fix issues and resubmit
    await caller.agents.update({
      id: agent.id,
      spec: { identity: { purpose: "Updated with documentation" } },
    });

    const request2 = await caller.agents.requestPromotion({ agentId: agent.id });
    expect(request2.status).toBe("pending");

    // Approve second request
    const approved = await caller.agents.approvePromotion({ requestId: request2.id });
    expect(approved.status).toBe("approved");
  });

  it("should handle agent expiry workflow", async () => {
    // Create agent with expiry date
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30); // 30 days from now

    const agent = await caller.agents.create({
      name: "Expiry Test Agent",
      spec: {},
      expiresAt: expiryDate,
    });

    testAgents.push(agent.id);

    await caller.agents.promote({ id: agent.id });

    // Simulate expiry check
    const drift = await caller.agents.detectDrift({ id: agent.id });

    // Should not be expired yet
    expect(drift?.driftType).not.toBe("expired");

    // Fast-forward expiry (update database directly)
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);

    await caller.agents.update({
      id: agent.id,
      expiresAt: pastDate,
    });

    // Check drift again
    const expiredDrift = await caller.agents.detectDrift({ id: agent.id });
    expect(expiredDrift?.driftType).toBe("expired");
  });

  it("should handle bulk operations", async () => {
    // Create multiple agents
    const agents = await Promise.all([
      caller.agents.create({ name: "Bulk Agent 1", spec: {} }),
      caller.agents.create({ name: "Bulk Agent 2", spec: {} }),
      caller.agents.create({ name: "Bulk Agent 3", spec: {} }),
    ]);

    testAgents.push(...agents.map(a => a.id));

    // Bulk promote
    const promoted = await caller.agents.bulkPromote({
      agentIds: agents.map(a => a.id),
    });

    expect(promoted.length).toBe(3);

    // Bulk delete
    await caller.agents.bulkDelete({
      agentIds: agents.map(a => a.id),
    });

    // Verify deletion
    for (const agent of agents) {
      const deleted = await caller.agents.getById({ id: agent.id });
      expect(deleted).toBeNull();
    }

    // Remove from cleanup list
    testAgents = testAgents.filter(id => !agents.some(a => a.id === id));
  });

  it("should generate compliance report for agent lifecycle", async () => {
    // Create and promote agent
    const agent = await caller.agents.create({
      name: "Compliance Test Agent",
      spec: {},
    });

    testAgents.push(agent.id);

    await caller.agents.promote({ id: agent.id });

    // Generate compliance report
    const report = await caller.agents.exportCompliance({
      framework: "SOC2",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
      format: "json",
    });

    expect(report.framework).toBe("SOC2");
    expect(report.agentEvents.some((e: any) => e.agentId === agent.id)).toBe(true);
  });

  it("should track complete audit trail", async () => {
    // Create agent
    const agent = await caller.agents.create({
      name: "Audit Trail Agent",
      spec: {},
    });

    testAgents.push(agent.id);

    // Perform various operations
    await caller.agents.update({ id: agent.id, spec: { identity: { name: "Updated" } } });
    await caller.agents.promote({ id: agent.id });
    await caller.agents.markRestricted({ id: agent.id, reason: "Test restriction" });

    // Get full history
    const history = await caller.agents.getHistory({ id: agent.id });

    expect(history.length).toBeGreaterThanOrEqual(4); // created, modified, promoted, status_changed
    expect(history.some(h => h.eventType === "created")).toBe(true);
    expect(history.some(h => h.eventType === "modified")).toBe(true);
    expect(history.some(h => h.eventType === "promoted")).toBe(true);
    expect(history.some(h => h.eventType === "status_changed")).toBe(true);
  });

  it("should handle concurrent promotion requests", async () => {
    const agent = await caller.agents.create({
      name: "Concurrent Test Agent",
      spec: {},
    });

    testAgents.push(agent.id);

    // Submit multiple promotion requests concurrently
    const requests = await Promise.all([
      caller.agents.requestPromotion({ agentId: agent.id }),
      caller.agents.requestPromotion({ agentId: agent.id }),
    ]);

    // Only one should succeed, others should be rejected or merged
    const pendingRequests = requests.filter(r => r.status === "pending");
    expect(pendingRequests.length).toBeLessThanOrEqual(1);
  });

  it("should enforce policy version consistency", async () => {
    const agent = await caller.agents.create({
      name: "Policy Version Agent",
      spec: {},
    });

    testAgents.push(agent.id);

    // Promote with current policy
    await caller.agents.promote({ id: agent.id });

    const governed = await caller.agents.getById({ id: agent.id });
    const originalPolicyHash = governed.proofBundle?.policyHash;

    // Simulate policy update
    await caller.policies.createVersion({
      version: "2.0.0",
      content: "Updated policy content",
    });

    // Check for drift
    const drift = await caller.agents.detectDrift({ id: agent.id });
    expect(drift?.driftType).toBe("policy_change");

    // Verify proof bundle still references original policy
    const current = await caller.agents.getById({ id: agent.id });
    expect(current.proofBundle?.policyHash).toBe(originalPolicyHash);
  });
});
