// Playwright Layer 4 harness — integrity source-scan.
//
// Closes the in-repo half of strict-audit item #7. The runtime half
// is the .github/workflows/playwright-e2e.yml job; that job's first
// green run lives in CI history, not in this repo.
//
// Same drift class as the other source-scan integrity tests in this
// directory: ensures the harness scaffold isn't silently demoted
// back to ADR-only state. A future contributor who deletes the
// playwright.config.ts, removes the workflow, drops the
// `@playwright/test` devDep, or empties the spec directory must
// either update this assertion (declaring the harness intentionally
// removed) or fix the regression.
//
// Method is source-scan only — no Playwright invocation. This file
// is a vitest test that runs on every CI shard.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..");

describe("Playwright Layer 4 harness — integrity", () => {
  it("playwright.config.ts exists at repo root and declares chromium project", () => {
    const config = readFileSync(
      join(REPO_ROOT, "playwright.config.ts"),
      "utf8",
    );
    expect(config).toMatch(/@playwright\/test/);
    expect(config).toMatch(/testDir:\s*["'][^"']*tests\/playwright/);
    expect(config).toMatch(/name:\s*["']chromium["']/);
  });

  it("playwright spec directory contains at least 3 .spec.ts files", () => {
    const specDir = join(REPO_ROOT, "tests", "playwright", "specs");
    const entries = readdirSync(specDir).filter((f) => f.endsWith(".spec.ts"));
    expect(
      entries.length,
      `Expected at least 3 Playwright .spec.ts files under tests/playwright/specs; found ${entries.length}: [${entries.join(", ")}]`,
    ).toBeGreaterThanOrEqual(3);
  });

  it("each playwright spec imports from @playwright/test (production-path discipline)", () => {
    const specDir = join(REPO_ROOT, "tests", "playwright", "specs");
    const specs = readdirSync(specDir).filter((f) => f.endsWith(".spec.ts"));
    for (const file of specs) {
      const src = readFileSync(join(specDir, file), "utf8");
      expect(
        src,
        `Playwright spec ${file} must import from "@playwright/test"`,
      ).toMatch(/from\s+["']@playwright\/test["']/);
    }
  });

  it("@playwright/test is declared in package.json devDependencies", () => {
    const pkg = JSON.parse(
      readFileSync(join(REPO_ROOT, "package.json"), "utf8"),
    );
    const devDeps = pkg.devDependencies ?? {};
    expect(
      devDeps["@playwright/test"],
      "Expected `@playwright/test` in devDependencies",
    ).toBeTruthy();
  });

  it("package.json declares the test:e2e script", () => {
    const pkg = JSON.parse(
      readFileSync(join(REPO_ROOT, "package.json"), "utf8"),
    );
    const scripts = pkg.scripts ?? {};
    expect(scripts["test:e2e"]).toBeTruthy();
    expect(scripts["test:e2e"]).toMatch(/playwright\s+test/);
  });

  it("CI workflow `.github/workflows/playwright-e2e.yml` exists with workflow_dispatch + label gate", () => {
    const wf = readFileSync(
      join(REPO_ROOT, ".github", "workflows", "playwright-e2e.yml"),
      "utf8",
    );
    expect(wf).toMatch(/workflow_dispatch/);
    expect(wf).toMatch(/run-e2e/);
    expect(wf).toMatch(/npx\s+playwright\s+install/);
    expect(wf).toMatch(/npx\s+playwright\s+test/);
  });

  it("Playwright specs are not picked up by the vitest include glob", () => {
    // Vitest include is `tests/**/*.test.ts`. Playwright specs use
    // `.spec.ts` and live under `tests/playwright/specs/`. If a
    // future contributor renames a Playwright spec to `.test.ts`,
    // vitest would pick it up and fail at import time (because
    // `@playwright/test`'s `test` API is incompatible with vitest's
    // `test`). This assertion catches that drift.
    const specDir = join(REPO_ROOT, "tests", "playwright", "specs");
    const offenders = readdirSync(specDir).filter((f) =>
      f.endsWith(".test.ts"),
    );
    expect(
      offenders,
      `Playwright spec directory must contain only .spec.ts files; found .test.ts files: [${offenders.join(", ")}]`,
    ).toEqual([]);
  });
});
