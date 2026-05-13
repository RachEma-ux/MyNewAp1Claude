/**
 * R2-c2 + R1-c3 — repo-wide `governedProcedure` registry coverage invariant.
 *
 * Cycle-2 (R2-c2) walked `server/agent-studio/api/` only (12 procedures).
 * Cycle-3 audit (`/sdcard/Download/GOVERNANCE_AUDIT_2026-05-08.md` §2.1)
 * found that the same footgun shape — `<name>: governedProcedure` declared
 * without a corresponding `action-key-map.ts` mapping or YAML registry
 * entry — recurs across **656 declarations in 99 files repo-wide**, of
 * which only ~12 are registered. R1-c3 expands this test from
 * agent-studio scope to repo-wide scope.
 *
 * Two complementary invariants:
 *
 *   1. **Per-file declaration count** (drift detection across all of
 *      `server/`). The map below is the cycle-3 baseline (656 across 99
 *      files). Adding or removing any `<name>: governedProcedure` line
 *      forces an EXPECTED_PER_FILE update — and forces a decision: the
 *      new procedure must either be registered (entry added to
 *      EXPECTED_REGISTERED + action-key-map + YAML), explicitly
 *      acknowledged as a known cycle-3 backlog item (the count update
 *      lands without a registration), or downgraded to
 *      `protectedProcedure` (the count decrements).
 *
 *   2. **Registry coverage for the curated "known-registered" set.**
 *      The 12 procedures cycle-2 closed remain strictly verified
 *      end-to-end (resolveActionKey + getActionDef). Adding a procedure
 *      to EXPECTED_REGISTERED implies you also added the action-key-map
 *      entry + YAML def — if you didn't, this assertion fires
 *      immediately on the unregistered key.
 *
 * The test runs in default CI Layer 6 (no DB, no module boot) so the
 * invariant fires on every PR.
 *
 * Cycle-3 R2-c3 closure pattern: as each follow-up PR registers (or
 * downgrades) one or more unregistered procedures, the per-file count
 * stays the same (or decrements on downgrades) AND the closing PR adds
 * the corresponding entry to EXPECTED_REGISTERED. The count and the
 * registered list move in lockstep.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { resolveActionKey } from "../../server/governance/action-key-map";
import { getActionDef } from "../../server/governance/action-registry";

const REPO_ROOT = process.cwd();
const SERVER_DIR = join(REPO_ROOT, "server");

/**
 * Curated list of `governedProcedure` declarations whose action-keys
 * MUST resolve through `resolveActionKey` + `getActionDef` cleanly.
 *
 * Cycle-2's R2-c2 list is the seed. Each PR that closes a cycle-3
 * R2-c3 backlog item should add the newly-registered entry here AND
 * ensure the corresponding `action-key-map.ts` + YAML registration is
 * in place.
 */
const EXPECTED_REGISTERED: ReadonlyArray<{
  trpcPath: string;
  source: string;
}> = [
  {
    trpcPath: "agentStudio.cag.refreshPack",
    source: "server/agent-studio/api/cag-router.ts",
  },
  {
    trpcPath: "agentStudio.kb.setLicense",
    source: "server/agent-studio/api/kb-router.ts",
  },
  {
    trpcPath: "agentStudio.kb.clearPiiFindings",
    source: "server/agent-studio/api/kb-router.ts",
  },
  {
    trpcPath: "agentStudio.mcpSchemaSync.sync",
    source: "server/agent-studio/api/mcp-schema-sync-router.ts",
  },
  {
    trpcPath: "agentStudio.toolApprovals.decide",
    source: "server/agent-studio/api/tool-approvals-router.ts",
  },
  {
    trpcPath: "agentStudio.workspaceDefaultBindings.upsert",
    source: "server/agent-studio/api/workspace-default-bindings-router.ts",
  },
  {
    trpcPath: "agentStudio.workspaceDefaultBindings.delete",
    source: "server/agent-studio/api/workspace-default-bindings-router.ts",
  },
  {
    trpcPath: "agentStudio.plugins.validate",
    source: "server/agent-studio/api/router.ts",
  },
  {
    trpcPath: "agentStudio.catalogTools.create",
    source: "server/agent-studio/api/router.ts",
  },
  {
    trpcPath: "agentStudio.catalogTools.update",
    source: "server/agent-studio/api/router.ts",
  },
  {
    trpcPath: "agentStudio.catalogTools.remove",
    source: "server/agent-studio/api/router.ts",
  },
  {
    trpcPath: "agentStudio.marketplace.refresh",
    source: "server/agent-studio/api/router.ts",
  },
  // C1-c4 — publish-workflow approval decision converted from
  // protectedProcedure → governedProcedure (cycle-4 audit closure).
  {
    trpcPath: "agentStudio.publish.decideApproval",
    source: "server/agent-studio/api/router.ts",
  },
];

