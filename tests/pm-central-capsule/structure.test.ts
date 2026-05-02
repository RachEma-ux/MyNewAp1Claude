/**
 * PM Central Capsule — Structural invariants.
 *
 * Static checks that exercise the capsule's contract without needing
 * a React renderer or trpc mocks. Mirrors
 * `tests/communication-capsule/structure.test.ts` and
 * `tests/data-analysis-capsule/structure.test.ts` so the third
 * migrated module is held to the same bar.
 *
 * PM Central owns the canonical /pm/* surface (Dashboard, Projects,
 * Tasks, Milestones, Risks, Issues, Decisions, Handoffs, Settings).
 * Projects System (`ps`) remains separate — PS → PM is a backend
 * handoff, not a frontend reach-around.
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
const PM_DIR = join(REPO_ROOT, "client", "src", "modules", "pm-central");
const APP_PATH = join(REPO_ROOT, "client", "src", "App.tsx");

describe("PM Central capsule files exist", () => {
  it.each([
    "client.ts",
    "manifest.ts",
    "mod.tsx",
    "routes.tsx",
    "nav.ts",
    "index.ts",
    "types.ts",
    "components/PMCentralShell.tsx",
  ])("has %s", (rel) => {
    expect(existsSync(join(PM_DIR, rel))).toBe(true);
  });

  it.each([
    "PMCentralDashboardPage.tsx",
    "PMProjectsPage.tsx",
    "PMProjectDetailPage.tsx",
    "PMTasksPage.tsx",
    "PMMilestonesPage.tsx",
    "PMRisksPage.tsx",
    "PMIssuesPage.tsx",
    "PMDecisionsPage.tsx",
    "PMHandoffsPage.tsx",
    "PMSettingsPage.tsx",
  ])("has page %s", (rel) => {
    expect(existsSync(join(PM_DIR, "pages", rel))).toBe(true);
  });
});

describe("PM Central migration state", () => {
  it("is in MIGRATED_MODULES", () => {
    expect(isMigrated("pmCentral")).toBe(true);
  });
  it("communication remains migrated", () => {
    expect(isMigrated("communication")).toBe(true);
  });
  it("dataAnalysis remains migrated", () => {
    expect(isMigrated("dataAnalysis")).toBe(true);
  });
  it("ps is migrated (PR #63 — Phase 3.4) — PS → PM Central remains a backend handoff", () => {
    expect(isMigrated("ps")).toBe(true);
  });
});

describe("PM Central manifest", () => {
  const snap = readManifestFor(REPO_ROOT, "pmCentral", "pm-central");

  it("declares baseRoute /pm", () => {
    expect(snap.baseRoute).toBe("/pm");
  });
  it("declares a capsuleEntrypoint", () => {
    expect(snap.capsuleEntrypoint).toBeTruthy();
  });
  it("layoutMode is inside-main-layout", () => {
    expect(snap.layoutMode).toBe("inside-main-layout");
  });
  it("routeInventory contains the 10 canonical routes", () => {
    const set = new Set(snap.routeInventory.map(normalizePath));
    expect(set).toEqual(
      new Set([
        "/pm",
        "/pm/projects",
        "/pm/projects/:id",
        "/pm/tasks",
        "/pm/milestones",
        "/pm/risks",
        "/pm/issues",
        "/pm/decisions",
        "/pm/handoffs",
        "/pm/settings",
      ]),
    );
  });
  it("declares the 9 /pm-central/rtlm compatibility redirects", () => {
    const fromTo = snap.compatibilityRoutes
      .map((c) => `${c.from}=>${c.to}`)
      .sort();
    expect(fromTo).toEqual(
      [
        "/pm-central/rtlm=>/pm",
        "/pm-central/rtlm/projects=>/pm/projects",
        "/pm-central/rtlm/tasks=>/pm/tasks",
        "/pm-central/rtlm/milestones=>/pm/milestones",
        "/pm-central/rtlm/risks=>/pm/risks",
        "/pm-central/rtlm/issues=>/pm/issues",
        "/pm-central/rtlm/decisions=>/pm/decisions",
        "/pm-central/rtlm/handoffs=>/pm/handoffs",
        "/pm-central/rtlm/settings=>/pm/settings",
      ].sort(),
    );
  });
  it("manifest.routes is empty (capsule mode)", () => {
    expect(snap.routes).toEqual([]);
  });
  it("does NOT declare any /pm-central/* shell paths as canonical", () => {
    // PM Central RTLM canonical lives at /pm/*. The legacy
    // /pm-central/* shell is a separate non-RTLM surface and must
    // not appear in routeInventory.
    const inv = snap.routeInventory.map(normalizePath);
    const shellMatches = inv.filter(
      (p) => p.startsWith("/pm-central/") && !p.startsWith("/pm-central/rtlm"),
    );
    expect(shellMatches).toEqual([]);
  });
});

describe("routeInventory ⊆ routes.tsx", () => {
  const snap = readManifestFor(REPO_ROOT, "pmCentral", "pm-central");

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
  const folder = RTLM_FOLDER_MAP.pmCentral;

  it("does not lazy-import any private PM Central capsule page", () => {
    expect(appSrc).not.toMatch(
      new RegExp(`import\\([^)]*?modules/${folder}/pages/`),
    );
  });

  it("does not mount any canonical /pm/* route owned by PM Central", () => {
    const snap = readManifestFor(REPO_ROOT, "pmCentral", "pm-central");
    const owned = new Set(snap.routeInventory.map(normalizePath));
    const offending = appRoutes.filter((r) => {
      const p = normalizePath(r.path);
      return owned.has(p) && !r.redirectTo;
    });
    expect(offending.map((r) => r.path)).toEqual([]);
  });

  it("keeps the 9 /pm-central/rtlm/* compatibility redirects", () => {
    const redirects = appRoutes.filter((r) => r.redirectTo);
    const rtlmPrefixed = redirects.filter((r) =>
      normalizePath(r.path).startsWith("/pm-central/rtlm"),
    );
    expect(rtlmPrefixed.length).toBeGreaterThanOrEqual(9);
  });
});

describe("Boundary discipline", () => {
  // Walk every .ts/.tsx in client/src/modules/pm-central and assert
  // the boundary scanner finds zero violations. This is the same
  // logic check:module-api-boundaries runs, here as a fast unit
  // assertion local to PM Central.
  const findings = collectAllBoundaryFindings(PM_DIR);

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

  it("specifically — no trpc.ps.* call inside the PM Central capsule (PS → PM is a backend handoff)", () => {
    const trpcPs = findings.filter(
      (f) => f.kind === "cross-module-trpc" && /trpc\.ps\b/.test(f.evidence),
    );
    expect(trpcPs.map((f) => f.file)).toEqual([]);
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
