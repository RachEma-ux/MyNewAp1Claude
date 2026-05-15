/**
 * Boot Step 3.35 wire-up — Phase 24 §T-F.8.
 *
 * Structural test verifying the lens-stack installer is wired into
 * boot.ts at Step 3.35 with the right import + try/catch envelope.
 * Source-scan only — does not actually boot the server.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const bootPath = resolve(
  __dirname,
  "../../server/agent-studio/boot.ts",
);

describe("T-F.8 — Boot Step 3.35 lens-stack wire-up", () => {
  const src = readFileSync(bootPath, "utf8");

  it("Step 3.35 header is present", () => {
    expect(src).toContain("Step 3.35");
    expect(src).toContain("T-F.7");
  });

  it("imports maybeInstallDefaultLensStack from graph-lens/public-api", () => {
    // Idiomatic boot pattern is `const { X } = await import("...")` —
    // so we look for the symbol + dynamic-import path.
    expect(src).toMatch(
      /maybeInstallDefaultLensStack[\s\S]{0,120}["']\.\/services\/graph-lens\/public-api["']/,
    );
  });

  it("documents both env flags", () => {
    expect(src).toContain("AGS_GRAPH_LENS_DEFAULTS_INSTALL=on");
    expect(src).toContain("AGS_GRAPH_LENS_STUB_RUNNERS_INSTALL=on");
  });

  it("wrapped in try/catch with skip-on-throw semantics", () => {
    // The installer must NOT crash boot if it throws — same defensive
    // envelope used by every other boot step.
    expect(src).toMatch(
      /maybeInstallDefaultLensStack[\s\S]{0,600}catch[\s\S]{0,300}install skipped/,
    );
  });

  it("default OFF — message in the section comment names this explicitly", () => {
    expect(src).toContain("default OFF");
  });

  it("uses console.log (not warn) for the success path; warn only for skipped/error", () => {
    // The boot logging convention is `console.log(\`... default lens-stack installed ...\`)`
    // and `console.warn(\`... install skipped ...\`)` — the call comes first in code.
    expect(src).toMatch(
      /console\.log[\s\S]{0,200}default lens-stack installed/,
    );
    expect(src).toMatch(/console\.warn[\s\S]{0,200}install skipped/);
  });
});
