import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  createConversation: vi.fn(),
  createExecutionRun: vi.fn(),
  createMessage: vi.fn(),
  getActiveBundleForEntry: vi.fn(),
  getCatalogEntryById: vi.fn(),
  getConversationById: vi.fn(),
  getExecutionRunById: vi.fn(),
  getUserWorkspaces: vi.fn(),
  updateExecutionRun: vi.fn(),
}));

vi.mock("../agents/db", () => ({
  getAgent: vi.fn(),
}));

vi.mock("../providers/registry", () => ({
  getProviderRegistry: vi.fn(),
}));

import {
  createConversation,
  createExecutionRun,
  createMessage,
  getActiveBundleForEntry,
  getCatalogEntryById,
  getConversationById,
  getUserWorkspaces,
  updateExecutionRun,
} from "../../../server/db";
import { getProviderRegistry } from "../../../server/providers/registry";
import { getAgent } from "../../../server/agents/db";
import { executeCatalogChatStream } from "../../../server/ai-types/execution";

function buildEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    name: "Catalog Agent",
    displayName: "Catalog Agent",
    entryType: "agent",
    status: "active",
    reviewState: "approved",
    tags: ["published"],
    providerId: 7,
    config: { callable: true },
    ...overrides,
  };
}

function buildBundle(overrides: Record<string, unknown> = {}) {
  return {
    id: 9,
    catalogEntryId: 5,
    versionLabel: "1.0.0",
    snapshotHash: "abc123",
    publishedAt: new Date("2026-03-21T10:00:00Z"),
    snapshot: {
      providerId: 7,
      name: "gpt-4o",
      config: {
        sourceAgentId: 17,
        roleClass: "assistant",
        systemPrompt: "Be helpful.",
        modelId: "gpt-4o",
        temperature: 0.4,
        hasDocumentAccess: false,
        hasToolAccess: true,
        allowedTools: ["web_search"],
        callable: true,
      },
    },
    ...overrides,
  };
}

function createStreamingProvider(chunks: string[]) {
  return {
    id: 7,
    name: "OpenAI",
    type: "openai",
    generateStream: async function* () {
      for (const chunk of chunks) {
        yield { content: chunk, isComplete: false };
      }
      yield { content: "", isComplete: true };
    },
  };
}

