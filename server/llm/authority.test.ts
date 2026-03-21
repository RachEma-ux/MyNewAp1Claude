import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isLLMVersionCatalogEligible,
  isRawLLMVersionRuntimeAuthority,
  onboardLLMVersionToCatalogCandidate,
  resolveCatalogLLMRuntimeAuthority,
} from "./authority";
import { catalogAuditEvents } from "../../drizzle/schema";

const mocks = vi.hoisted(() => ({
  db: null as any,
  getCatalogEntryById: vi.fn(),
  getActiveBundleForEntry: vi.fn(),
}));

vi.mock("../db/connection", () => ({
  getDb: () => mocks.db,
}));

vi.mock("../db/catalog", () => ({
  getCatalogEntryById: mocks.getCatalogEntryById,
  getActiveBundleForEntry: mocks.getActiveBundleForEntry,
}));

function createFakeDb(selectResponses: any[], insertReturningResponses: any[] = []) {
  const selectQueue = [...selectResponses];
  const insertQueue = [...insertReturningResponses];
  const inserts: Array<{ table: unknown; value: unknown }> = [];

  const db: any = {
    inserts,
    transaction: async (callback: (tx: any) => Promise<any>) => callback(db),
    execute: async () => undefined,
    select: () => ({
      from: () => {
        const query: any = {
          where: () => query,
          then: (resolve: (value: any) => any) => resolve(selectQueue.shift() ?? []),
        };
        return query;
      },
    }),
    insert: (table: unknown) => ({
      values: (value: unknown) => {
        inserts.push({ table, value });
        const pending = insertQueue.shift() ?? [];
        return {
          returning: async () => pending,
          then: (resolve: (value: any) => any) => resolve(undefined),
        };
      },
    }),
  };

  return db;
}

describe("LLM Catalog authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("treats raw LLM versions as internal eligibility only", () => {
    expect(isLLMVersionCatalogEligible({ callable: true } as any)).toBe(true);
    expect(isRawLLMVersionRuntimeAuthority({ id: 9 } as any)).toBe(false);
  });

  it("only allows catalog-eligible versions to onboard", async () => {
    mocks.db = createFakeDb([
      [{ id: 7, llmId: 3, version: 1, environment: "sandbox", callable: false }],
    ]);

    await expect(
      onboardLLMVersionToCatalogCandidate({ llmVersionId: 7, actorId: 5 })
    ).rejects.toThrow("Only catalog-eligible LLM versions can be onboarded");
  });

  it("creates a catalog candidate for an eligible version", async () => {
    mocks.db = createFakeDb(
      [
        [{ id: 7, llmId: 3, version: 1, environment: "sandbox", callable: true, config: { model: { name: "demo" } } }],
        [{ id: 3, name: "demo-llm", role: "executor", description: "demo" }],
        [],
      ],
      [[{ id: 44, entryType: "llm", reviewState: "needs_review", status: "draft" }]]
    );

    const entry = await onboardLLMVersionToCatalogCandidate({ llmVersionId: 7, actorId: 5 });

    expect(entry.id).toBe(44);
    expect(mocks.db.inserts.some((insert: any) => insert.table === catalogAuditEvents)).toBe(true);
  });

  it("blocks unpublished catalog entries from becoming runtime authority", async () => {
    mocks.getCatalogEntryById.mockResolvedValue({
      id: 44,
      entryType: "llm",
      reviewState: "needs_review",
      status: "draft",
      tags: ["candidate"],
      config: { callable: false },
    });

    await expect(resolveCatalogLLMRuntimeAuthority(44)).rejects.toMatchObject({
      blocker: expect.objectContaining({ code: "catalog_entry_not_published" }),
    });
  });

  it("allows active published entries with callable (legacy) as runtime authority", async () => {
    mocks.getCatalogEntryById.mockResolvedValue({
      id: 44,
      entryType: "llm",
      reviewState: "approved",
      status: "active",
      tags: ["published", "llm"],
      config: { callable: true, sourceLLMId: 3, sourceLLMVersionId: 7 },
    });
    mocks.getActiveBundleForEntry.mockResolvedValue({
      id: 91,
      catalogEntryId: 44,
      snapshot: {
        config: { callable: true, sourceLLMId: 3, sourceLLMVersionId: 7 },
      },
    });

    const authority = await resolveCatalogLLMRuntimeAuthority(44);

    expect(authority.bundle.id).toBe(91);
    expect(authority.sourceLLMVersionId).toBe(7);
  });

  it("allows active published entries with catalogEligible (new) as runtime authority", async () => {
    mocks.getCatalogEntryById.mockResolvedValue({
      id: 45,
      entryType: "llm",
      reviewState: "approved",
      status: "active",
      tags: ["published", "llm"],
      config: { catalogEligible: true, sourceLLMId: 4, sourceLLMVersionId: 8 },
    });
    mocks.getActiveBundleForEntry.mockResolvedValue({
      id: 92,
      catalogEntryId: 45,
      snapshot: {
        config: { catalogEligible: true, sourceLLMId: 4, sourceLLMVersionId: 8 },
      },
    });

    const authority = await resolveCatalogLLMRuntimeAuthority(45);

    expect(authority.bundle.id).toBe(92);
    expect(authority.sourceLLMVersionId).toBe(8);
    expect(authority.sourceLLMId).toBe(4);
  });

  it("rejects entries that are neither callable nor catalogEligible", async () => {
    mocks.getCatalogEntryById.mockResolvedValue({
      id: 46,
      entryType: "llm",
      reviewState: "approved",
      status: "active",
      tags: ["published", "llm"],
      config: { sourceLLMId: 5, sourceLLMVersionId: 9 },
    });
    mocks.getActiveBundleForEntry.mockResolvedValue({
      id: 93,
      catalogEntryId: 46,
      snapshot: {
        config: { sourceLLMId: 5, sourceLLMVersionId: 9 },
      },
    });

    await expect(resolveCatalogLLMRuntimeAuthority(46)).rejects.toMatchObject({
      blocker: expect.objectContaining({ code: "catalog_entry_not_catalog_eligible" }),
    });
  });
});