/**
 * Per-file declaration count of `<name>: governedProcedure` lines under
 * `server/`. Cycle-3 baseline: 656 across 99 files. C1-c4 (cycle-4)
 * added 1 (publish.decideApproval converted from protectedProcedure);
 * current baseline: 657 across 99 files. Of these, 13 are in
 * EXPECTED_REGISTERED above; the remaining 644 are pre-existing cycle-3
 * backlog (R2-c3) — see `/sdcard/Download/GOVERNANCE_AUDIT_2026-05-08.md`
 * §2.1 for the per-domain breakdown.
 *
 * **Maintenance:** adding or removing a `governedProcedure` declaration
 * anywhere under `server/` requires updating the entry below for the
 * affected file. The test will fail with a diff showing exactly which
 * file's count changed.
 */
const EXPECTED_PER_FILE: Record<string, number> = {
  "server/agent-studio/api/cag-router.ts": 1,
  "server/agent-studio/api/graph-skill-router.ts": 2,
  "server/agent-studio/api/kb-router.ts": 2,
  "server/agent-studio/api/mcp-schema-sync-router.ts": 1,
  "server/agent-studio/api/router.ts": 6,
  "server/agent-studio/api/tool-approvals-router.ts": 1,
  "server/agent-studio/api/workspace-default-bindings-router.ts": 2,
  "server/agent-studio/services/graph-agent/router.ts": 1,
  "server/agents/router.ts": 8,
  "server/ai-types/taxonomy/router.ts": 1,
  "server/automation/automation-router.ts": 7,
  "server/catalog-import/router.ts": 6,
  "server/chat/router.ts": 6,
  "server/communication/router.ts": 15,
  "server/culture-values/router.ts": 11,
  "server/data-analysis/data-acquisition/dataAcquisition.router.ts": 14,
  "server/data-analysis/graphrag/router.ts": 3,
  "server/documents/documents-crud-router.ts": 5,
  "server/documents/documents-router.ts": 2,
  "server/embeddings/embeddings-router.ts": 2,
  "server/governance/router.ts": 1,
  "server/hardware/hardware-router.ts": 1,
  "server/hr/analytics/router.ts": 5,
  "server/hr/compensation/router.ts": 10,
  "server/hr/compliance/router.ts": 9,
  "server/hr/directory/router.ts": 4,
  "server/hr/engagement/router.ts": 9,
  "server/hr/learning/router.ts": 8,
  "server/hr/lifecycle/router.ts": 10,
  "server/hr/organization/router.ts": 7,
  "server/hr/performance/router.ts": 8,
  "server/hr/recruiting/router.ts": 8,
  "server/hr/relations/router.ts": 9,
  "server/hr/role-definitions/router.ts": 10,
  "server/hr/staffing/router.ts": 3,
  "server/hr/talent/router.ts": 7,
  "server/hr/time/router.ts": 11,
  "server/inference/inference-router.ts": 3,
  "server/models/benchmark-router.ts": 1,
  "server/models/download-router.ts": 9,
  "server/models/version-router.ts": 5,
  "server/modules/agents/router.ts": 6,
  "server/modules/collaboration/router.ts": 6,
  "server/modules/hr/router.ts": 2,
  "server/modules/kgia/router.ts": 7,
  "server/modules/knowledge/router.ts": 5,
  "server/modules/pmt/activity-types-router.ts": 3,
  "server/modules/pmt/ai-router.ts": 1,
  "server/modules/pmt/attachments-router.ts": 2,
  "server/modules/pmt/baselines-router.ts": 1,
  "server/modules/pmt/budgets-router.ts": 3,
  "server/modules/pmt/comments-router.ts": 3,
  "server/modules/pmt/config-router.ts": 8,
  "server/modules/pmt/cost-entries-router.ts": 3,
  "server/modules/pmt/custom-actions-router.ts": 4,
  "server/modules/pmt/custom-fields-router.ts": 4,
  "server/modules/pmt/discussions-router.ts": 6,
  "server/modules/pmt/git-router.ts": 2,
  "server/modules/pmt/meetings-router.ts": 6,
  "server/modules/pmt/news-router.ts": 3,
  "server/modules/pmt/router.ts": 12,
  "server/modules/pmt/sprints-router.ts": 6,
  "server/modules/pmt/templates-router.ts": 10,
  "server/modules/pmt/time-entries-router.ts": 3,
  "server/modules/pmt/versions-router.ts": 3,
  "server/modules/pmt/views-router.ts": 3,
  "server/modules/pmt/watchers-router.ts": 2,
  "server/modules/pmt/webhooks-router.ts": 4,
  "server/modules/router.ts": 2,
  "server/openrouter/router.ts": 10,
  "server/organization-management/router.ts": 20,
  "server/pm-central/router.ts": 28,
  "server/provider-connections/router.ts": 8,
  "server/providers/router.ts": 13,
  "server/ps/context-translator-router.ts": 2,
  "server/ps/ps.ideation-router.ts": 16,
  "server/ps/ps.router.ts": 64,
  "server/routers/actions.ts": 1,
  "server/routers/agents-control-plane.ts": 6,
  "server/routers/agents-diff.ts": 1,
  "server/routers/agents-promotions.ts": 4,
  "server/routers/agents.ts": 8,
  "server/routers/bots.ts": 3,
  "server/routers/catalog-manage.ts": 7,
  "server/routers/conversations.ts": 3,
  "server/routers/deploy.ts": 3,
  "server/routers/keyRotation.ts": 13,
  "server/routers/llm-creation.ts": 13,
  "server/routers/llm-providers.ts": 4,
  "server/routers/llm.ts": 12,
  "server/routers/models.ts": 3,
  "server/routers/policies.ts": 5,
  "server/routers/protocols.ts": 4,
  "server/routers/templates.ts": 4,
  "server/routers/triggers.ts": 1,
  "server/routers/wcpWorkflows.ts": 3,
  "server/routers/wiki.ts": 6,
  "server/secrets/secrets-router.ts": 3,
  "server/vectordb/vectordb-router.ts": 3,
  "server/workforce-assignment/router.ts": 14,
  "server/workspace/workspace-router.ts": 21,
};