describe("catalog execution observability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (createExecutionRun as any).mockResolvedValue({ id: 101 });
    (updateExecutionRun as any).mockResolvedValue({ id: 101 });
    (createMessage as any).mockResolvedValue({ id: 1 });
    (getConversationById as any).mockResolvedValue(undefined);
    (getUserWorkspaces as any).mockResolvedValue([{ id: 12 }]);
    (createConversation as any).mockResolvedValue({ id: 44 });
    (getProviderRegistry as any).mockReturnValue({
      getProvider: vi.fn().mockReturnValue(createStreamingProvider(["Hello", " world"])),
    });
    (getAgent as any).mockResolvedValue({ id: 17, name: "Source Agent", workspaceId: 3 });
  });

  it("records a blocked execution when the catalog entry has no active published bundle", async () => {
    (getCatalogEntryById as any).mockResolvedValue(buildEntry());
    (getActiveBundleForEntry as any).mockResolvedValue(null);

    const events = [];
    for await (const event of executeCatalogChatStream({
      catalogEntryId: 5,
      actorUserId: 1,
      message: "test run",
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        type: "error",
        runId: 101,
        error: "This Catalog entry cannot run because it does not have an active published bundle.",
      },
    ]);
    expect(createExecutionRun).toHaveBeenCalledWith(
      expect.objectContaining({
        catalogEntryId: 5,
        triggerSource: "catalog_chat",
      })
    );
    expect(updateExecutionRun).toHaveBeenCalledWith(
      101,
      expect.objectContaining({
        state: "failed",
        success: false,
        blockerCode: "catalog_bundle_missing",
        blockerCategory: "dependency_block",
      })
    );
  });

  it("creates, links, and completes an execution run for a successful catalog execution", async () => {
    (getCatalogEntryById as any).mockResolvedValue(buildEntry());
    (getActiveBundleForEntry as any).mockResolvedValue(buildBundle());

    const events = [];
    for await (const event of executeCatalogChatStream({
      catalogEntryId: 5,
      actorUserId: 1,
      message: "hello catalog",
    })) {
      events.push(event);
    }

    expect(events[0]).toEqual({ type: "run_started", runId: 101, conversationId: 44 });
    expect(events[1]).toEqual({ type: "token", content: "Hello" });
    expect(events[2]).toEqual({ type: "token", content: " world" });
    expect(events[3]).toEqual({ type: "complete", runId: 101, conversationId: 44, content: "Hello world" });

    expect(createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 12,
        userId: 1,
      })
    );
    expect(updateExecutionRun).toHaveBeenCalledWith(
      101,
      expect.objectContaining({
        conversationId: 44,
        provider: "OpenAI",
        modelId: "gpt-4o",
        state: "running",
      })
    );
    expect(updateExecutionRun).toHaveBeenCalledWith(101, expect.objectContaining({ firstTokenAt: expect.any(Date) }));
    expect(updateExecutionRun).toHaveBeenCalledWith(101, expect.objectContaining({ state: "completed", success: true }));
    expect(createMessage).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ conversationId: 44, role: "user", content: "hello catalog" })
    );
    expect(createMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ conversationId: 44, role: "assistant", content: "Hello world" })
    );
  });

  it("records conversation linkage when an existing conversation is provided", async () => {
    (getCatalogEntryById as any).mockResolvedValue(buildEntry());
    (getActiveBundleForEntry as any).mockResolvedValue(buildBundle());
    (getConversationById as any).mockResolvedValue({ id: 88, userId: 1 });

    const events = [];
    for await (const event of executeCatalogChatStream({
      catalogEntryId: 5,
      actorUserId: 1,
      conversationId: 88,
      message: "reuse conversation",
    })) {
      events.push(event);
    }

    expect(createConversation).not.toHaveBeenCalled();
    expect(events[0]).toEqual({ type: "run_started", runId: 101, conversationId: 88 });
    expect(updateExecutionRun).toHaveBeenCalledWith(
      101,
      expect.objectContaining({
        conversationId: 88,
        state: "running",
      })
    );
  });


  it("stores shared blocker categories for inaccessible conversations", async () => {
    (getCatalogEntryById as any).mockResolvedValue(buildEntry());
    (getActiveBundleForEntry as any).mockResolvedValue(buildBundle());
    (getConversationById as any).mockResolvedValue({ id: 88, userId: 999 });

    const events = [];
    for await (const event of executeCatalogChatStream({
      catalogEntryId: 5,
      actorUserId: 1,
      conversationId: 88,
      message: "reuse conversation",
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        type: "error",
        runId: 101,
        error: "The requested conversation is not available to the current user.",
      },
    ]);
    expect(updateExecutionRun).toHaveBeenCalledWith(
      101,
      expect.objectContaining({
        state: "failed",
        success: false,
        blockerCode: "conversation_not_accessible",
        blockerCategory: "permission_error",
      })
    );
  });

  it("stores shared blocker categories for runtime failures", async () => {
    (getCatalogEntryById as any).mockResolvedValue(buildEntry());
    (getActiveBundleForEntry as any).mockResolvedValue(buildBundle());
    (getProviderRegistry as any).mockReturnValue({
      getProvider: vi.fn().mockReturnValue({
        name: "OpenAI",
        generateStream: async function* () {
          throw new Error("Provider crashed");
        },
      }),
    });

    const events = [];
    for await (const event of executeCatalogChatStream({
      catalogEntryId: 5,
      actorUserId: 1,
      message: "hello catalog",
    })) {
      events.push(event);
    }

    expect(events[0]).toEqual({ type: "run_started", runId: 101, conversationId: 44 });
    expect(events[1]).toEqual({ type: "error", runId: 101, conversationId: 44, error: "Provider crashed" });
    expect(updateExecutionRun).toHaveBeenCalledWith(
      101,
      expect.objectContaining({
        state: "failed",
        success: false,
        blockerCode: "runtime_execution_error",
        blockerCategory: "technical_error",
      })
    );
  });
});
