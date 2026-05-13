// Graph backend health-alert evaluator + scanner tests.
//
// V1+ Phase J-1 — covers the pure evaluator branch matrix and the
// scanner composition (with stubbed repository + persistence). No
// real DB; the persistence path is exercised via an injected stub.

import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_HEALTH_THRESHOLDS,
  evaluateHealth,
  runHealthAlertScan,
  type AlertDecision,
  type HealthThresholds,
} from "../../server/agent-studio/services/graph/health-alert.js";
import type {
  BackendHealth,
  BackendCapabilities,
  GraphRepository,
} from "../../server/agent-studio/services/graph/repository/types.js";

const stubCapabilities: BackendCapabilities = {
  backendKey: "neo4j-ce",
  supportsCypher: true,
  supportsParameterizedTemplates: true,
  supportsPropertyKeyConstraints: true,
  supportsShortestPath: true,
  supportsGraphAlgorithms: false,
  supportsExplainPlan: true,
  supportsPermissionFilter: true,
  supportsTransactions: true,
  supportsBenchmark: true,
  supportsBackendHealth: true,
} as unknown as BackendCapabilities;

function health(
  overrides: Partial<BackendHealth> = {},
): BackendHealth {
  return {
    status: "healthy",
    latencyMs: 50,
    errors: [],
    capabilities: stubCapabilities,
    ...overrides,
  };
}

describe("evaluateHealth (pure)", () => {
  it("healthy + low latency raises nothing", () => {
    expect(evaluateHealth({ health: health() })).toEqual([]);
  });

  it("status=degraded raises a warning", () => {
    const decisions = evaluateHealth({
      health: health({ status: "degraded", errors: ["foo"] }),
    });
    expect(decisions).toHaveLength(1);
    expect(decisions[0].alertKey).toBe("graph_health_degraded");
    expect(decisions[0].severity).toBe("warning");
  });

  it("status=unavailable raises critical AND skips latency evaluation", () => {
    const decisions = evaluateHealth({
      health: health({
        status: "unavailable",
        latencyMs: 99_999,
        errors: ["bolt connect refused"],
      }),
    });
    expect(decisions).toHaveLength(1);
    expect(decisions[0].alertKey).toBe("graph_health_unavailable");
    expect(decisions[0].severity).toBe("critical");
  });

  it("latency >= warn threshold raises a latency_high warning", () => {
    const decisions = evaluateHealth({
      health: health({
        latencyMs: DEFAULT_HEALTH_THRESHOLDS.latencyWarnMs + 1,
      }),
    });
    expect(decisions).toHaveLength(1);
    expect(decisions[0].alertKey).toBe("graph_health_latency_high");
    expect(decisions[0].severity).toBe("warning");
  });

  it("latency >= critical threshold raises a latency_high critical", () => {
    const decisions = evaluateHealth({
      health: health({
        latencyMs: DEFAULT_HEALTH_THRESHOLDS.latencyCriticalMs + 1,
      }),
    });
    expect(decisions).toHaveLength(1);
    expect(decisions[0].severity).toBe("critical");
    expect(decisions[0].observedValue).toMatchObject({
      latencyMs: DEFAULT_HEALTH_THRESHOLDS.latencyCriticalMs + 1,
    });
  });

  it("degraded + high latency raises BOTH decisions", () => {
    const decisions = evaluateHealth({
      health: health({
        status: "degraded",
        latencyMs: DEFAULT_HEALTH_THRESHOLDS.latencyCriticalMs + 1,
      }),
    });
    const keys = decisions.map((d) => d.alertKey).sort();
    expect(keys).toEqual(["graph_health_degraded", "graph_health_latency_high"]);
  });

  it("custom thresholds override defaults", () => {
    const t: HealthThresholds = { latencyWarnMs: 10, latencyCriticalMs: 20 };
    const decisions = evaluateHealth({
      health: health({ latencyMs: 25 }),
      thresholds: t,
    });
    expect(decisions[0].severity).toBe("critical");
    expect(decisions[0].threshold).toMatchObject({
      latencyWarnMs: 10,
      latencyCriticalMs: 20,
    });
  });

  it("scope is propagated into the decision", () => {
    const decisions = evaluateHealth({
      health: health({ status: "degraded" }),
      scope: "us-west-1",
    });
    expect(decisions[0].scope).toBe("us-west-1");
  });

  it("missing latencyMs does not throw and does not raise a latency alert", () => {
    const decisions = evaluateHealth({
      health: health({ latencyMs: undefined }),
    });
    expect(decisions).toEqual([]);
  });
});

describe("runHealthAlertScan (composition)", () => {
  function makeRepo(h: BackendHealth): GraphRepository {
    return {
      backendKey: "neo4j-ce",
      capabilities: stubCapabilities,
      health: () => Promise.resolve(h),
    } as unknown as GraphRepository;
  }

  it("returns scoped result + decisions + persisted counts from the stub", async () => {
    const persist = vi.fn(async (decisions: ReadonlyArray<AlertDecision>) => ({
      raised: decisions.length,
      resolved: 0,
    }));
    const result = await runHealthAlertScan({
      repository: makeRepo(health({ status: "degraded" })),
      persist,
      scope: "default",
    });
    expect(result.status).toBe("degraded");
    expect(result.decisions).toHaveLength(1);
    expect(result.persisted.raised).toBe(1);
    expect(persist).toHaveBeenCalledOnce();
  });

  it("healthy backend produces zero decisions but still calls persist (for resolve sweep)", async () => {
    const persist = vi.fn(async () => ({ raised: 0, resolved: 2 }));
    const result = await runHealthAlertScan({
      repository: makeRepo(health()),
      persist,
    });
    expect(result.decisions).toEqual([]);
    expect(result.persisted.resolved).toBe(2);
    expect(persist).toHaveBeenCalledOnce();
  });

  it("propagates injected thresholds end-to-end", async () => {
    let captured: ReadonlyArray<AlertDecision> | null = null;
    await runHealthAlertScan({
      repository: makeRepo(health({ latencyMs: 30 })),
      thresholds: { latencyWarnMs: 10, latencyCriticalMs: 20 },
      persist: async (d) => {
        captured = d;
        return { raised: d.length, resolved: 0 };
      },
    });
    expect(captured).not.toBeNull();
    expect(captured!.length).toBe(1);
    expect(captured![0].alertKey).toBe("graph_health_latency_high");
    expect(captured![0].severity).toBe("critical");
  });
});
