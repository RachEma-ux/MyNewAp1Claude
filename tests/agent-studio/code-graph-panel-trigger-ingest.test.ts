/**
 * Source-scan integrity test for the CodeGraphPanel's
 * triggerIngest operator-trigger affordance (T-G.2.3 operator-visible
 * closure on top of PR #1711).
 *
 * The panel already consumed seven read endpoints from the
 * `agentStudio.codeGraph.*` tRPC surface (continuation-18 slice 87).
 * This change adds the only mutation in that router:
 *
 *   - "+ Trigger ingest" toggle button (top-right of section header)
 *   - Form with repoPath + repositoryId + optional relativeSubPath
 *   - Result card showing the last ingest summary
 *   - onSuccess: invalidates listIngestions / listRepositories /
 *     listRecentParserErrors so the rest of the panel reflects the
 *     new row without a page refresh
 *
 * Source-scan rather than RTL-mount because the panel transitively
 * imports the tRPC client + react-query providers that don't render
 * in the unit-test environment. Structural test locks the
 * declarations + invalidate-set, which is the part that drifts.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const repoRoot = resolve(__dirname, "../..");
const panelPath = resolve(
  repoRoot,
  "client/src/modules/agent-studio/components/CodeGraphPanel.tsx",
);
const src = readFileSync(panelPath, "utf8");

describe("CodeGraphPanel — triggerIngest operator-trigger UI", () => {
  it("uses the triggerIngest mutation from the codeGraph router", () => {
    expect(src).toMatch(
      /trpc\.agentStudio\.codeGraph\.triggerIngest\.useMutation/,
    );
  });

  it("acquires the tRPC utils handle for cache invalidation", () => {
    expect(src).toMatch(/trpc\.useUtils\(\)/);
  });

  it("invalidates the three read queries that change shape after a new ingestion", () => {
    expect(src).toMatch(
      /utils\.agentStudio\.codeGraph\.listIngestions\.invalidate\(\)/,
    );
    expect(src).toMatch(
      /utils\.agentStudio\.codeGraph\.listRepositories\.invalidate\(\)/,
    );
    expect(src).toMatch(
      /utils\.agentStudio\.codeGraph\.listRecentParserErrors\.invalidate\(\)/,
    );
  });

  it("renders the toggle button + form + submit + result with stable testids", () => {
    expect(src).toMatch(/data-testid="cg-trigger-ingest-toggle"/);
    expect(src).toMatch(/data-testid="cg-trigger-ingest-form"/);
    expect(src).toMatch(/data-testid="cg-trigger-ingest-repo-path"/);
    expect(src).toMatch(/data-testid="cg-trigger-ingest-repository-id"/);
    expect(src).toMatch(/data-testid="cg-trigger-ingest-sub-path"/);
    expect(src).toMatch(/data-testid="cg-trigger-ingest-submit"/);
    expect(src).toMatch(/data-testid="cg-trigger-ingest-error"/);
    expect(src).toMatch(/data-testid="cg-trigger-ingest-result"/);
  });

  it("requires repoPath + repositoryId pre-submit (client-side guard)", () => {
    // The client-side validation gates the mutate() call so an
    // operator who submits an empty form gets a friendly error
    // instead of a 400 from the zod schema.
    expect(src).toMatch(
      /repoPath and repositoryId are both required/,
    );
  });

  it("conditionally spreads relativeSubPath only when non-empty (avoids '' overriding the orchestrator default)", () => {
    // Naive `relativeSubPath: subPath` would send "" which the zod
    // schema accepts but the orchestrator would join into the path,
    // producing an empty scan-root identical to `repoPath`. The
    // conditional spread keeps the default behavior intact.
    expect(src).toMatch(
      /\.\.\.\(subPath\s*!==\s*""\s*\?\s*\{\s*relativeSubPath:\s*subPath\s*\}\s*:\s*\{\}\)/,
    );
  });

  it("shows the last-trigger result card with the orchestrator summary fields", () => {
    expect(src).toMatch(/scanned:\s*\{lastTriggerResult\.filesScanned\}/);
    expect(src).toMatch(/parsed:\s*\{lastTriggerResult\.filesParsed\}/);
    expect(src).toMatch(/nodes:\s*\{lastTriggerResult\.nodesUpserted\}/);
    expect(src).toMatch(/edges:\s*\{lastTriggerResult\.edgesUpserted\}/);
    expect(src).toMatch(
      /lastTriggerResult\.durationMs\}ms/,
    );
  });

  it("disables the submit button while the mutation is in-flight", () => {
    expect(src).toMatch(/disabled=\{triggerMutation\.isPending\}/);
    expect(src).toMatch(/Ingesting…/);
  });
});