const GOVERNED_PROCEDURE_RE = /^\s+[a-zA-Z][a-zA-Z0-9_]*\s*:\s*governedProcedure\b/m;
const GOVERNED_PROCEDURE_RE_GLOBAL = /^\s+[a-zA-Z][a-zA-Z0-9_]*\s*:\s*governedProcedure\b/gm;

/**
 * Recursively walk a directory and yield every `*.ts` file path that
 * is NOT a test file. Returns paths relative to REPO_ROOT.
 */
function* walkTsFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      // Skip broken symlinks (some repos have stale symlinks under
      // server/ that throw ENOENT on stat — e.g. server/_core/public
      // pointing at a generated dist directory that may not exist).
      continue;
    }
    if (stat.isDirectory()) {
      yield* walkTsFiles(full);
    } else if (
      stat.isFile() &&
      entry.endsWith(".ts") &&
      !entry.endsWith(".test.ts")
    ) {
      yield relative(REPO_ROOT, full);
    }
  }
}

/**
 * Count `<name>: governedProcedure` declarations in a single file.
 */
function countGovernedProcedureDeclarations(relPath: string): number {
  const src = readFileSync(join(REPO_ROOT, relPath), "utf8");
  const matches = src.match(GOVERNED_PROCEDURE_RE_GLOBAL);
  return matches?.length ?? 0;
}

