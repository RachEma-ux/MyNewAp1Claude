// Effective chat-binding resolver tests — Option-B PR 4.
//
// Covers the D-PR-4 / D-WDB-3 two-step lookup:
//   (I)  per-agent binding from `getAgentProviderBinding(draftId, "primary")`
//   (II) workspace-default binding for role="chat"
// Returns null when both miss; otherwise the binding has
// status="binding_v1" and a non-null providerConnectionId so
// downstream chat paths can use it uniformly.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../bindings", () => ({
  getAgentProviderBinding: vi.fn(),
}));
vi.mock("../workspace-default-bindings", () => ({
  resolveWorkspaceDefaultBinding: vi.fn(),
}));

import { getAgentProviderBinding } from "../bindings";
import { resolveWorkspaceDefaultBinding } from "../workspace-default-bindings";
import { resolveEffectiveChatBinding } from "./chat-binding-resolver";

const mockedGetAgent = getAgentProviderBinding as unknown as ReturnType<typeof vi.fn>;
const mockedGetWsDefault = resolveWorkspaceDefaultBinding as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockedGetAgent.mockReset();
  mockedGetWsDefault.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("resolveEffectiveChatBinding", () => {
  it("returns per-agent binding when status=binding_v1 and providerConnectionId is set", async () => {
    const perAgent = {
      id: 7,
      workspaceId: 2,
      agentId: 1,
      draftId: 1,
      role: "primary",
      providerCatalogEntryId: 1,
      modelCatalogEntryId: null,
      providerConnectionId: 5,
      modelRef: "gpt-4o",
      status: "binding_v1",
      statusReason: null,
      legacyEnvVarHint: null,
      lastValidatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockedGetAgent.mockResolvedValueOnce(perAgent);

    const result = await resolveEffectiveChatBinding({ draftId: 1, workspaceId: 2 });

    expect(result?.source).toBe("per-agent");
    expect(result?.binding).toEqual(perAgent);
    expect(mockedGetWsDefault).not.toHaveBeenCalled();
  });

  it("falls back to workspace-default when per-agent binding is null", async () => {
    mockedGetAgent.mockResolvedValueOnce(null);
    mockedGetWsDefault.mockResolvedValueOnce({
      workspaceId: 2,
      role: "chat",
      providerConnectionId: 3,
      providerCatalogEntryId: 7,
      modelRef: "gpt-4o-mini",
      ok: true,
    });

    const result = await resolveEffectiveChatBinding({ draftId: 99, workspaceId: 2 });

    expect(result?.source).toBe("workspace-default");
    expect(result?.binding.providerConnectionId).toBe(3);
    expect(result?.binding.modelRef).toBe("gpt-4o-mini");
    expect(result?.binding.status).toBe("binding_v1");
    expect(result?.binding.draftId).toBe(99);
    expect(mockedGetWsDefault).toHaveBeenCalledWith({
      workspaceId: 2,
      role: "chat",
    });
  });

  it("falls back to workspace-default when per-agent status is not binding_v1", async () => {
    mockedGetAgent.mockResolvedValueOnce({
      id: 7,
      workspaceId: 2,
      agentId: 1,
      draftId: 1,
      role: "primary",
      providerCatalogEntryId: 1,
      modelCatalogEntryId: null,
      providerConnectionId: 5,
      modelRef: "gpt-4o",
      status: "legacy_unresolved", // disqualifies per-agent fast path
      statusReason: "legacy_no_credential",
      legacyEnvVarHint: null,
      lastValidatedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockedGetWsDefault.mockResolvedValueOnce({
      workspaceId: 2,
      role: "chat",
      providerConnectionId: 3,
      providerCatalogEntryId: 7,
      modelRef: "gpt-4o-mini",
      ok: true,
    });

    const result = await resolveEffectiveChatBinding({ draftId: 1, workspaceId: 2 });

    expect(result?.source).toBe("workspace-default");
    expect(result?.binding.providerConnectionId).toBe(3);
  });

  it("falls back to workspace-default when per-agent providerConnectionId is null (local-provider binding)", async () => {
    mockedGetAgent.mockResolvedValueOnce({
      id: 7,
      workspaceId: 2,
      agentId: 1,
      draftId: 1,
      role: "primary",
      providerCatalogEntryId: 1,
      modelCatalogEntryId: null,
      providerConnectionId: null,
      modelRef: "llama3",
      status: "binding_v1",
      statusReason: null,
      legacyEnvVarHint: null,
      lastValidatedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockedGetWsDefault.mockResolvedValueOnce({
      workspaceId: 2,
      role: "chat",
      providerConnectionId: 3,
      providerCatalogEntryId: 7,
      modelRef: "gpt-4o-mini",
      ok: true,
    });

    const result = await resolveEffectiveChatBinding({ draftId: 1, workspaceId: 2 });

    expect(result?.source).toBe("workspace-default");
  });

  it("returns null when both per-agent and workspace-default miss (refuse-required state)", async () => {
    mockedGetAgent.mockResolvedValueOnce(null);
    mockedGetWsDefault.mockResolvedValueOnce(null);

    const result = await resolveEffectiveChatBinding({ draftId: 99, workspaceId: 2 });

    expect(result).toBeNull();
  });

  it("returns null when workspace-default exists but ok=false (e.g. unhealthy provider connection)", async () => {
    mockedGetAgent.mockResolvedValueOnce(null);
    mockedGetWsDefault.mockResolvedValueOnce({
      workspaceId: 2,
      role: "chat",
      providerConnectionId: 3,
      providerCatalogEntryId: 7,
      modelRef: "gpt-4o-mini",
      ok: false,
      reason: "provider_connection_unhealthy",
    });

    const result = await resolveEffectiveChatBinding({ draftId: 99, workspaceId: 2 });

    expect(result).toBeNull();
  });
});
