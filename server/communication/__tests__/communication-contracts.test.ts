/**
 * Communication — contract (Zod schema) tests.
 *
 * Validates input shapes used by Module Gateway, Handoff, and Event Bus.
 */
import { describe, it, expect } from "vitest";
import {
  CommunicationConversationTypeSchema,
  CommunicationConversationStatusSchema,
  CommunicationMessageRoleSchema,
  CommunicationMeetingStatusSchema,
  CommunicationNotificationStatusSchema,
  CreateConversationInputSchema,
  AddMessageInputSchema,
  CreateMeetingInputSchema,
  CreateNotificationInputSchema,
} from "../contracts";

describe("Communication enum schemas", () => {
  it("conversation types include the agent kind", () => {
    expect(CommunicationConversationTypeSchema.parse("agent")).toBe("agent");
    expect(() => CommunicationConversationTypeSchema.parse("nope")).toThrow();
  });

  it("conversation status enum is exhaustive", () => {
    expect(CommunicationConversationStatusSchema.options).toEqual([
      "active",
      "archived",
      "deleted",
    ]);
  });

  it("message role accepts agent + bot", () => {
    expect(CommunicationMessageRoleSchema.parse("agent")).toBe("agent");
    expect(CommunicationMessageRoleSchema.parse("bot")).toBe("bot");
  });

  it("meeting status enum is exhaustive", () => {
    expect(CommunicationMeetingStatusSchema.options).toEqual([
      "scheduled",
      "active",
      "completed",
      "cancelled",
    ]);
  });

  it("notification status enum is exhaustive", () => {
    expect(CommunicationNotificationStatusSchema.options).toEqual([
      "unread",
      "read",
      "archived",
    ]);
  });
});

describe("CreateConversationInputSchema", () => {
  it("accepts a minimal valid input", () => {
    const parsed = CreateConversationInputSchema.parse({
      workspaceId: 1,
      title: "Hello",
    });
    expect(parsed.workspaceId).toBe(1);
    expect(parsed.title).toBe("Hello");
  });

  it("rejects empty title", () => {
    expect(() =>
      CreateConversationInputSchema.parse({ workspaceId: 1, title: "" }),
    ).toThrow();
  });

  it("rejects non-positive workspaceId", () => {
    expect(() =>
      CreateConversationInputSchema.parse({ workspaceId: 0, title: "ok" }),
    ).toThrow();
  });

  it("accepts source attribution fields (used by agents bridge)", () => {
    const parsed = CreateConversationInputSchema.parse({
      workspaceId: 5,
      title: "Agent chat",
      conversationType: "agent",
      sourceModule: "agents",
      sourceRefId: 42,
    });
    expect(parsed.sourceModule).toBe("agents");
    expect(parsed.sourceRefId).toBe(42);
  });
});

describe("AddMessageInputSchema", () => {
  it("accepts a valid user message", () => {
    const parsed = AddMessageInputSchema.parse({
      conversationId: 1,
      role: "user",
      content: "Hi",
    });
    expect(parsed.role).toBe("user");
  });

  it("rejects empty content", () => {
    expect(() =>
      AddMessageInputSchema.parse({
        conversationId: 1,
        role: "user",
        content: "",
      }),
    ).toThrow();
  });
});

describe("CreateMeetingInputSchema", () => {
  it("accepts ISO date strings via z.coerce.date", () => {
    const parsed = CreateMeetingInputSchema.parse({
      workspaceId: 1,
      title: "Weekly sync",
      startTime: "2026-05-15T10:00:00.000Z",
      createdBy: 7,
    });
    expect(parsed.startTime).toBeInstanceOf(Date);
    expect(parsed.createdBy).toBe(7);
  });

  it("requires createdBy", () => {
    expect(() =>
      CreateMeetingInputSchema.parse({
        workspaceId: 1,
        title: "Sync",
      } as any),
    ).toThrow();
  });
});

describe("CreateNotificationInputSchema", () => {
  it("accepts a minimal valid notification", () => {
    const parsed = CreateNotificationInputSchema.parse({
      workspaceId: 1,
      userId: 2,
      eventType: "agent.completed",
      title: "Agent finished",
    });
    expect(parsed.eventType).toBe("agent.completed");
  });

  it("rejects empty eventType", () => {
    expect(() =>
      CreateNotificationInputSchema.parse({
        workspaceId: 1,
        userId: 2,
        eventType: "",
        title: "X",
      }),
    ).toThrow();
  });
});
