// CronStatusBadge migration regression lock.
//
// PRs #716 + #717 centralized the 4-state cron-status badge ladder
// (loading → error → healthy → never run) into a single shared
// component (`CronStatusBadge`). All 18 retention panels in
// `RetrofitPage.tsx` now route through it.
//
// Risk: a future contributor copy-pastes one of the migrated panels
// as a template for a new retention surface, but inlines the badge
// ladder again instead of using the component. The duplication would
// re-emerge silently — the per-cron tests and the panel-coverage
// test would still pass, but the operator UI logic would be split
// across the component AND the inline ladder.
//
// This test enforces the migration:
//
//   `RetrofitPage.tsx` MUST NOT contain the 4-state cron-status
//   inline ladder. Any new cron-status badge belongs through
//   `<CronStatusBadge .../>`.
//
// Method: source-scan for the canonical inline-ladder signature
// (`<Badge variant="destructive">error</Badge>` paired with
// `<Badge>healthy</Badge>` — a combination unique to the
// cron-status surface). The 2-state archival-candidates ladder
// (loading vs candidate count) does NOT trip this — it has no
// `destructive>error` or `>healthy<` markers.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const REPO_ROOT = join(__dirname, "..", "..");
const RETROFIT_PAGE_PATH = join(
  REPO_ROOT,
  "client",
  "src",
  "modules",
  "agent-studio",
  "pages",
  "RetrofitPage.tsx",
);

const CRON_STATUS_BADGE_PATH = join(
  REPO_ROOT,
  "client",
  "src",
  "modules",
  "agent-studio",
  "components",
  "CronStatusBadge.tsx",
);

describe("CronStatusBadge migration — regression lock", () => {
  const src = readFileSync(RETROFIT_PAGE_PATH, "utf8");

  // Panels extracted out of RetrofitPage (PR #708 / #722) still own
  // their CronStatusBadge usages; count those alongside the inline
  // usages so the 18-cron retention surface stays covered.
  const EXTRACTED_PANEL_PATHS: ReadonlyArray<string> = [
    join(REPO_ROOT, "client", "src", "modules", "agent-studio", "components", "CronStatusPanel.tsx"),
    join(REPO_ROOT, "client", "src", "modules", "agent-studio", "components", "McpTransitionsRetentionPanel.tsx"),
    join(REPO_ROOT, "client", "src", "modules", "agent-studio", "components", "ToolCallTracesRetentionPanel.tsx"),
    join(REPO_ROOT, "client", "src", "modules", "agent-studio", "components", "CatalogSyncLogRetentionPanel.tsx"),
    join(REPO_ROOT, "client", "src", "modules", "agent-studio", "components", "RacRuntimeTracesRetentionPanel.tsx"),
    join(REPO_ROOT, "client", "src", "modules", "agent-studio", "components", "CagPackEventsRetentionPanel.tsx"),
    join(REPO_ROOT, "client", "src", "modules", "agent-studio", "components", "SimulationRunsRetentionPanel.tsx"),
    join(REPO_ROOT, "client", "src", "modules", "agent-studio", "components", "TestRunsRetentionPanel.tsx"),
    join(REPO_ROOT, "client", "src", "modules", "agent-studio", "components", "GraphQualityScansRetentionPanel.tsx"),
    join(REPO_ROOT, "client", "src", "modules", "agent-studio", "components", "GraphCorrectionProposalsRetentionPanel.tsx"),
    join(REPO_ROOT, "client", "src", "modules", "agent-studio", "components", "GraphQualityAgentRunsRetentionPanel.tsx"),
  ];

  function countBadgeUsages(): number {
    const inline = (src.match(/<CronStatusBadge\b/g) ?? []).length;
    const extracted = EXTRACTED_PANEL_PATHS.reduce((sum, p) => {
      const panelSrc = readFileSync(p, "utf8");
      return sum + (panelSrc.match(/<CronStatusBadge\b/g) ?? []).length;
    }, 0);
    return inline + extracted;
  }

  it("RetrofitPage imports CronStatusBadge", () => {
    expect(src).toMatch(
      /import\s*\{\s*CronStatusBadge\s*\}\s*from\s*["']\.\.\/components\/CronStatusBadge["']/,
    );
  });

  it("RetrofitPage + extracted panels use CronStatusBadge at least 18 times (one per retention cron + archival surface where applicable)", () => {
    const total = countBadgeUsages();
    expect(
      total,
      `Expected at least 18 <CronStatusBadge> usages across RetrofitPage + extracted panels (one per retention cron). Found ${total}. If a panel was removed, update this assertion + the panel-coverage test. If a panel was extracted into a new component file, add its path to EXTRACTED_PANEL_PATHS.`,
    ).toBeGreaterThanOrEqual(18);
  });

  it("RetrofitPage contains zero inline 4-state cron-status badge ladders", () => {
    // The signature of the inline cron-status ladder is the combination
    // of the destructive>error and >healthy< badges within close
    // proximity. The 2-state archival-candidates ladder has neither
    // (it uses loading vs candidate count), so this signature is
    // unique to the migrated surface.
    const errorBadge = '<Badge variant="destructive">error</Badge>';
    const healthyBadge = "<Badge>healthy</Badge>";

    expect(
      src.includes(errorBadge),
      `Inline cron-status badge regression: found "${errorBadge}" in RetrofitPage. ` +
        `Use <CronStatusBadge isLoading={...} lastError={...} lastRunAt={...} /> instead. ` +
        `If a non-cron surface legitimately needs a "destructive>error" badge, ` +
        `weaken this assertion to a count check rather than a presence check.`,
    ).toBe(false);

    expect(
      src.includes(healthyBadge),
      `Inline cron-status badge regression: found "${healthyBadge}" in RetrofitPage. ` +
        `Use <CronStatusBadge isLoading={...} lastError={...} lastRunAt={...} /> instead.`,
    ).toBe(false);
  });

  it("CronStatusBadge component exists at the expected path", () => {
    // If the component file is moved, both the import assertion above
    // and this assertion need an update.
    const componentSrc = readFileSync(CRON_STATUS_BADGE_PATH, "utf8");
    expect(componentSrc).toMatch(/export\s+function\s+CronStatusBadge\b/);
  });
});
