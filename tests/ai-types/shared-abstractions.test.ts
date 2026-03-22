/**
 * Cross-Domain AI Types Test Suite — Shared Abstractions
 *
 * Validates that domain-entity.ts and readiness.ts work correctly
 * for all 5 AI types (LLM, Model, Bot, Agent, Provider).
 */

import { describe, it, expect } from "vitest";
import type { DomainEntity, AITypeKind } from "../../server/core/domain-entity";
import { LIFECYCLE_STATES, normalizeStatus } from "../../server/core/domain-entity";
import {
  computeDeployable,
  providerBlockingChecks,
  botBlockingChecks,
  modelBlockingChecks,
  agentBlockingChecks,
  llmBlockingChecks,
} from "../../server/core/readiness";

// ============================================================================
// LIFECYCLE_STATES coverage
// ============================================================================

describe("LIFECYCLE_STATES", () => {
  const allKinds: AITypeKind[] = ["llm", "model", "bot", "agent", "provider"];

  it("defines states for all 5 AI types", () => {
    for (const kind of allKinds) {
      expect(LIFECYCLE_STATES[kind]).toBeDefined();
      expect(LIFECYCLE_STATES[kind].all.length).toBeGreaterThan(0);
      expect(LIFECYCLE_STATES[kind].deployable.length).toBeGreaterThan(0);
      expect(LIFECYCLE_STATES[kind].terminal.length).toBeGreaterThan(0);
    }
  });

  it("deployable states are a subset of all states", () => {
    for (const kind of allKinds) {
      const { all, deployable } = LIFECYCLE_STATES[kind];
      for (const s of deployable) {
        expect(all).toContain(s);
      }
    }
  });

  it("terminal states are a subset of all states", () => {
    for (const kind of allKinds) {
      const { all, terminal } = LIFECYCLE_STATES[kind];
      for (const s of terminal) {
        expect(all).toContain(s);
      }
    }
  });

  it("deployable and terminal states do not overlap", () => {
    for (const kind of allKinds) {
      const { deployable, terminal } = LIFECYCLE_STATES[kind];
      const overlap = deployable.filter((s) => terminal.includes(s));
      expect(overlap).toEqual([]);
    }
  });
});

// ============================================================================
// normalizeStatus coverage
// ============================================================================

describe("normalizeStatus", () => {
  it("maps draft to draft", () => {
    expect(normalizeStatus("draft")).toBe("draft");
  });

  it("maps archived to archived", () => {
    expect(normalizeStatus("archived")).toBe("archived");
  });

  it("maps governed to deployable (LLM/Agent)", () => {
    expect(normalizeStatus("governed")).toBe("deployable");
  });

  it("maps ready to deployable (Model)", () => {
    expect(normalizeStatus("ready")).toBe("deployable");
  });

  it("maps healthy to deployable (Provider)", () => {
    expect(normalizeStatus("healthy")).toBe("deployable");
  });

  it("maps active to deployable (Provider)", () => {
    expect(normalizeStatus("active")).toBe("deployable");
  });

  it("maps suspended to suspended (Provider)", () => {
    expect(normalizeStatus("suspended")).toBe("suspended");
  });

  it("maps unknown to draft", () => {
    expect(normalizeStatus("unknown_status")).toBe("draft");
  });
});

// ============================================================================
// computeDeployable — structural checks
// ============================================================================

