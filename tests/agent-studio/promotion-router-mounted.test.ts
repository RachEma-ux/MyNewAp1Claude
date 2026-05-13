// promotionRouter — mount + procedure integrity.
//
// Pre-fix state: promotionRouter was defined at PR #408 (graph-workspace
// tRPC routers) but the mount step was never added to
// agentStudioRouter. PR #694 added two new adminProcedures
// (pruneRetention + getRetentionCronStatus) to the orphaned router;
// PR #695 added the operator UI panel that consumes them. Because
// tsconfig.json excludes the promotion path from the typecheck pass,
// the orphaned mount went silent until this fix.
//
// This test locks both invariants:
//
//   1. promotionRouter is imported and mounted on agentStudioRouter
//      as `promotion: promotionRouter`. A future refactor that
//      accidentally removes the mount line trips before reaching CI's
//      black-box layer.
//   2. The 6 procedures expected to live on promotionRouter are
//      declared inside its body — Phase 11's lifecycle surface
//      (submit / approve / reject / rollback) plus PR #694's retention
//      surface (pruneRetention / getRetentionCronStatus).
//
// Source-string scan rather than runtime import (heavyweight tRPC tree
// pulls in DB connections + governance loader).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..");
const AGENT_STUDIO_ROUTER_PATH = join(
  REPO_ROOT,
  "server/agent-studio/api/router.ts",
);
const PROMOTION_ROUTER_PATH = join(
  REPO_ROOT,
  "server/agent-studio/services/promotion/router.ts",
);

describe("agent-studio top-level router — promotion mount integrity", () => {
  const agentStudioSrc = readFileSync(AGENT_STUDIO_ROUTER_PATH, "utf8");

  it("imports promotionRouter from services/promotion/router", () => {
    expect(agentStudioSrc).toMatch(
      /import\s*\{\s*promotionRouter\s*\}\s*from\s*["']\.\.\/services\/promotion\/router["']/,
    );
  });

  it("mounts `promotion: promotionRouter` on the agentStudioRouter", () => {
    expect(agentStudioSrc).toMatch(/\bpromotion\s*:\s*promotionRouter\b/);
  });

  it("the mount sits in the last router({...}) call (the agentStudioRouter, not a sub-router)", () => {
    // Same pattern as graph-agent-router-mounted.test.ts — the
    // agentStudioRouter is the final top-level `router({...})` block in
    // this file. Every sub-router above it is a const ___Router =
    // router({...}). Find the last `router({` and assert the mount is
    // inside it.
    const lastRouterIdx = agentStudioSrc.lastIndexOf("router({");
    expect(lastRouterIdx).toBeGreaterThanOrEqual(0);
    const tail = agentStudioSrc.slice(lastRouterIdx);
    expect(tail).toMatch(/\bpromotion\s*:\s*promotionRouter\b/);
  });
});

describe("promotionRouter — procedure declaration integrity", () => {
  const promotionSrc = readFileSync(PROMOTION_ROUTER_PATH, "utf8");

  /**
   * Expected procedures on the promotionRouter body. Grouped by phase
   * for readability — grouping does not affect assertion logic.
   *
   * Each entry pairs procedure name with the `<protected|admin>Procedure`
   * decorator the source must use for that procedure. Catches accidental
   * downgrades (admin → protected loses cross-tenant scope).
   */
  const EXPECTED_PROCEDURES: ReadonlyArray<{
    name: string;
    decorator: "protectedProcedure" | "adminProcedure";
    phase: string;
  }> = [
    // Phase 11 lifecycle surface
    { name: "submit", decorator: "protectedProcedure", phase: "Phase 11" },
    { name: "approve", decorator: "protectedProcedure", phase: "Phase 11" },
    { name: "reject", decorator: "protectedProcedure", phase: "Phase 11" },
    { name: "rollback", decorator: "protectedProcedure", phase: "Phase 11" },
    // PR #694 retention surface
    { name: "pruneRetention", decorator: "adminProcedure", phase: "#694" },
    { name: "getRetentionCronStatus", decorator: "adminProcedure", phase: "#694" },
  ];

  for (const { name, decorator, phase } of EXPECTED_PROCEDURES) {
    it(`declares \`${name}: ${decorator}\` (${phase})`, () => {
      const pattern = new RegExp(`\\b${name}\\s*:\\s*${decorator}\\b`);
      expect(
        promotionSrc,
        `${name} (${phase}) is no longer declared as \`${decorator}\` ` +
          `on promotionRouter. If renamed or moved, update the test + ` +
          `update the consumer at client/src/modules/agent-studio/pages/` +
          `RetrofitPage.tsx (for retention) and downstream Phase 11 ` +
          `callers (for lifecycle).`,
      ).toMatch(pattern);
    });
  }

  it("exports the router as `promotionRouter`", () => {
    expect(promotionSrc).toMatch(
      /export\s+const\s+promotionRouter\s*=\s*router\s*\(/,
    );
  });
});
