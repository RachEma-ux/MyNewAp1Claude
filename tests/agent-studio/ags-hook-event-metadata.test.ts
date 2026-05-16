/**
 * Phase S §T-S.21 — AGS hook-event metadata lockstep.
 */

import { describe, it, expect } from "vitest";
import {
  AGS_HOOK_EVENTS,
  AGS_HOOK_EVENT_METADATA,
  getAgsHookEventMetadata,
} from "../../server/agent-studio/shared/constants.js";

const VALID_CATEGORIES = [
  "session",
  "tool",
  "user",
  "task",
  "filesystem",
] as const;

const EXPECTED_PAIRED_SET = new Set([
  "PreToolUse",
  "PostToolUse",
  "SessionStart",
  "SessionEnd",
  "SubagentStart",
  "SubagentStop",
  "PreCompact",
  "PostCompact",
  "TaskCreated",
  "TaskCompleted",
  "Elicitation",
  "ElicitationResult",
  "WorktreeCreate",
  "WorktreeRemove",
]);

describe("AGS_HOOK_EVENT_METADATA (T-S.21)", () => {
  it("has metadata for every closed-taxonomy hook event", () => {
    for (const e of AGS_HOOK_EVENTS) {
      expect(AGS_HOOK_EVENT_METADATA[e]).toBeDefined();
    }
  });

  it("metadata key count equals taxonomy length", () => {
    expect(Object.keys(AGS_HOOK_EVENT_METADATA).length).toBe(
      AGS_HOOK_EVENTS.length,
    );
  });

  it.each(AGS_HOOK_EVENTS)(
    "%s has non-empty label + description + valid category + boolean isPaired",
    (e) => {
      const md = AGS_HOOK_EVENT_METADATA[e];
      expect(md.label.length).toBeGreaterThan(2);
      expect(md.description.length).toBeGreaterThan(30);
      expect(VALID_CATEGORIES).toContain(md.category);
      expect(typeof md.isPaired).toBe("boolean");
    },
  );

  it.each(AGS_HOOK_EVENTS)(
    "getAgsHookEventMetadata(%s) returns table entry",
    (e) => {
      expect(getAgsHookEventMetadata(e)).toBe(AGS_HOOK_EVENT_METADATA[e]);
    },
  );

  it("paired set matches the expected canonical pair members", () => {
    const paired = new Set(
      AGS_HOOK_EVENTS.filter((e) => AGS_HOOK_EVENT_METADATA[e].isPaired),
    );
    expect(paired).toEqual(EXPECTED_PAIRED_SET);
  });

  it("paired count is even (every paired member has a partner)", () => {
    const pairedCount = AGS_HOOK_EVENTS.filter(
      (e) => AGS_HOOK_EVENT_METADATA[e].isPaired,
    ).length;
    expect(pairedCount % 2).toBe(0);
  });

  it("every category has at least one event", () => {
    for (const c of VALID_CATEGORIES) {
      const matching = AGS_HOOK_EVENTS.filter(
        (e) => AGS_HOOK_EVENT_METADATA[e].category === c,
      );
      expect(matching.length).toBeGreaterThan(0);
    }
  });

  it("labels are unique", () => {
    const labels = new Set<string>();
    for (const e of AGS_HOOK_EVENTS) {
      labels.add(AGS_HOOK_EVENT_METADATA[e].label);
    }
    expect(labels.size).toBe(AGS_HOOK_EVENTS.length);
  });

  it("tool-category events are exactly PreToolUse / PostToolUse / PostToolUseFailure", () => {
    const tool = new Set(
      AGS_HOOK_EVENTS.filter(
        (e) => AGS_HOOK_EVENT_METADATA[e].category === "tool",
      ),
    );
    expect(tool).toEqual(
      new Set(["PreToolUse", "PostToolUse", "PostToolUseFailure"]),
    );
  });

  it("task-category events are exactly TaskCreated / TaskCompleted", () => {
    const task = new Set(
      AGS_HOOK_EVENTS.filter(
        (e) => AGS_HOOK_EVENT_METADATA[e].category === "task",
      ),
    );
    expect(task).toEqual(new Set(["TaskCreated", "TaskCompleted"]));
  });
});
