/**
 * Cross-Domain AI Types Test Suite — Policy Engines
 *
 * Validates that all domain policy engines (Model, Bot, Agent, Provider)
 * produce correct decisions and that the base engine framework is sound.
 */

import { describe, it, expect } from "vitest";
import { ModelPolicyEngine } from "../../server/policies/model-policy-engine";
import { BotPolicyEngine } from "../../server/policies/bot-policy-engine";
import { AgentPolicyEngine } from "../../server/policies/agent-policy-engine";
import { ProviderPolicyEngine } from "../../server/policies/provider-policy-engine";

// ============================================================================
// Model Policy Engine
// ============================================================================

describe("ModelPolicyEngine", () => {
  it("allows a valid model", async () => {
    const result = await ModelPolicyEngine.evaluate({
      name: "gpt-4o",
      displayName: "GPT-4o",
      modelType: "llm",
    });
    expect(result.decision).toBe("allow");
    expect(result.violations).toEqual([]);
  });

  it("denies model with empty name", async () => {
    const result = await ModelPolicyEngine.evaluate({
      name: "",
      displayName: "",
      modelType: "llm",
    });
    expect(result.decision).toBe("deny");
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it("denies model with invalid type", async () => {
    const result = await ModelPolicyEngine.evaluate({
      name: "test-model",
      displayName: "Test",
      modelType: "invalid_type",
    });
    expect(result.decision).toBe("deny");
    expect(result.violations).toContainEqual(
      expect.objectContaining({ rule: "modelType.notAllowed" })
    );
  });

  it("warns for excessive context length", async () => {
    const result = await ModelPolicyEngine.evaluate({
      name: "big-context",
      displayName: "Big",
      modelType: "llm",
      contextLength: 500000,
    });
    expect(result.decision).toBe("warn");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("includes policyHash and metadata", async () => {
    const result = await ModelPolicyEngine.evaluate({
      name: "test",
      displayName: "test",
      modelType: "llm",
    });
    expect(result.policyHash).toBeTruthy();
    expect(result.metadata?.domain).toBe("model");
  });
});

// ============================================================================
// Bot Policy Engine
// ============================================================================

describe("BotPolicyEngine", () => {
  it("allows a valid bot", async () => {
    const result = await BotPolicyEngine.evaluate({
      name: "customer-bot",
      agentId: 1,
      llmId: null,
      channels: ["web"],
      rateLimit: 100,
      behaviorConfig: null,
      scope: "app",
    });
    expect(result.decision).toBe("allow");
  });

  it("denies bot without binding", async () => {
    const result = await BotPolicyEngine.evaluate({
      name: "orphan-bot",
      agentId: null,
      llmId: null,
      channels: ["web"],
      rateLimit: 100,
      behaviorConfig: null,
      scope: "app",
    });
    expect(result.decision).toBe("deny");
    expect(result.violations).toContainEqual(
      expect.objectContaining({ rule: "binding.required" })
    );
  });

  it("denies bot without channels", async () => {
    const result = await BotPolicyEngine.evaluate({
      name: "no-channel-bot",
      agentId: 1,
      llmId: null,
      channels: [],
      rateLimit: null,
      behaviorConfig: null,
      scope: "app",
    });
    expect(result.decision).toBe("deny");
    expect(result.violations).toContainEqual(
      expect.objectContaining({ rule: "channels.required" })
    );
  });

  it("denies bot with excessive rate limit", async () => {
    const result = await BotPolicyEngine.evaluate({
      name: "fast-bot",
      agentId: 1,
      llmId: null,
      channels: ["web"],
      rateLimit: 99999,
      behaviorConfig: null,
      scope: "app",
    });
    expect(result.decision).toBe("deny");
  });
});

// ============================================================================
// Agent Policy Engine
// ============================================================================

describe("AgentPolicyEngine", () => {
  it("allows a valid agent", async () => {
    const result = await AgentPolicyEngine.evaluate({
      name: "research-agent",
      roleClass: "analyst",
      modelId: "gpt-4o",
      systemPrompt: "You are a research analyst.",
      mode: "sandbox",
    });
    expect(result.decision).toBe("allow");
  });

  it("denies agent without model", async () => {
    const result = await AgentPolicyEngine.evaluate({
      name: "no-model-agent",
      roleClass: "analyst",
      modelId: "",
      systemPrompt: "You are an agent.",
      mode: "sandbox",
    });
    expect(result.decision).toBe("deny");
    expect(result.violations).toContainEqual(
      expect.objectContaining({ rule: "model.required" })
    );
  });

  it("denies agent with short system prompt", async () => {
    const result = await AgentPolicyEngine.evaluate({
      name: "short-prompt",
      roleClass: "analyst",
      modelId: "gpt-4o",
      systemPrompt: "Hi",
      mode: "sandbox",
    });
    expect(result.decision).toBe("deny");
    expect(result.violations).toContainEqual(
      expect.objectContaining({ rule: "systemPrompt.tooShort" })
    );
  });

  it("denies agent with invalid role class", async () => {
    const result = await AgentPolicyEngine.evaluate({
      name: "bad-role-agent",
      roleClass: "hacker",
      modelId: "gpt-4o",
      systemPrompt: "You are an agent with a role.",
      mode: "sandbox",
    });
    expect(result.decision).toBe("deny");
    expect(result.violations).toContainEqual(
      expect.objectContaining({ rule: "roleClass.notAllowed" })
    );
  });

  it("warns for executor in governed mode", async () => {
    const result = await AgentPolicyEngine.evaluate({
      name: "exec-agent",
      roleClass: "executor",
      modelId: "gpt-4o",
      systemPrompt: "You are an executor agent.",
      mode: "governed",
    });
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ rule: "roleClass.governedRestricted" })
    );
  });

  it("denies restricted tools", async () => {
    const result = await AgentPolicyEngine.evaluate({
      name: "dangerous-agent",
      roleClass: "analyst",
      modelId: "gpt-4o",
      systemPrompt: "You are an analyst agent.",
      mode: "sandbox",
      hasToolAccess: true,
      allowedTools: ["web_search", "shell_exec"],
    });
    expect(result.decision).toBe("deny");
    expect(result.violations).toContainEqual(
      expect.objectContaining({ rule: "tools.restricted" })
    );
  });
});

// ============================================================================
// Provider Policy Engine
// ============================================================================

describe("ProviderPolicyEngine", () => {
  it("allows a valid cloud provider", async () => {
    const result = await ProviderPolicyEngine.evaluate({
      name: "openai-prod",
      type: "openai",
      enabled: true,
      kind: "cloud",
      lifecycleStatus: "active",
      policyTags: ["no_egress"],
      config: { apiKey: "sk-xxx" },
    });
    expect(result.decision).toBe("allow");
  });

  it("denies provider with invalid type", async () => {
    const result = await ProviderPolicyEngine.evaluate({
      name: "bad-provider",
      type: "invalid_provider",
      enabled: true,
      kind: "cloud",
      lifecycleStatus: "active",
      config: {},
    });
    expect(result.decision).toBe("deny");
    expect(result.violations).toContainEqual(
      expect.objectContaining({ rule: "type.notAllowed" })
    );
  });

  it("warns for cloud provider without API key", async () => {
    const result = await ProviderPolicyEngine.evaluate({
      name: "no-key-provider",
      type: "openai",
      enabled: true,
      kind: "cloud",
      lifecycleStatus: "active",
      config: {},
    });
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ rule: "config.cloudApiKey" })
    );
  });

  it("warns for cloud provider without policy tags", async () => {
    const result = await ProviderPolicyEngine.evaluate({
      name: "no-tags-provider",
      type: "openai",
      enabled: true,
      kind: "cloud",
      lifecycleStatus: "active",
      config: { apiKey: "sk-xxx" },
    });
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ rule: "policyTags.cloudMissing" })
    );
  });

  it("includes policyHash and domain metadata", async () => {
    const result = await ProviderPolicyEngine.evaluate({
      name: "test-provider",
      type: "openai",
      enabled: true,
      kind: "cloud",
      lifecycleStatus: "active",
      config: {},
    });
    expect(result.policyHash).toBeTruthy();
    expect(result.metadata?.domain).toBe("provider");
  });
});
