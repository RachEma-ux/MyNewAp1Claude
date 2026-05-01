/**
 * Communication — manifest shape tests.
 *
 * Static checks on the declared manifest. No DB or boot side-effects.
 */
import { describe, it, expect } from "vitest";
import { communicationManifest } from "../manifest";
import { COMMUNICATION_HANDOFFS } from "../handoffs";

describe("communicationManifest", () => {
  it("declares the expected identity", () => {
    expect(communicationManifest.key).toBe("communication");
    expect(communicationManifest.routerKey).toBe("communication");
    expect(communicationManifest.name).toBe("Communication");
  });

  it("owns the communicationdb database", () => {
    expect(communicationManifest.database.kind).toBe("owned");
    if (communicationManifest.database.kind === "owned") {
      expect(communicationManifest.database.key).toBe("communicationdb");
      expect(communicationManifest.database.ownedTables).toEqual(
        expect.arrayContaining([
          "communication_conversations",
          "communication_messages",
          "communication_meetings",
          "communication_participants",
          "communication_notifications",
        ]),
      );
    }
  });

  it("is embedded runtime mode", () => {
    expect(communicationManifest.runtime.mode).toBe("embedded");
  });

  it("declares the canonical /communication/* routes", () => {
    const paths = (communicationManifest.routes ?? []).map((r) => r.path);
    expect(paths).toEqual([
      "/communication",
      "/communication/chat",
      "/communication/conversations",
      "/communication/video-meeting",
      "/communication/notifications",
    ]);
  });

  it("declares governance actions for delete/cancel/export with receipts required", () => {
    const required = (communicationManifest.governanceActions ?? [])
      .filter((a) => a.receiptRequired)
      .map((a) => a.key)
      .sort();
    expect(required).toEqual(
      [
        "communication.conversation.delete",
        "communication.message.delete",
        "communication.meeting.cancel",
        "communication.export",
      ].sort(),
    );
  });

  it("accepts the three published handoff types", () => {
    const accepts = communicationManifest.handoffs?.accepts ?? [];
    expect(accepts.sort()).toEqual(
      Object.values(COMMUNICATION_HANDOFFS).slice().sort(),
    );
  });

  it("does not produce handoffs (consumer-only module)", () => {
    expect(communicationManifest.handoffs?.produces ?? []).toEqual([]);
  });

  it("provides communication.read + communication.notifications ports", () => {
    expect((communicationManifest.ports?.provided ?? []).sort()).toEqual([
      "communication.notifications",
      "communication.read",
    ]);
    expect(communicationManifest.ports?.consumed ?? []).toEqual([]);
  });

  it("supports gateway, handoff, and event communication modes", () => {
    expect((communicationManifest.communication?.modes ?? []).sort()).toEqual([
      "event",
      "gateway",
      "handoff",
    ]);
  });

  it("references its public API at the canonical path", () => {
    expect(communicationManifest.publicApi?.path).toBe(
      "server/communication/public-api.ts",
    );
  });
});