/**
 * Compute the discovered per-file count map across all of server/.
 */
function discoverGovernedProcedureCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const relPath of walkTsFiles(SERVER_DIR)) {
    const n = countGovernedProcedureDeclarations(relPath);
    if (n > 0) counts[relPath] = n;
  }
  return counts;
}

describe("RETROFIT R1-c3 — every governedProcedure is accounted for repo-wide", () => {
  describe("drift detection — per-file declaration counts match EXPECTED_PER_FILE", () => {
    const discovered = discoverGovernedProcedureCounts();

    it("total declaration count matches the cycle-3 baseline (660 after Native Graph Workspace MVP 4)", () => {
      const total = Object.values(discovered).reduce((a, b) => a + b, 0);
      const expected = Object.values(EXPECTED_PER_FILE).reduce((a, b) => a + b, 0);
      expect(
        total,
        `governedProcedure repo-wide total drifted. Expected ${expected}, found ${total}. ` +
          `Update EXPECTED_PER_FILE in this test to match.`,
      ).toBe(expected);
    });

    it("file count matches the cycle-3 baseline (101 files after Native Graph Workspace MVP 4)", () => {
      const expectedKeys = new Set(Object.keys(EXPECTED_PER_FILE));
      const discoveredKeys = new Set(Object.keys(discovered));

      const newFiles = [...discoveredKeys].filter((k) => !expectedKeys.has(k));
      const removedFiles = [...expectedKeys].filter((k) => !discoveredKeys.has(k));

      expect(
        newFiles,
        `New files declaring governedProcedure detected. Add to EXPECTED_PER_FILE:\n  ${newFiles.join("\n  ")}`,
      ).toEqual([]);
      expect(
        removedFiles,
        `Files in EXPECTED_PER_FILE no longer declare governedProcedure. Remove from EXPECTED_PER_FILE:\n  ${removedFiles.join("\n  ")}`,
      ).toEqual([]);
    });

    it("per-file declaration counts match expected", () => {
      const mismatches: string[] = [];
      for (const [file, expectedCount] of Object.entries(EXPECTED_PER_FILE)) {
        const actualCount = discovered[file] ?? 0;
        if (actualCount !== expectedCount) {
          mismatches.push(`${file}: expected ${expectedCount}, found ${actualCount}`);
        }
      }
      expect(
        mismatches,
        `Per-file governedProcedure counts drifted:\n  ${mismatches.join("\n  ")}\n` +
          `Update EXPECTED_PER_FILE entries above. If you added a new procedure, also decide ` +
          `whether to register it (add to EXPECTED_REGISTERED + action-key-map + YAML), ` +
          `acknowledge it as cycle-3 backlog (count update only), or downgrade to ` +
          `protectedProcedure (count decrements).`,
      ).toEqual([]);
    });
  });

  describe("registry coverage — every EXPECTED_REGISTERED procedure resolves cleanly", () => {
    for (const { trpcPath, source } of EXPECTED_REGISTERED) {
      it(`${trpcPath} (${source}) resolves through resolveActionKey + getActionDef`, () => {
        const actionKey = resolveActionKey(trpcPath);
        expect(actionKey).toBeTruthy();
        const def = getActionDef(actionKey);
        expect(def).toBeDefined();
        expect(def.stage).toBe("mutate");
        expect(def.domain.length).toBeGreaterThan(0);
        expect(def.capability.length).toBeGreaterThan(0);
      });
    }
  });

  describe("source consistency — every EXPECTED_REGISTERED source file declares governedProcedure", () => {
    const discovered = discoverGovernedProcedureCounts();

    for (const { trpcPath, source } of EXPECTED_REGISTERED) {
      it(`${source} declares at least one governedProcedure (for ${trpcPath})`, () => {
        expect(
          discovered[source],
          `${source} is referenced by EXPECTED_REGISTERED but no governedProcedure declarations found there.`,
        ).toBeGreaterThanOrEqual(1);
      });
    }
  });
});
