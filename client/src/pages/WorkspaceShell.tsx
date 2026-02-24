/**
 * WorkspaceShell — IBM-style workspace execution container
 *
 * Layout: Top App Bar | Collapsible Sidebar | Main Content | Oversight Drawer | Status Bar
 * Routes workspace-scoped module pages under /w/:workspaceId/*.
 * Dynamically shows/hides modules based on workspace_modules bindings.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useParams, Route, Switch, Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Loader2, Pin, PinOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  FolderKanban,
  BookOpen,
  Bot,
  MessageSquare,
  BarChart3,
  ShieldCheck,
} from "lucide-react";

import { WorkspaceSidebar } from "@/components/workspace/WorkspaceSidebar";
import { WorkspaceStatusBar } from "@/components/workspace/WorkspaceStatusBar";
import { OversightDrawer } from "@/components/workspace/OversightDrawer";
import { ModuleDisabled } from "@/components/workspace/ModuleDisabled";

import { PMTProjectsPage } from "./workspace/PMTProjectsPage";
import { PMTKanbanPage } from "./workspace/PMTKanbanPage";
import { PMTTimelinePage } from "./workspace/PMTTimelinePage";
import { PMTProjectDetailPage } from "./workspace/PMTProjectDetailPage";
import { KnowledgeDocsPage } from "./workspace/KnowledgeDocsPage";
import { KnowledgeDecisionsPage } from "./workspace/KnowledgeDecisionsPage";
import { KnowledgeSearchPage } from "./workspace/KnowledgeSearchPage";
import { AgentsRosterPage } from "./workspace/AgentsRosterPage";
import { AgentRunsPage } from "./workspace/AgentRunsPage";
import { AgentRunDetailPage } from "./workspace/AgentRunDetailPage";
import { CollabThreadsPage } from "./workspace/CollabThreadsPage";
import { ReportingDashboardPage } from "./workspace/ReportingDashboardPage";
import { GovernancePage } from "./workspace/GovernancePage";

const moduleIcons: Record<string, React.ReactNode> = {
  pmt: <FolderKanban className="h-5 w-5" />,
  knowledge: <BookOpen className="h-5 w-5" />,
  agents: <Bot className="h-5 w-5" />,
  collaboration: <MessageSquare className="h-5 w-5" />,
  reporting: <BarChart3 className="h-5 w-5" />,
};

export default function WorkspaceShell() {
  const params = useParams<{ workspaceId: string; rest?: string }>();
  const workspaceId = parseInt(params.workspaceId || "0", 10);
  const [location, navigate] = useLocation();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [oversightOpen, setOversightOpen] = useState(false);
  const [pinned, setPinned] = useState(false);

  // Drag state for floating window
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (pinned) return;
    dragging.current = true;
    dragOffset.current = { x: e.clientX - position.x, y: e.clientY - position.y };
    e.preventDefault();
  }, [pinned, position]);

  useEffect(() => {
    if (pinned) return;
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      setPosition({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
    };
    const onMouseUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [pinned]);

  const { data: workspace, isLoading: wsLoading } = trpc.workspaces.get.useQuery(
    { id: workspaceId },
    { enabled: workspaceId > 0 }
  );

  const { data: modules, isLoading: modsLoading } = trpc.modules.manage.list.useQuery(
    { workspaceId },
    { enabled: workspaceId > 0, retry: 2 }
  );

  // Loading state — only block on workspace, not modules
  if (wsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Workspace not found
  if (!workspace) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-2">
          <p className="text-destructive text-lg font-medium">Workspace not found</p>
          <Link href="/workspaces">
            <Button variant="outline">Back to Workspaces</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Always show all sidebar items; ModuleGate handles disabled content
  const ALL_MODULE_KEYS = ["pmt", "knowledge", "agents", "collaboration", "reporting"];
  const enabledModules = (modules && (modules as any[]).length > 0)
    ? new Set((modules as any[]).filter((m: any) => m.enabled).map((m: any) => m.moduleKey))
    : new Set(ALL_MODULE_KEYS);
  const enabledCount = enabledModules.size;
  const basePath = `/w/${workspaceId}`;

  /** Module gate — renders ModuleDisabled if module is not enabled */
  function ModuleGate({
    moduleKey,
    moduleName,
    children,
  }: {
    moduleKey: string;
    moduleName: string;
    children: React.ReactNode;
  }) {
    if (!enabledModules.has(moduleKey)) {
      return <ModuleDisabled moduleName={moduleName} workspaceId={workspaceId} />;
    }
    return <>{children}</>;
  }

  const navItems = [
    { key: "pmt", label: "Projects", icon: moduleIcons.pmt, path: `${basePath}/projects` },
    { key: "knowledge", label: "Knowledge", icon: moduleIcons.knowledge, path: `${basePath}/knowledge` },
    { key: "agents", label: "Agents", icon: moduleIcons.agents, path: `${basePath}/agents` },
    { key: "collaboration", label: "Collab", icon: moduleIcons.collaboration, path: `${basePath}/collaboration` },
    { key: "reporting", label: "Reports", icon: moduleIcons.reporting, path: `${basePath}/reports` },
  ];

  const shellContent = (
    <>
      {/* ─── Main Body: Sidebar + Content ─── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Collapsible Sidebar */}
        <WorkspaceSidebar
          workspaceId={workspaceId}
          workspaceName={workspace.name}
          enabledModules={enabledModules}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          onOversightOpen={() => setOversightOpen(true)}
        />

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto">
          <Switch>
            {/* ─── PMT Engine ─── */}
            <Route path={`${basePath}/projects/board`}>
              <ModuleGate moduleKey="pmt" moduleName="Project Management">
                <PMTKanbanPage workspaceId={workspaceId} />
              </ModuleGate>
            </Route>
            <Route path={`${basePath}/projects/timeline`}>
              <ModuleGate moduleKey="pmt" moduleName="Project Management">
                <PMTTimelinePage workspaceId={workspaceId} />
              </ModuleGate>
            </Route>
            <Route path={`${basePath}/projects/:projectId`}>
              <ModuleGate moduleKey="pmt" moduleName="Project Management">
                <PMTProjectDetailPage workspaceId={workspaceId} />
              </ModuleGate>
            </Route>
            <Route path={`${basePath}/projects`}>
              <ModuleGate moduleKey="pmt" moduleName="Project Management">
                <PMTProjectsPage workspaceId={workspaceId} />
              </ModuleGate>
            </Route>

            {/* ─── Knowledge Engine ─── */}
            <Route path={`${basePath}/knowledge/decisions`}>
              <ModuleGate moduleKey="knowledge" moduleName="Knowledge">
                <KnowledgeDecisionsPage workspaceId={workspaceId} />
              </ModuleGate>
            </Route>
            <Route path={`${basePath}/knowledge/search`}>
              <ModuleGate moduleKey="knowledge" moduleName="Knowledge">
                <KnowledgeSearchPage workspaceId={workspaceId} />
              </ModuleGate>
            </Route>
            <Route path={`${basePath}/knowledge`}>
              <ModuleGate moduleKey="knowledge" moduleName="Knowledge">
                <KnowledgeDocsPage workspaceId={workspaceId} />
              </ModuleGate>
            </Route>

            {/* ─── Agent Orchestration ─── */}
            <Route path={`${basePath}/agents/runs/:runId`}>
              <ModuleGate moduleKey="agents" moduleName="Agent Orchestration">
                <AgentRunDetailPage workspaceId={workspaceId} />
              </ModuleGate>
            </Route>
            <Route path={`${basePath}/agents/runs`}>
              <ModuleGate moduleKey="agents" moduleName="Agent Orchestration">
                <AgentRunsPage workspaceId={workspaceId} />
              </ModuleGate>
            </Route>
            <Route path={`${basePath}/agents`}>
              <ModuleGate moduleKey="agents" moduleName="Agent Orchestration">
                <AgentsRosterPage workspaceId={workspaceId} />
              </ModuleGate>
            </Route>

            {/* ─── Collaboration ─── */}
            <Route path={`${basePath}/collaboration`}>
              <ModuleGate moduleKey="collaboration" moduleName="Collaboration">
                <CollabThreadsPage workspaceId={workspaceId} />
              </ModuleGate>
            </Route>

            {/* ─── Reporting ─── */}
            <Route path={`${basePath}/reports`}>
              <ModuleGate moduleKey="reporting" moduleName="Reporting">
                <ReportingDashboardPage workspaceId={workspaceId} />
              </ModuleGate>
            </Route>

            {/* ─── Governance ─── */}
            <Route path={`${basePath}/governance`}>
              <GovernancePage workspaceId={workspaceId} />
            </Route>

            {/* ─── Overview (default) ─── */}
            <Route>
              <WorkspaceOverview
                workspaceId={workspaceId}
                enabledModules={enabledModules}
                basePath={basePath}
                navItems={navItems}
              />
            </Route>
          </Switch>
        </main>
      </div>

      {/* ─── Bottom Status Bar ─── */}
      <WorkspaceStatusBar
        workspaceId={workspaceId}
        enabledModuleCount={enabledCount}
        onOversightOpen={() => setOversightOpen(true)}
      />

      {/* ─── Oversight Drawer ─── */}
      <OversightDrawer
        open={oversightOpen}
        onOpenChange={setOversightOpen}
        workspaceId={workspaceId}
      />
    </>
  );

  // ─── Pinned: docked in content area ───
  if (pinned) {
    return (
      <div className="flex flex-col h-full relative">
        <button
          onClick={() => { setPinned(false); setPosition({ x: 0, y: 0 }); }}
          className="absolute top-2 right-2 z-10 p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Unpin (float)"
        >
          <PinOff className="h-4 w-4" />
        </button>
        {shellContent}
      </div>
    );
  }

  // ─── Unpinned: floating draggable window ───
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
      <div
        className="pointer-events-auto flex flex-col rounded-lg border border-border bg-background shadow-2xl"
        style={{
          width: "90vw",
          height: "85vh",
          transform: `translate(${position.x}px, ${position.y}px)`,
        }}
      >
        {/* ─── Draggable Title Bar ─── */}
        <div
          className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50 rounded-t-lg cursor-grab active:cursor-grabbing select-none shrink-0"
          onMouseDown={onMouseDown}
        >
          <span className="text-sm font-medium truncate">{workspace.name}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPinned(true)}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Pin (dock)"
            >
              <Pin className="h-4 w-4" />
            </button>
            <button
              onClick={() => navigate("/workspaces")}
              className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ─── Shell Content ─── */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {shellContent}
        </div>
      </div>
    </div>
  );
}