describe("computeDeployable", () => {
  function makeEntity(overrides: Partial<DomainEntity> = {}): DomainEntity {
    return {
      id: 1,
      name: "test-entity",
      kind: "model",
      status: "ready",
      createdAt: new Date(),
      ...overrides,
    };
  }

  it("returns deployable for a valid model in ready state", () => {
    const result = computeDeployable(makeEntity());
    expect(result.isDeployable).toBe(true);
    expect(result.blockingReasons).toEqual([]);
  });

  it("blocks entity with empty name", () => {
    const result = computeDeployable(makeEntity({ name: "" }));
    expect(result.isDeployable).toBe(false);
    expect(result.blockingReasons.length).toBeGreaterThan(0);
  });

  it("blocks entity in non-deployable state", () => {
    const result = computeDeployable(makeEntity({ status: "downloading" }));
    expect(result.isDeployable).toBe(false);
    expect(result.blockingReasons).toContainEqual(
      expect.stringContaining("not deployable")
    );
  });

  it("blocks entity in terminal state", () => {
    const result = computeDeployable(makeEntity({ status: "archived" }));
    expect(result.isDeployable).toBe(false);
    expect(result.blockingReasons).toContainEqual(
      expect.stringContaining("terminal state")
    );
  });

  it("blocks LLM in draft state", () => {
    const result = computeDeployable(makeEntity({ kind: "llm", status: "draft" }));
    expect(result.isDeployable).toBe(false);
  });

  it("allows LLM in governed state", () => {
    const result = computeDeployable(makeEntity({ kind: "llm", status: "governed" }));
    expect(result.isDeployable).toBe(true);
  });

  it("allows provider in healthy state", () => {
    const result = computeDeployable(makeEntity({ kind: "provider", status: "healthy" }));
    expect(result.isDeployable).toBe(true);
  });

  it("allows provider in active state", () => {
    const result = computeDeployable(makeEntity({ kind: "provider", status: "active" }));
    expect(result.isDeployable).toBe(true);
  });

  it("blocks provider in configured state", () => {
    const result = computeDeployable(makeEntity({ kind: "provider", status: "configured" }));
    expect(result.isDeployable).toBe(false);
  });

  it("allows bot in deployable state", () => {
    const result = computeDeployable(makeEntity({ kind: "bot", status: "deployable" }));
    expect(result.isDeployable).toBe(true);
  });
});

// ============================================================================
// Domain-specific blocking checks
// ============================================================================

describe("providerBlockingChecks", () => {
  it("blocks provider without type", () => {
    const reasons = providerBlockingChecks({ type: "", enabled: true });
    expect(reasons).toContainEqual(expect.stringContaining("type"));
  });

  it("blocks disabled provider", () => {
    const reasons = providerBlockingChecks({ type: "openai", enabled: false });
    expect(reasons).toContainEqual(expect.stringContaining("disabled"));
  });

  it("passes for valid provider", () => {
    const reasons = providerBlockingChecks({ type: "openai", enabled: true });
    expect(reasons).toEqual([]);
  });
});

describe("botBlockingChecks", () => {
  it("blocks bot with no agent or LLM", () => {
    const reasons = botBlockingChecks({ agentId: null, llmId: null, channels: ["web"] });
    expect(reasons).toContainEqual(expect.stringContaining("agent or LLM"));
  });

  it("blocks bot with no channels", () => {
    const reasons = botBlockingChecks({ agentId: 1, llmId: null, channels: [] });
    expect(reasons).toContainEqual(expect.stringContaining("channel"));
  });

  it("passes for valid bot", () => {
    const reasons = botBlockingChecks({ agentId: 1, llmId: null, channels: ["web"] });
    expect(reasons).toEqual([]);
  });
});

describe("modelBlockingChecks", () => {
  it("blocks model without type", () => {
    const reasons = modelBlockingChecks({ modelType: "" });
    expect(reasons).toContainEqual(expect.stringContaining("type"));
  });

  it("passes for valid model", () => {
    const reasons = modelBlockingChecks({ modelType: "llm" });
    expect(reasons).toEqual([]);
  });
});

describe("agentBlockingChecks", () => {
  it("blocks agent without system prompt", () => {
    const reasons = agentBlockingChecks({ systemPrompt: "", modelId: "gpt-4", roleClass: "assistant" });
    expect(reasons).toContainEqual(expect.stringContaining("system prompt"));
  });

  it("blocks agent without model", () => {
    const reasons = agentBlockingChecks({ systemPrompt: "test", modelId: "", roleClass: "assistant" });
    expect(reasons).toContainEqual(expect.stringContaining("model"));
  });

  it("passes for valid agent", () => {
    const reasons = agentBlockingChecks({ systemPrompt: "test", modelId: "gpt-4", roleClass: "assistant" });
    expect(reasons).toEqual([]);
  });
});

describe("llmBlockingChecks", () => {
  it("blocks LLM without role", () => {
    const reasons = llmBlockingChecks({ role: "", archived: false });
    expect(reasons).toContainEqual(expect.stringContaining("role"));
  });

  it("blocks archived LLM", () => {
    const reasons = llmBlockingChecks({ role: "planner", archived: true });
    expect(reasons).toContainEqual(expect.stringContaining("archived"));
  });

  it("passes for valid LLM", () => {
    const reasons = llmBlockingChecks({ role: "planner", archived: false });
    expect(reasons).toEqual([]);
  });
});
