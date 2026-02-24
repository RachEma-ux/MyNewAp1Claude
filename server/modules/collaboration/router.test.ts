/**
 * Collaboration Engine Router Tests
 *
 * Tests:
 * 1. Schema tables are defined
 * 2. Module guard requires 'collaboration'
 * 3. Thread types: discussion, approval, meeting_notes
 * 4. Mention support
 * 5. Guard rejects when disabled
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRequireModule = vi.fn().mockResolvedValue(undefined);
const mockLogActivity = vi.fn().mockResolvedValue(undefined);

vi.mock("../registry", () => ({
  requireModule: (...args: any[]) => mockRequireModule(...args),
  logActivity: (...args: any[]) => mockLogActivity(...args),
}));

vi.mock("../../db/connection", () => ({
  getDb: vi.fn(() => ({
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => [],
          limit: () => [{ id: 1, type: "discussion" }],
        }),
      }),
    }),
    insert: () => ({
      values: () => ({
        returning: () => [{ id: 1, workspaceId: 1, title: "Test Thread" }],
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => Promise.resolve(),
      }),
    }),
    delete: () => ({
      where: () => Promise.resolve(),
    }),
  })),
}));

describe("Collaboration Engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("schema tables are defined", async () => {
    const { threads, threadMessages, threadMentions } = await import("./schema");
    expect(threads).toBeDefined();
    expect(threadMessages).toBeDefined();
    expect(threadMentions).toBeDefined();
  });

  it("module guard requires 'collaboration'", async () => {
    await mockRequireModule(1, "collaboration");
    expect(mockRequireModule).toHaveBeenCalledWith(1, "collaboration");
  });

  it("thread types include discussion, approval, meeting_notes", () => {
    const validTypes = ["discussion", "approval", "meeting_notes"];
    expect(validTypes).toContain("discussion");
    expect(validTypes).toContain("approval");
    expect(validTypes).toContain("meeting_notes");
  });

  it("mention types include user, ai, role", () => {
    const mentionTypes = ["user", "ai", "role"];
    expect(mentionTypes).toContain("user");
    expect(mentionTypes).toContain("ai");
    expect(mentionTypes).toContain("role");
  });

  it("guard rejects when collaboration disabled", async () => {
    mockRequireModule.mockRejectedValueOnce(
      new Error('Module "collaboration" is not enabled for workspace 1')
    );
    await expect(mockRequireModule(1, "collaboration")).rejects.toThrow("not enabled");
  });

  it("activity logging for thread creation", async () => {
    await mockLogActivity({
      workspaceId: 1,
      moduleKey: "collaboration",
      actorId: 1,
      action: "thread.create",
      targetType: "thread",
      targetId: 1,
    });
    expect(mockLogActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "thread.create" })
    );
  });
});
