/**
 * Data Analysis Capsule — Structural invariants.
 *
 * Static checks that exercise the capsule's contract without needing
 * a React renderer or trpc mocks. These are the failure modes a
 * capsule migration is most likely to silently introduce.
 *
 * Mirrors `tests/communication-capsule/structure.test.ts` so the
 * second migrated module is held to the same bar as the pilot.
 *
 * Data Analysis owns the GraphRAG, Data Acquisition, and Data
 * Warehouse subdomains. KGRA Agent is a separate RTLM and is
 * verified to NOT be absorbed.
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
  isBaseRouteMatch,
  normalizePath,
  routePatternMatches,
} from "../../scripts/module-tools/route-parser";
import { extractAppRoutes } from "../../scripts/module-tools/route-inventory";
import { scanFileForBoundaries } from "../../scripts/module-tools/boundary-rules";

const REPO_ROOT = process.cwd();
const DA_DIR = join(REPO_ROOT, "client", "src", "modules", "data-analysis");
const APP_PATH = join(REPO_ROOT, "client", "src", "App.tsx");

describe("Data Analysis capsule files exist", () => {
  it.each([
    "client.ts",
    "manifest.ts",
    "mod.tsx",
    "routes.tsx",
    "nav.ts",
    "index.ts",
    "types.ts",
    "components/DataAnalysisShell.tsx",
  ])("has %s", (rel) => {
    expect(existsSync(join(DA_DIR, rel))).toBe(true);
  });

  it.each([
    "GraphRAGPage.tsx",
    "DataAcquisitionPage.tsx",
    "DataWarehousePage.tsx",
  ])("has page %s", (rel) => {
    expect(existsSync(join(DA_DIR, "pages", rel))).toBe(true);
  });
});

describe("Data Analysis migration state", () => {
  it("is in MIGRATED_MODULES", () => {
    expect(isMigrated("dataAnalysis")).toBe(true);
  });

  it("communication remains migrated (regression guard)", () => {
    expect(isMigrated("communication")).toBe(true);
  });

  it("kgraAgent is NOT migrated (separate RTLM, future PR)", () => {
    expect(isMigrated("kgraAgent")).toBe(false);
  });
});

describe("Data Analysis manifest", () => {
  const snap = readManifestFor(REPO_ROOT, "dataAnalysis", "data-analysis");

  it("declares baseRoute /data-analysis", () => {
    expect(snap.baseRoute).toBe("/data-analysis");
  });
  it("declares a capsuleEntrypoint", () => {
    expect(snap.capsuleEntrypoint).toBeTruthy();
  });
  it("layoutMode is inside-main-layout", () => {
    expect(snap.layoutMode).toBe("inside-main-layout");
  });
  it("routeInventory contains the 14 canonical routes", () => {
    const set = new Set(snap.routeInventory.map(normalizePath));
    expect(set).toEqual(
      new Set([
        "/data-analysis",
        "/data-analysis/graphrag",
        "/data-analysis/data-acquisition",
        "/data-analysis/data-acquisition/sources",
        "/data-analysis/data-acquisition/runs",
        "/data-analysis/data-acquisition/items",
        "/data-analysis/data-acquisition/classification",
        "/data-analysis/data-acquisition/routing",
        "/data-analysis/data-acquisition/processing",
        "/data-analysis/data-acquisition/document-intelligence",
        "/data-analysis/data-acquisition/canonical-records",
        "/data-analysis/data-acquisition/outputs",
        "/data-analysis/data-acquisition/settings",
        "/data-analysis/data-warehouse",
      ]),
    );
  });
  it("declares no compatibility redirects (no legacy paths)", () => {
    expect(snap.compatibilityRoutes).toEqual([]);
  });
  it("manifest.routes is empty (capsule mode)", () => {
    expect(snap.routes).toEqual([]);
  });
  it("does NOT declare /data-analysis/kgra-agent (KGRA is separate RTLM)", () => {
    const inv = new Set(snap.routeInventory.map(normalizePath));
    expect(inv.has("/data-analysis/kgra-agent")).toBe(false);
  });
});

describe("routeInventory ⊆ routes.tsx", () => {
  const snap = readManifestFor(REPO_ROOT, "dataAnalysis", "data-analysis");

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
  const folder = RTLM_FOLDER_MAP.dataAnalysis;

  it("does not lazy-import any private Data Analysis page", () => {
    expect(appSrc).not.toMatch(
      new RegExp(`import\\([^)]*?modules/${folder}/pages/`),
    );
  });

  it("does not lazy-import GraphRAG/DataAcquisition/DataWarehouse from pages/data-analysis", () => {
    // KGRA pages may still be imported (KGRA RTLM is unmigrated).
    // Non-KGRA Data Analysis pages must not appear in App.tsx imports.
    expect(appSrc).not.toMatch(
      /import\([^)]*?@\/pages\/data-analysis\/GraphRAG/,
    );
    expect(appSrc).not.toMatch(
      /import\([^)]*?@\/pages\/data-analysis\/DataAcquisition/,
    );
    expect(appSrc).not.toMatch(
      /import\([^)]*?@\/pages\/data-analysis\/DataWarehouse/,
    );
  });

  it("does not mount any canonical /data-analysis/* route owned by Data Analysis", () => {
    const snap = readManifestFor(REPO_ROOT, "dataAnalysis", "data-analysis");
    const owned = new Set(snap.routeInventory.map(normalizePath));
    const offending = appRoutes.filter((r) => {
      const p = normalizePath(r.path);
      return owned.has(p) && !r.redirectTo;
    });
    expect(offending.map((r) => r.path)).toEqual([]);
  });

  it("preserves the KGRA Agent route (separate RTLM)", () => {
    const has = appRoutes.some(
      (r) => normalizePath(r.path) === "/data-analysis/kgra-agent",
    );
    expect(has).toBe(true);
  });
});

describe("Boundary discipline", () => {
  // Walk every .ts/.tsx in client/src/modules/data-analysis and
  // assert the boundary scanner finds zero violations. This is the
  // same logic check:module-api-boundaries runs, here as a fast
  // unit assertion local to Data Analysis.
  const findings = collectAllBoundaryFindings(DA_DIR);

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

  it("specifically — no trpc.kgraAgent.* call inside the Data Analysis capsule", () => {
    const trpcKgra = findings.filter(
      (f) => f.kind === "cross-module-trpc" && /trpc\.kgraAgent/.test(f.evidence),
    );
    expect(trpcKgra.map((f) => f.file)).toEqual([]);
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
