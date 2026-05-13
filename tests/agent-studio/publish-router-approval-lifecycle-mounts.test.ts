/**
 * publishRouter — approval-lifecycle procedure mount integrity.
 *
 * Locks the 10 adminProcedures shipped on `publishRouter` for the
 * approval-lifecycle retention + holds-management + archival +
 * operator-explainer surface (PRs #694 / #697 / #700 / #702). If any
 * procedure is silently removed or renamed, this test fires before
 * an operator notices the missing endpoint.
 *
 * Source-string scan (not runtime import) — same rationale as
 * graph-agent-router-mounted.test.ts: importing `router.ts`
 * transitively pulls in the entire Agent Studio service surface (DB
 * connections, governance loader, etc.) which is heavyweight for
 * what is a structural assertion.
 *
 * If a procedure here is intentionally moved off publishRouter (or
 * renamed), update both the EXPECTED list AND the failing assertion's
 * companion code path — don't just delete the assertion silently.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..");
const ROUTER_PATH = join(REPO_ROOT, "server/agent-studio/api/router.ts");

/**
 * The 10 approval-lifecycle adminProcedures expected to live inside
 * the `publishRouter = router({...})` block. Grouped by sub-arc for
 * readability — the grouping does not affect the assertion logic.
 */
const EXPECTED_PROCEDURES: ReadonlyArray<{ name: string; pr: string }> = [
  // PR #694 — manual sweep + cron status for the 2 publishRouter-owned
  // approval-lifecycle tables.
  { name: "prunePublishRequestsRetention", pr: "#694" },
  { name: "getPublishRequestsRetentionCronStatus", pr: "#694" },
  { name: "pruneApprovalStepsRetention", pr: "#694" },
  { name: "getApprovalStepsRetentionCronStatus", pr: "#694" },

  // PR #697 — Track 2 compliance archival workflow for agsReleaseAuditRefs.
  { name: "listReleaseAuditRefsArchivalCandidates", pr: "#697" },
  { name: "archiveReleaseAuditRef", pr: "#697" },

  // PR #700 — holds-management write-side surface.
  { name: "setLifecycleHold", pr: "#700" },
  { name: "releaseLifecycleHold", pr: "#700" },
  { name: "listLifecycleHoldsForEntity", pr: "#700" },

  // PR #702 — operator-investigation explainer.
  { name: "explainRetentionEligibility", pr: "#702" },
];

describe("publishRouter — approval-lifecycle procedure mount integrity", () => {
  const src = readFileSync(ROUTER_PATH, "utf8");

  // Find the publishRouter block — every assertion below scopes to it
  // to avoid false-positive matches against same-name procedures on
  // unrelated sub-routers.
  const publishRouterStart = src.indexOf("const publishRouter = router({");
  expect(
    publishRouterStart,
    "publishRouter declaration not found in router.ts — has the file been restructured?",
  ).toBeGreaterThanOrEqual(0);

  // The publishRouter body ends at the matching `});` — find it by
  // brace-balanced walk starting after the `router({`.
  const openParenIdx = src.indexOf("({", publishRouterStart);
  let depth = 0;
  let publishRouterEnd = -1;
  for (let i = openParenIdx + 1; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        publishRouterEnd = i;
        break;
      }
    }
  }
  expect(
    publishRouterEnd,
    "Could not find the end of the publishRouter body via brace-balanced walk.",
  ).toBeGreaterThan(publishRouterStart);

  const publishRouterBody = src.slice(publishRouterStart, publishRouterEnd + 1);

  for (const { name, pr } of EXPECTED_PROCEDURES) {
    it(`mounts \`${name}\` inside publishRouter (${pr})`, () => {
      // Matches `<name>: adminProcedure` — the procedure-declaration
      // shape. Allows for whitespace and trailing newline.
      const pattern = new RegExp(`\\b${name}\\s*:\\s*adminProcedure\\b`);
      expect(
        publishRouterBody,
        `${name} (${pr}) is no longer declared inside publishRouter. ` +
          `If this was intentional, update EXPECTED_PROCEDURES and explain ` +
          `the move/removal in the PR description.`,
      ).toMatch(pattern);
    });
  }

  it("publishRouter is mounted on the top-level appRouter as `publish: publishRouter`", () => {
    // Locate the appRouter — it's the last `router({...})` block.
    const lastRouterIdx = src.lastIndexOf("router({");
    expect(lastRouterIdx).toBeGreaterThan(publishRouterStart);
    const tail = src.slice(lastRouterIdx);
    expect(tail).toMatch(/\bpublish\s*:\s*publishRouter\b/);
  });
});
