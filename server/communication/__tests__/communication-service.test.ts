/**
 * Communication — service unit tests.
 *
 * Mocks the repository, registry audit, and platform event bus so we
 * can test the service's business logic (state validation, event
 * emission, audit logging, default values) without a live DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../communication.repository", () => ({
  createConversation: vi.fn(),
  getConversationById: vi.fn(),
  updateConversation: vi.fn(),
  deleteConversationCascade: vi.fn(),
  addMessage: vi.fn(),
  createMeeting: vi.fn(),
  getMeetingById: vi.fn(),
  updateMeeting: vi.fn(),
  createNotification: vi.fn(),
  updateNotification: vi.fn(),
  listConversations: vi.fn(),
  listMessages: vi.fn(),
  listMeetings: vi.fn(),
  listNotifications: vi.fn(),
}));

vi.mock("../../modules/registry", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../platform/events", () => ({
  publishEvent: vi.fn().mockResolvedValue(undefined),
  makeEnvelope: vi.fn((args: any) => ({ envelope: args })),
}));

import * as repo from "../communication.repository";
import { logActivity } from "../../modules/registry";
import { publishEvent, makeEnvelope } from "../../platform/events";
import {
  createConversation,
  archiveConversation,
  deleteConversation,
  addMessage,
  cancelMeeting,
  createMeeting,
} from "../communication.service";
import { COMMUNICATION_EVENTS } from "../events";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createConversation", () => {
  it("defaults conversationType to 'human' and sets status to 'active'", async () => {
    (repo.createConversation as any).mockResolvedValue({
      id: 1,
      workspaceId: 7,
      ownerUserId: 3,
      conversationType: "human",
      sourceModule: null,
      title: "T",
    });
    await createConversation({ workspaceId: 7, title: "T" }, 3);
    expect(repo.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 7,
        ownerUserId: 3,
        conversationType: "human",
        status: "active",
        title: "T",
      }),
    );
  });

  it("logs activity and emits conversationCreated", async () => {
    (repo.createConversation as any).mockResolvedValue({
      id: 99,
      workspaceId: 7,
      ownerUserId: 3,
      conversationType: "human",
      sourceModule: null,
    });
    await createConversation({ workspaceId: 7, title: "T" }, 3);

    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        moduleKey: "communication",
        action: "conversation.create",
        targetType: "conversation",
        targetId: 99,
        actorId: 3,
      }),
    );
    expect(makeEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: COMMUNICATION_EVENTS.conversationCreated,
        sourceModule: "communication",
        workspaceId: 7,
      }),
    );
    expect(publishEvent).toHaveBeenCalled();
  });

  it("preserves source attribution from agents bridge", async () => {
    (repo.createConversation as any).mockResolvedValue({
      id: 5,
      workspaceId: 1,
      conversationType: "agent",
      sourceModule: "agents",
      sourceRefId: 42,
    });
    await createConversation(
      {
        workspaceId: 1,
        title: "Agent chat",
        conversationType: "agent",
        sourceModule: "agents",
        sourceRefId: 42,
      },
      9,
    );
    expect(repo.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationType: "agent",
        sourceModule: "agents",
        sourceRefId: 42,
      }),
    );
  });
});

describe("archiveConversation", () => {
  it("rejects when conversation is not found", async () => {
    (repo.getConversationById as any).mockResolvedValue(null);
    await expect(archiveConversation(1)).rejects.toThrow(/not found/);
  });

  it("rejects archive of an already-deleted conversation", async () => {
    (repo.getConversationById as any).mockResolvedValue({
      id: 1,
      workspaceId: 1,
      status: "deleted",
    });
    await expect(archiveConversation(1)).rejects.toThrow(/Invalid/);
  });

  it("archives an active conversation and emits event", async () => {
    (repo.getConversationById as any).mockResolvedValue({
      id: 1,
      workspaceId: 7,
      status: "active",
    });
    (repo.updateConversation as any).mockResolvedValue({
      id: 1,
      workspaceId: 7,
      status: "archived",
    });
    await archiveConversation(1, 4);
    expect(repo.updateConversation).toHaveBeenCalledWith(1, {
      status: "archived",
    });
    expect(makeEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: COMMUNICATION_EVENTS.conversationArchived,
      }),
    );
  });
});

describe("deleteConversation", () => {
  it("cascades and emits conversationDeleted", async () => {
    (repo.getConversationById as any).mockResolvedValue({
      id: 9,
      workspaceId: 2,
      status: "active",
    });
    (repo.deleteConversationCascade as any).mockResolvedValue(undefined);

    const result = await deleteConversation(9, 5);
    expect(repo.deleteConversationCascade).toHaveBeenCalledWith(9);
    expect(result).toEqual({ deleted: true, id: 9 });
    expect(makeEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: COMMUNICATION_EVENTS.conversationDeleted,
      }),
    );
  });
});

describe("addMessage", () => {
  it("rejects when parent conversation is missing", async () => {
    (repo.getConversationById as any).mockResolvedValue(null);
    await expect(
      addMessage({ conversationId: 1, role: "user", content: "hi" }),
    ).rejects.toThrow(/not found/);
  });

  it("emits messageSent with content length", async () => {
    (repo.getConversationById as any).mockResolvedValue({
      id: 1,
      workspaceId: 7,
      status: "active",
    });
    (repo.addMessage as any).mockResolvedValue({
      id: 11,
      conversationId: 1,
      role: "user",
      contentType: "text",
      content: "hello",
    });
    await addMessage(
      { conversationId: 1, role: "user", content: "hello" },
      8,
    );
    expect(makeEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: COMMUNICATION_EVENTS.messageSent,
        payload: expect.objectContaining({
          messageId: 11,
          conversationId: 1,
          role: "user",
          contentType: "text",
          contentLength: "hello".length,
        }),
      }),
    );
  });
});

describe("createMeeting", () => {
  it("defaults meetingType to 'video' and status to 'scheduled'", async () => {
    (repo.createMeeting as any).mockResolvedValue({
      id: 7,
      workspaceId: 1,
      meetingType: "video",
      status: "scheduled",
      startTime: null,
    });
    await createMeeting(
      { workspaceId: 1, title: "Sync", createdBy: 3 },
      3,
    );
    expect(repo.createMeeting).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 1,
        title: "Sync",
        meetingType: "video",
        status: "scheduled",
        createdBy: 3,
      }),
    );
  });
});

describe("cancelMeeting", () => {
  it("rejects cancel of completed meeting (terminal)", async () => {
    (repo.getMeetingById as any).mockResolvedValue({
      id: 1,
      workspaceId: 1,
      status: "completed",
    });
    await expect(cancelMeeting(1)).rejects.toThrow(/Invalid/);
  });

  it("cancels a scheduled meeting and emits event", async () => {
    (repo.getMeetingById as any).mockResolvedValue({
      id: 1,
      workspaceId: 7,
      status: "scheduled",
    });
    (repo.updateMeeting as any).mockResolvedValue({
      id: 1,
      workspaceId: 7,
      status: "cancelled",
    });
    await cancelMeeting(1, 9);
    expect(repo.updateMeeting).toHaveBeenCalledWith(1, {
      status: "cancelled",
    });
    expect(makeEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: COMMUNICATION_EVENTS.meetingCancelled,
      }),
    );
  });
});
