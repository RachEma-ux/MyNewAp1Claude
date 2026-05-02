/**
 * PM Central — tRPC router shape test.
 */
import { describe, it, expect } from "vitest";
import { pmCentralRouter } from "../router";

describe("pmCentralRouter", () => {
  it("mounts the nine documented sub-routers", () => {
    const procDef =
      (pmCentralRouter as any)?._def?.procedures ??
      (pmCentralRouter as any)?._def?.record;
    expect(procDef).toBeTruthy();
    const prefixes = new Set(
      Object.keys(procDef).map((k) => k.split(".")[0]),
    );
    for (const expected of [
      "dashboard",
      "projects",
      "plans",
      "milestones",
      "tasks",
      "risks",
      "issues",
      "decisions",
      "handoffs",
    ]) {
      expect(prefixes).toContain(expected);
    }
  });
});
