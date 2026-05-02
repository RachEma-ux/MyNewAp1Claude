/**
 * Code Studio Capsule — Structural invariants.
 *
 * Static checks that exercise the capsule's contract without needing
 * a React renderer or trpc mocks. Mirrors
 * `tests/communication-capsule/structure.test.ts`,
 * `tests/data-analysis-capsule/structure.test.ts`, and
 * `tests/pm-central-capsule/structure.test.ts` so the fourth
 * migrated module is held to the same bar.
 *
 * Code Studio owns the canonical /code-studio/* surface (Dashboard,
 * Jobs incl. detail, Templates, Sessions, Approvals, Repositories,
 * Agents, AI Catalog, Policies, Control Panel, OpenCode Settings,
 * How To). The legacy `/code` Monaco editor route is a SEPARATE
 * non-RTLM page and is not part of the capsule.
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
const CS_DIR = join(REPO_ROOT, "client", "src", "modules", "code-studio");
const APP_PATH = join(REPO_ROOT, "client", "src", "App.tsx");

describe("Code Studio capsule files exist", () => {
  it.each([
    "client.ts",
    "manifest.ts",
    "mod.tsx",
    "routes.tsx",
    "nav.ts",
    "index.ts",
    "types.ts",
    "components/CodeStudioShell.tsx",
    "components/CodeStudioSidebar.tsx",
    "components/OpenCodeSettingsRail.tsx",
  ])("has %s", (rel) => {
    expect(existsSync(join(CS_DIR, rel))).toBe(true);
  });

  it.each([
    "CodeStudioDashboardPage.tsx",
    "CodeStudioJobsPage.tsx",
    "CodeStudioJobDetailPage.tsx",
    "CodeStudioTemplatesPage.tsx",
    "CodeStudioSessionsPage.tsx",
    "CodeStudioApprovalsPage.tsx",
    "CodeStudioReposPage.tsx",
    "CodeStudioAgentsPage.tsx",
    "CodeStudioAICatalogPage.tsx",
    "CodeStudioPoliciesPage.tsx",
    "CodeStudioControlPanelPage.tsx",
    "CodeStudioOpenCodeSettingsPage.tsx",
    "CodeStudioHowToPage.tsx",
  ])("has page %s", (rel) => {
    expect(existsSync(join(CS_DIR, "pages", rel))).toBe(true);
  });
});

describe("Code Studio migration state", () => {
  it("is in MIGRATED_MODULES", () => {
    expect(isMigrated("codeStudio")).toBe(true);
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
  it("agentStudio is NOT migrated (separate RTLM, future PR)", () => {
    expect(isMigrated("agentStudio")).toBe(false);
  });
});

describe("Code Studio manifest", () => {
  const snap = readManifestFor(REPO_ROOT, "codeStudio", "code-studio");

  it("declares baseRoute /code-studio", () => {
    expect(snap.baseRoute).toBe("/code-studio");
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
        "/code-studio",
        "/code-studio/dashboard",
        "/code-studio/jobs",
        "/code-studio/jobs/:id",
        "/code-studio/templates",
        "/code-studio/sessions",
        "/code-studio/approvals",
        "/code-studio/repos",
        "/code-studio/agents",
        "/code-studio/ai-catalog",
        "/code-studio/policies",
        "/code-studio/control-panel",
        "/code-studio/opencode-settings",
        "/code-studio/how-to",
      ]),
    );
  });
  it("manifest.routes is empty (capsule mode)", () => {
    expect(snap.routes).toEqual([]);
  });
  it("declares no compatibility redirects (no path migration)", () => {
    expect(snap.compatibilityRoutes).toEqual([]);
  });
  it("does NOT claim the legacy /code editor route", () => {
    const inv = snap.routeInventory.map(normalizePath);
    expect(inv).not.toContain("/code");
    expect(inv.every((p) => p.startsWith("/code-studio"))).toBe(true);
  });
});

describe("routeInventory ⊆ routes.tsx", () => {
  const snap = readManifestFor(REPO_ROOT, "codeStudio", "code-studio");

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
  const folder = RTLM_FOLDER_MAP.codeStudio;

  it("does not lazy-import any private Code Studio capsule page", () => {
    expect(appSrc).not.toMatch(
      new RegExp(`import\\([^)]*?modules/${folder}/pages/`),
    );
  });

  it("does not lazy-import legacy @/pages/code-studio/ pages", () => {
    expect(appSrc).not.toMatch(/import\([^)]*?@\/pages\/code-studio\//);
  });

  it("does not mount any canonical /code-studio/* route owned by Code Studio", () => {
    const snap = readManifestFor(REPO_ROOT, "codeStudio", "code-studio");
    const owned = new Set(snap.routeInventory.map(normalizePath));
    const offending = appRoutes.filter((r) => {
      const p = normalizePath(r.path);
      return owned.has(p) && !r.redirectTo;
    });
    expect(offending.map((r) => r.path)).toEqual([]);
  });

  it("preserves the legacy /code editor route (non-RTLM, separate)", () => {
    const codeEditor = appRoutes.find(
      (r) => normalizePath(r.path) === "/code",
    );
    expect(codeEditor, "/code editor route missing from App.tsx").toBeDefined();
  });
});

describe("Boundary discipline", () => {
  // Walk every .ts/.tsx in client/src/modules/code-studio and assert
  // the boundary scanner finds zero violations. This is the same
  // logic check:module-api-boundaries runs, here as a fast unit
  // assertion local to Code Studio.
  const findings = collectAllBoundaryFindings(CS_DIR);

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
