/**
 * AI Work Console — Shell
 *
 * Layout: IBM-style 3-panel enterprise console, cloned from the
 * Code Studio Double IBM Shell pattern.
 *
 *   ┌─────────┬──────────────┬────────────────────┬─────────┐
 *   │   S1    │  Left Rail   │  Center Workspace  │  Right  │
 *   │ Sidebar │  Task+Ctrls  │  Tabs: Plan/Live/  │  Gov    │
 *   │  (nav)  │  + History   │  Diffs/Results/... │  Rail   │
 *   └─────────┴──────────────┴────────────────────┴─────────┘
 *
 * Routes this shell handles (URL parser is self-contained):
 *   /work-console                            → Home view
 *   /work-console/new                        → Home + form focused
 *   /work-console/:id                        → Detail, default tab (plan)
 *   /work-console/:id/plan|live|diffs|...    → Detail, specific tab
 *
 * Polling:
 *   - Jobs list: handled inside WorkConsoleLeftRail + WorkConsoleHomePage
 *   - Active job: single `getJob` query here at the shell level with
 *     2s refetch, shared down to the Center tabs and Right rail via
 *     props. Matches the existing RunConsolePage polling cadence.
 *
 * Reuses only `trpc.orchestrator.*` — no new backend.
 */
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import WorkConsoleSidebar, { type WorkConsoleView } from "./WorkConsoleSidebar";
import WorkConsoleLeftRail from "./WorkConsoleLeftRail";
import WorkConsoleGovernanceRail from "./WorkConsoleGovernanceRail";
import WorkConsoleHomePage from "@/pages/work-console/WorkConsoleHomePage";
import WorkConsoleDetailPage from "@/pages/work-console/WorkConsoleDetailPage";

// Valid tabs — kept in sync with WorkConsoleCenterTabs
const VALID_TABS = new Set([
  "plan",
  "live",
  "diffs",
  "results",
  "logs",
  "audit",
]);

interface ParsedRoute {
  view: WorkConsoleView;
  jobId: string | null;
  tab: string;
}

function parseRoute(path: string): ParsedRoute {
  // /work-console               → home
  // /work-console/              → home
  // /work-console/new           → new
  // /work-console/:id           → detail, tab=plan
  // /work-console/:id/:tab      → detail, tab=<tab>
  if (path === "/work-console" || path === "/work-console/") {
    return { view: "home", jobId: null, tab: "plan" };
  }
  if (path === "/work-console/new") {
    return { view: "new", jobId: null, tab: "plan" };
  }
  const m = path.match(/^\/work-console\/([^/]+)(?:\/([a-z]+))?/);
  if (!m) {
    return { view: "home", jobId: null, tab: "plan" };
  }
  const jobId = decodeURIComponent(m[1]);
  const rawTab = m[2] || "plan";
  const tab = VALID_TABS.has(rawTab) ? rawTab : "plan";
  return { view: "detail", jobId, tab };
}

export default function WorkConsoleShell() {
  const [location, navigate] = useLocation();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const parsed = useMemo(() => parseRoute(location), [location]);
  const { view, jobId, tab } = parsed;

  // ── Polling the active job ──────────────────────────────────────────
  // 2s refetch matches RunConsolePage's existing cadence. React Query
  // dedupes this query across any component that reads the same key,
  // so both center tabs and right rail share one poll.
  const jobQuery = trpc.orchestrator.getJob.useQuery(
    { jobId: jobId ?? "" },
    {
      enabled: jobId !== null,
      refetchInterval: jobId ? 2000 : false,
    }
  );
  const job = jobQuery.data ?? null;

  const handleNavigate = (key: WorkConsoleView) => {
    if (key === "home") navigate("/work-console");
    else if (key === "new") navigate("/work-console/new");
    else if (key === "history") navigate("/work-console");
    else if (key === "detail" && jobId)
      navigate(`/work-console/${encodeURIComponent(jobId)}`);
  };

  const handleJobSelected = (_id: string) => {
    // The left rail handles its own navigation; we just let the URL
    // change flow through useLocation and re-parse.
  };

  const handleTabChange = (newTab: string) => {
    if (!jobId) return;
    navigate(
      `/work-console/${encodeURIComponent(jobId)}/${newTab}`
    );
  };

  return (
    <>
      {/* S1 — Module sidebar */}
      <WorkConsoleSidebar
        active={view}
        onNavigate={handleNavigate}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Left rail — Task & Controls (always visible except in home-only
          minimal mode; for v1 always visible on every view) */}
      <WorkConsoleLeftRail
        activeJobId={jobId}
        onJobSelected={handleJobSelected}
      />

      {/* Center workspace — Home or Detail */}
      {view === "detail" && jobId ? (
        <WorkConsoleDetailPage
          jobId={jobId}
          job={job}
          activeTab={tab}
          onTabChange={handleTabChange}
        />
      ) : (
        <WorkConsoleHomePage />
      )}

      {/* Right rail — Governance (always visible) */}
      <WorkConsoleGovernanceRail jobId={jobId} job={job} />
    </>
  );
}
