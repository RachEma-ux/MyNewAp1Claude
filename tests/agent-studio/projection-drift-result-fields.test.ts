/**
 * Projection drift cron result fields surfaced — PR-V1-201.
 *
 * Extends the drift cron card (#942) with the 6 fields from
 * `DriftCronResult` that were available but unrendered.
 * driftCount + permissionLeakCount get text-destructive when > 0
 * since they represent integrity violations.
 *
 * Includes contract-anchor assertions on the server-side type so
 * a future server-side rename trips the test rather than silently
 * breaking the UI (same pattern as PR-V1-200).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-201 — projection drift cron result fields", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/GraphHealthAdminPanel.tsx",
  );
  const driftType = resolve(
    __dirname,
    "../../server/agent-studio/services/graph/projection/drift-cron.ts",
  );

  it("panel renders the 6 DriftCronResult fields", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain("driftCronQ.data.lastResult.totalScanned");
    expect(src).toContain("driftCronQ.data.lastResult.driftCount");
    expect(src).toContain(
      "driftCronQ.data.lastResult.permissionLeakCount",
    );
    expect(src).toContain("driftCronQ.data.lastResult.persistedEvents");
    expect(src).toContain("driftCronQ.data.lastResult.scope");
    expect(src).toContain("driftCronQ.data.lastResult.scannedAt");
    // driftCount + permissionLeakCount get text-destructive when > 0.
    expect(
      /driftCronQ\.data\.lastResult\.driftCount\s*>\s*0\s*\?\s*"text-destructive"/.test(
        src,
      ),
    ).toBe(true);
    expect(
      /driftCronQ\.data\.lastResult\.permissionLeakCount\s*>\s*0\s*\?\s*"text-destructive"/.test(
        src,
      ),
    ).toBe(true);
  });

  it("server-side DriftCronResult contract still carries the 6 fields", () => {
    const src = readFileSync(driftType, "utf8");
    expect(/totalScanned:\s*number/.test(src)).toBe(true);
    expect(/driftCount:\s*number/.test(src)).toBe(true);
    expect(/permissionLeakCount:\s*number/.test(src)).toBe(true);
    expect(/persistedEvents:\s*number/.test(src)).toBe(true);
    expect(/scope:\s*string/.test(src)).toBe(true);
    expect(/scannedAt:\s*string/.test(src)).toBe(true);
  });
});
