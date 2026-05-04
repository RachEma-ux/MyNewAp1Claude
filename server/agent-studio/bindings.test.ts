/**
 * Agent Studio — provider binding write/read tests.
 *
 * Plan v3 Phase 11. Mocks `getAsDb` (asdb connection) and
 * `getBindingEligibility` (Phase 8 contract). Asserts:
 *
 *   1. `binding_v1` writes call the Phase 8 eligibility gate first
 *      and reject when it returns `ok=false`.
 *   2. `legacy_unresolved` writes skip the gate (migration path).
 *   3. The `enforceEligibility: false` escape-hatch is honoured
 *      (used by the Phase 10 migration script).
 *   4. Local-provider `binding_v1` rows with `providerConnectionId=null`
 *      are accepted (no credential needed for Ollama/llama.cpp).
 *   5. The returned `AgentProviderBindingPublic` shape never carries
 *      a credential-shaped key (FORBIDDEN_BINDING_KEYS guard).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db/connection", () => ({
  getAsDb: vi.fn(),
}));

vi.mock("../provider-connections/public-api", () => ({
  getBindingEligibility: vi.fn(),
}));

import { getAsDb } from "./db/connection";
import { getBindingEligibility } from "../provider-connections/public-api";
import {
  upsertAgentProviderBinding,
  getAgentProviderBinding,
  BindingEligibilityError,
  FORBIDDEN_BINDING_KEYS,
} from "./bindings";

const mockedGetAsDb = getAsDb as unknown as ReturnType<typeof vi.fn>;
const mockedEligibility = getBindingEligibility as unknown as ReturnType<
  typeof vi.fn
>;

function makeDbWithExisting(rows: unknown[], inserted?: unknown, updated?: unknown) {
  const select = vi.fn(() => {
    const b: any = {};
    b.from = vi.fn().mockReturnValue(b);
    b.where = vi.fn().mockResolvedValue(rows);
    return b;
  });
  const insert = vi.fn(() => {
    const b: any = {};
    b.values = vi.fn().mockReturnValue(b);
    b.returning = vi
      .fn()
      .mockResolvedValue([
        inserted ?? {
          id: 1,
          workspaceId: 1,
          agentId: 1,
          draftId: 1,
          role: "primary",
          providerCatalogEntryId: 10,
          modelCatalogEntryId: 20,
          providerConnectionId: 42,
          modelRef: "gpt-4o-mini",
          status: "binding_v1",
          statusReason: null,
          legacyEnvVarHint: null,
          createdBy: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
    return b;
  });
  const update = vi.fn(() => {
    const b: any = {};
    b.set = vi.fn().mockReturnValue(b);
    b.where = vi.fn().mockReturnValue(b);
    b.returning = vi.fn().mockResolvedValue([updated ?? rows[0]]);
    return b;
  });
  return { select, insert, update };
}

function assertNoForbiddenKeys(value: unknown, path = "$"): void {
  if (value === null || value === undefined) return;
  if (typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const [i, v] of value.entries())
      assertNoForbiddenKeys(v, `${path}[${i}]`);
    return;
  }
  for (const k of Object.keys(value)) {
    if (FORBIDDEN_BINDING_KEYS.includes(k)) {
      throw new Error(
        `Forbidden binding key "${k}" at ${path}.${k}. Phase 11 contract forbids credential material in binding output.`,
      );
    }
    assertNoForbiddenKeys(
      (value as Record<string, unknown>)[k],
      `${path}.${k}`,
    );
  }
}

describe("upsertAgentProviderBinding — eligibility gate", () => {
  beforeEach(() => {
    mockedGetAsDb.mockReset();
    mockedEligibility.mockReset();
  });

  it("calls getBindingEligibility before inserting binding_v1", async () => {
    mockedEligibility.mockResolvedValue({
      providerConnectionId: 42,
      ok: true,
      lifecycleStatus: "active",
      healthStatus: "ok",
    });
    mockedGetAsDb.mockReturnValue(makeDbWithExisting([]));

    const r = await upsertAgentProviderBinding({
      workspaceId: 1,
      agentId: 1,
      draftId: 1,
      providerCatalogEntryId: 10,
      modelCatalogEntryId: 20,
      providerConnectionId: 42,
      modelRef: "gpt-4o-mini",
      status: "binding_v1",
      createdBy: 1,
    });

    expect(mockedEligibility).toHaveBeenCalledWith({
      providerConnectionId: 42,
    });
    expect(r.binding.status).toBe("binding_v1");
    expect(r.eligibility?.ok).toBe(true);
  });

  it("throws BindingEligibilityError when the gate rejects", async () => {
    mockedEligibility.mockResolvedValue({
      providerConnectionId: 42,
      ok: false,
      reason: "validated_only",
      lifecycleStatus: "validated",
    });

    await expect(
      upsertAgentProviderBinding({
        workspaceId: 1,
        agentId: 1,
        draftId: 1,
        providerCatalogEntryId: 10,
        modelCatalogEntryId: 20,
        providerConnectionId: 42,
        modelRef: "gpt-4o-mini",
        status: "binding_v1",
        createdBy: 1,
      }),
    ).rejects.toThrow(BindingEligibilityError);

    // No DB write attempted when the gate rejects.
    expect(mockedGetAsDb).not.toHaveBeenCalled();
  });

  it("skips the gate for status=legacy_unresolved", async () => {
    mockedGetAsDb.mockReturnValue(
      makeDbWithExisting([], {
        id: 5,
        workspaceId: 1,
        agentId: 1,
        draftId: 1,
        role: "primary",
        providerCatalogEntryId: null,
        modelCatalogEntryId: null,
        providerConnectionId: null,
        modelRef: "gpt-4o-mini",
        status: "legacy_unresolved",
        statusReason: "legacy_raw_api_key",
        legacyEnvVarHint: null,
        createdBy: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const r = await upsertAgentProviderBinding({
      workspaceId: 1,
      agentId: 1,
      draftId: 1,
      providerCatalogEntryId: null,
      modelCatalogEntryId: null,
      providerConnectionId: null,
      modelRef: "gpt-4o-mini",
      status: "legacy_unresolved",
      statusReason: "legacy_raw_api_key",
      createdBy: 1,
    });

    expect(mockedEligibility).not.toHaveBeenCalled();
    expect(r.binding.status).toBe("legacy_unresolved");
    expect(r.binding.statusReason).toBe("legacy_raw_api_key");
    expect(r.eligibility).toBeNull();
  });

  it("skips the gate when enforceEligibility=false (migration script escape-hatch)", async () => {
    mockedGetAsDb.mockReturnValue(makeDbWithExisting([]));

    await upsertAgentProviderBinding({
      workspaceId: 1,
      agentId: 1,
      draftId: 1,
      providerCatalogEntryId: 10,
      modelCatalogEntryId: 20,
      providerConnectionId: 42,
      modelRef: "gpt-4o-mini",
      status: "binding_v1",
      createdBy: 1,
      enforceEligibility: false,
    });

    expect(mockedEligibility).not.toHaveBeenCalled();
  });

  it("skips the gate for local-provider binding_v1 with providerConnectionId=null", async () => {
    mockedGetAsDb.mockReturnValue(
      makeDbWithExisting([], {
        id: 7,
        workspaceId: 1,
        agentId: 1,
        draftId: 1,
        role: "primary",
        providerCatalogEntryId: null,
        modelCatalogEntryId: null,
        providerConnectionId: null,
        modelRef: "llama3.1:8b",
        status: "binding_v1",
        statusReason: null,
        legacyEnvVarHint: null,
        createdBy: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const r = await upsertAgentProviderBinding({
      workspaceId: 1,
      agentId: 1,
      draftId: 1,
      providerCatalogEntryId: null,
      modelCatalogEntryId: null,
      providerConnectionId: null,
      modelRef: "llama3.1:8b",
      status: "binding_v1",
      createdBy: 1,
    });

    expect(mockedEligibility).not.toHaveBeenCalled();
    expect(r.binding.status).toBe("binding_v1");
    expect(r.binding.providerConnectionId).toBeNull();
  });

  it("updates an existing row instead of inserting (idempotency)", async () => {
    mockedEligibility.mockResolvedValue({
      providerConnectionId: 42,
      ok: true,
      lifecycleStatus: "active",
      healthStatus: "ok",
    });
    const existing = {
      id: 99,
      workspaceId: 1,
      agentId: 1,
      draftId: 1,
      role: "primary",
      providerCatalogEntryId: 10,
      modelCatalogEntryId: 20,
      providerConnectionId: 42,
      modelRef: "gpt-3.5-turbo",
      status: "binding_v1",
      statusReason: null,
      legacyEnvVarHint: null,
      createdBy: 1,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    const updated = { ...existing, modelRef: "gpt-4o-mini", updatedAt: new Date() };
    mockedGetAsDb.mockReturnValue(
      makeDbWithExisting([existing], undefined, updated),
    );

    const r = await upsertAgentProviderBinding({
      workspaceId: 1,
      agentId: 1,
      draftId: 1,
      providerCatalogEntryId: 10,
      modelCatalogEntryId: 20,
      providerConnectionId: 42,
      modelRef: "gpt-4o-mini",
      status: "binding_v1",
      createdBy: 1,
    });

    expect(r.binding.id).toBe(99);
    expect(r.binding.modelRef).toBe("gpt-4o-mini");
  });
});

describe("getAgentProviderBinding — read path", () => {
  beforeEach(() => {
    mockedGetAsDb.mockReset();
  });

  it("returns null when no row exists", async () => {
    mockedGetAsDb.mockReturnValue(makeDbWithExisting([]));
    const r = await getAgentProviderBinding(123);
    expect(r).toBeNull();
  });

  it("returns the public no-secret projection", async () => {
    const row = {
      id: 1,
      workspaceId: 1,
      agentId: 1,
      draftId: 1,
      role: "primary",
      providerCatalogEntryId: 10,
      modelCatalogEntryId: 20,
      providerConnectionId: 42,
      modelRef: "gpt-4o-mini",
      status: "binding_v1",
      statusReason: null,
      legacyEnvVarHint: null,
      createdBy: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockedGetAsDb.mockReturnValue(makeDbWithExisting([row]));

    const r = await getAgentProviderBinding(1);
    expect(r).not.toBeNull();
    expect(() => assertNoForbiddenKeys(r)).not.toThrow();
    // Specifically: no `createdBy` in the public projection (internal field).
    // Specifically: no apiKey / apiKeyEnvVar / Authorization.
    expect((r as Record<string, unknown>).apiKey).toBeUndefined();
    expect((r as Record<string, unknown>).apiKeyEnvVar).toBeUndefined();
  });
});
