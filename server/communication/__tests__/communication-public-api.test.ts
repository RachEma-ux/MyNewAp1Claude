/**
 * Communication — public API surface test.
 *
 * Verifies that `public-api.ts` re-exports the manifest, contracts,
 * events, handoffs, and ports — the canonical surface other modules
 * are allowed to import from.
 */
import { describe, it, expect } from "vitest";
import * as publicApi from "../public-api";

describe("server/communication/public-api", () => {
  it("re-exports the module manifest", () => {
    expect(publicApi.communicationManifest).toBeDefined();
    expect(publicApi.communicationManifest.key).toBe("communication");
  });

  it("re-exports event constants", () => {
    expect(publicApi.COMMUNICATION_EVENTS).toBeDefined();
    expect(publicApi.COMMUNICATION_EVENTS.messageSent).toBe(
      "communication.message.sent",
    );
  });

  it("re-exports handoff constants", () => {
    expect(publicApi.COMMUNICATION_HANDOFFS).toBeDefined();
  });

  it("re-exports zod input schemas (for cross-module validation)", () => {
    expect(publicApi.CreateConversationInputSchema).toBeDefined();
    expect(publicApi.AddMessageInputSchema).toBeDefined();
    expect(publicApi.CreateMeetingInputSchema).toBeDefined();
    expect(publicApi.CreateNotificationInputSchema).toBeDefined();
  });
});
