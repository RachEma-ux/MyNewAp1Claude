/**
 * AI Types — provider/model availability contract tests.
 *
 * Plan v3 Phase 7. Two suites:
 *
 *   1. Shape guard — the response carries NO credential-shaped key.
 *   2. Behaviour — the join filters out non-active models, frozen
 *      entries, and unapproved entries; non-DB-backed environments
 *      return [] cleanly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock `getDb` so the query function works without a live Postgres.
// Returning `null` exercises the test-sandbox short-circuit; a stub
// builder returning canned rows exercises the projection path.
vi.mock("../db/connection", () => ({
  getDb: vi.fn(),
}));

import { getDb } from "../db/connection";
import {
  listAvailableProviderModels,
  FORBIDDEN_AVAILABILITY_KEYS,
  type AvailableProviderModel,
} from "./provider-models-availability";

const mockedGetDb = getDb as unknown as ReturnType<typeof vi.fn>;

function assertNoForbiddenKeys(value: unknown, path = "$"): void {
  if (value === null || value === undefined) return;
  if (typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const [i, v] of value.entries()) {
      assertNoForbiddenKeys(v, `${path}[${i}]`);
    }
    return;
  }
  for (const k of Object.keys(value)) {
    if (FORBIDDEN_AVAILABILITY_KEYS.includes(k)) {
      throw new Error(
        `Forbidden availability key "${k}" at ${path}.${k}. Phase 7 contract forbids credential material in output.`,
      );
    }
    assertNoForbiddenKeys(
      (value as Record<string, unknown>)[k],
      `${path}.${k}`,
    );
  }
}

describe("listAvailableProviderModels — shape guard", () => {
  it("AvailableProviderModel sample contains no forbidden credential keys", () => {
    const sample: AvailableProviderModel = {
      providerCatalogEntryId: 10,
      providerId: 1,
      providerSlug: "openai",
      providerName: "OpenAI",
      providerType: "openai",
      modelCatalogEntryId: 20,
      modelId: 2,
      modelRef: "gpt-test",
      modelDisplayName: "GPT Test",
      capabilities: ["chat"],
      governanceStatus: {
        status: "active",
        reviewState: "approved",
        available: true,
        reasons: [],
      },
      restrictions: {
        policyTags: ["external"],
        frozen: false,
        freezeReason: null,
      },
    };
    expect(() => assertNoForbiddenKeys(sample)).not.toThrow();
  });

  it("guard catches a deliberately-poisoned response (regression)", () => {
    const poisoned = {
      providerSlug: "openai",
      apiKey: "sk-leak",
    };
    expect(() => assertNoForbiddenKeys(poisoned)).toThrow(
      /Forbidden availability key "apiKey"/,
    );
  });

  it("guard catches credential bleed in a nested field", () => {
    const poisoned = {
      providerSlug: "openai",
      restrictions: { meta: { Authorization: "Bearer leak" } },
    };
    expect(() => assertNoForbiddenKeys(poisoned)).toThrow(
      /Forbidden availability key "Authorization"/,
    );
  });
});

describe("listAvailableProviderModels — behaviour", () => {
  beforeEach(() => {
    mockedGetDb.mockReset();
  });

  it("returns [] when the database is not initialized", async () => {
    mockedGetDb.mockReturnValue(null);
    const r = await listAvailableProviderModels({});
    expect(r).toEqual([]);
  });

  it("filters out frozen, non-active, and unapproved models", async () => {
    // Synthetic db: queue 4 select() calls in order.
    //  1. aiTypeModels (where status=active [+ optional providerSlug])
    //  2. providers (in providerIds)
    //  3. catalog_entries (entryType=model, sourceType=ai_type_models)
    //  4. catalog_entries (entryType=provider, providerId in ...)
    const calls: { from: any[]; where: any[] }[] = [];
    const queueResults: unknown[][] = [
      // (1) Models — three rows: ok, frozen, unapproved
      [
        {
          id: 100,
          name: "ok-model",
          providerId: 1,
          providerSlug: "openai",
          apiModelId: "gpt-test",
          canonicalKey: "openai/gpt-test",
          capabilities: ["chat"],
          status: "active",
          displayName: "OK Model",
        },
        {
          id: 101,
          name: "frozen-model",
          providerId: 1,
          providerSlug: "openai",
          apiModelId: "gpt-frozen",
          capabilities: ["chat"],
          status: "active",
          displayName: null,
        },
        {
          id: 102,
          name: "unapproved-model",
          providerId: 1,
          providerSlug: "openai",
          apiModelId: "gpt-pending",
          capabilities: [],
          status: "active",
          displayName: null,
        },
      ],
      // (2) Providers
      [
        {
          id: 1,
          name: "OpenAI",
          type: "openai",
          enabled: true,
          policyTags: ["external"],
        },
      ],
      // (3) Model catalog entries — one ok, one frozen, one needs_review
      [
        {
          id: 1000,
          entryType: "model",
          sourceType: "ai_type_models",
          sourceId: 100,
          status: "active",
          reviewState: "approved",
          frozen: false,
          freezeReason: null,
          providerId: 1,
        },
        {
          id: 1001,
          entryType: "model",
          sourceType: "ai_type_models",
          sourceId: 101,
          status: "active",
          reviewState: "approved",
          frozen: true,
          freezeReason: "lockdown",
          providerId: 1,
        },
        {
          id: 1002,
          entryType: "model",
          sourceType: "ai_type_models",
          sourceId: 102,
          status: "active",
          reviewState: "needs_review",
          frozen: false,
          freezeReason: null,
          providerId: 1,
        },
      ],
      // (4) Provider catalog entries
      [
        {
          id: 2000,
          entryType: "provider",
          providerId: 1,
          status: "active",
          reviewState: "approved",
        },
      ],
    ];

    function makeBuilder(rows: unknown[]) {
      const builder: any = {};
      builder.from = vi.fn().mockReturnValue(builder);
      builder.where = vi.fn().mockReturnValue(builder);
      builder.orderBy = vi.fn().mockReturnValue(builder);
      builder.then = (resolve: any) => Promise.resolve(rows).then(resolve);
      return builder;
    }

    const fakeDb = {
      select: vi.fn(() => {
        const next = queueResults.shift() ?? [];
        return makeBuilder(next);
      }),
    };
    mockedGetDb.mockReturnValue(fakeDb);

    const r = await listAvailableProviderModels({ providerSlug: "openai" });
    expect(r).toHaveLength(1);
    const row = r[0]!;
    expect(row.modelRef).toBe("gpt-test");
    expect(row.providerSlug).toBe("openai");
    expect(row.providerType).toBe("openai");
    expect(row.providerCatalogEntryId).toBe(2000);
    expect(row.modelCatalogEntryId).toBe(1000);
    expect(row.governanceStatus.available).toBe(true);
    expect(row.restrictions.frozen).toBe(false);
    expect(row.capabilities).toEqual(["chat"]);
    expect(row.modelDisplayName).toBe("OK Model");

    // Shape guard.
    expect(() => assertNoForbiddenKeys(r)).not.toThrow();
    void calls;
  });

  it("derives modelRef from canonicalKey when apiModelId is missing", async () => {
    const queueResults: unknown[][] = [
      [
        {
          id: 200,
          name: "fallback",
          providerId: 1,
          providerSlug: "anthropic",
          apiModelId: null,
          canonicalKey: "anthropic/claude-test",
          capabilities: [],
          status: "active",
          displayName: null,
        },
      ],
      [
        {
          id: 1,
          name: "Anthropic",
          type: "anthropic",
          enabled: true,
          policyTags: null,
        },
      ],
      [
        {
          id: 3000,
          entryType: "model",
          sourceType: "ai_type_models",
          sourceId: 200,
          status: "active",
          reviewState: "approved",
          frozen: false,
          freezeReason: null,
          providerId: 1,
        },
      ],
      [],
    ];
    function makeBuilder(rows: unknown[]) {
      const b: any = {};
      b.from = vi.fn().mockReturnValue(b);
      b.where = vi.fn().mockReturnValue(b);
      b.orderBy = vi.fn().mockReturnValue(b);
      b.then = (resolve: any) => Promise.resolve(rows).then(resolve);
      return b;
    }
    mockedGetDb.mockReturnValue({
      select: vi.fn(() => makeBuilder(queueResults.shift() ?? [])),
    });

    const r = await listAvailableProviderModels({});
    expect(r).toHaveLength(1);
    expect(r[0]!.modelRef).toBe("claude-test");
    expect(r[0]!.providerCatalogEntryId).toBeNull();
  });

  it("filters out models whose provider is disabled", async () => {
    const queueResults: unknown[][] = [
      [
        {
          id: 300,
          name: "m",
          providerId: 1,
          providerSlug: "openai",
          apiModelId: "gpt-test",
          capabilities: [],
          status: "active",
          displayName: null,
        },
      ],
      [
        {
          id: 1,
          name: "OpenAI",
          type: "openai",
          enabled: false, // <-- disabled provider
          policyTags: null,
        },
      ],
      [
        {
          id: 4000,
          entryType: "model",
          sourceType: "ai_type_models",
          sourceId: 300,
          status: "active",
          reviewState: "approved",
          frozen: false,
          freezeReason: null,
          providerId: 1,
        },
      ],
      [],
    ];
    function makeBuilder(rows: unknown[]) {
      const b: any = {};
      b.from = vi.fn().mockReturnValue(b);
      b.where = vi.fn().mockReturnValue(b);
      b.orderBy = vi.fn().mockReturnValue(b);
      b.then = (resolve: any) => Promise.resolve(rows).then(resolve);
      return b;
    }
    mockedGetDb.mockReturnValue({
      select: vi.fn(() => makeBuilder(queueResults.shift() ?? [])),
    });

    const r = await listAvailableProviderModels({});
    expect(r).toEqual([]);
  });
});
