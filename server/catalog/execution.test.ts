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
} from "../db";
import { getProviderRegistry } from "../providers/registry";
import { executeCatalogChatStream } from "./execution";

function buildEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 5,
    name: "Catalog Model",
    displayName: "Catalog Model",
    entryType: "model",
    status: "active",
    reviewState: "approved",
    providerId: 7,
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
        callable: true,
        model: "gpt-4o",
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
        error: 'Catalog entry "Catalog Model" has no active published bundle.',
      },
    ]);
    expect(createExecutionRun).toHaveBeenCalledWith(
      expect.objectContaining({
        catalogEntryId: 5,
        triggerSource: "catalog_chat",
      })
    );
    expect(updateExecutionRun).toHaveBeenCalledWith(101, expect.objectContaining({ state: "failed", success: false }));
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
});
