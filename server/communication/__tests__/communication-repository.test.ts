/**
 * Communication — repository surface test.
 *
 * The repository talks to a live CommunicationDB; full integration
 * tests live in the platform's DB-backed suite. Here we only assert
 * the module exposes the documented function surface — drift here
 * would silently break the service that depends on it.
 */
import { describe, it, expect } from "vitest";
import * as repo from "../communication.repository";

const EXPECTED_EXPORTS = [
  "createConversation",
  "getConversationById",
  "listConversations",
  "updateConversation",
  "deleteConversationCascade",
  "addMessage",
  "listMessages",
  "deleteMessage",
  "createMeeting",
  "getMeetingById",
  "listMeetings",
  "updateMeeting",
  "addParticipant",
  "removeParticipant",
  "listParticipants",
  "createNotification",
  "listNotifications",
  "updateNotification",
  "summary",
  "pingDb",
] as const;

describe("communication.repository surface", () => {
  for (const fnName of EXPECTED_EXPORTS) {
    it(`exports ${fnName} as a function`, () => {
      const fn = (repo as any)[fnName];
      expect(typeof fn).toBe("function");
    });
  }
});
