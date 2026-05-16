/**
 * Phase 22 §T-I.49 — Boot wiring for the projection staleness cron.
 *
 * Source-scan structural test asserting `boot.ts` imports + calls
 * `ensureProjectionStalenessCronStarted` next to the drift cron
 * registration. Locks against accidental removal during future boot
 * refactors.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const bootPath = resolve(
  __dirname,
  "../../server/agent-studio/boot.ts",
);

describe("boot.ts registers the projection-staleness cron", () => {
  const src = readFileSync(bootPath, "utf8");

  it("imports ensureProjectionStalenessCronStarted from the cron module", () => {
    expect(src).toMatch(
      /ensureProjectionStalenessCronStarted[\s\S]{0,200}from\s*[("'][^"')]*staleness-cron/,
    );
  });

  it("invokes the ensure-started function", () => {
    expect(src).toContain("ensureProjectionStalenessCronStarted();");
  });

  it("wraps registration in a try/catch that warns on failure", () => {
    expect(src).toMatch(
      /ensureProjectionStalenessCronStarted\(\)[\s\S]{0,400}\[ags-projection-staleness-cron\] start skipped/,
    );
  });

  it("registers near the drift cron registration (locality invariant)", () => {
    // Both registrations should appear in the same neighborhood — if a
    // refactor moves one but not the other, this check fires.
    const driftIdx = src.indexOf("ensureProjectionDriftCronStarted");
    const stalenessIdx = src.indexOf("ensureProjectionStalenessCronStarted");
    expect(driftIdx).toBeGreaterThan(-1);
    expect(stalenessIdx).toBeGreaterThan(-1);
    expect(Math.abs(driftIdx - stalenessIdx)).toBeLessThan(2000);
  });
});
