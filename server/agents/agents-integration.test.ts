/**
 * Agents Integration Test Suite
 * 
 * End-to-end tests for agent CRUD, promotion workflow, and governance
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createCaller } from "../routers";
import { db } from "../db";
import { agents } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

describe("Agents Integration Tests", () => {
  let caller: any;
  let testAgentId: string;

  beforeEach(async () => {
    // Create test caller with mock context
    caller = createCaller({
      user: { id: 1, openId: "test-user", name: "Test User", role: "admin" },
    });
  });

  afterEach(async () => {
    // Cleanup test agents
    if (testAgentId) {
      await db.delete(agents).where(eq(agents.id, testAgentId));
    }
  });

  describe("Agent CRUD Operations", () => {
    it("should create a new agent in draft mode", async () => {
      const agent = await caller.agents.create({
        name: "Test Agent",
        description: "Integration test agent",
        spec: {
          identity: { name: "Test Agent", purpose: "Testing" },
          role: { systemPrompt: "You are a test agent" },
          llm: { provider: "openai", model: "gpt-4" },
          capabilities: [],
          limits: { maxTokens: 1000 },
        },
      });

      testAgentId = agent.id;
      
      expect(agent.name).toBe("Test Agent");
      expect(agent.mode).toBe("draft");
      expect(agent.governanceStatus).toBe("SANDBOX");
    });

    it("should update agent spec", async () => {
      const agent = await caller.agents.create({
        name: "Test Agent",
        spec: { identity: { name: "Test Agent" } },
      });

      testAgentId = agent.id;

      const updated = await caller.agents.update({
        id: agent.id,
        spec: { identity: { name: "Updated Agent" } },
      });

      expect(updated.spec.identity.name).toBe("Updated Agent");
    });

    it("should list all agents", async () => {
      const agentsList = await caller.agents.list();
      
      expect(Array.isArray(agentsList)).toBe(true);
    });

    it("should get agent by ID", async () => {
      const agent = await caller.agents.create({
        name: "Test Agent",
        spec: {},
      });

      testAgentId = agent.id;

      const retrieved = await caller.agents.getById({ id: agent.id });
      
      expect(retrieved.id).toBe(agent.id);
      expect(retrieved.name).toBe("Test Agent");
    });

    it("should delete agent", async () => {
      const agent = await caller.agents.create({
        name: "Test Agent",
        spec: {},
      });

      await caller.agents.delete({ id: agent.id });

      const deleted = await caller.agents.getById({ id: agent.id });
      expect(deleted).toBeNull();
    });
  });

  describe("Promotion Workflow", () => {
    it("should request agent promotion", async () => {
      const agent = await caller.agents.create({
        name: "Test Agent",
        spec: {},
      });

      testAgentId = agent.id;

      const request = await caller.agents.requestPromotion({
        agentId: agent.id,
      });

      expect(request.agentId).toBe(agent.id);
      expect(request.status).toBe("pending");
    });

    it("should approve promotion request", async () => {
      const agent = await caller.agents.create({
        name: "Test Agent",
        spec: {},
      });

      testAgentId = agent.id;

      const request = await caller.agents.requestPromotion({
        agentId: agent.id,
      });

      const approved = await caller.agents.approvePromotion({
        requestId: request.id,
      });

      expect(approved.status).toBe("approved");
    });

    it("should reject promotion request with reason", async () => {
      const agent = await caller.agents.create({
        name: "Test Agent",
        spec: {},
      });

      testAgentId = agent.id;

      const request = await caller.agents.requestPromotion({
        agentId: agent.id,
      });

      const rejected = await caller.agents.rejectPromotion({
        requestId: request.id,
        reason: "Policy violation",
      });

      expect(rejected.status).toBe("rejected");
      expect(rejected.rejectionReason).toBe("Policy violation");
    });

    it("should execute approved promotion", async () => {
      const agent = await caller.agents.create({
        name: "Test Agent",
        spec: {},
      });

      testAgentId = agent.id;

      const request = await caller.agents.requestPromotion({
        agentId: agent.id,
      });

      await caller.agents.approvePromotion({
        requestId: request.id,
      });

      const executed = await caller.agents.executePromotion({
        requestId: request.id,
      });

      expect(executed.status).toBe("executed");
    });

    it("should track SLA for promotion requests", async () => {
      const agent = await caller.agents.create({
        name: "Test Agent",
        spec: {},
      });

      testAgentId = agent.id;

      const request = await caller.agents.requestPromotion({
        agentId: agent.id,
      });

      expect(request.slaDeadline).toBeTruthy();
      
      const deadline = new Date(request.slaDeadline);
      const now = new Date();
      const hoursDiff = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);
      
      expect(hoursDiff).toBeCloseTo(24, 1); // 24-hour SLA
    });
  });

  describe("Governance Status", () => {
    it("should transition from SANDBOX to GOVERNED_VALID", async () => {
      const agent = await caller.agents.create({
        name: "Test Agent",
        spec: {},
      });

      testAgentId = agent.id;

      const promoted = await caller.agents.promote({
        id: agent.id,
      });

      expect(promoted.governanceStatus).toBe("GOVERNED_VALID");
    });

    it("should mark agent as GOVERNED_RESTRICTED on policy violation", async () => {
      const agent = await caller.agents.create({
        name: "Test Agent",
        spec: {},
        mode: "governed",
      });

      testAgentId = agent.id;

      const restricted = await caller.agents.markRestricted({
        id: agent.id,
        reason: "Budget exceeded",
      });

      expect(restricted.governanceStatus).toBe("GOVERNED_RESTRICTED");
    });

    it("should invalidate agent on critical drift", async () => {
      const agent = await caller.agents.create({
        name: "Test Agent",
        spec: {},
        mode: "governed",
      });

      testAgentId = agent.id;

      const invalidated = await caller.agents.invalidate({
        id: agent.id,
        reason: "Spec tampering detected",
      });

      expect(invalidated.governanceStatus).toBe("GOVERNED_INVALIDATED");
    });
  });

  describe("Agent History", () => {
    it("should record agent creation event", async () => {
      const agent = await caller.agents.create({
        name: "Test Agent",
        spec: {},
      });

      testAgentId = agent.id;

      const history = await caller.agents.getHistory({ id: agent.id });
      
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].eventType).toBe("created");
    });

    it("should record promotion events", async () => {
      const agent = await caller.agents.create({
        name: "Test Agent",
        spec: {},
      });

      testAgentId = agent.id;

      await caller.agents.promote({ id: agent.id });

      const history = await caller.agents.getHistory({ id: agent.id });
      
      const promotionEvent = history.find(h => h.eventType === "promoted");
      expect(promotionEvent).toBeTruthy();
    });

    it("should record spec modifications", async () => {
      const agent = await caller.agents.create({
        name: "Test Agent",
        spec: {},
      });

      testAgentId = agent.id;

      await caller.agents.update({
        id: agent.id,
        spec: { identity: { name: "Modified Agent" } },
      });

      const history = await caller.agents.getHistory({ id: agent.id });
      
      const modifyEvent = history.find(h => h.eventType === "modified");
      expect(modifyEvent).toBeTruthy();
    });
  });
});
