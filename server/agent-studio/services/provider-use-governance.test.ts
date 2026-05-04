/**
 * Phase 21 — provider-use governance unit tests.
 *
 * Locks down each gate's behavior in isolation plus the composed
 * `evaluateProviderUsePolicy` denial / approval flow.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../provider-connections/public-api", () => ({
  getBindingEligibility: vi.fn(),
}));

import { getBindingEligibility } from "../../provider-connections/public-api";
import {
  evaluateProviderUsePolicy,
  scanSensitiveEgress,
} from "./provider-use-governance";

const mockedEligibility = getBindingEligibility as unknown as ReturnType<
  typeof vi.fn
>;

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
  mockedEligibility.mockReset();
});

describe("scanSensitiveEgress", () => {
  it("flags PEM private keys", () => {
    const r = scanSensitiveEgress([
      { content: "Here is my key:\n-----BEGIN RSA PRIVATE KEY-----\nMIIE..." },
    ]);
    expect(r.blocked).toBe(true);
  });

  it("flags sk- API keys", () => {
    const r = scanSensitiveEgress([
      { content: "use sk-abc123def456ghi789jkl012mno345 to call OpenAI" },
    ]);
    expect(r.blocked).toBe(true);
  });

  it("flags GitHub PAT", () => {
    const r = scanSensitiveEgress([
      {
        content:
          "token: github_pat_11ABCDEFG0123456789abcdefghijklmnopqrstuv",
      },
    ]);
    expect(r.blocked).toBe(true);
  });

  it("flags Bearer tokens", () => {
    const r = scanSensitiveEgress([
      { content: "Authorization: Bearer abcdef0123456789ghijkl" },
    ]);
    expect(r.blocked).toBe(true);
  });

  it("flags password=<value>", () => {
    const r = scanSensitiveEgress([
      { content: "config: password=hunter2supersecret" },
    ]);
    expect(r.blocked).toBe(true);
  });

  it("does not flag benign content", () => {
    const r = scanSensitiveEgress([
      { content: "Hello, can you help me write a Python function?" },
    ]);
    expect(r.blocked).toBe(false);
  });

  it("ignores non-string content gracefully", () => {
    // @ts-expect-error — testing defensiveness
    const r = scanSensitiveEgress([{ content: null }, { content: undefined }]);
    expect(r.blocked).toBe(false);
  });
});

describe("evaluateProviderUsePolicy", () => {
  it("approves when every gate passes", async () => {
    mockedEligibility.mockResolvedValue({
      providerConnectionId: 42,
      ok: true,
      lifecycleStatus: "active",
      healthStatus: "ok",
    });
    const r = await evaluateProviderUsePolicy({
      binding: bindingPublic(),
      messages: [{ role: "user", content: "hi" }],
    });
    expect(r.ok).toBe(true);
  });

  it("blocks when workspace.allowExternalProviders=false", async () => {
    const r = await evaluateProviderUsePolicy({
      binding: bindingPublic(),
      messages: [{ role: "user", content: "hi" }],
      workspace: { allowExternalProviders: false },
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected denial");
    expect(r.reason).toBe("workspace_provider_disallowed");
  });

  it("blocks when agent.externalProvidersAllowed=false", async () => {
    const r = await evaluateProviderUsePolicy({
      binding: bindingPublic(),
      messages: [{ role: "user", content: "hi" }],
      agent: { externalProvidersAllowed: false },
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected denial");
    expect(r.reason).toBe("agent_external_provider_disallowed");
  });

  it("blocks when Phase 8 eligibility says no", async () => {
    mockedEligibility.mockResolvedValue({
      providerConnectionId: 42,
      ok: false,
      reason: "validated_only",
      lifecycleStatus: "validated",
    });
    const r = await evaluateProviderUsePolicy({
      binding: bindingPublic(),
      messages: [{ role: "user", content: "hi" }],
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected denial");
    expect(r.reason).toBe("connection_ineligible");
    expect(r.eligibility?.reason).toBe("validated_only");
  });

  it("blocks when binding has no model catalog ref (and is hosted)", async () => {
    mockedEligibility.mockResolvedValue({
      providerConnectionId: 42,
      ok: true,
      lifecycleStatus: "active",
      healthStatus: "ok",
    });
    const r = await evaluateProviderUsePolicy({
      binding: bindingPublic({ modelCatalogEntryId: null }),
      messages: [{ role: "user", content: "hi" }],
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected denial");
    expect(r.reason).toBe("model_unknown_in_catalog");
  });

  it("does not run the catalog gate for local-provider bindings", async () => {
    const r = await evaluateProviderUsePolicy({
      binding: bindingPublic({
        providerConnectionId: null,
        modelCatalogEntryId: null,
        modelRef: "llama3.1:8b",
      }),
      messages: [{ role: "user", content: "hi" }],
    });
    // Phase 21 only enforces catalog ref for HOSTED bindings; local
    // providers may skip the catalog ref. Eligibility check is also
    // skipped because providerConnectionId is null.
    expect(r.ok).toBe(true);
    expect(mockedEligibility).not.toHaveBeenCalled();
  });

  it("blocks on sensitive egress in any message", async () => {
    mockedEligibility.mockResolvedValue({
      providerConnectionId: 42,
      ok: true,
      lifecycleStatus: "active",
      healthStatus: "ok",
    });
    const r = await evaluateProviderUsePolicy({
      binding: bindingPublic(),
      messages: [
        { role: "system", content: "Be helpful." },
        { role: "user", content: "Look up sk-abcdef0123456789ghijklmnop" },
      ],
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected denial");
    expect(r.reason).toBe("sensitive_egress_blocked");
  });

  it("skips eligibility re-check when caller asks", async () => {
    const r = await evaluateProviderUsePolicy({
      binding: bindingPublic(),
      messages: [{ role: "user", content: "hi" }],
      skipEligibilityCheck: true,
    });
    expect(r.ok).toBe(true);
    expect(mockedEligibility).not.toHaveBeenCalled();
  });

  it("denial precedence: workspace > agent > eligibility > catalog > egress", async () => {
    mockedEligibility.mockResolvedValue({
      providerConnectionId: 42,
      ok: false,
      reason: "secret_missing",
      lifecycleStatus: "active",
    });
    const r = await evaluateProviderUsePolicy({
      binding: bindingPublic({ modelCatalogEntryId: null }),
      messages: [{ role: "user", content: "sk-abcdefghij0123456789klmnop" }],
      workspace: { allowExternalProviders: false },
      agent: { externalProvidersAllowed: false },
    });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("expected denial");
    // Workspace gate fires first; the others never get evaluated.
    expect(r.reason).toBe("workspace_provider_disallowed");
    expect(mockedEligibility).not.toHaveBeenCalled();
  });
});
