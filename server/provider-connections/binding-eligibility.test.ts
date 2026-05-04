/**
 * Provider Connections — Phase 8 binding-eligibility gate tests.
 *
 * Asserts the contract Agent Studio binding writers (Phase 11+) will
 * call before persisting a binding:
 *
 *   - active + ok                  -> ok
 *   - active + unknown             -> ok + degradedReason=provider_health_unknown
 *   - active + unreachable         -> NOT ok (health_failed)
 *   - active + missing secret      -> NOT ok (secret_missing)
 *   - validated                    -> NOT ok (validated_only)
 *   - missing row                  -> NOT ok (not_found)
 *
 * The function never returns secret material — guarded by the existing
 * shape test in `public-api.test.ts`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("./db", () => ({
  getLatestSecret: vi.fn(),
}));

import { getDb } from "../db";
import { getLatestSecret } from "./db";
import { getBindingEligibility } from "./public-api";

const mockedGetDb = getDb as unknown as ReturnType<typeof vi.fn>;
const mockedGetLatestSecret = getLatestSecret as unknown as ReturnType<
  typeof vi.fn
>;

function makeSelectBuilder(rows: unknown[]) {
  const b: any = {};
  b.from = vi.fn().mockReturnValue(b);
  b.where = vi.fn().mockResolvedValue(rows);
  return b;
}

function withDb(row: unknown | null) {
  mockedGetDb.mockReturnValue({
    select: vi.fn(() => makeSelectBuilder(row ? [row] : [])),
  });
}

describe("getBindingEligibility — Phase 8 contract", () => {
  beforeEach(() => {
    mockedGetDb.mockReset();
    mockedGetLatestSecret.mockReset();
  });

  it("ok=true when active + healthy + secret present", async () => {
    withDb({
      id: 42,
      providerId: 7,
      workspaceId: 1,
      lifecycleStatus: "active",
      healthStatus: "ok",
      modelCount: 3,
      capabilities: ["chat"],
    });
    mockedGetLatestSecret.mockResolvedValue({ id: 100 });

    const r = await getBindingEligibility({ providerConnectionId: 42 });
    expect(r.ok).toBe(true);
    expect(r.lifecycleStatus).toBe("active");
    expect(r.healthStatus).toBe("ok");
    expect(r.degradedReason).toBeUndefined();
  });

  it("ok=true with degradedReason when health is unknown", async () => {
    withDb({
      id: 43,
      providerId: 7,
      workspaceId: 1,
      lifecycleStatus: "active",
      healthStatus: null,
      modelCount: 0,
      capabilities: [],
    });
    mockedGetLatestSecret.mockResolvedValue({ id: 100 });

    const r = await getBindingEligibility({ providerConnectionId: 43 });
    expect(r.ok).toBe(true);
    expect(r.healthStatus).toBe("unknown");
    expect(r.degradedReason).toBe("provider_health_unknown");
  });

  it("ok=false (health_failed) when active but unreachable", async () => {
    withDb({
      id: 44,
      providerId: 7,
      workspaceId: 1,
      lifecycleStatus: "active",
      healthStatus: "unreachable",
      modelCount: 0,
      capabilities: [],
    });
    mockedGetLatestSecret.mockResolvedValue({ id: 100 });

    const r = await getBindingEligibility({ providerConnectionId: 44 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("health_failed");
    expect(r.lifecycleStatus).toBe("active");
    expect(r.healthStatus).toBe("unreachable");
  });

  it("ok=false (secret_missing) when active but no stored secret", async () => {
    withDb({
      id: 45,
      providerId: 7,
      workspaceId: 1,
      lifecycleStatus: "active",
      healthStatus: "ok",
      modelCount: 0,
      capabilities: [],
    });
    mockedGetLatestSecret.mockResolvedValue(null);

    const r = await getBindingEligibility({ providerConnectionId: 45 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("secret_missing");
  });

  it("ok=false (validated_only) when lifecycleStatus=validated", async () => {
    withDb({
      id: 46,
      providerId: 7,
      workspaceId: 1,
      lifecycleStatus: "validated",
      healthStatus: "ok",
      modelCount: 0,
      capabilities: [],
    });

    const r = await getBindingEligibility({ providerConnectionId: 46 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("validated_only");
    expect(r.lifecycleStatus).toBe("validated");
  });

  it("ok=false (not_active) when lifecycleStatus=disabled", async () => {
    withDb({
      id: 47,
      providerId: 7,
      workspaceId: 1,
      lifecycleStatus: "disabled",
      healthStatus: "ok",
      modelCount: 0,
      capabilities: [],
    });

    const r = await getBindingEligibility({ providerConnectionId: 47 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("not_active");
  });

  it("ok=false (not_found) when no row exists", async () => {
    withDb(null);
    const r = await getBindingEligibility({ providerConnectionId: 999 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("not_found");
  });

  it("returns ok=false on no-DB sandbox (test environment)", async () => {
    mockedGetDb.mockReturnValue(null);
    const r = await getBindingEligibility({ providerConnectionId: 1 });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("not_found");
  });
});
