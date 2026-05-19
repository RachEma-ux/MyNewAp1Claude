/**
 * Retention-cron failure-state bridge — source-scan integrity.
 *
 * Slice 20 of the no-deferral catalogue (2026-05-19). Closes the
 * `background_job_failed` producer gap by wiring an emission in the
 * shared makeRetentionCron catch block. Every cron that fails under
 * the shared envelope now emits a structured failure-state event
 * so operator dashboards (filterable by kind) see them.
 *
 * The audit (this slice's deliverable) lives at
 * `docs/implementation/agent-studio-failure-state-kind-audit-2026-05-19.md`.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const REPO_ROOT = process.cwd();

describe("makeRetentionCron — slice 20 bridge", () => {
  const src = readFileSync(
    join(
      REPO_ROOT,
      "server/agent-studio/services/retention/make-retention-cron.ts",
    ),
    "utf8",
  );

  it("imports recordFailureStateEvent in the catch block (dynamic import)", () => {
    expect(src).toMatch(
      /const \{ recordFailureStateEvent \} = await import\(\s*["']\.\.\/failure-states\/observability-bridge\.js["']/s,
    );
  });

  it("emits background_job_failed on uncaught sweep errors", () => {
    expect(src).toMatch(/failureState:\s*["']background_job_failed["']/);
  });

  it("includes the logPrefix in sourceKind for operator triage", () => {
    expect(src).toMatch(/sourceKind:\s*`cron\.\$\{config\.logPrefix\}`/);
  });

  it("forwards the error message so the event payload carries the failure cause", () => {
    expect(src).toMatch(/errorMessage:\s*msg/);
  });

  it("remains fail-soft — observability writes never propagate", () => {
    const catchIdx = src.lastIndexOf("background_job_failed");
    expect(catchIdx).toBeGreaterThan(-1);
    const after = src.slice(catchIdx, catchIdx + 1000);
    expect(after).toMatch(/catch\s*\{\s*\/\* fail-soft \*\//);
  });
});

describe("slice 20 audit doc", () => {
  it("ships at the documented path", () => {
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "docs/implementation/agent-studio-failure-state-kind-audit-2026-05-19.md",
        ),
      ),
    ).toBe(true);
  });

  const doc = readFileSync(
    join(
      REPO_ROOT,
      "docs/implementation/agent-studio-failure-state-kind-audit-2026-05-19.md",
    ),
    "utf8",
  );

  it("audits all 25 closed-taxonomy kinds in the table", () => {
    // Each kind in FAILURE_STATES should appear in the audit doc.
    // Scope the regex to the FAILURE_STATES array block so we don't
    // sweep in unrelated string literals elsewhere in contracts.ts.
    const taxonomy = readFileSync(
      join(
        REPO_ROOT,
        "server/agent-studio/services/failure-states/contracts.ts",
      ),
      "utf8",
    );
    const start = taxonomy.indexOf("export const FAILURE_STATES = [");
    const end = taxonomy.indexOf("] as const;", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = taxonomy.slice(start, end);
    const kindMatches = block.match(/"([a-z0-9_]+)"/g) ?? [];
    const kinds = kindMatches.map((s) => s.replace(/"/g, ""));
    expect(kinds.length).toBeGreaterThanOrEqual(20);
    for (const k of kinds) {
      expect(doc, `audit doc must mention ${k}`).toMatch(new RegExp("`" + k + "`"));
    }
  });

  it("names the 7 deferred producers explicitly for follow-on slices", () => {
    expect(doc).toMatch(/neo4j_query_timeout/);
    expect(doc).toMatch(/backlink_refresh_failed/);
    expect(doc).toMatch(/cag_reference_invalidated/);
    expect(doc).toMatch(/graph_skill_reference_invalidated/);
    expect(doc).toMatch(/search_index_stale/);
    expect(doc).toMatch(/query_cache_stale/);
    expect(doc).toMatch(/semantic_enrichment_rejected/);
  });
});
