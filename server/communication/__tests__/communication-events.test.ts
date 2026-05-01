/**
 * Communication — event constants surface test.
 *
 * Verifies the exported event names match what the manifest declares
 * under `events.emits`. If these drift, downstream subscribers break.
 */
import { describe, it, expect } from "vitest";
import { COMMUNICATION_EVENTS } from "../events";
import { communicationManifest } from "../manifest";

describe("COMMUNICATION_EVENTS", () => {
  it("declares the eight known event types", () => {
    expect(COMMUNICATION_EVENTS).toEqual({
      conversationCreated: "communication.conversation.created",
      conversationArchived: "communication.conversation.archived",
      conversationDeleted: "communication.conversation.deleted",
      messageSent: "communication.message.sent",
      meetingScheduled: "communication.meeting.scheduled",
      meetingCancelled: "communication.meeting.cancelled",
      notificationCreated: "communication.notification.created",
      notificationRead: "communication.notification.read",
    });
  });

  it("every event constant is namespaced under communication.*", () => {
    for (const value of Object.values(COMMUNICATION_EVENTS)) {
      expect(value.startsWith("communication.")).toBe(true);
    }
  });

  it("manifest emits matches event constants", () => {
    const declared = new Set(communicationManifest.events?.emits ?? []);
    const constants = new Set(Object.values(COMMUNICATION_EVENTS));
    expect([...constants].sort()).toEqual([...declared].sort());
  });
});
