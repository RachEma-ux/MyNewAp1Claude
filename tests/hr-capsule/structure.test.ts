/**
 * HR Capsule — Structural invariants.
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
const HR_DIR = join(REPO_ROOT, "client", "src", "modules", "hr");
const APP_PATH = join(REPO_ROOT, "client", "src", "App.tsx");

describe("HR capsule files exist", () => {
  it.each([
    "client.ts",
    "manifest.ts",
    "mod.tsx",
    "routes.tsx",
    "nav.ts",
    "index.ts",
    "types.ts",
    "components/HrGate.tsx",
  ])("has %s", (rel) => {
    expect(existsSync(join(HR_DIR, rel))).toBe(true);
  });

  it.each([
    "HRHomePage.tsx",
    "HRSectionLandingPage.tsx",
    "HRDirectoryPage.tsx",
    "HROrganizationPage.tsx",
    "HRPositionsPage.tsx",
    "HRStaffingPage.tsx",
    "HRSkillsPage.tsx",
    "HRReportsPage.tsx",
    "HRSettingsPage.tsx",
    "HRRecruitmentPage.tsx",
    "HROnboardingPage.tsx",
    "HROffboardingPage.tsx",
    "HRTimesheetPage.tsx",
    "HRLeavePage.tsx",
    "HROvertimePage.tsx",
    "HRShiftPlanningPage.tsx",
    "HRTrainingPage.tsx",
    "HRCertificationsPage.tsx",
    "HRGoalsPage.tsx",
    "HRPerformanceReviewsPage.tsx",
    "HRCompensationPage.tsx",
    "HRBenefitsPage.tsx",
    "HRPoliciesPage.tsx",
    "HRGrievancesPage.tsx",
    "HRSurveysPage.tsx",
    "HREngagementPage.tsx",
    "HRIncidentsPage.tsx",
    "HRComplianceMgmtPage.tsx",
    "HRAnalyticsDashboardPage.tsx",
    "HRTalentPage.tsx",
    "HRJobArchitecturePage.tsx",
    "HRWorkPermitsPage.tsx",
    "HRLettersCertificatesPage.tsx",
    "HRRiskManagementPage.tsx",
    "HRAuditLogsPage.tsx",
    "HRAccessControlsPage.tsx",
    "HRRoleDefinitionsPage.tsx",
    "HRRoleDefinitionDetailPage.tsx",
    "HRRoleDefinitionEditPage.tsx",
    "HRRoleDefinitionReviewPage.tsx",
    "HRRoleDefinitionComparePage.tsx",
  ])("has page %s", (rel) => {
    expect(existsSync(join(HR_DIR, "pages", rel))).toBe(true);
  });
});

describe("HR migration state", () => {
  it.each([
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

describe("HR manifest", () => {
  const snap = readManifestFor(REPO_ROOT, "hr", "hr");

  it("declares baseRoute /hr", () => {
    expect(snap.baseRoute).toBe("/hr");
  });
  it("declares a capsuleEntrypoint", () => {
    expect(snap.capsuleEntrypoint).toBeTruthy();
  });
  it("layoutMode is inside-main-layout", () => {
    expect(snap.layoutMode).toBe("inside-main-layout");
  });
  it("routeInventory contains the 54 canonical routes", () => {
    expect(snap.routeInventory.length).toBe(54);
    const set = new Set(snap.routeInventory.map(normalizePath));
    expect(set.has("/hr")).toBe(true);
    expect(set.has("/hr/role-definitions/:id")).toBe(true);
    expect(set.has("/hr/role-definitions/:id/edit")).toBe(true);
    expect(set.has("/hr/security-access/audit-logs")).toBe(true);
  });
  it("manifest.routes is empty (capsule mode)", () => {
    expect(snap.routes).toEqual([]);
  });
  it("declares no compatibility redirects", () => {
    expect(snap.compatibilityRoutes).toEqual([]);
  });
});

describe("routeInventory ⊆ routes.tsx", () => {
  const snap = readManifestFor(REPO_ROOT, "hr", "hr");
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
  const folder = RTLM_FOLDER_MAP.hr;

  it("does not lazy-import any private HR capsule page", () => {
    expect(appSrc).not.toMatch(
      new RegExp(`import\\([^)]*?modules/${folder}/pages/`),
    );
  });

  it("does not lazy-import legacy @/pages/hr/ pages", () => {
    expect(appSrc).not.toMatch(/import\([^)]*?@\/pages\/hr\//);
  });

  it("does not retain the inlined HrGate / hrGated helpers", () => {
    expect(appSrc).not.toMatch(/function hrGated\b/);
    expect(appSrc).not.toMatch(/function HrGate\b/);
  });

  it("does not mount any canonical /hr/* route owned by HR", () => {
    const snap = readManifestFor(REPO_ROOT, "hr", "hr");
    const owned = new Set(snap.routeInventory.map(normalizePath));
    const offending = appRoutes.filter((r) => {
      const p = normalizePath(r.path);
      return owned.has(p) && !r.redirectTo;
    });
    expect(offending.map((r) => r.path)).toEqual([]);
  });
});

describe("Boundary discipline", () => {
  const findings = collectAllBoundaryFindings(HR_DIR);

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
