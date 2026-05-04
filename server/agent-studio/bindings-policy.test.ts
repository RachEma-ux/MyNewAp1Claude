/**
 * Phase 12 — validateBindingPolicy + resolveForRun tests.
 *
 * Asserts the reference/policy validator (no upstream HTTP) and the
 * runtime resolver behave per migration spec §7 + Phase 13's split:
 *
 *   - validateBindingPolicy: cheap, no fetch
 *   - resolveForRun: returns refs only, no credentials
 *
 * Each branch (binding_not_found / legacy_unresolved / disabled /
 * provider_connection_ineligible / ok / local-provider null PCID) has
 * a dedicated case.
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
  validateBindingPolicy,
  resolveForRun,
  FORBIDDEN_BINDING_KEYS,
} from "./bindings";

const mockedGetAsDb = getAsDb as unknown as ReturnType<typeof vi.fn>;
const mockedEligibility = getBindingEligibility as unknown as ReturnType<
  typeof vi.fn
>;

function makeDbWithRow(row: unknown | null) {
  const select = vi.fn(() => {
    const b: any = {};
    b.from = vi.fn().mockReturnValue(b);
    b.where = vi.fn().mockResolvedValue(row ? [row] : []);
    return b;
  });
  return { select };
}

function bindingRow(overrides: Record<string, unknown> = {}) {
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
    status: "binding_v1",
    statusReason: null,
    legacyEnvVarHint: null,
    createdBy: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
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
        `Forbidden binding key "${k}" at ${path}.${k}. Phase 12 contract forbids credentials in resolver output.`,
      );
    }
    assertNoForbiddenKeys(
      (value as Record<string, unknown>)[k],
      `${path}.${k}`,
    );
  }
}

describe("validateBindingPolicy", () => {
  beforeEach(() => {
    mockedGetAsDb.mockReset();
    mockedEligibility.mockReset();
  });

  it("returns binding_not_found when no row exists", async () => {
    mockedGetAsDb.mockReturnValue(makeDbWithRow(null));
    const r = await validateBindingPolicy(123);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("binding_not_found");
    expect(mockedEligibility).not.toHaveBeenCalled();
  });

  it("returns legacy_unresolved for legacy_unresolved status", async () => {
    mockedGetAsDb.mockReturnValue(
      makeDbWithRow(
        bindingRow({ status: "legacy_unresolved", statusReason: "legacy_env_var" }),
      ),
    );
    const r = await validateBindingPolicy(1);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("legacy_unresolved");
    expect(mockedEligibility).not.toHaveBeenCalled();
  });

  it("returns binding_disabled for disabled / archived", async () => {
    for (const status of ["disabled", "archived"]) {
      mockedGetAsDb.mockReturnValue(makeDbWithRow(bindingRow({ status })));
      const r = await validateBindingPolicy(1);
      expect(r.ok, `status=${status}`).toBe(false);
      expect(r.reason).toBe("binding_disabled");
    }
  });

  it("returns provider_connection_ineligible when Phase 8 gate rejects", async () => {
    mockedGetAsDb.mockReturnValue(makeDbWithRow(bindingRow()));
    mockedEligibility.mockResolvedValue({
      providerConnectionId: 42,
      ok: false,
      reason: "validated_only",
      lifecycleStatus: "validated",
    });
    const r = await validateBindingPolicy(1);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("provider_connection_ineligible");
    expect(r.eligibility?.reason).toBe("validated_only");
  });

  it("returns ok=true when binding_v1 + Phase 8 gate passes", async () => {
    mockedGetAsDb.mockReturnValue(makeDbWithRow(bindingRow()));
    mockedEligibility.mockResolvedValue({
      providerConnectionId: 42,
      ok: true,
      lifecycleStatus: "active",
      healthStatus: "ok",
    });
    const r = await validateBindingPolicy(1);
    expect(r.ok).toBe(true);
    expect(r.eligibility?.ok).toBe(true);
    expect(r.catalogAvailable).toBeNull();
  });

  it("skips Phase 8 gate for local-provider binding (providerConnectionId=null)", async () => {
    mockedGetAsDb.mockReturnValue(
      makeDbWithRow(
        bindingRow({ providerConnectionId: null, modelRef: "llama3.1:8b" }),
      ),
    );
    const r = await validateBindingPolicy(1);
    expect(r.ok).toBe(true);
    expect(mockedEligibility).not.toHaveBeenCalled();
  });
});

describe("resolveForRun", () => {
  beforeEach(() => {
    mockedGetAsDb.mockReset();
    mockedEligibility.mockReset();
  });

  it("returns ok=true with providerConnection ref when binding is healthy", async () => {
    mockedGetAsDb.mockReturnValue(makeDbWithRow(bindingRow()));
    mockedEligibility.mockResolvedValue({
      providerConnectionId: 42,
      ok: true,
      lifecycleStatus: "active",
      healthStatus: "ok",
    });

    const r = await resolveForRun({ draftId: 1 });
    expect(r.ok).toBe(true);
    expect(r.providerConnection).not.toBeNull();
    expect(r.providerConnection!.providerConnectionId).toBe(42);
    expect(r.providerConnection!.lifecycleStatus).toBe("active");

    // No credential keys leak into the resolver output.
    expect(() => assertNoForbiddenKeys(r)).not.toThrow();
  });

  it("returns providerConnection=null for local-provider bindings", async () => {
    mockedGetAsDb.mockReturnValue(
      makeDbWithRow(
        bindingRow({ providerConnectionId: null, modelRef: "llama3.1:8b" }),
      ),
    );
    const r = await resolveForRun({ draftId: 1 });
    expect(r.ok).toBe(true);
    expect(r.providerConnection).toBeNull();
  });

  it("returns ok=false with reason when policy fails", async () => {
    mockedGetAsDb.mockReturnValue(
      makeDbWithRow(bindingRow({ status: "legacy_unresolved" })),
    );
    const r = await resolveForRun({ draftId: 1 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("legacy_unresolved");
    expect(r.providerConnection).toBeNull();
  });

  it("returns ok=false with binding_not_found when binding row is missing", async () => {
    mockedGetAsDb.mockReturnValue(makeDbWithRow(null));
    const r = await resolveForRun({ draftId: 999 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("binding_not_found");
    // Even on the not-found path, no credentials in the response.
    expect(() => assertNoForbiddenKeys(r)).not.toThrow();
  });
});
