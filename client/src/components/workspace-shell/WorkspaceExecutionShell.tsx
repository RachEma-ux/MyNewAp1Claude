/**
 * WorkspaceExecutionShell — The primary workspace runtime shell
 *
 * Layout:
 *   WorkspaceShellHeader (top)
 *   WorkspaceToolsToolbar (horizontal tools bar)
 *   [WorkspaceContextSidebar (left, always open on desktop) | Main Content Area]
 *   WorkspaceManagerControls (right drawer, manager-only)
 *
 * CRITICAL: No blocking spinner. Shell structure renders immediately.
 * Context sidebar is always-open on desktop to answer "what is this?" first.
 */

import { useState, useEffect } from "react";
import { useParams, Route, Switch, Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

import { WorkspaceShellHeader } from "./WorkspaceShellHeader";
import { WorkspaceContextSidebar } from "./WorkspaceContextSidebar";
import { WorkspaceToolsToolbar } from "./WorkspaceToolsToolbar";
import { WorkspaceMainFrame } from "./WorkspaceMainFrame";
import { WorkspaceManagerControls } from "./WorkspaceManagerControls";
import type { ShellViewData } from "./types";

// Module page imports — reuse existing workspace module pages
import { ModuleDisabled } from "@/components/workspace/ModuleDisabled";
import { PMTProjectsPage } from "@/pages/workspace/PMTProjectsPage";
import { PMTKanbanPage } from "@/pages/workspace/PMTKanbanPage";
import { PMTTimelinePage } from "@/pages/workspace/PMTTimelinePage";
import { PMTProjectDetailPage } from "@/pages/workspace/PMTProjectDetailPage";
import { PMTTablePage } from "@/pages/workspace/PMTTablePage";
import { PMTGanttPage } from "@/pages/workspace/PMTGanttPage";
import { PMTCalendarPage } from "@/pages/workspace/PMTCalendarPage";
import { PMTRoadmapPage } from "@/pages/workspace/PMTRoadmapPage";
import { PMTTypesConfigPage } from "@/pages/workspace/PMTTypesConfigPage";
import { PMTStatusConfigPage } from "@/pages/workspace/PMTStatusConfigPage";
import { PMTWorkflowConfigPage } from "@/pages/workspace/PMTWorkflowConfigPage";
import { PMTCustomFieldsPage } from "@/pages/workspace/PMTCustomFieldsPage";
import { PMTProjectSettingsPage } from "@/pages/workspace/PMTProjectSettingsPage";
import { PMTBacklogPage } from "@/pages/workspace/PMTBacklogPage";
import { PMTSprintBoardPage } from "@/pages/workspace/PMTSprintBoardPage";
import { PMTBurndownChart } from "@/pages/workspace/PMTBurndownChart";
import { PMTVelocityChart } from "@/pages/workspace/PMTVelocityChart";
import { PMTMeetingsPage } from "@/pages/workspace/PMTMeetingsPage";
import { PMTMeetingDetailPage } from "@/pages/workspace/PMTMeetingDetailPage";
import { PMTDiscussionsPage } from "@/pages/workspace/PMTDiscussionsPage";
import { PMTDiscussionDetailPage } from "@/pages/workspace/PMTDiscussionDetailPage";
import { PMTNewsPage } from "@/pages/workspace/PMTNewsPage";
import { PMTTeamPlannerPage } from "@/pages/workspace/PMTTeamPlannerPage";
import { PMTWikiPage } from "@/pages/workspace/PMTWikiPage";
import { PMTReportingPage } from "@/pages/workspace/PMTReportingPage";
import { PMTTimeReportPage } from "@/pages/workspace/PMTTimeReportPage";
import { PMTCostReportPage } from "@/pages/workspace/PMTCostReportPage";
import { PMTBudgetPage } from "@/pages/workspace/PMTBudgetPage";
import { PMTPortfolioPage } from "@/pages/workspace/PMTPortfolioPage";
import { PMTProjectHomePage } from "@/pages/workspace/PMTProjectHomePage";
import { PMTGitReferencesPage } from "@/pages/workspace/PMTGitReferencesPage";
import { PMTWebhooksPage } from "@/pages/workspace/PMTWebhooksPage";
import { PMTCustomActionsPage } from "@/pages/workspace/PMTCustomActionsPage";
import { PMTNotificationsPage } from "@/pages/workspace/PMTNotificationsPage";
import { PMTAIServicesPage } from "@/pages/workspace/PMTAIServicesPage";
import { KnowledgeDocsPage } from "@/pages/workspace/KnowledgeDocsPage";
import { KnowledgeDecisionsPage } from "@/pages/workspace/KnowledgeDecisionsPage";
import { KnowledgeSearchPage } from "@/pages/workspace/KnowledgeSearchPage";
import { AgentsRosterPage } from "@/pages/workspace/AgentsRosterPage";
import { AgentRunsPage } from "@/pages/workspace/AgentRunsPage";
import { AgentRunDetailPage } from "@/pages/workspace/AgentRunDetailPage";
import { CollabThreadsPage } from "@/pages/workspace/CollabThreadsPage";
import { ReportingDashboardPage } from "@/pages/workspace/ReportingDashboardPage";
import { GovernancePage } from "@/pages/workspace/GovernancePage";
import { WSTeamPage } from "@/pages/workspace/WSTeamPage";
import { WSCrewPage } from "@/pages/workspace/WSCrewPage";
import { WSRulesPage } from "@/pages/workspace/WSRulesPage";

/** Fallback shell data while loading — renders skeleton context immediately */
function makeLoadingShell(workspaceId: number): ShellViewData {
  return {
    workspaceId,
    workspaceName: "Loading...",
    workspaceDescription: null,
    workspaceType: null,
    purposeType: null,
    purposeRef: null,
    status: "active",
    participantRole: null,
    isManager: false,
    isAdmin: false,
    sidebar: {
      showIdentity: true, showPurpose: true, showMission: true,
      showCurrentWork: true, showActivityLog: true, showAlerts: true,
      showQuickActions: true, showGuide: true, showHealth: true,
    },
    toolbar: { visibleItems: [], priorityItems: [] },
    quickActions: [],
    alertsEnabled: false,
    missionEmphasis: null,
    managerControls: { showConfiguration: false, showVisibilityLayer: false },
    enabledModules: [],
    capabilities: [],
    teamCount: 0,
    crewCount: 0,
  };
}

export default function WorkspaceExecutionShell() {
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = parseInt(params.workspaceId || "0", 10);
  const [location, navigate] = useLocation();

  // Sidebar ALWAYS starts open on desktop — context-first
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [managerDrawerOpen, setManagerDrawerOpen] = useState(false);

  // Fetch the resolved shell view from backend — NON-BLOCKING
  const {
    data: shellView,
    isLoading,
    error,
  } = trpc.workspaces.shell.view.useQuery(
    { workspaceId },
    { enabled: workspaceId > 0, staleTime: 30000 }
  );

  // Close sidebar on mobile only
  useEffect(() => {
    if (window.innerWidth < 768) setSidebarOpen(false);
    const onResize = () => {
      if (window.innerWidth < 768) setSidebarOpen(false);
      else setSidebarOpen(true);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Use real data or loading skeleton — NEVER block rendering
  const shell: ShellViewData = (shellView as ShellViewData) || makeLoadingShell(workspaceId);
  const basePath = `/w/${workspaceId}`;
  const enabledModules = new Set(shell.enabledModules);

  // Hard error — workspace genuinely not found (after loading finishes)
  if (!isLoading && !shellView) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-2">
          <p className="text-destructive text-lg font-medium">Workspace not found</p>
          <p className="text-sm text-muted-foreground">
            {error ? "Access denied or workspace does not exist." : "Unable to load workspace."}
          </p>
          <Link href="/workspaces">
            <Button variant="outline">Back to Workspaces</Button>
          </Link>
        </div>
      </div>
    );
  }

  function ModuleGate({ moduleKey, moduleName, children }: {
    moduleKey: string; moduleName: string; children: React.ReactNode;
  }) {
    if (!enabledModules.has(moduleKey)) {
      return <ModuleDisabled moduleName={moduleName} workspaceId={workspaceId} />;
    }
    return <>{children}</>;
  }

  return (
    <div className="-m-6 flex flex-col" style={{ height: "calc(100vh - 4rem)" }}>
      {/* ─── Shell Header ─── */}
      <WorkspaceShellHeader
        workspaceName={shell.workspaceName}
        workspaceType={shell.workspaceType}
        status={shell.status}
        isManager={shell.isManager}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onManagerOpen={() => setManagerDrawerOpen(true)}
        basePath={basePath}
      />

      {/* ─── Tools Toolbar (horizontal, visually distinct, labeled) ─── */}
      <WorkspaceToolsToolbar shell={shell} basePath={basePath} />

      {/* ─── Body: Context Sidebar + Main Content ─── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Context Sidebar (left) — ALWAYS VISIBLE on desktop */}
        <WorkspaceContextSidebar
          shell={shell}
          isLoading={isLoading}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* Main Execution Area */}
        <main className="flex-1 overflow-auto bg-background">
          <Switch>
            {/* ─── PMT Engine ─── */}
            <Route path={`${basePath}/projects/board`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTKanbanPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/table`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTTablePage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/timeline`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTTimelinePage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/gantt`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTGanttPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/calendar`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTCalendarPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/roadmap`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTRoadmapPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/config/types`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTTypesConfigPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/config/statuses`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTStatusConfigPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/config/workflows`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTWorkflowConfigPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/config/fields`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTCustomFieldsPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/settings`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTProjectSettingsPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/backlog`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTBacklogPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/sprint-board`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTSprintBoardPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/burndown`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTBurndownChart workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/velocity`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTVelocityChart workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/team-planner`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTTeamPlannerPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/meetings/:meetingId`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTMeetingDetailPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/meetings`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTMeetingsPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/discussions/:discussionId`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTDiscussionDetailPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/discussions`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTDiscussionsPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/news`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTNewsPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/wiki`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTWikiPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/reporting`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTReportingPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/time-report`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTTimeReportPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/cost-report`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTCostReportPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/budgets`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTBudgetPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/portfolio`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTPortfolioPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/project-home`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTProjectHomePage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/git-references`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTGitReferencesPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/webhooks`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTWebhooksPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/custom-actions`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTCustomActionsPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/notifications`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTNotificationsPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/ai-services`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTAIServicesPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects/:projectId`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTProjectDetailPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/projects`}><ModuleGate moduleKey="pmt" moduleName="Project Management"><PMTProjectsPage workspaceId={workspaceId} /></ModuleGate></Route>

            {/* ─── Knowledge ─── */}
            <Route path={`${basePath}/knowledge/decisions`}><ModuleGate moduleKey="knowledge" moduleName="Knowledge"><KnowledgeDecisionsPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/knowledge/search`}><ModuleGate moduleKey="knowledge" moduleName="Knowledge"><KnowledgeSearchPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/knowledge`}><ModuleGate moduleKey="knowledge" moduleName="Knowledge"><KnowledgeDocsPage workspaceId={workspaceId} /></ModuleGate></Route>

            {/* ─── Agents ─── */}
            <Route path={`${basePath}/agents/runs/:runId`}><ModuleGate moduleKey="agents" moduleName="Agent Orchestration"><AgentRunDetailPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/agents/runs`}><ModuleGate moduleKey="agents" moduleName="Agent Orchestration"><AgentRunsPage workspaceId={workspaceId} /></ModuleGate></Route>
            <Route path={`${basePath}/agents`}><ModuleGate moduleKey="agents" moduleName="Agent Orchestration"><AgentsRosterPage workspaceId={workspaceId} /></ModuleGate></Route>

            {/* ─── Collaboration ─── */}
            <Route path={`${basePath}/collaboration`}><ModuleGate moduleKey="collaboration" moduleName="Collaboration"><CollabThreadsPage workspaceId={workspaceId} /></ModuleGate></Route>

            {/* ─── Reporting ─── */}
            <Route path={`${basePath}/reports`}><ModuleGate moduleKey="reporting" moduleName="Reporting"><ReportingDashboardPage workspaceId={workspaceId} /></ModuleGate></Route>

            {/* ─── Team / Crew / Rules ─── */}
            <Route path={`${basePath}/team`}><WSTeamPage /></Route>
            <Route path={`${basePath}/crew`}><WSCrewPage /></Route>
            <Route path={`${basePath}/rules`}><WSRulesPage /></Route>

            {/* ─── Governance ─── */}
            <Route path={`${basePath}/governance`}><GovernancePage workspaceId={workspaceId} /></Route>

            {/* ─── Default: Mission-driven landing ─── */}
            <Route><WorkspaceMainFrame shell={shell} basePath={basePath} /></Route>
          </Switch>
        </main>
      </div>

      {/* ─── Manager Controls Drawer (right) ─── */}
      <WorkspaceManagerControls
        shell={shell}
        open={managerDrawerOpen}
        onOpenChange={setManagerDrawerOpen}
        basePath={basePath}
      />
    </div>
  );
}