/** Overview page — module cards with real summary data */
function WorkspaceOverview({
  workspaceId,
  enabledModules,
  basePath,
  navItems,
}: {
  workspaceId: number;
  enabledModules: Set<string>;
  basePath: string;
  navItems: { key: string; label: string; icon: React.ReactNode; path: string }[];
}) {
  const { data: summary } = trpc.modules.reporting.summary.useQuery(
    { workspaceId },
    { retry: false }
  );

  const summaryData: Record<string, string> = {
    pmt: `${summary?.projects ?? 0} projects, ${summary?.tasks ?? 0} tasks`,
    knowledge: `${summary?.documents ?? 0} documents`,
    agents: `${summary?.agents ?? 0} runs`,
    collaboration: `${summary?.threads ?? 0} threads`,
    reporting: "View dashboard",
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Workspace Overview</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {enabledModules.size} modules enabled
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {navItems
          .filter((item) => enabledModules.has(item.key))
          .map((item) => (
            <Link key={item.key} href={item.path}>
              <Card className="cursor-pointer hover:border-primary/50 transition-colors h-full">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    {item.icon}
                    {item.label}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {summaryData[item.key] || `Open ${item.label.toLowerCase()}`}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
      </div>

      {/* Governance card (always visible) */}
      <Link href={`${basePath}/governance`}>
        <Card className="cursor-pointer hover:border-primary/50 transition-colors max-w-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Governance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              View governance status, action registry, and health checks
            </p>
          </CardContent>
        </Card>
      </Link>

      {enabledModules.size === 0 && (
        <div className="text-center py-8">
          <p className="text-muted-foreground">
            No modules enabled. Configure modules in workspace settings.
          </p>
        </div>
      )}
    </div>
  );
}
