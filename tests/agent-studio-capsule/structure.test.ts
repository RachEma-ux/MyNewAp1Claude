/**
 * Agent Studio Capsule — Structural invariants.
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
const AS_DIR = join(REPO_ROOT, "client", "src", "modules", "agent-studio");
const APP_PATH = join(REPO_ROOT, "client", "src", "App.tsx");

describe("Agent Studio capsule files exist", () => {
  it.each([
    "client.ts",
    "manifest.ts",
    "mod.tsx",
    "routes.tsx",
    "nav.ts",
    "index.ts",
    "types.ts",
  ])("has %s", (rel) => {
    expect(existsSync(join(AS_DIR, rel))).toBe(true);
  });

  it.each([
    "AgentStudioHomePage.tsx",
    "AgentStudioNewPage.tsx",
    "AgentOverviewPage.tsx",
    "AgentIdentityPage.tsx",
    "AgentBehaviorPage.tsx",
    "AgentPromptsPage.tsx",
    "AgentToolsPage.tsx",
    "AgentKnowledgePage.tsx",
    "AgentMemoryPage.tsx",
    "AgentWorkflowsPage.tsx",
    "AgentGovernancePage.tsx",
    "AgentSimulationPage.tsx",
    "AgentTestingPage.tsx",
    "AgentRunsPage.tsx",
    "AgentVersionsPage.tsx",
    "AgentPublishPage.tsx",
    "AgentRuntimePage.tsx",
    "AgentHooksPage.tsx",
    "AgentMcpPage.tsx",
    "AgentSubagentsPage.tsx",
    "AgentSkillCatalogPage.tsx",
    "AgentToolCatalogPage.tsx",
    "AgentMarketplacePage.tsx",
    "AgentMcpManagerPage.tsx",
    "AgentChatPage.tsx",
  ])("has page %s", (rel) => {
    expect(existsSync(join(AS_DIR, "pages", rel))).toBe(true);
  });

  it.each([
    "AgentStudioShell.tsx",
    "AgentStudioSidebar.tsx",
    "AgentStudioTopBar.tsx",
    "AgentStudioStatusBar.tsx",
    "AgentStudioOversightDrawer.tsx",
    "AgentStudioChatWindow.tsx",
    "OrchestrationCanvas.tsx",
  ])("has component %s", (rel) => {
    expect(existsSync(join(AS_DIR, "components", rel))).toBe(true);
  });

  it("has the components/ui/ subfolder", () => {
    expect(existsSync(join(AS_DIR, "components", "ui", "index.ts"))).toBe(true);
  });
});

describe("Agent Studio migration state", () => {
  it.each([
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
});

describe("Agent Studio manifest", () => {
  // readManifestFor(repoRoot, RtlmKey camelCase, folder kebab-case)
  const snap = readManifestFor(REPO_ROOT, "agentStudio", "agent-studio");

  it("declares baseRoute /agent-studio", () => {
    expect(snap.baseRoute).toBe("/agent-studio");
  });
  it("declares a capsuleEntrypoint", () => {
    expect(snap.capsuleEntrypoint).toBeTruthy();
  });
  it("layoutMode is inside-main-layout", () => {
    expect(snap.layoutMode).toBe("inside-main-layout");
  });
  it("routeInventory contains the 11 canonical patterns", () => {
    const set = new Set(snap.routeInventory.map(normalizePath));
    expect(set).toEqual(
      new Set([
        "/agent-studio",
        "/agent-studio/new",
        "/agent-studio/templates",
        "/agent-studio/import",
        "/agent-studio/catalog",
        "/agent-studio/catalog/:section",
        "/agent-studio/marketplace",
        "/agent-studio/:agentId",
        "/agent-studio/:agentId/:section",
        "/agent-studio/:agentId/runs/:runId",
        "/agent-studio/:agentId/versions/compare",
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
  const snap = readManifestFor(REPO_ROOT, "agentStudio", "agent-studio");
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
  const folder = RTLM_FOLDER_MAP.agentStudio;

  it("does not lazy-import any private Agent Studio capsule page", () => {
    expect(appSrc).not.toMatch(
      new RegExp(`import\\([^)]*?modules/${folder}/pages/`),
    );
  });

  it("does not lazy-import legacy @/pages/agent-studio/ pages", () => {
    expect(appSrc).not.toMatch(/import\([^)]*?@\/pages\/agent-studio\//);
  });

  it("does not import legacy @/components/agent-studio/ private components", () => {
    expect(appSrc).not.toMatch(
      /from\s+["']@\/components\/agent-studio\//,
    );
    expect(appSrc).not.toMatch(
      /from\s+["']\.\/components\/agent-studio\//,
    );
  });

  it("does not mount any canonical /agent-studio/* route owned by Agent Studio", () => {
    const snap = readManifestFor(REPO_ROOT, "agentStudio", "agent-studio");
    const owned = new Set(snap.routeInventory.map(normalizePath));
    const offending = appRoutes.filter((r) => {
      const p = normalizePath(r.path);
      return owned.has(p) && !r.redirectTo;
    });
    expect(offending.map((r) => r.path)).toEqual([]);
  });
});

describe("Boundary discipline", () => {
  const findings = collectAllBoundaryFindings(AS_DIR);

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
