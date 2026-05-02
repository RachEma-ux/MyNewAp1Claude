/**
 * Projects System Capsule — Structural invariants.
 *
 * Static checks that exercise the capsule's contract without needing
 * a React renderer or trpc mocks. Mirrors the prior four capsule
 * structure tests (Communication / Data Analysis / PM Central /
 * Code Studio) so the fifth migrated module is held to the same bar.
 *
 * PS owns the canonical /ps/* surface (Catalog default, Ideation
 * with detail + convert deep links, Control Panel, Wizard, List, AI
 * Catalog). PS → PM Central is a backend handoff: the PS frontend
 * never reaches across the PM Central namespace.
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
const PS_DIR = join(REPO_ROOT, "client", "src", "modules", "ps");
const APP_PATH = join(REPO_ROOT, "client", "src", "App.tsx");

describe("Projects System capsule files exist", () => {
  it.each([
    "client.ts",
    "manifest.ts",
    "mod.tsx",
    "routes.tsx",
    "nav.ts",
    "index.ts",
    "types.ts",
    "components/PSShell.tsx",
    "components/PSSidebar.tsx",
  ])("has %s", (rel) => {
    expect(existsSync(join(PS_DIR, rel))).toBe(true);
  });

  it.each([
    "PSCatalogPage.tsx",
    "PSIdeationPage.tsx",
    "PSIdeationDetailPage.tsx",
    "PSIdeationConvertPage.tsx",
    "PSControlPanelPage.tsx",
    "PSWizardPage.tsx",
    "PSListPage.tsx",
    "PSAICatalogPage.tsx",
  ])("has page %s", (rel) => {
    expect(existsSync(join(PS_DIR, "pages", rel))).toBe(true);
  });
});

describe("Projects System migration state", () => {
  it("is in MIGRATED_MODULES", () => {
    expect(isMigrated("ps")).toBe(true);
  });
  it("communication remains migrated", () => {
    expect(isMigrated("communication")).toBe(true);
  });
  it("dataAnalysis remains migrated", () => {
    expect(isMigrated("dataAnalysis")).toBe(true);
  });
  it("pmCentral remains migrated", () => {
    expect(isMigrated("pmCentral")).toBe(true);
  });
  it("codeStudio remains migrated", () => {
    expect(isMigrated("codeStudio")).toBe(true);
  });
  it("prm is migrated (PR #65 — Phase 3.5)", () => {
    expect(isMigrated("prm")).toBe(true);
  });
});

describe("Projects System manifest", () => {
  const snap = readManifestFor(REPO_ROOT, "ps", "ps");

  it("declares baseRoute /ps", () => {
    expect(snap.baseRoute).toBe("/ps");
  });
  it("declares a capsuleEntrypoint", () => {
    expect(snap.capsuleEntrypoint).toBeTruthy();
  });
  it("layoutMode is inside-main-layout", () => {
    expect(snap.layoutMode).toBe("inside-main-layout");
  });
  it("routeInventory contains the 9 canonical routes", () => {
    const set = new Set(snap.routeInventory.map(normalizePath));
    expect(set).toEqual(
      new Set([
        "/ps",
        "/ps/catalog",
        "/ps/ideation",
        "/ps/ideation/:id",
        "/ps/ideation/:id/convert",
        "/ps/control-panel",
        "/ps/wizard",
        "/ps/list",
        "/ps/ai-catalog",
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
  const snap = readManifestFor(REPO_ROOT, "ps", "ps");

  it("every routeInventory path is matched by a routes.tsx pattern", () => {
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
  const folder = RTLM_FOLDER_MAP.ps;

  it("does not lazy-import any private PS capsule page", () => {
    expect(appSrc).not.toMatch(
      new RegExp(`import\\([^)]*?modules/${folder}/pages/`),
    );
  });

  it("does not lazy-import legacy @/pages/projects-system/ pages", () => {
    expect(appSrc).not.toMatch(/import\([^)]*?@\/pages\/projects-system\//);
  });

  it("does not mount any canonical /ps/* route owned by PS", () => {
    const snap = readManifestFor(REPO_ROOT, "ps", "ps");
    const owned = new Set(snap.routeInventory.map(normalizePath));
    const offending = appRoutes.filter((r) => {
      const p = normalizePath(r.path);
      return owned.has(p) && !r.redirectTo;
    });
    expect(offending.map((r) => r.path)).toEqual([]);
  });
});

describe("Boundary discipline", () => {
  // Walk every .ts/.tsx in client/src/modules/ps and assert the
  // boundary scanner finds zero violations. Same logic as
  // check:module-api-boundaries, here as a fast unit assertion local
  // to PS.
  const findings = collectAllBoundaryFindings(PS_DIR);

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

  it("specifically — no trpc.pmCentral.* call inside the PS capsule (PS → PM is a backend handoff)", () => {
    const trpcPm = findings.filter(
      (f) =>
        f.kind === "cross-module-trpc" && /trpc\.pmCentral\b/.test(f.evidence),
    );
    expect(trpcPm.map((f) => f.file)).toEqual([]);
  });

  it("specifically — no trpc.sandboxWf.* call inside the PS capsule (PS chat round-table proxies through ps.chat.*)", () => {
    const trpcSwf = findings.filter(
      (f) =>
        f.kind === "cross-module-trpc" && /trpc\.sandboxWf\b/.test(f.evidence),
    );
    expect(trpcSwf.map((f) => f.file)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */

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
