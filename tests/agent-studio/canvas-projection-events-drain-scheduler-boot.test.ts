/**
 * 17-γ canvas projection events drain scheduler boot wiring tests
 * (PR-V1-61).
 *
 * Source-scan that `server/agent-studio/boot.ts` invokes the
 * scheduler installer in Step 3.29 with the expected shape.
 * Mirrors the boot.ts wiring assertions for the AS-4 governance
 * gate (#786) and the 17-γ sink install (#806).
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("boot.ts wiring — Step 3.29 drain scheduler", () => {
  const file = resolve(__dirname, "../../server/agent-studio/boot.ts");
  const src = readFileSync(file, "utf8");

  it("imports maybeInstallDefaultCanvasProjectionEventsDrainScheduler", () => {
    expect(
      /maybeInstallDefaultCanvasProjectionEventsDrainScheduler/.test(src),
    ).toBe(true);
  });

  it("references the install module by its file path", () => {
    expect(
      src.includes(
        "./services/canvas/install-default-projection-events-drain-scheduler",
      ),
    ).toBe(true);
  });

  it("logs the installed-mode case (mode + intervalMs)", () => {
    expect(
      src.includes("[ags-canvas-projection-events-drain] scheduler installed"),
    ).toBe(true);
    // The log line must include both mode and intervalMs so
    // operators can see the cadence the scheduler picked.
    expect(/\$\{result\.mode\}/.test(src)).toBe(true);
    expect(/\$\{result\.intervalMs\}/.test(src)).toBe(true);
  });

  it("logs the skipped case (env flag unset)", () => {
    expect(
      src.includes(
        "[ags-canvas-projection-events-drain] scheduler not installed",
      ),
    ).toBe(true);
  });

  it("includes Step 3.29 comment label", () => {
    expect(/Step 3\.29\b/.test(src)).toBe(true);
  });

  it("wraps the import in try/catch (install error never crashes boot)", () => {
    // Locate the Step 3.29 block and confirm the next try {} ... catch
    // pair is structurally present.
    const step329Index = src.indexOf("Step 3.29");
    expect(step329Index).toBeGreaterThan(-1);
    const after = src.slice(step329Index, step329Index + 2000);
    expect(/\btry\s*\{/.test(after)).toBe(true);
    expect(/\bcatch\s*\(/.test(after)).toBe(true);
  });
});
