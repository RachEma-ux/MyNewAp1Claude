/**
 * Phase 16 — runTestWithBinding tests.
 *
 * Mocks `resolveForRun` (Phase 12) and the platform `gatewayCall`
 * (Phase 4 Model Access entry). Asserts:
 *
 *   - Each binding-policy failure (binding_not_found, legacy_unresolved,
 *     binding_disabled, provider_connection_ineligible, validation_stale)
 *     short-circuits BEFORE the gateway is called.
 *   - Local-provider bindings are rejected with
 *     provider_connection_ineligible (no Model Access local adapter yet).
 *   - On success, `openRouter.modelAccess.execute` is invoked with the
 *     resolved providerConnectionId + modelRef + the user's prompt, and
 *     the result fields (output, latencyMs, usage, refs) are echoed back.
 *   - When Model Access throws or returns status="error", the failure
 *     surfaces as `reason="model_access_failed"` with the detail
 *     preserved.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../bindings", () => ({
  resolveForRun: vi.fn(),
}));
vi.mock("../../platform/modules/module-gateway", () => ({
  gatewayCall: vi.fn(),
}));

import { resolveForRun } from "../bindings";
import { gatewayCall } from "../../platform/modules/module-gateway";
import { runTestWithBinding } from "./test-run-binding";

const mockedResolve = resolveForRun as unknown as ReturnType<typeof vi.fn>;
const mockedGateway = gatewayCall as unknown as ReturnType<typeof vi.fn>;

function bindingPublic(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    workspaceId: 1,
    agentId: 1,
    draftId: 1,
    role: "primary",
    providerCatalogEntryId: 10,
    modelCatalogEntryId: 20,
    providerConnectionId: 42,
    modelRef: "gpt-4o-mini",
    status: "binding_v1" as const,
    statusReason: null,
    legacyEnvVarHint: null,
    lastValidatedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  mockedResolve.mockReset();
  mockedGateway.mockReset();
});

describe("runTestWithBinding — failure short-circuits", () => {
  it.each([
    "binding_not_found",
    "legacy_unresolved",
    "binding_disabled",
    "provider_connection_ineligible",
    "validation_stale",
  ] as const)("surfaces %s without calling Model Access", async (reason) => {
    mockedResolve.mockResolvedValue({
      binding: bindingPublic(),
      providerConnection: null,
      ok: false,
      reason,
    });

    const r = await runTestWithBinding({
      draftId: 1,
      workspaceId: 1,
      actorId: 1,
      prompt: "Hello",
    });

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe(reason);
    expect(mockedGateway).not.toHaveBeenCalled();
  });

  it("rejects local-provider bindings as provider_connection_ineligible", async () => {
    mockedResolve.mockResolvedValue({
      binding: bindingPublic({ providerConnectionId: null, modelRef: "llama3.1:8b" }),
      providerConnection: null,
      ok: true,
    });

    const r = await runTestWithBinding({
      draftId: 1,
      workspaceId: 1,
      actorId: 1,
      prompt: "Hello",
    });

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.reason).toBe("provider_connection_ineligible");
    expect(mockedGateway).not.toHaveBeenCalled();
  });
});

describe("runTestWithBinding — happy path", () => {
  it("calls Model Access with the resolved refs and the user prompt", async () => {
    mockedResolve.mockResolvedValue({
      binding: bindingPublic(),
      providerConnection: {
        providerConnectionId: 42,
        providerCatalogEntryId: 10,
        workspaceId: 1,
        lifecycleStatus: "active",
        healthStatus: "ok",
        selectable: true,
      },
      ok: true,
    });
    mockedGateway.mockResolvedValue({
      status: "ok",
      output: "Hi from the model",
      providerConnectionId: 42,
      modelRef: "gpt-4o-mini",
      latencyMs: 123,
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      correlationId: "corr-7",
    });

    const r = await runTestWithBinding({
      draftId: 1,
      workspaceId: 1,
      actorId: 1,
      prompt: "What's 2+2?",
      systemPrompt: "Be concise.",
      correlationId: "corr-7",
    });

    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("type-narrowing");
    expect(r.output).toBe("Hi from the model");
    expect(r.latencyMs).toBe(123);
    expect(r.usage?.totalTokens).toBe(15);
    expect(r.providerConnectionId).toBe(42);
    expect(r.providerCatalogEntryId).toBe(10);
    expect(r.modelCatalogEntryId).toBe(20);
    expect(r.modelRef).toBe("gpt-4o-mini");
    expect(r.correlationId).toBe("corr-7");

    // Verify the gateway call shape.
    expect(mockedGateway).toHaveBeenCalledTimes(1);
    const call = mockedGateway.mock.calls[0][0];
    expect(call.ctx.targetModule).toBe("openRouter");
    expect(call.ctx.actionKey).toBe("openRouter.modelAccess.execute");
    expect(call.input.providerConnectionId).toBe(42);
    expect(call.input.modelRef).toBe("gpt-4o-mini");
    expect(call.input.intent).toBe("agent-test");
    expect(call.input.workspaceId).toBe(1);
    expect(call.input.actorId).toBe(1);
    expect(call.input.messages).toEqual([
      { role: "system", content: "Be concise." },
      { role: "user", content: "What's 2+2?" },
    ]);
  });

  it("omits the system message when systemPrompt is absent", async () => {
    mockedResolve.mockResolvedValue({
      binding: bindingPublic(),
      providerConnection: {
        providerConnectionId: 42,
        providerCatalogEntryId: 10,
        workspaceId: 1,
        lifecycleStatus: "active",
        healthStatus: "ok",
        selectable: true,
      },
      ok: true,
    });
    mockedGateway.mockResolvedValue({
      status: "ok",
      output: "ok",
      providerConnectionId: 42,
      modelRef: "gpt-4o-mini",
      latencyMs: 1,
    });

    await runTestWithBinding({
      draftId: 1,
      workspaceId: 1,
      actorId: 1,
      prompt: "ping",
    });

    const call = mockedGateway.mock.calls[0][0];
    expect(call.input.messages).toEqual([{ role: "user", content: "ping" }]);
  });
});

describe("runTestWithBinding — Model Access failure", () => {
  beforeEach(() => {
    mockedResolve.mockResolvedValue({
      binding: bindingPublic(),
      providerConnection: {
        providerConnectionId: 42,
        providerCatalogEntryId: 10,
        workspaceId: 1,
        lifecycleStatus: "active",
        healthStatus: "ok",
        selectable: true,
      },
      ok: true,
    });
  });

  it("surfaces thrown errors as model_access_failed", async () => {
    mockedGateway.mockRejectedValue(new Error("upstream timeout"));

    const r = await runTestWithBinding({
      draftId: 1,
      workspaceId: 1,
      actorId: 1,
      prompt: "x",
    });

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected failure");
    expect(r.reason).toBe("model_access_failed");
    expect(r.detail).toContain("upstream timeout");
  });

  it("surfaces status=error responses as model_access_failed with latency", async () => {
    mockedGateway.mockResolvedValue({
      status: "error",
      providerConnectionId: 42,
      modelRef: "gpt-4o-mini",
      latencyMs: 50,
      error: "upstream 503",
    });

    const r = await runTestWithBinding({
      draftId: 1,
      workspaceId: 1,
      actorId: 1,
      prompt: "x",
    });

    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected failure");
    expect(r.reason).toBe("model_access_failed");
    expect(r.detail).toContain("upstream 503");
    expect(r.latencyMs).toBe(50);
    expect(r.modelAccessResult?.error).toBe("upstream 503");
  });
});
