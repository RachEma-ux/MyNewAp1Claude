/**
 * Communication — tRPC router shape test.
 *
 * Verifies the router exposes the documented sub-router surface.
 * Does not exercise procedures (no DB or auth context required).
 */
import { describe, it, expect } from "vitest";
import { communicationRouter } from "../router";

describe("communicationRouter", () => {
  it("mounts the seven documented sub-routers", () => {
    const procDef =
      (communicationRouter as any)?._def?.procedures ??
      (communicationRouter as any)?._def?.record;
    expect(procDef).toBeTruthy();

    // tRPC v11 flattens to dotted paths like "dashboard.health".
    // Pull the unique prefixes and assert all 7 sub-routers appear.
    const prefixes = new Set(
      Object.keys(procDef).map((k) => k.split(".")[0]),
    );
    for (const expected of [
      "dashboard",
      "conversations",
      "messages",
      "chat",
      "meetings",
      "participants",
      "notifications",
    ]) {
      expect(prefixes).toContain(expected);
    }
  });

  it("exposes the tRPC router marker", () => {
    expect((communicationRouter as any)?._def).toBeDefined();
  });
});
