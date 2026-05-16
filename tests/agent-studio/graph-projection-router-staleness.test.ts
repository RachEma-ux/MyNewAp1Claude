/**
 * Phase 22 §T-I.46 — Graph-projection router staleness procedure.
 *
 * Source-scan structural test asserting the admin tRPC router exposes
 * `runStalenessCheck` and that it threads through to the canonical
 * `runStalenessCheck` + `loadStalenessRowsFromAsDb` composition.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const routerPath = resolve(
  __dirname,
  "../../server/agent-studio/services/graph/projection/router.ts",
);

describe("graph-projection router exposes the staleness procedure", () => {
  const src = readFileSync(routerPath, "utf8");

  it("imports runStalenessCheck + loadStalenessRowsFromAsDb from the detector module", () => {
    expect(src).toMatch(
      /import\s*\{[^}]*runStalenessCheck[\s\S]*?\}\s*from\s*["']\.\/staleness-detector/,
    );
    expect(src).toMatch(
      /import\s*\{[^}]*loadStalenessRowsFromAsDb[\s\S]*?\}\s*from\s*["']\.\/staleness-detector/,
    );
  });

  it("declares a runStalenessCheck procedure as admin-gated mutation", () => {
    expect(src).toContain("runStalenessCheck: adminProcedure");
    expect(src).toContain(".mutation(");
  });

  it("input schema accepts optional thresholdMs and limit", () => {
    expect(src).toMatch(/thresholdMs:\s*z\.number/);
    expect(src).toMatch(/limit:\s*z\.number/);
  });

  it("composes loadStalenessRowsFromAsDb as the fetchRows arg", () => {
    expect(src).toMatch(
      /fetchRows:\s*\(\)\s*=>\s*loadStalenessRowsFromAsDb/,
    );
  });

  it("threads thresholdMs from input into the orchestrator", () => {
    expect(src).toMatch(/thresholdMs:\s*input\?\.thresholdMs/);
  });

  it("threads limit from input into the row fetcher", () => {
    expect(src).toMatch(/limit:\s*input\?\.limit/);
  });
});
