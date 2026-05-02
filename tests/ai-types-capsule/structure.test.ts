/**
 * AI Types Capsule — Structural invariants.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

import { readManifestFor } from "../../scripts/module-tools/manifest-reader";
import {
  isMigrated,
  RTLM_FOLDER_MAP,
} from "../../scripts/module-tools/migration-state";
import {
  normalizePath,
  routePatternMatches,
} from "../../scripts/module-tools/route-parser";
import { extractAppRoutes } from "../../scripts/module-tools/route-inventory";
import { scanFileForBoundaries } from "../../scripts/module-tools/boundary-rules";

const REPO_ROOT = process.cwd();
const AIT_DIR = join(REPO_ROOT, "client", "src", "modules", "ai-types");
const APP_PATH = join(REPO_ROOT, "client", "src", "App.tsx");

describe("AI Types capsule files exist", () => {
  it.each([
    "client.ts",
    "manifest.ts",
    "mod.tsx",
    "routes.tsx",
    "nav.ts",
    "index.ts",
    "types.ts",
  ])("has %s", (rel) => {
    expect(existsSync(join(AIT_DIR, rel))).toBe(true);
  });

  it.each([
    "AITypesShell.tsx",
    "AITypesOverviewPage.tsx",
    "AITypesPage.tsx",
    "AITypesTaxonomyPage.tsx",
    "AITypesRelationshipsPage.tsx",
    "AITypesValidationPage.tsx",
    "AITypesGovernancePage.tsx",
    "AITypesControlPanelPage.tsx",
  ])("has page %s", (rel) => {
    expect(existsSync(join(AIT_DIR, "pages", rel))).toBe(true);
  });

  it("has AITypesSidebar component", () => {
    expect(
      existsSync(join(AIT_DIR, "components", "AITypesSidebar.tsx")),
    ).toBe(true);
  });
});

describe("AI Types migration state", () => {
  it.each([
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
});

describe("AI Types manifest", () => {
  // readManifestFor(repoRoot, RtlmKey camelCase, folder kebab-case)
  const snap = readManifestFor(REPO_ROOT, "aiTypes", "ai-types");

  it("declares baseRoute /ai-types", () => {
    expect(snap.baseRoute).toBe("/ai-types");
  });
  it("declares a capsuleEntrypoint", () => {
    expect(snap.capsuleEntrypoint).toBeTruthy();
  });
  it("layoutMode is inside-main-layout", () => {
    expect(snap.layoutMode).toBe("inside-main-layout");
  });
  it("routeInventory contains the 13 canonical routes", () => {
    const set = new Set(snap.routeInventory.map(normalizePath));
    expect(set).toEqual(
      new Set([
        "/ai-types",
        "/ai-types/overview",
        "/ai-types/catalog",
        "/ai-types/providers",
        "/ai-types/llms",
        "/ai-types/models",
        "/ai-types/agents",
        "/ai-types/bots",
        "/ai-types/taxonomy",
        "/ai-types/relationships",
        "/ai-types/validation",
        "/ai-types/governance",
        "/ai-types/control-panel",
      ]),
    );
  });
  it("manifest.routes is empty (capsule mode)", () => {
    expect(snap.routes).toEqual([]);
  });
  it("declares no compatibility redirects", () => {
    expect(snap.compatibilityRoutes).toEqual([]);
  });
});

describe("routeInventory ⊆ routes.tsx", () => {
  const snap = readManifestFor(REPO_ROOT, "aiTypes", "ai-types");
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
  const folder = RTLM_FOLDER_MAP.aiTypes;

  it("does not lazy-import any private AI Types capsule page", () => {
    expect(appSrc).not.toMatch(
      new RegExp(`import\\([^)]*?modules/${folder}/pages/`),
    );
  });

  it("does not lazy-import legacy @/pages/ai-types/ pages", () => {
    expect(appSrc).not.toMatch(/import\([^)]*?@\/pages\/ai-types\//);
  });

  it("does not lazy-import legacy @/pages/AITypesPage", () => {
    expect(appSrc).not.toMatch(/import\([^)]*?@\/pages\/AITypesPage/);
  });

  it("does not mount any canonical /ai-types/* route owned by AI Types", () => {
    const snap = readManifestFor(REPO_ROOT, "aiTypes", "ai-types");
    const owned = new Set(snap.routeInventory.map(normalizePath));
    const offending = appRoutes.filter((r) => {
      const p = normalizePath(r.path);
      return owned.has(p) && !r.redirectTo;
    });
    expect(offending.map((r) => r.path)).toEqual([]);
  });
});

describe("Boundary discipline", () => {
  const findings = collectAllBoundaryFindings(AIT_DIR);

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
