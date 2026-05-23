/**
 * Source-scan integrity test for the per-repository Re-ingest
 * affordance + the metadata.lastRun wiring that backs it.
 *
 * Follows PR #1711 (orchestrator), #1712 (form), and #1713
 * (auto-select). This slice closes the "re-fire a known ingest"
 * boundary so operators stop having to retype the repoPath every time
 * they re-ingest a known repo.
 *
 * Cross-file source-scan covers:
 *   - persistence/code-graph-store.ts
 *     · CodeGraphIngestionInput accepts optional repoPath +
 *       relativeSubPath
 *     · CodeGraphRepositorySummaryRow surfaces latestRunRepoPath +
 *       latestRunRelativeSubPath (nullable for historical rows)
 *     · persistIngestion writes them into metadata.lastRun
 *     · listRepositories selects + parses metadata back out
 *
 *   - orchestrator/code-graph-orchestrator.ts
 *     · Forwards repoPath + relativeSubPath to persistIngestion
 *
 *   - client/src/modules/agent-studio/components/CodeGraphPanel.tsx
 *     · Per-row Re-ingest button rendered only when latestRunRepoPath
 *       is non-null
 *     · Button reuses the same triggerMutation (so auto-select kicks
 *       in for re-ingest just like the form)
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const repoRoot = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(resolve(repoRoot, rel), "utf8");
}

describe("Code Graph — freshness panel Re-ingest", () => {
  // ── persistence/code-graph-store.ts ───────────────────────────────
  it("CodeGraphIngestionInput accepts optional repoPath + relativeSubPath", () => {
    const src = read(
      "server/agent-studio/services/code-graph/persistence/code-graph-store.ts",
    );
    expect(src).toMatch(
      /interface\s+CodeGraphIngestionInput\s+\{[\s\S]*?readonly\s+repoPath\?\:\s*string;[\s\S]*?readonly\s+relativeSubPath\?\:\s*string;/,
    );
  });

  it("CodeGraphRepositorySummaryRow surfaces latestRunRepoPath + latestRunRelativeSubPath (nullable)", () => {
    const src = read(
      "server/agent-studio/services/code-graph/persistence/code-graph-store.ts",
    );
    expect(src).toMatch(
      /interface\s+CodeGraphRepositorySummaryRow\s+\{[\s\S]*?readonly\s+latestRunRepoPath:\s*string\s*\|\s*null;[\s\S]*?readonly\s+latestRunRelativeSubPath:\s*string\s*\|\s*null;/,
    );
  });

  it("persistIngestion writes metadata.lastRun only when repoPath is provided (conditional spread)", () => {
    const src = read(
      "server/agent-studio/services/code-graph/persistence/code-graph-store.ts",
    );
    // The local `lastRun` binding gets undefined when repoPath is
    // absent — protects historical callers from acquiring an empty
    // lastRun: {} object that would confuse the freshness panel.
    expect(src).toMatch(
      /const\s+lastRun(?::[^=]*)?\s*=\s*\n?\s*input\.repoPath\s*!==\s*undefined/,
    );
    expect(src).toMatch(
      /\.\.\.\(lastRun\s*!==\s*undefined\s*\?\s*\{\s*lastRun\s*\}\s*:\s*\{\}\)/,
    );
  });

  it("listRepositories SELECTs metadata and extracts lastRun.repoPath + lastRun.relativeSubPath", () => {
    const src = read(
      "server/agent-studio/services/code-graph/persistence/code-graph-store.ts",
    );
    // SELECT includes metadata
    expect(src).toMatch(/SELECT\s+DISTINCT\s+ON\s+\(repository_id\)[\s\S]*?metadata[\s\S]*?FROM\s+ags_code_graph_ingestions/);
    // Result-mapping picks the two string fields out of lastRun.
    // Bracket access may wrap to the next line in the source.
    expect(src).toMatch(/\[\s*"lastRun"\s*\]/);
    expect(src).toMatch(
      /typeof\s+lastRun\?\.repoPath\s*===\s*"string"\s*\?\s*lastRun\.repoPath\s*:\s*null/,
    );
    expect(src).toMatch(
      /typeof\s+lastRun\?\.relativeSubPath\s*===\s*"string"/,
    );
  });

  // ── orchestrator/code-graph-orchestrator.ts ───────────────────────
  it("orchestrator forwards repoPath + relativeSubPath to persistIngestion", () => {
    const src = read(
      "server/agent-studio/services/code-graph/orchestrator/code-graph-orchestrator.ts",
    );
    expect(src).toMatch(/repoPath:\s+input\.repoPath/);
    expect(src).toMatch(
      /\.\.\.\(input\.relativeSubPath\s*!==\s*undefined\s*\?\s*\{\s*relativeSubPath:\s*input\.relativeSubPath\s*\}\s*:\s*\{\}\)/,
    );
  });

  // ── client/src/modules/agent-studio/components/CodeGraphPanel.tsx ─
  it("freshness panel renders a per-row Re-ingest button when latestRunRepoPath is non-null", () => {
    const src = read(
      "client/src/modules/agent-studio/components/CodeGraphPanel.tsx",
    );
    expect(src).toMatch(/data-testid="cg-repository-reingest-btn"/);
    expect(src).toMatch(/r\.latestRunRepoPath\s*!==\s*null/);
  });

  it("Re-ingest button reuses the existing triggerMutation (so auto-select still fires)", () => {
    const src = read(
      "client/src/modules/agent-studio/components/CodeGraphPanel.tsx",
    );
    // The button must call triggerMutation.mutate(...) rather than
    // mint a parallel mutation hook — otherwise auto-select +
    // last-result-card + invalidate-set behaviors from PRs
    // #1712/#1713 don't apply to re-ingest.
    const buttonBlock = src.split('data-testid="cg-repository-reingest-btn"')[1] ?? "";
    expect(buttonBlock).toMatch(/triggerMutation\.mutate\(/);
  });

  it("Re-ingest button conditionally spreads relativeSubPath only when non-null (matches form behavior)", () => {
    const src = read(
      "client/src/modules/agent-studio/components/CodeGraphPanel.tsx",
    );
    expect(src).toMatch(
      /\.\.\.\(r\.latestRunRelativeSubPath\s*!==\s*null[\s\S]{0,80}relativeSubPath:\s*r\.latestRunRelativeSubPath/,
    );
  });

  it("Re-ingest button is disabled while a trigger mutation is in-flight", () => {
    const src = read(
      "client/src/modules/agent-studio/components/CodeGraphPanel.tsx",
    );
    const buttonBlock = src.split('data-testid="cg-repository-reingest-btn"')[1] ?? "";
    expect(buttonBlock.slice(0, 600)).toMatch(/disabled=\{triggerMutation\.isPending\}/);
  });
});
