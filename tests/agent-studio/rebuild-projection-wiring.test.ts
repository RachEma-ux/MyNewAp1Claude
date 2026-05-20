/**
 * Source-scan integrity test for the Neo4j repository's
 * rebuildProjection wiring.
 *
 * Guards against regression where rebuildProjection drifts back to
 * the pre-closure placeholder shape (insert row → return zero counts
 * → flip row to `queued` for a worker that doesn't exist). After
 * this PR, the method:
 *
 *   - imports replayProjectionScope + ProjectionSyncWorker
 *   - calls replayProjectionScope synchronously
 *   - records `counts` + `writes` + `errors` + `durationMs` in the
 *     rebuild row's summary
 *   - flips the row to `completed` (or `failed` on errors), never
 *     leaves it pending/queued
 *   - returns the real ProjectionResult counts (not zeros)
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("rebuildProjection — worker-side replay wiring", () => {
  const repoSrc = read(
    "server/agent-studio/services/graph/repository/neo4j-community-graph-repository.ts",
  );
  const replaySrc = read(
    "server/agent-studio/services/graph/projection/rebuild-replay.ts",
  );
  const publicApiSrc = read(
    "server/agent-studio/services/graph/projection/public-api.ts",
  );

  describe("Neo4j repo wiring", () => {
    it("rebuildProjection imports replayProjectionScope + ProjectionSyncWorker", () => {
      expect(
        /await\s+import\(\s*["']\.\.\/projection\/rebuild-replay\.js["']\s*\)/.test(
          repoSrc,
        ),
      ).toBe(true);
      expect(
        /await\s+import\(\s*["']\.\.\/projection\/sync-worker\.js["']\s*\)/.test(
          repoSrc,
        ),
      ).toBe(true);
    });

    it("rebuildProjection calls replayProjectionScope with the scope + a sync worker", () => {
      expect(
        /replayProjectionScope\(scope,[\s\S]+?worker:\s*new\s+ProjectionSyncWorker\(\{\s*repository:\s*this\s*\}\)/.test(
          repoSrc,
        ),
      ).toBe(true);
    });

    it("rebuild row status flips to completed / failed (never `queued` placeholder)", () => {
      expect(
        /status:\s*replayErrors\s*===\s*0\s*\?\s*"completed"\s*:\s*"failed"/.test(
          repoSrc,
        ),
      ).toBe(true);
      // The prior placeholder was `status: "queued"` — make sure
      // that exact regression isn't reintroduced inside rebuildProjection.
      const fn = repoSrc.match(/async\s+rebuildProjection\([\s\S]+?\n  \}\n/);
      expect(fn).not.toBeNull();
      if (fn) {
        expect(/status:\s*"queued"/.test(fn[0])).toBe(false);
      }
    });

    it("rebuild row summary carries the per-source counts + per-write totals", () => {
      expect(
        /summary:[\s\S]+?counts:\s*scopeCounts[\s\S]+?writes:[\s\S]+?nodesUpdated:\s*result\.nodesUpdated[\s\S]+?edgesUpdated:\s*result\.edgesUpdated/.test(
          repoSrc,
        ),
      ).toBe(true);
    });

    it("rebuildProjection returns the real ProjectionResult (not zeros)", () => {
      // The result object pulls fields directly from the replay
      // result rather than initializing all six counters to 0.
      expect(
        /nodesCreated:\s*replay\.nodesCreated[\s\S]+?nodesUpdated:\s*replay\.nodesUpdated[\s\S]+?edgesUpdated:\s*replay\.edgesUpdated/.test(
          repoSrc,
        ),
      ).toBe(true);
    });

    it("imports the ReplayCounts type for the summary shape", () => {
      expect(
        /import\s+type\s+\{\s*ReplayCounts\s*\}\s+from\s+["']\.\.\/projection\/rebuild-replay\.js["']/.test(
          repoSrc,
        ),
      ).toBe(true);
    });
  });

  describe("replay module surface", () => {
    it("exports SUPPORTED_REBUILD_SCOPES as a closed taxonomy", () => {
      expect(
        /SUPPORTED_REBUILD_SCOPES\s*=\s*\[[\s\S]+?"vault_notes"[\s\S]+?"wikilinks"[\s\S]+?"bases"[\s\S]+?"all"[\s\S]+?\]\s*as\s+const/.test(
          replaySrc,
        ),
      ).toBe(true);
    });

    it("exports the orchestrator + the type-narrowing guard", () => {
      expect(/export\s+function\s+isSupportedScope/.test(replaySrc)).toBe(true);
      expect(/export\s+async\s+function\s+replayProjectionScope/.test(replaySrc)).toBe(
        true,
      );
    });

    it("default ASDB loaders are gated on getAsDb() being non-null", () => {
      // Each loader returns [] when ASDB is unavailable rather than
      // throwing — protects the replay against partial dev envs.
      expect(/async\s+function\s+defaultLoadNotes[\s\S]+?if\s*\(!db\)\s+return\s+\[\]/.test(replaySrc)).toBe(
        true,
      );
      expect(/async\s+function\s+defaultLoadWikilinks[\s\S]+?if\s*\(!db\)\s+return\s+\[\]/.test(replaySrc)).toBe(
        true,
      );
      expect(/async\s+function\s+defaultLoadBases[\s\S]+?if\s*\(!db\)\s+return\s+\[\]/.test(replaySrc)).toBe(
        true,
      );
      expect(/async\s+function\s+defaultLoadBaseRows[\s\S]+?if\s*\(!db\)\s+return\s+\[\]/.test(replaySrc)).toBe(
        true,
      );
    });

    it("vault_notes loader skips soft-deleted rows", () => {
      expect(/agsVaultNotes\.deletedAt[\s\S]+?IS\s+NULL/.test(replaySrc)).toBe(true);
    });

    it("bases loader skips archived bases", () => {
      expect(/agsBases\.archivedAt[\s\S]+?IS\s+NULL/.test(replaySrc)).toBe(true);
    });

    it("wikilinks loader drops unresolved rows (targetNoteId IS NULL)", () => {
      expect(
        /\.filter\(\(r\)\s*=>\s*r\.targetNoteId\s*!==\s*null/.test(replaySrc),
      ).toBe(true);
    });
  });

  describe("public-api barrel", () => {
    it("re-exports the orchestrator + types", () => {
      expect(/export\s+\{[\s\S]+?replayProjectionScope[\s\S]+?\}\s+from\s+["']\.\/rebuild-replay\.js["']/.test(publicApiSrc)).toBe(
        true,
      );
      expect(/export\s+type\s+\{[\s\S]+?RebuildScope[\s\S]+?ReplayCounts[\s\S]+?\}\s+from\s+["']\.\/rebuild-replay\.js["']/.test(publicApiSrc)).toBe(
        true,
      );
    });
  });
});
