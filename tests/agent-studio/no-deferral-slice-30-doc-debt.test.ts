/**
 * Doc-debt sweep continuation — source-scan test.
 *
 * Slice 30 of the no-deferral continuation catalogue (2026-05-19).
 * Asserts the closed-by-successor markers identified in the post-
 * slice-26 re-scan have been rewritten to status-neutral language.
 *
 * Each assertion pairs the rewritten target file with the successor
 * code that closed the marker, so accidentally reintroducing the
 * stale language during a future refactor trips the test.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..");

function read(rel: string): string {
  const p = join(REPO_ROOT, rel);
  return readFileSync(p, "utf8");
}

describe("no-deferral slice 30 — doc-debt continuation sweep", () => {
  it("vault/repository.ts no longer claims MVP 1 skeleton (closed by repository-asdb.ts)", () => {
    const src = read("server/agent-studio/services/vault/repository.ts");
    expect(src).not.toContain("MVP 1 skeleton");
    expect(src).not.toContain("Wire to ASDB Drizzle client in Phase 2");
    // Successor must exist + be named in the doc-block.
    expect(
      existsSync(
        join(REPO_ROOT, "server/agent-studio/services/vault/repository-asdb.ts"),
      ),
    ).toBe(true);
    expect(src).toContain("AsdbVaultRepository");
  });

  it("semantic-enrichment-router.ts no longer names the 3 deferred kinds", () => {
    const src = read(
      "server/agent-studio/services/graph-enrichment/semantic-enrichment-router.ts",
    );
    expect(src).not.toContain("3 deferred kinds");
    expect(src).not.toContain(
      "deferred kinds (stale_fact_refresh / entity_disambiguation /",
    );
    // Successor must exist (the runner supports all 5 kinds).
    const runner = read(
      "server/agent-studio/services/graph-enrichment/semantic-enrichment-runner.ts",
    );
    expect(runner).toContain('"stale_fact_refresh"');
    expect(runner).toContain('"entity_disambiguation"');
    expect(runner).toContain('"relationship_label_repair"');
  });

  it("mutation-worker.ts no longer claims Phase 7.5 fills are pending", () => {
    const src = read(
      "server/agent-studio/services/graph-quality/mutation-worker.ts",
    );
    expect(src).not.toContain(
      "Phase 7.5 fills in real writes; today these are no-op stubs",
    );
    expect(src).not.toContain(
      "Phase 7.5 replaces these with real graph mutations",
    );
    // Successor must exist + be named.
    expect(
      existsSync(
        join(
          REPO_ROOT,
          "server/agent-studio/services/graph-quality/repository-backed-applier.ts",
        ),
      ),
    ).toBe(true);
    expect(src).toContain("createRepositoryBackedApplierRegistry");
  });

  it("boot.ts no longer claims lens runners are still placeholder stubs", () => {
    const src = read("server/agent-studio/boot.ts");
    expect(src).not.toContain(
      "concrete-per-kind\n  // kind runners are still placeholder stubs",
    );
    expect(src).not.toContain(
      "runners are still placeholder stubs",
    );
    // Successor — Step 3.36 wires the real per-kind runners.
    expect(src).toContain("maybeInstallAllLensRunnersWithAsdb");
  });

  it("each rewritten doc-block describes what the code does today (not what's deferred)", () => {
    const vaultRepo = read(
      "server/agent-studio/services/vault/repository.ts",
    );
    expect(vaultRepo).toContain("repository contract");

    const enrichmentRouter = read(
      "server/agent-studio/services/graph-enrichment/semantic-enrichment-router.ts",
    );
    // The rewritten kind_not_yet_supported note must describe it as
    // a defensive contract for *future* kind additions, not as a
    // deferral marker.
    expect(enrichmentRouter).toContain(
      "stays as a defensive contract so a future kind addition",
    );

    const mutationWorker = read(
      "server/agent-studio/services/graph-quality/mutation-worker.ts",
    );
    expect(mutationWorker).toContain(
      "createRepositoryBackedApplierRegistry",
    );

    const boot = read("server/agent-studio/boot.ts");
    expect(boot).toContain("deliberate fallback");
  });
});
