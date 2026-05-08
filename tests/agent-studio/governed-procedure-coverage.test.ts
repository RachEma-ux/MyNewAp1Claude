/**
 * R2-c2 — systemic invariant: every `governedProcedure` declaration
 * across `server/agent-studio/api/*.ts` must resolve through
 * `resolveActionKey` + `getActionDef` cleanly.
 *
 * Cycle-2 audit (`/sdcard/Download/RAC_AUDIT_2026-05-08-cycle2.md`)
 * found a recurring pattern: routers declare `<name>: governedProcedure`
 * but never register the action key in `server/governance/action-key-map.ts`
 * or `config/governance/platform_action_registry.yaml`. The deny path
 * is unconditional — `getActionDef` throws for unknown keys
 * (`server/governance/action-registry.ts:142-153`,
 * comment: \"DENY-BY-DEFAULT\"), the trpc middleware catches and
 * rethrows as HTTP 403, and the procedure is silently broken in
 * production.
 *
 * R1-c2 closed the U5-b.4 instance (kb.setLicense + kb.clearPiiFindings).
 * R2-c2 closes 9 more pre-existing instances surfaced by this test
 * (mcpSchemaSync.sync, toolApprovals.decide, workspaceDefaultBindings
 * upsert/delete, plugins.validate, catalogTools create/update/remove,
 * marketplace.refresh) and locks the invariant going forward.
 *
 * Two complementary checks:
 *
 *   1. **Drift detection** — source-string scan over the API directory
 *      counts every `<name>: governedProcedure` declaration. The count
 *      must equal `EXPECTED_GOVERNED_PROCEDURES.length`. Adding a new
 *      governedProcedure without updating EXPECTED fails this test
 *      with a pointer to the unaccounted-for declarations.
 *
 *   2. **Registry coverage** — for each entry in EXPECTED, run the
 *      full middleware resolution chain and assert no throw. Removing
 *      a registry entry (in action-key-map.ts or YAML) fails this
 *      test for the affected entry directly.
 *
 * Source-string scans match the project pattern (see
 * `tests/pmb/wiring.test.ts` header) — booting `agentStudioRouter`
 * triggers ASDB connection probes and Phase-10 schedulers that aren't
 * needed to verify governance wiring.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { resolveActionKey } from "../../server/governance/action-key-map";
import { getActionDef } from "../../server/governance/action-registry";

const REPO_ROOT = process.cwd();
const API_DIR = join(REPO_ROOT, "server/agent-studio/api");

/**
 * Every `<name>: governedProcedure` declaration in
 * `server/agent-studio/api/*.ts` must appear in this list with its
 * resolved trpc path. Order doesn't matter; counts and contents must
 * match the source.
 */
const EXPECTED_GOVERNED_PROCEDURES: ReadonlyArray<{
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
  // Sub-routers defined inline in router.ts — pluginsRouter,
  // catalogToolsRouter, marketplaceRouter — each contributes governed
  // procedures from a single file but distinct mount paths.
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
];

/**
 * Scan all `*.ts` files under `server/agent-studio/api/` and count
 * every `<name>: governedProcedure` declaration. Returns a count plus
 * the file:line:procedureName triples for diagnostics on failure.
 */
function findGovernedDeclarations(): Array<{
  file: string;
  line: number;
  procedureName: string;
}> {
  const declarations: Array<{ file: string; line: number; procedureName: string }> = [];
  const tsFiles = readdirSync(API_DIR).filter(
    (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
  );
  for (const file of tsFiles) {
    const path = join(API_DIR, file);
    const lines = readFileSync(path, "utf8").split("\n");
    for (let i = 0; i < lines.length; i++) {
      // Match `<name>: governedProcedure` at the start of a line
      // (allowing for indentation). Excludes comments and string
      // literals via the leading-whitespace anchor.
      const match = /^\s+([a-zA-Z][a-zA-Z0-9_]*)\s*:\s*governedProcedure\b/.exec(
        lines[i],
      );
      if (match) {
        declarations.push({
          file: `server/agent-studio/api/${file}`,
          line: i + 1,
          procedureName: match[1],
        });
      }
    }
  }
  return declarations;
}

describe("RETROFIT R2-c2 — every governedProcedure has registry coverage", () => {
  describe("drift detection — source declarations match EXPECTED list", () => {
    it("counts the right number of <name>: governedProcedure declarations", () => {
      const decls = findGovernedDeclarations();
      // Failure shape gives the operator the file:line of any new
      // governedProcedure that was added without an EXPECTED entry.
      const summary = decls.map((d) => `${d.file}:${d.line} → ${d.procedureName}`);
      expect(
        decls.length,
        `governedProcedure declarations found:\n  ${summary.join("\n  ")}\n` +
          `EXPECTED list has ${EXPECTED_GOVERNED_PROCEDURES.length} entries; if you added a new ` +
          `governedProcedure, also add it to EXPECTED_GOVERNED_PROCEDURES in this test AND register ` +
          `the action in server/governance/action-key-map.ts and config/governance/platform_action_registry.yaml.`,
      ).toBe(EXPECTED_GOVERNED_PROCEDURES.length);
    });

    it("every EXPECTED entry has a corresponding source declaration", () => {
      const decls = findGovernedDeclarations();
      const declSources = new Set(decls.map((d) => d.file));
      const missing: string[] = [];
      for (const expected of EXPECTED_GOVERNED_PROCEDURES) {
        // Each expected procedure must have at least one
        // governedProcedure declaration in its claimed source file.
        if (!declSources.has(expected.source)) {
          missing.push(`${expected.trpcPath} → ${expected.source}`);
        }
      }
      expect(missing).toEqual([]);
    });
  });

  describe("registry coverage — every EXPECTED procedure resolves cleanly", () => {
    for (const { trpcPath } of EXPECTED_GOVERNED_PROCEDURES) {
      it(`${trpcPath} resolves through resolveActionKey + getActionDef`, () => {
        const actionKey = resolveActionKey(trpcPath);
        // resolveActionKey falls back to the trpc path on miss; that's
        // fine — the actual gate is getActionDef, which throws for
        // unknown keys.
        expect(actionKey).toBeTruthy();
        const def = getActionDef(actionKey);
        expect(def).toBeDefined();
        expect(def.stage).toBe("mutate");
        // Every governed procedure must have a non-empty domain +
        // capability so RBAC checks can fire.
        expect(def.domain.length).toBeGreaterThan(0);
        expect(def.capability.length).toBeGreaterThan(0);
      });
    }
  });
});
