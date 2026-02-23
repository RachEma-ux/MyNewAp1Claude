/**
 * Probe: Contract Route Integrity
 *
 * Validates:
 * - /hq/* has exactly 8 pages
 * - /governance/* has 7 sidebar items + 1 detail view = 8 conceptual pages
 * - No stale /digital-hq or /governance-center references (except redirects)
 * - Sidebar links match routes exactly
 * - Legacy redirects exist
 */

import * as fs from "fs";
import * as path from "path";
import type { ProbeResult, Finding } from "../index";

const HQ_SLUGS = ["org-authority", "roles", "workspaces", "agents", "discover", "notifications", "risk-baselines", "collaboration"];
const GOV_SLUGS = ["overview", "scorecards", "controls", "packs", "freezes", "drift", "coverage"];

export function probeContractRoutes(rootDir: string): ProbeResult {
  const findings: Finding[] = [];

  // 1. Check DigitalHQPage switch cases
  const hqPagePath = path.join(rootDir, "client/src/pages/DigitalHQPage.tsx");
  if (fs.existsSync(hqPagePath)) {
    const hqContent = fs.readFileSync(hqPagePath, "utf-8");
    for (const slug of HQ_SLUGS) {
      if (!hqContent.includes(`case "${slug}"`)) {
        findings.push({
          severity: "critical",
          title: `Missing HQ page: ${slug}`,
          file: "client/src/pages/DigitalHQPage.tsx",
          line: 0,
          detail: `Switch case for "${slug}" not found in DigitalHQPage`,
        });
      }
    }
    if (!hqContent.includes('useRoute("/hq/:item")')) {
      findings.push({
        severity: "critical",
        title: "HQ route pattern wrong",
        file: "client/src/pages/DigitalHQPage.tsx",
        line: 0,
        detail: 'useRoute must use "/hq/:item"',
      });
    }
  } else {
    findings.push({
      severity: "critical",
      title: "DigitalHQPage.tsx missing",
      file: "client/src/pages/DigitalHQPage.tsx",
      line: 0,
      detail: "File does not exist",
    });
  }

  // 2. Check GovernanceCenterPage switch cases
  const govPagePath = path.join(rootDir, "client/src/pages/GovernanceCenterPage.tsx");
  if (fs.existsSync(govPagePath)) {
    const govContent = fs.readFileSync(govPagePath, "utf-8");
    for (const slug of GOV_SLUGS) {
      if (!govContent.includes(`case "${slug}"`)) {
        findings.push({
          severity: "critical",
          title: `Missing Governance page: ${slug}`,
          file: "client/src/pages/GovernanceCenterPage.tsx",
          line: 0,
          detail: `Switch case for "${slug}" not found in GovernanceCenterPage`,
        });
      }
    }
    if (!govContent.includes('useRoute("/governance/:item")')) {
      findings.push({
        severity: "critical",
        title: "Governance route pattern wrong",
        file: "client/src/pages/GovernanceCenterPage.tsx",
        line: 0,
        detail: 'useRoute must use "/governance/:item"',
      });
    }
  } else {
    findings.push({
      severity: "critical",
      title: "GovernanceCenterPage.tsx missing",
      file: "client/src/pages/GovernanceCenterPage.tsx",
      line: 0,
      detail: "File does not exist",
    });
  }

  // 3. Check panel files exist
  const hqPanelDir = path.join(rootDir, "client/src/pages/hq");
  const hqPanels = ["OrgAuthorityPanel", "RolesMembershipPanel", "WorkspaceDirectoryPanel",
    "AgentOrchestrationPanel", "DiscoverabilityPanel", "NotificationsPanel",
    "RiskBaselinesPanel", "CollaborationIntelPanel"];
  for (const panel of hqPanels) {
    if (!fs.existsSync(path.join(hqPanelDir, `${panel}.tsx`))) {
      findings.push({
        severity: "critical",
        title: `Missing HQ panel: ${panel}.tsx`,
        file: `client/src/pages/hq/${panel}.tsx`,
        line: 0,
        detail: "Panel component file does not exist",
      });
    }
  }

  const govPanelDir = path.join(rootDir, "client/src/pages/governance");
  const govPanels = ["GovernanceOverviewPanel", "ScorecardsExplorerPanel", "ControlsCatalogPanel",
    "PacksRunnersPanel", "FreezesPanel", "DriftMonitoringPanel", "CoverageMapPanel"];
  for (const panel of govPanels) {
    if (!fs.existsSync(path.join(govPanelDir, `${panel}.tsx`))) {
      findings.push({
        severity: "critical",
        title: `Missing Governance panel: ${panel}.tsx`,
        file: `client/src/pages/governance/${panel}.tsx`,
        line: 0,
        detail: "Panel component file does not exist",
      });
    }
  }

  // 4. Check stale references
  const clientDir = path.join(rootDir, "client/src");
  const staleRefs = scanForStaleRefs(clientDir);
  for (const ref of staleRefs) {
    findings.push({
      severity: "high",
      title: `Stale namespace reference: ${ref.pattern}`,
      file: ref.file,
      line: ref.line,
      detail: `Found "${ref.pattern}" — should use /hq/ or /governance/ namespace`,
    });
  }

  // 5. Check legacy redirects in App.tsx
  const appPath = path.join(rootDir, "client/src/App.tsx");
  if (fs.existsSync(appPath)) {
    const appContent = fs.readFileSync(appPath, "utf-8");
    if (!appContent.includes('/digital-hq/:item')) {
      findings.push({
        severity: "medium",
        title: "Missing legacy redirect for /digital-hq",
        file: "client/src/App.tsx",
        line: 0,
        detail: "Legacy redirect from /digital-hq/:item to /hq/:item not found",
      });
    }
    if (!appContent.includes('/governance-center/:item')) {
      findings.push({
        severity: "medium",
        title: "Missing legacy redirect for /governance-center",
        file: "client/src/App.tsx",
        line: 0,
        detail: "Legacy redirect from /governance-center/:item to /governance/:item not found",
      });
    }
  }

  // 6. Check sidebar links in MainLayout
  const layoutPath = path.join(rootDir, "client/src/components/MainLayout.tsx");
  if (fs.existsSync(layoutPath)) {
    const layoutContent = fs.readFileSync(layoutPath, "utf-8");
    for (const slug of HQ_SLUGS) {
      if (!layoutContent.includes(`/hq/${slug}`)) {
        findings.push({
          severity: "high",
          title: `Missing sidebar link: /hq/${slug}`,
          file: "client/src/components/MainLayout.tsx",
          line: 0,
          detail: `Sidebar must have link to /hq/${slug}`,
        });
      }
    }
    for (const slug of GOV_SLUGS) {
      if (!layoutContent.includes(`/governance/${slug}`)) {
        findings.push({
          severity: "high",
          title: `Missing sidebar link: /governance/${slug}`,
          file: "client/src/components/MainLayout.tsx",
          line: 0,
          detail: `Sidebar must have link to /governance/${slug}`,
        });
      }
    }
  }

  const status = findings.some((f) => f.severity === "critical") ? "FAIL" : findings.length > 0 ? "WARN" : "PASS";

  return {
    probeId: "P01",
    probeName: "Contract Route Integrity",
    status,
    findings,
    summary: `${HQ_SLUGS.length} HQ pages, ${GOV_SLUGS.length} governance pages, ${findings.length} finding(s)`,
  };
}

function scanForStaleRefs(dir: string): Array<{ file: string; line: number; pattern: string }> {
  const results: Array<{ file: string; line: number; pattern: string }> = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") {
      results.push(...scanForStaleRefs(fullPath));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      const content = fs.readFileSync(fullPath, "utf-8");
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        // Skip redirect lines
        if (lines[i].includes("Redirect to=")) continue;
        if (lines[i].includes('<Route path="/digital-hq')) continue;
        if (lines[i].includes('<Route path="/governance-center')) continue;
        if (/\/digital-hq\//.test(lines[i])) {
          results.push({ file: path.relative(process.cwd(), fullPath), line: i + 1, pattern: "/digital-hq/" });
        }
        if (/\/governance-center\//.test(lines[i])) {
          results.push({ file: path.relative(process.cwd(), fullPath), line: i + 1, pattern: "/governance-center/" });
        }
      }
    }
  }
  return results;
}
