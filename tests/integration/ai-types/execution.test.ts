import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppBlockerError } from "../../../server/_core/blockers";
import { resolveCatalogAgentExecutionTarget } from "../../../server/ai-types/execution";
import { setAgentPort } from "../../../server/ai-types/ports";

const mocks = vi.hoisted(() => ({
  getCatalogEntryById: vi.fn(),
  getActiveBundleForEntry: vi.fn(),
  getAgent: vi.fn(),
}));

// Mock paths must resolve against the SUT, not the test file. The SUT
// at server/ai-types/execution.ts imports `./db` (= server/ai-types/db)
// from the test file's location that resolves as below.
vi.mock("../../../server/ai-types/db", () => ({
  getCatalogEntryById: mocks.getCatalogEntryById,
  getActiveBundleForEntry: mocks.getActiveBundleForEntry,
}));

describe("resolveCatalogAgentExecutionTarget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // SUT calls getAgentPort().getAgent(...) — wire a fake port that
    // delegates to the mock fn so tests can configure responses.
    setAgentPort({
      getAgent: (id: number) => mocks.getAgent(id),
    });
  });

  it("allows a published active callable Catalog agent entry to execute", async () => {
    mocks.getCatalogEntryById.mockResolvedValue({
      id: 42,
      name: "PM Agent",
      displayName: "PM Agent",
      entryType: "agent",
      status: "active",
      reviewState: "approved",
      tags: ["published", "agent"],
      config: { callable: true },
    });
    mocks.getActiveBundleForEntry.mockResolvedValue({
      id: 7,
      catalogEntryId: 42,
      versionLabel: "1.0.0",
      snapshot: {
        config: {
          sourceAgentId: 9,
          roleClass: "assistant",
          systemPrompt: "You are helpful.",
          modelId: "gpt-4o-mini",
          temperature: 0.4,
          hasDocumentAccess: false,
          hasToolAccess: true,
          allowedTools: ["web_search"],
          callable: true,
        },
      },
    });
    mocks.getAgent.mockResolvedValue({ id: 9, name: "Source Agent", workspaceId: 3 });

    const target = await resolveCatalogAgentExecutionTarget(42);

    expect(target.entry.id).toBe(42);
    expect(target.bundle.id).toBe(7);
    expect(target.executionConfig.modelId).toBe("gpt-4o-mini");
    expect(target.sourceAgent.id).toBe(9);
  });

  it("blocks candidate or review-state entries before execution", async () => {
    mocks.getCatalogEntryById.mockResolvedValue({
      id: 42,
      name: "Candidate Agent",
      entryType: "agent",
      status: "draft",
      reviewState: "needs_review",
      tags: ["candidate"],
      config: { callable: true },
    });

    await expect(resolveCatalogAgentExecutionTarget(42)).rejects.toMatchObject({
      blocker: expect.objectContaining({
        code: "catalog_entry_not_published",
        category: "lifecycle_rule",
      }),
    });
  });

  it("blocks inactive Catalog entries", async () => {
    mocks.getCatalogEntryById.mockResolvedValue({
      id: 42,
      name: "Inactive Agent",
      entryType: "agent",
      status: "disabled",
      reviewState: "approved",
      tags: ["published"],
      config: { callable: true },
    });

    await expect(resolveCatalogAgentExecutionTarget(42)).rejects.toMatchObject({
      blocker: expect.objectContaining({
        code: "catalog_entry_inactive",
        category: "lifecycle_rule",
      }),
    });
  });

  it("blocks non-callable Catalog entries", async () => {
    mocks.getCatalogEntryById.mockResolvedValue({
      id: 42,
      name: "Non-callable Agent",
      entryType: "agent",
      status: "active",
      reviewState: "approved",
      tags: ["published"],
      config: { callable: false },
    });
    mocks.getActiveBundleForEntry.mockResolvedValue({
      id: 7,
      catalogEntryId: 42,
      versionLabel: "1.0.0",
      snapshot: { config: { callable: false } },
    });

    await expect(resolveCatalogAgentExecutionTarget(42)).rejects.toMatchObject({
      blocker: expect.objectContaining({
        code: "catalog_entry_not_callable",
        category: "lifecycle_rule",
      }),
    });
  });

  it("blocks malformed published runtime config", async () => {
    mocks.getCatalogEntryById.mockResolvedValue({
      id: 42,
      name: "Broken Agent",
      entryType: "agent",
      status: "active",
      reviewState: "approved",
      tags: ["published"],
      config: { callable: true },
    });
    mocks.getActiveBundleForEntry.mockResolvedValue({
      id: 7,
      catalogEntryId: 42,
      versionLabel: "1.0.0",
      snapshot: {
        config: {
          callable: true,
          sourceAgentId: 9,
          systemPrompt: "",
        },
      },
    });

    try {
      await resolveCatalogAgentExecutionTarget(42);
      throw new Error("Expected malformed config to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AppBlockerError);
      expect((error as AppBlockerError).blocker.code).toBe("catalog_execution_config_invalid");
      expect((error as AppBlockerError).blocker.category).toBe("validation_error");
    }
  });
});
