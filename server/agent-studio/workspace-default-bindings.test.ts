/**
 * Agent Studio — workspace default Provider Connection lookup tests.
 *
 * Phase 29.1b. Mocks `getAsDb` (asdb connection) and `getBindingEligibility`
 * (Phase 8 contract). Covers the contract surface locked in
 * `WORKSPACE_DEFAULT_BINDING_DECISION.md` (D-WDB-1..8):
 *
 *   1. `null` row → null return (caller's decision point)
 *   2. row hit + healthy provider connection → ok=true
 *   3. row hit + missing provider connection → ok=false / `provider_connection_missing`
 *   4. row hit + unhealthy provider connection → ok=false / `provider_connection_unhealthy`
 *   5. row hit + disabled provider connection → ok=false / `provider_connection_disabled`
 *   6. role lattice — all 4 D-WDB-4 roles round-trip
 *   7. write path gates on `getBindingEligibility` (mirrors Phase 11 contract)
 *   8. result projection never carries a credential-shaped key
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// `getAsDb` (legacy alias) and `getAsDbForWorkspace` (the V1+ MR-3 phase-1
// workspace-aware shim — see comments in `workspace-default-bindings.ts`)
// route to the same fake so existing test ergonomics survive the migration.
// Without this dual export the impl calls `getAsDbForWorkspace` and vitest
// fails with "No 'getAsDbForWorkspace' export is defined on the
// './db/connection' mock".
//
// `vi.hoisted` is required because `vi.mock` factories are hoisted to the
// top of the module before any plain `const` declarations.
const dbMocks = vi.hoisted(() => ({ getAsDb: vi.fn() }));
vi.mock("./db/connection", () => ({
  getAsDb: dbMocks.getAsDb,
  getAsDbForWorkspace: dbMocks.getAsDb,
}));

vi.mock("../provider-connections/public-api", () => ({
  getBindingEligibility: vi.fn(),
}));

import { getAsDb } from "./db/connection";
import { getBindingEligibility } from "../provider-connections/public-api";
import {
  resolveWorkspaceDefaultBinding,
  upsertWorkspaceDefaultBinding,
  deleteWorkspaceDefaultBinding,
  listWorkspaceDefaultBindings,
  WORKSPACE_DEFAULT_BINDING_ROLES,
  type WorkspaceDefaultBindingRole,
} from "./workspace-default-bindings";
import { FORBIDDEN_BINDING_KEYS } from "./bindings";

const mockedGetAsDb = getAsDb as unknown as ReturnType<typeof vi.fn>;
const mockedEligibility = getBindingEligibility as unknown as ReturnType<
  typeof vi.fn
>;

function makeRow(role: WorkspaceDefaultBindingRole = "chat", overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    workspaceId: 7,
    role,
    providerConnectionId: 42,
    providerCatalogEntryId: 10,
    modelRef: role === "embedding" ? "text-embedding-3-small" : "gpt-4o-mini",
    createdAt: new Date(),
    updatedAt: new Date(),
    updatedBy: 1,
    ...overrides,
  };
}

function makeReadDb(rows: unknown[]) {
  const select = vi.fn(() => {
    const b: any = {};
    b.from = vi.fn().mockReturnValue(b);
    b.where = vi.fn().mockResolvedValue(rows);
    return b;
  });
  return { select, insert: vi.fn(), delete: vi.fn() };
}

function makeWriteDb(insertedRow: unknown) {
  const insert = vi.fn(() => {
    const b: any = {};
    b.values = vi.fn().mockReturnValue(b);
    b.onConflictDoUpdate = vi.fn().mockReturnValue(b);
    b.returning = vi.fn().mockResolvedValue([insertedRow]);
    return b;
  });
  const select = vi.fn();
  const del = vi.fn(() => {
    const b: any = {};
    b.where = vi.fn().mockReturnValue(b);
    b.returning = vi.fn().mockResolvedValue([{ id: 1 }]);
    return b;
  });
  return { select, insert, delete: del };
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
        `Forbidden binding key "${k}" at ${path}.${k}. D-WDB-3 forbids credential material in workspace-default-binding output.`,
      );
    }
    assertNoForbiddenKeys(
      (value as Record<string, unknown>)[k],
      `${path}.${k}`,
    );
  }
}

describe("WORKSPACE_DEFAULT_BINDING_ROLES — D-WDB-4 lattice", () => {
  it("contains exactly the 4 contract roles", () => {
    expect(WORKSPACE_DEFAULT_BINDING_ROLES).toEqual([
      "chat",
      "embedding",
      "tool",
      "classifier",
    ]);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(WORKSPACE_DEFAULT_BINDING_ROLES)).toBe(true);
  });
});

describe("resolveWorkspaceDefaultBinding — read path", () => {
  beforeEach(() => {
    mockedGetAsDb.mockReset();
    mockedEligibility.mockReset();
  });

  it("returns null when no row exists for (workspaceId, role)", async () => {
    mockedGetAsDb.mockReturnValue(makeReadDb([]));
    // eligibility should NOT be called when no row exists
    mockedEligibility.mockResolvedValue({ ok: true, providerConnectionId: 42 });

    const result = await resolveWorkspaceDefaultBinding({
      workspaceId: 7,
      role: "chat",
    });

    expect(result).toBeNull();
    expect(mockedEligibility).not.toHaveBeenCalled();
  });

  it("returns ok=true when row hits a healthy provider connection", async () => {
    mockedGetAsDb.mockReturnValue(makeReadDb([makeRow("chat")]));
    mockedEligibility.mockResolvedValue({ ok: true, providerConnectionId: 42 });

    const result = await resolveWorkspaceDefaultBinding({
      workspaceId: 7,
      role: "chat",
    });

    expect(result).toEqual({
      workspaceId: 7,
      role: "chat",
      providerConnectionId: 42,
      providerCatalogEntryId: 10,
      modelRef: "gpt-4o-mini",
      ok: true,
    });
    expect(mockedEligibility).toHaveBeenCalledWith({ providerConnectionId: 42 });
  });

  it("maps eligibility 'not_found' to provider_connection_missing", async () => {
    mockedGetAsDb.mockReturnValue(makeReadDb([makeRow("embedding")]));
    mockedEligibility.mockResolvedValue({
      ok: false,
      reason: "not_found",
      providerConnectionId: 42,
    });

    const result = await resolveWorkspaceDefaultBinding({
      workspaceId: 7,
      role: "embedding",
    });

    expect(result?.ok).toBe(false);
    expect(result?.reason).toBe("provider_connection_missing");
  });

  it("maps eligibility 'health_failed' to provider_connection_unhealthy", async () => {
    mockedGetAsDb.mockReturnValue(makeReadDb([makeRow("classifier")]));
    mockedEligibility.mockResolvedValue({
      ok: false,
      reason: "health_failed",
      providerConnectionId: 42,
    });

    const result = await resolveWorkspaceDefaultBinding({
      workspaceId: 7,
      role: "classifier",
    });

    expect(result?.ok).toBe(false);
    expect(result?.reason).toBe("provider_connection_unhealthy");
  });

  it("maps eligibility 'not_active' to provider_connection_disabled", async () => {
    mockedGetAsDb.mockReturnValue(makeReadDb([makeRow("tool")]));
    mockedEligibility.mockResolvedValue({
      ok: false,
      reason: "not_active",
      providerConnectionId: 42,
    });

    const result = await resolveWorkspaceDefaultBinding({
      workspaceId: 7,
      role: "tool",
    });

    expect(result?.ok).toBe(false);
    expect(result?.reason).toBe("provider_connection_disabled");
  });

  it("maps eligibility 'secret_missing' to provider_connection_disabled", async () => {
    mockedGetAsDb.mockReturnValue(makeReadDb([makeRow("chat")]));
    mockedEligibility.mockResolvedValue({
      ok: false,
      reason: "secret_missing",
      providerConnectionId: 42,
    });

    const result = await resolveWorkspaceDefaultBinding({
      workspaceId: 7,
      role: "chat",
    });

    expect(result?.ok).toBe(false);
    expect(result?.reason).toBe("provider_connection_disabled");
  });

  it("preserves null providerCatalogEntryId in the projection", async () => {
    mockedGetAsDb.mockReturnValue(
      makeReadDb([makeRow("chat", { providerCatalogEntryId: null })]),
    );
    mockedEligibility.mockResolvedValue({ ok: true, providerConnectionId: 42 });

    const result = await resolveWorkspaceDefaultBinding({
      workspaceId: 7,
      role: "chat",
    });

    expect(result?.providerCatalogEntryId).toBeNull();
  });

  it("result projection never carries a credential-shaped key (D-WDB-3)", async () => {
    mockedGetAsDb.mockReturnValue(makeReadDb([makeRow("embedding")]));
    mockedEligibility.mockResolvedValue({ ok: true, providerConnectionId: 42 });

    const result = await resolveWorkspaceDefaultBinding({
      workspaceId: 7,
      role: "embedding",
    });

    assertNoForbiddenKeys(result);
  });

  it("round-trips all 4 D-WDB-4 roles through the lookup", async () => {
    for (const role of WORKSPACE_DEFAULT_BINDING_ROLES) {
      mockedGetAsDb.mockReturnValue(makeReadDb([makeRow(role)]));
      mockedEligibility.mockResolvedValue({
        ok: true,
        providerConnectionId: 42,
      });

      const result = await resolveWorkspaceDefaultBinding({
        workspaceId: 7,
        role,
      });

      expect(result?.ok).toBe(true);
      expect(result?.role).toBe(role);
    }
  });
});

describe("upsertWorkspaceDefaultBinding — write path eligibility gate", () => {
  beforeEach(() => {
    mockedGetAsDb.mockReset();
    mockedEligibility.mockReset();
  });

  it("rejects when getBindingEligibility returns ok=false (not_found)", async () => {
    mockedEligibility.mockResolvedValue({
      ok: false,
      reason: "not_found",
      providerConnectionId: 42,
    });

    const result = await upsertWorkspaceDefaultBinding({
      workspaceId: 7,
      role: "chat",
      providerConnectionId: 42,
      modelRef: "gpt-4o-mini",
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("provider_connection_missing");
    // DB should not have been touched
    expect(mockedGetAsDb).not.toHaveBeenCalled();
  });

  it("rejects when getBindingEligibility returns ok=false (health_failed)", async () => {
    mockedEligibility.mockResolvedValue({
      ok: false,
      reason: "health_failed",
      providerConnectionId: 42,
    });

    const result = await upsertWorkspaceDefaultBinding({
      workspaceId: 7,
      role: "classifier",
      providerConnectionId: 42,
      modelRef: "gpt-4o-mini",
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("provider_connection_unhealthy");
  });

  it("persists the row when getBindingEligibility returns ok=true", async () => {
    const persistedRow = makeRow("embedding");
    mockedEligibility.mockResolvedValue({ ok: true, providerConnectionId: 42 });
    mockedGetAsDb.mockReturnValue(makeWriteDb(persistedRow));

    const result = await upsertWorkspaceDefaultBinding({
      workspaceId: 7,
      role: "embedding",
      providerConnectionId: 42,
      providerCatalogEntryId: 10,
      modelRef: "text-embedding-3-small",
      updatedBy: 1,
    });

    expect(result.ok).toBe(true);
    expect(result.binding).toEqual(persistedRow);
  });

  it("write result never carries a credential-shaped key (D-WDB-3)", async () => {
    mockedEligibility.mockResolvedValue({ ok: true, providerConnectionId: 42 });
    mockedGetAsDb.mockReturnValue(makeWriteDb(makeRow("chat")));

    const result = await upsertWorkspaceDefaultBinding({
      workspaceId: 7,
      role: "chat",
      providerConnectionId: 42,
      modelRef: "gpt-4o-mini",
    });

    assertNoForbiddenKeys(result);
  });
});

describe("deleteWorkspaceDefaultBinding + listWorkspaceDefaultBindings", () => {
  beforeEach(() => {
    mockedGetAsDb.mockReset();
    mockedEligibility.mockReset();
  });

  it("delete returns true when a row was removed", async () => {
    mockedGetAsDb.mockReturnValue(makeWriteDb(makeRow()));

    const removed = await deleteWorkspaceDefaultBinding({
      workspaceId: 7,
      role: "chat",
    });

    expect(removed).toBe(true);
  });

  it("delete returns false when no row matched", async () => {
    const dbWithEmptyDelete = {
      select: vi.fn(),
      insert: vi.fn(),
      delete: vi.fn(() => {
        const b: any = {};
        b.where = vi.fn().mockReturnValue(b);
        b.returning = vi.fn().mockResolvedValue([]);
        return b;
      }),
    };
    mockedGetAsDb.mockReturnValue(dbWithEmptyDelete);

    const removed = await deleteWorkspaceDefaultBinding({
      workspaceId: 99,
      role: "tool",
    });

    expect(removed).toBe(false);
  });

  it("list returns all defaults for a workspace", async () => {
    const rows = [makeRow("chat"), makeRow("embedding"), makeRow("tool")];
    mockedGetAsDb.mockReturnValue(makeReadDb(rows));

    const listed = await listWorkspaceDefaultBindings(7);

    expect(listed).toHaveLength(3);
    expect(listed.map((r) => r.role)).toEqual(["chat", "embedding", "tool"]);
  });
});
