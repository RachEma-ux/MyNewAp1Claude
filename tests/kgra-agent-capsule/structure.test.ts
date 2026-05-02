/**
 * KGRA Agent Capsule — Structural invariants.
 *
 * KGRA Agent is the fifteenth and final migrated module. This suite
 * also pins the "all 15 RTLMs migrated" invariant — once it ships,
 * the migration sequence is complete.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

import { readManifestFor } from "../../scripts/module-tools/manifest-reader";
import {
  isMigrated,
  RTLM_FOLDER_MAP,
  RTLM_LIST,
  MIGRATED_MODULES,
} from "../../scripts/module-tools/migration-state";
import {
  normalizePath,
  routePatternMatches,
} from "../../scripts/module-tools/route-parser";
import { extractAppRoutes } from "../../scripts/module-tools/route-inventory";
import { scanFileForBoundaries } from "../../scripts/module-tools/boundary-rules";

const REPO_ROOT = process.cwd();
const KGRA_DIR = join(REPO_ROOT, "client", "src", "modules", "kgra-agent");
const APP_PATH = join(REPO_ROOT, "client", "src", "App.tsx");

describe("KGRA Agent capsule files exist", () => {
  it.each([
    "client.ts",
    "manifest.ts",
    "mod.tsx",
    "routes.tsx",
    "nav.ts",
    "index.ts",
    "types.ts",
  ])("has %s", (rel) => {
    expect(existsSync(join(KGRA_DIR, rel))).toBe(true);
  });

  it.each([
    "KGRAAgentPage.tsx",
    "KGRAQueryLab.tsx",
  ])("has page %s", (rel) => {
    expect(existsSync(join(KGRA_DIR, "pages", rel))).toBe(true);
  });
});

describe("KGRA Agent migration state", () => {
  it.each([
    "kgraAgent",
    "sandboxWf",
    "agentStudio",
    "openRouter",
    "aiTypes",
    "cultureValues",
    "organizationManagement",
    "hr",
    "psm",
    "prm",
    "communication",
    "dataAnalysis",
    "pmCentral",
    "codeStudio",
    "ps",
  ])("%s is migrated", (k) => {
    expect(isMigrated(k)).toBe(true);
  });

  it("MIGRATED_MODULES covers ALL 15 RTLMs (migration sequence complete)", () => {
    expect(MIGRATED_MODULES.length).toBe(RTLM_LIST.length);
    expect(MIGRATED_MODULES.length).toBe(15);
    for (const key of RTLM_LIST) {
      expect(isMigrated(key), `${key} should be migrated`).toBe(true);
    }
  });
});

describe("KGRA Agent manifest", () => {
  // readManifestFor(repoRoot, RtlmKey camelCase, folder kebab-case)
  const snap = readManifestFor(REPO_ROOT, "kgraAgent", "kgra-agent");

  it("declares baseRoute /data-analysis/kgra-agent", () => {
    expect(snap.baseRoute).toBe("/data-analysis/kgra-agent");
  });
  it("declares a capsuleEntrypoint", () => {
    expect(snap.capsuleEntrypoint).toBeTruthy();
  });
  it("layoutMode is inside-main-layout", () => {
    expect(snap.layoutMode).toBe("inside-main-layout");
  });
  it("routeInventory contains the canonical /data-analysis/kgra-agent path", () => {
    const set = new Set(snap.routeInventory.map(normalizePath));
    expect(set).toEqual(new Set(["/data-analysis/kgra-agent"]));
  });
  it("manifest.routes is empty (capsule mode)", () => {
    expect(snap.routes).toEqual([]);
  });
  it("declares no compatibility redirects", () => {
    expect(snap.compatibilityRoutes).toEqual([]);
  });
});

describe("routeInventory ⊆ routes.tsx", () => {
  const snap = readManifestFor(REPO_ROOT, "kgraAgent", "kgra-agent");
  it("every routeInventory path matches a routes.tsx pattern", () => {
    for (const inv of snap.routeInventory) {
      const matched = snap.routesFileEntries.some((p) =>
        routePatternMatches(p, inv),
      );
      expect(matched, `routeInventory ${inv} not matched in routes.tsx`).toBe(
        true,
      );
    }
  });
});

describe("App.tsx ownership", () => {
  const appSrc = readFileSync(APP_PATH, "utf8");
  const appRoutes = extractAppRoutes(appSrc);
  const folder = RTLM_FOLDER_MAP.kgraAgent;

  it("does not lazy-import any private KGRA Agent capsule page", () => {
    expect(appSrc).not.toMatch(
      new RegExp(`import\\([^)]*?modules/${folder}/pages/`),
    );
  });

  it("does not lazy-import legacy @/pages/data-analysis/KGRAAgentPage", () => {
    expect(appSrc).not.toMatch(
      /import\([^)]*?(?:@\/pages|\.\/pages)\/data-analysis\/KGRAAgentPage/,
    );
  });

  it("does not mount the canonical /data-analysis/kgra-agent route owned by KGRA Agent", () => {
    const snap = readManifestFor(REPO_ROOT, "kgraAgent", "kgra-agent");
    const owned = new Set(snap.routeInventory.map(normalizePath));
    const offending = appRoutes.filter((r) => {
      const p = normalizePath(r.path);
      return owned.has(p) && !r.redirectTo;
    });
    expect(offending.map((r) => r.path)).toEqual([]);
  });
});

describe("Boundary discipline", () => {
  const findings = collectAllBoundaryFindings(KGRA_DIR);

  it("no MainLayout import inside the capsule", () => {
    const main = findings.filter((f) => f.kind === "main-layout-import");
    expect(main.map((f) => f.file)).toEqual([]);
  });
  it("no cross-module trpc.<other>.* call inside the capsule", () => {
    const trpc = findings.filter((f) => f.kind === "cross-module-trpc");
    expect(trpc.map((f) => `${f.file}: ${f.evidence}`)).toEqual([]);
  });
  it("no private cross-module imports out of the capsule", () => {
    const priv = findings.filter((f) => f.kind === "private-import");
    expect(priv.map((f) => `${f.file}: ${f.evidence}`)).toEqual([]);
  });
});

function collectAllBoundaryFindings(root: string) {
  const out: ReturnType<typeof scanFileForBoundaries> = [];
  walk(root);
  return out;

  function walk(dir: string) {
    for (const e of readdirSync(dir)) {
      const full = join(dir, e);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else if (e.endsWith(".ts") || e.endsWith(".tsx")) {
        const rel = full.slice(REPO_ROOT.length + 1);
        const src = readFileSync(full, "utf8");
        out.push(...scanFileForBoundaries(rel, src));
      }
    }
  }
}
