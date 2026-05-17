/**
 * Retrofit single-axis breakdown batch — T-F.115 (T-F.7-δ).
 *
 * Stacked on T-F.114 (which extracted the SingleAxisBreakdownCard
 * helper). Adds 4 more breakdown card invocations consuming pre-
 * existing getStats axes:
 *   - errorEventsByLane
 *   - errorEventsByErrorClass
 *   - notificationsByKind (workspace-wide, distinct from per-user Inbox)
 *   - notificationsByLane (workspace-wide)
 *
 * Pure helper reuse — no new component, no new aggregation logic.
 * Source-scan locks the 4 invocations + relative order + unique
 * testid prefixes.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

function read(): string {
  return readFileSync(
    resolve(
      __dirname,
      "../../client/src/modules/agent-studio/pages/RetrofitPage.tsx",
    ),
    "utf8",
  );
}

describe("Retrofit single-axis breakdown batch (T-F.115 / T-F.7-δ)", () => {
  it("errorEventsByLane card invokes helper with correct props", () => {
    const src = read();
    expect(src).toMatch(
      /<SingleAxisBreakdownCard[\s\S]{0,500}title="Error events by lane"[\s\S]{0,200}rowLabel="Lane"[\s\S]{0,200}data=\{s\.errorEventsByLane\}[\s\S]{0,200}testidPrefix="retrofit-error-events-by-lane"/,
    );
  });

  it("errorEventsByErrorClass card invokes helper with correct props", () => {
    const src = read();
    expect(src).toMatch(
      /<SingleAxisBreakdownCard[\s\S]{0,500}title="Error events by error class"[\s\S]{0,200}rowLabel="Error class"[\s\S]{0,200}data=\{s\.errorEventsByErrorClass\}[\s\S]{0,200}testidPrefix="retrofit-error-events-by-error-class"/,
    );
  });

  it("notificationsByKind workspace-wide card invokes helper with workspace-wide title qualifier", () => {
    const src = read();
    expect(src).toMatch(
      /<SingleAxisBreakdownCard[\s\S]{0,500}title="Notifications by kind \(workspace-wide\)"[\s\S]{0,200}rowLabel="Notification kind"[\s\S]{0,200}data=\{s\.notificationsByKind\}[\s\S]{0,200}testidPrefix="retrofit-notifications-by-kind"/,
    );
  });

  it("notificationsByLane workspace-wide card invokes helper", () => {
    const src = read();
    expect(src).toMatch(
      /<SingleAxisBreakdownCard[\s\S]{0,500}title="Notifications by lane \(workspace-wide\)"[\s\S]{0,200}rowLabel="Lane"[\s\S]{0,200}data=\{s\.notificationsByLane\}[\s\S]{0,200}testidPrefix="retrofit-notifications-by-lane"/,
    );
  });

  it("relative order: error-events-by-source-kind → by-lane → by-error-class → notifications-by-kind → notifications-by-lane", () => {
    const src = read();
    const sourceKindIdx = src.indexOf(
      'testidPrefix="retrofit-error-events-by-source-kind"',
    );
    const errLaneIdx = src.indexOf(
      'testidPrefix="retrofit-error-events-by-lane"',
    );
    const errClassIdx = src.indexOf(
      'testidPrefix="retrofit-error-events-by-error-class"',
    );
    const notifKindIdx = src.indexOf(
      'testidPrefix="retrofit-notifications-by-kind"',
    );
    const notifLaneIdx = src.indexOf(
      'testidPrefix="retrofit-notifications-by-lane"',
    );
    expect(sourceKindIdx).toBeGreaterThan(0);
    expect(errLaneIdx).toBeGreaterThan(sourceKindIdx);
    expect(errClassIdx).toBeGreaterThan(errLaneIdx);
    expect(notifKindIdx).toBeGreaterThan(errClassIdx);
    expect(notifLaneIdx).toBeGreaterThan(notifKindIdx);
  });

  it("all 4 new testid prefixes are unique (no copy-paste collisions)", () => {
    const src = read();
    const prefixes = [
      "retrofit-error-events-by-lane",
      "retrofit-error-events-by-error-class",
      "retrofit-notifications-by-kind",
      "retrofit-notifications-by-lane",
    ];
    for (const p of prefixes) {
      const matches = src.match(
        new RegExp(`testidPrefix="${p}"`, "g"),
      );
      expect(matches?.length).toBe(1);
    }
  });
});
