/**
 * Source-scan integrity test for the Bases lifecycle-maturity slice
 * (closes audit item 21 — "Full Bases capability — Partially
 * implemented"). Before this PR the router exposed create/list/
 * getSnapshot/update for bases, createColumn/listColumns for columns,
 * and createRow/updateRow/listRows/deleteRow for rows — but no
 * column update/delete and no explicit archive/unarchive verbs.
 *
 * Guards against:
 *   - The 4 new procedures being silently removed.
 *   - The service-layer functions being severed from the public-api.
 *   - The new verbs reverting to "update with archivedAt" instead of
 *     dedicated endpoints.
 *   - `BaseColumnNotFoundError` propagation getting dropped.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve, join } from "path";

const REPO_ROOT = resolve(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

describe("Bases lifecycle maturity slice", () => {
  const serviceSrc = read("server/agent-studio/services/bases/bases-service.ts");
  const routerSrc = read("server/agent-studio/services/bases/bases-router.ts");
  const publicSrc = read("server/agent-studio/services/bases/public-api.ts");

  describe("service-layer functions", () => {
    it("exports updateBaseColumn(columnId, patch)", () => {
      expect(/export\s+async\s+function\s+updateBaseColumn\(/.test(serviceSrc)).toBe(
        true,
      );
    });

    it("exports deleteBaseColumn(columnId)", () => {
      expect(/export\s+async\s+function\s+deleteBaseColumn\(columnId:\s*number\)/.test(serviceSrc)).toBe(
        true,
      );
    });

    it("exports archiveBase(baseId) — idempotent verb", () => {
      expect(/export\s+async\s+function\s+archiveBase\(baseId:\s*number\)/.test(serviceSrc)).toBe(
        true,
      );
      // Idempotence: already-archived rows return current state without bumping.
      expect(/archivedAt\s*!=\s*null\)\s*return\s+existing\[0\]/.test(serviceSrc)).toBe(
        true,
      );
    });

    it("exports unarchiveBase(baseId) — idempotent verb", () => {
      expect(/export\s+async\s+function\s+unarchiveBase\(baseId:\s*number\)/.test(serviceSrc)).toBe(
        true,
      );
      // Idempotence: already-unarchived rows return current state.
      expect(/archivedAt\s*==\s*null\)\s*return\s+existing\[0\]/.test(serviceSrc)).toBe(
        true,
      );
    });

    it("updateBaseColumn refuses dataType + key mutations (immutability invariant)", () => {
      // The UpdateBaseColumnInput interface MUST NOT include dataType / key.
      expect(/interface\s+UpdateBaseColumnInput[\s\S]+?readonly\s+name\?:[\s\S]+?readonly\s+config\?:[\s\S]+?readonly\s+sortKey\?:[\s\S]+?\}/.test(serviceSrc)).toBe(
        true,
      );
      expect(/UpdateBaseColumnInput[\s\S]+?dataType/.test(serviceSrc)).toBe(false);
      expect(/UpdateBaseColumnInput[\s\S]+?readonly\s+key/.test(serviceSrc)).toBe(false);
    });

    it("deleteBaseColumn hard-deletes (DELETE) rather than soft-marks", () => {
      expect(/db\.delete\(agsBaseColumns\)\.where\(eq\(agsBaseColumns\.id,\s*columnId\)\)/.test(serviceSrc)).toBe(
        true,
      );
    });

    it("archiveBase fires base.updated projection (not a new kind)", () => {
      expect(/fireBaseProjection\(updated,\s*"base\.updated"\)/.test(serviceSrc)).toBe(
        true,
      );
    });
  });

  describe("tRPC router procedures", () => {
    it("exposes updateColumn as a mutation", () => {
      expect(/updateColumn:\s*protectedProcedure[\s\S]+?\.mutation/.test(routerSrc)).toBe(
        true,
      );
    });

    it("exposes deleteColumn returning { columnId, deleted: true }", () => {
      expect(/deleteColumn:\s*protectedProcedure[\s\S]+?\.mutation/.test(routerSrc)).toBe(
        true,
      );
      expect(/columnId:\s*input\.columnId,\s*deleted:\s*true\s+as\s+const/.test(routerSrc)).toBe(
        true,
      );
    });

    it("exposes archiveBase / unarchiveBase as mutations", () => {
      expect(/archiveBase:\s*protectedProcedure[\s\S]+?\.mutation/.test(routerSrc)).toBe(
        true,
      );
      expect(/unarchiveBase:\s*protectedProcedure[\s\S]+?\.mutation/.test(routerSrc)).toBe(
        true,
      );
    });

    it("translates BaseColumnNotFoundError to TRPCError NOT_FOUND", () => {
      expect(
        /BaseColumnNotFoundError[\s\S]+?TRPCError\(\{\s*code:\s*"NOT_FOUND"/.test(
          routerSrc,
        ),
      ).toBe(true);
    });

    it("translates BaseNotFoundError to TRPCError NOT_FOUND for archive verbs", () => {
      // Tightened: both archive/unarchive blocks must surface NOT_FOUND on missing base.
      const archiveBlock = routerSrc.match(
        /archiveBase:\s*protectedProcedure[\s\S]+?unarchiveBase:/,
      );
      expect(archiveBlock).not.toBeNull();
      if (archiveBlock) {
        expect(/BaseNotFoundError[\s\S]+?NOT_FOUND/.test(archiveBlock[0])).toBe(true);
      }
      const unarchiveBlock = routerSrc.match(
        /unarchiveBase:\s*protectedProcedure[\s\S]+?\}\),\s*\}\);/,
      );
      expect(unarchiveBlock).not.toBeNull();
      if (unarchiveBlock) {
        expect(/BaseNotFoundError[\s\S]+?NOT_FOUND/.test(unarchiveBlock[0])).toBe(
          true,
        );
      }
    });
  });

  describe("public-api barrel", () => {
    it("re-exports the 4 new functions + UpdateBaseColumnInput type", () => {
      expect(/archiveBase/.test(publicSrc)).toBe(true);
      expect(/unarchiveBase/.test(publicSrc)).toBe(true);
      expect(/updateBaseColumn/.test(publicSrc)).toBe(true);
      expect(/deleteBaseColumn/.test(publicSrc)).toBe(true);
      expect(/UpdateBaseColumnInput/.test(publicSrc)).toBe(true);
    });
  });

  describe("preserved invariants", () => {
    it("create / list / update / getSnapshot procedures still present", () => {
      expect(/create:\s*protectedProcedure/.test(routerSrc)).toBe(true);
      expect(/list:\s*protectedProcedure/.test(routerSrc)).toBe(true);
      expect(/update:\s*protectedProcedure/.test(routerSrc)).toBe(true);
      expect(/getSnapshot:\s*protectedProcedure/.test(routerSrc)).toBe(true);
    });

    it("createColumn / createRow / updateRow / deleteRow procedures preserved", () => {
      expect(/createColumn:\s*protectedProcedure/.test(routerSrc)).toBe(true);
      expect(/createRow:\s*protectedProcedure/.test(routerSrc)).toBe(true);
      expect(/updateRow:\s*protectedProcedure/.test(routerSrc)).toBe(true);
      expect(/deleteRow:\s*protectedProcedure/.test(routerSrc)).toBe(true);
    });
  });
});
