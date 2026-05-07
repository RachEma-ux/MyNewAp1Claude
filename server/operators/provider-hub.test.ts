/**
 * Operators Provider Hub — PMB Phase 29.5 (LR-04 closure) tests.
 *
 * Locks the post-migration contract:
 *
 *   1. `callProviderHub` requires `workspaceId` on the request.
 *   2. Binding resolves via `resolveWorkspaceDefaultBinding` with
 *      `role: "classifier"`.
 *   3. Upstream call goes through `gatewayCall` against
 *      `openRouter.modelAccess.execute` with `intent: "system-internal"`.
 *   4. `OperatorBindingError` is thrown with the typed reason from
 *      D-WDB-3 when no binding is set or the binding is unhealthy.
 *   5. Per-operator `OPERATOR_MODEL_CONSTRAINTS` (max tokens, max
 *      temperature) governance guardrails clamp request values down.
 *   6. JSON-validation retry loop: invalid JSON triggers ONE retry
 *      with a stricter system prompt; second invalid response throws.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../platform/modules/module-gateway", () => ({
  gatewayCall: vi.fn(),
}));
vi.mock("../agent-studio/workspace-default-bindings", () => ({
  resolveWorkspaceDefaultBinding: vi.fn(),
}));

import { gatewayCall } from "../platform/modules/module-gateway";
import { resolveWorkspaceDefaultBinding } from "../agent-studio/workspace-default-bindings";
import { callProviderHub, OperatorBindingError } from "./provider-hub";
import type { ProviderHubRequest } from "@shared/operator-types";

const mockedGateway = gatewayCall as unknown as ReturnType<typeof vi.fn>;
const mockedResolve = resolveWorkspaceDefaultBinding as unknown as ReturnType<
  typeof vi.fn
>;

const HEALTHY_BINDING = {
  workspaceId: 7,
  role: "classifier" as const,
  providerConnectionId: 42,
  providerCatalogEntryId: 10,
  modelRef: "gpt-4o-mini",
  ok: true,
};

function makeRequest(overrides: Partial<ProviderHubRequest> = {}): ProviderHubRequest {
  return {
    operator: "builder",
    jobId: "job-1",
    systemPrompt: "You are a builder.",
    userPrompt: "Make a plan.",
    maxTokens: 4096,
    temperature: 0.5,
    responseFormat: "json",
    traceId: "trace-1",
    workspaceId: 7,
    ...overrides,
  };
}

beforeEach(() => {
  mockedGateway.mockReset();
  mockedResolve.mockReset();
});

describe("callProviderHub — D1-closed credential path", () => {
  it("resolves the workspace's classifier binding and calls modelAccess.execute", async () => {
    mockedResolve.mockResolvedValue(HEALTHY_BINDING);
    mockedGateway.mockResolvedValue({
      status: "ok",
      providerConnectionId: 42,
      modelRef: "gpt-4o-mini",
      latencyMs: 23,
      output: '{"plan": []}',
      usage: { totalTokens: 12 },
    });

    const result = await callProviderHub(makeRequest());

    expect(result.content).toBe('{"plan": []}');
    expect(result.model).toBe("gpt-4o-mini");
    expect(result.tokensUsed).toBe(12);
    expect(result.fallbackUsed).toBe(false);
    expect(mockedResolve).toHaveBeenCalledWith({
      workspaceId: 7,
      role: "classifier",
    });
    const call = mockedGateway.mock.calls[0][0];
    expect(call.ctx.actionKey).toBe("openRouter.modelAccess.execute");
    expect(call.ctx.targetModule).toBe("openRouter");
    expect(call.ctx.workspaceId).toBe(7);
    expect(call.input.intent).toBe("system-internal");
    expect(call.input.providerConnectionId).toBe(42);
    expect(call.input.modelRef).toBe("gpt-4o-mini");
  });

  it("throws OperatorBindingError(workspace_required) when workspaceId is 0/missing", async () => {
    await expect(
      callProviderHub(makeRequest({ workspaceId: 0 as unknown as number })),
    ).rejects.toBeInstanceOf(OperatorBindingError);
    expect(mockedResolve).not.toHaveBeenCalled();
    expect(mockedGateway).not.toHaveBeenCalled();
  });

  it("throws OperatorBindingError(default_not_set) when workspace has no classifier default", async () => {
    mockedResolve.mockResolvedValue(null);
    try {
      await callProviderHub(makeRequest());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OperatorBindingError);
      expect((err as OperatorBindingError).reason).toBe("default_not_set");
    }
    expect(mockedGateway).not.toHaveBeenCalled();
  });

  it("propagates the typed reason when the linked Provider Connection fails eligibility", async () => {
    mockedResolve.mockResolvedValue({
      ...HEALTHY_BINDING,
      ok: false,
      reason: "provider_connection_disabled",
    });
    try {
      await callProviderHub(makeRequest());
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OperatorBindingError);
      expect((err as OperatorBindingError).reason).toBe(
        "provider_connection_disabled",
      );
    }
  });

  it("throws when modelAccess.execute returns status=error", async () => {
    mockedResolve.mockResolvedValue(HEALTHY_BINDING);
    mockedGateway.mockResolvedValue({
      status: "error",
      providerConnectionId: 42,
      modelRef: "gpt-4o-mini",
      latencyMs: 0,
      error: "upstream_http_error",
    });
    await expect(callProviderHub(makeRequest())).rejects.toThrow(
      /upstream_http_error/,
    );
  });
});

describe("callProviderHub — operator constraints clamp request values", () => {
  it("clamps maxTokens to OPERATOR_MODEL_CONSTRAINTS[governance].maxTokens (4096)", async () => {
    mockedResolve.mockResolvedValue(HEALTHY_BINDING);
    mockedGateway.mockResolvedValue({
      status: "ok",
      providerConnectionId: 42,
      modelRef: "gpt-4o-mini",
      latencyMs: 5,
      output: "{}",
      usage: { totalTokens: 0 },
    });

    await callProviderHub(
      makeRequest({ operator: "governance", maxTokens: 99999, temperature: 0.5 }),
    );

    const call = mockedGateway.mock.calls[0][0];
    expect(call.input.tokenBudget).toBe(4096); // clamped
    expect(call.input.temperature).toBe(0.1); // clamped (governance maxTemp=0.1, request was 0.5)
  });
});

describe("callProviderHub — JSON-validation retry loop", () => {
  it("retries once with a stricter system prompt on first invalid JSON", async () => {
    mockedResolve.mockResolvedValue(HEALTHY_BINDING);
    mockedGateway
      .mockResolvedValueOnce({
        status: "ok",
        providerConnectionId: 42,
        modelRef: "gpt-4o-mini",
        latencyMs: 5,
        output: "not json",
        usage: { totalTokens: 5 },
      })
      .mockResolvedValueOnce({
        status: "ok",
        providerConnectionId: 42,
        modelRef: "gpt-4o-mini",
        latencyMs: 5,
        output: '{"plan": [], "explain": "ok"}',
        usage: { totalTokens: 12 },
      });

    const result = await callProviderHub(makeRequest());
    expect(result.content).toBe('{"plan": [], "explain": "ok"}');
    expect(mockedGateway).toHaveBeenCalledTimes(2);
    // The retry should have a stricter system prompt
    const retrySystemPrompt = mockedGateway.mock.calls[1][0].input.messages[0].content;
    expect(retrySystemPrompt).toMatch(/CRITICAL/);
    expect(retrySystemPrompt).toMatch(/valid JSON only/);
  });

  it("throws after second invalid JSON response (no third attempt)", async () => {
    mockedResolve.mockResolvedValue(HEALTHY_BINDING);
    mockedGateway.mockResolvedValue({
      status: "ok",
      providerConnectionId: 42,
      modelRef: "gpt-4o-mini",
      latencyMs: 5,
      output: "not json either",
      usage: { totalTokens: 5 },
    });

    await expect(callProviderHub(makeRequest())).rejects.toThrow(
      /invalid JSON twice/,
    );
    expect(mockedGateway).toHaveBeenCalledTimes(2);
  });
});

describe("OperatorBindingError", () => {
  it("carries workspaceId + reason for operator-job surfacing", () => {
    const e = new OperatorBindingError(99, "default_not_set");
    expect(e.workspaceId).toBe(99);
    expect(e.reason).toBe("default_not_set");
    expect(e.name).toBe("OperatorBindingError");
    expect(e.message).toMatch(/Workspace 99/);
    expect(e.message).toMatch(/default_not_set/);
  });
});
