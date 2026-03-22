/**
 * Project Workspace Shell Template
 *
 * Inherits from: GenericWorkspaceShellTemplate
 * Anchor: Objective (deliverable)
 *
 * This shell provides a multi-user project execution environment with
 * PMT, knowledge, agents, collaboration, and reporting modules.
 *
 * Structural elements inherited from Generic Template are MANDATORY.
 * Only the CONFIG OVERRIDES section differs from the canonical blueprint.
 */

import { useState } from "react";
import { useParams, Route, Switch, Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Loader2, Pin, PinOff, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  LayoutDashboard,
  Settings,
  ChevronLeft,
  ChevronRight,
  Home,
  Shield,
  Activity,
  CheckCircle2,
  XCircle,
  FolderKanban,
  BookOpen,
  Bot,
  MessageCircle,
  BarChart3,
  Zap,
  Rocket,
  Target,
} from "lucide-react";

// ============================================================================
// CONFIG OVERRIDES — Project Workspace specialization
// ============================================================================

/** Module keys — project execution modules */
const MODULE_KEYS = [
  "overview",
  "pmt",
  "knowledge",
  "agents",
  "collaboration",
  "reporting",
  "automation",
  "deployments",
  "settings",
] as const;
type ModuleKey = (typeof MODULE_KEYS)[number];

/** Module icon map */
const MODULE_ICONS: Record<string, React.ReactNode> = {
  overview: <LayoutDashboard className="h-4 w-4" />,
  pmt: <FolderKanban className="h-4 w-4" />,
  knowledge: <BookOpen className="h-4 w-4" />,
  agents: <Bot className="h-4 w-4" />,
  collaboration: <MessageCircle className="h-4 w-4" />,
  reporting: <BarChart3 className="h-4 w-4" />,
  automation: <Zap className="h-4 w-4" />,
  deployments: <Rocket className="h-4 w-4" />,
  settings: <Settings className="h-4 w-4" />,
};

/** Module labels */
const MODULE_LABELS: Record<string, string> = {
  overview: "Overview",
  pmt: "Projects",
  knowledge: "Knowledge",
  agents: "Agents",
  collaboration: "Collaboration",
  reporting: "Reports",
  automation: "Automation",
  deployments: "Deployments",
  settings: "Settings",
};

/** Route base path prefix */
const ROUTE_PREFIX = "/project";

/** Default enabled modules */
const DEFAULT_MODULES: ModuleKey[] = [
  "overview",
  "pmt",
  "knowledge",
  "agents",
  "collaboration",
  "reporting",
  "settings",
];

/** Always-enabled modules */
const ALWAYS_ON_MODULES: ModuleKey[] = ["overview", "settings"];

/** Entity display name */
const ENTITY_LABEL = "Project Workspace";

// ============================================================================
// END CONFIG OVERRIDES
// ============================================================================

// ── Types ──

interface NavEntry {
  key: string;
  label: string;
  icon: React.ReactNode;
  path: string;
  always?: boolean;
  children?: { label: string; path: string }[];
}

interface ModuleGateProps {
  moduleKey: string;
  moduleName: string;
  children: React.ReactNode;
}

// ── Sidebar ──

interface SidebarProps {
  entityId: number;
  entityName: string;
  enabledModules: Set<string>;
  collapsed: boolean;
  onToggle: () => void;
  onOversightOpen: () => void;
  navEntries: NavEntry[];
  basePath: string;
}

function ProjectSidebar({
  entityId,
  entityName,
  enabledModules,
  collapsed,
  onToggle,
  onOversightOpen,
  navEntries,
  basePath,
}: SidebarProps) {
  const [location] = useLocation();
  const handleNav = () => { if (!collapsed) onToggle(); };
  const visible = navEntries.filter((e) => e.always || enabledModules.has(e.key));
  const isActive = (path: string) => {
    if (path === basePath) return location === basePath;
    return location.startsWith(path);
  };

  return (
    <aside className={cn("flex flex-col border-r bg-card transition-all duration-200 shrink-0", collapsed ? "w-12" : "w-60")}>
      <div className="flex items-center gap-2 border-b px-3 h-12">
        {!collapsed && (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Target className="h-4 w-4 shrink-0 text-orange-400" />
            <span className="text-sm font-semibold truncate">{entityName}</span>
          </div>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onToggle}>
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>
      <div className="px-2 pt-2 pb-1">
        <Link href="/">
          <button onClick={handleNav} className={cn("flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors", collapsed && "justify-center px-0")}>
            <Home className="h-4 w-4" />
            {!collapsed && <span>All Workspaces</span>}
          </button>
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto py-2 space-y-0.5">
        {visible.map((entry) => {
          const active = isActive(entry.path);
          const item = (
            <Link key={entry.key} href={entry.path}>
              <button onClick={handleNav} className={cn("flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded-md transition-colors", active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground", collapsed && "justify-center px-0")}>
                {entry.icon}
                {!collapsed && <span className="truncate">{entry.label}</span>}
              </button>
            </Link>
          );
          if (collapsed) {
            return (
              <Tooltip key={entry.key}>
                <TooltipTrigger asChild>{item}</TooltipTrigger>
                <TooltipContent side="right">{entry.label}</TooltipContent>
              </Tooltip>
            );
          }
          return (
            <div key={entry.key}>
              {item}
              {entry.children && active && !collapsed && (
                <div className="ml-6 mt-0.5 space-y-0.5">
                  {entry.children.map((child) => (
                    <Link key={child.path} href={child.path}>
                      <button onClick={handleNav} className={cn("flex items-center w-full px-2 py-1 text-xs rounded-md transition-colors", location === child.path ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground")}>
                        {child.label}
                      </button>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      <div className="border-t p-2 space-y-0.5">
        <button onClick={onOversightOpen} className={cn("flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors", collapsed && "justify-center px-0")}>
          <Shield className="h-4 w-4" />
          {!collapsed && <span>Oversight</span>}
        </button>
        <Link href={`${basePath}/settings`}>
          <button className={cn("flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors", collapsed && "justify-center px-0")}>
            <Settings className="h-4 w-4" />
            {!collapsed && <span>Settings</span>}
          </button>
        </Link>
      </div>
    </aside>
  );
}

// ── Status Bar ──

function ProjectStatusBar({ entityId, enabledModuleCount, onOversightOpen }: { entityId: number; enabledModuleCount: number; onOversightOpen?: () => void }) {
  return (
    <div className="flex items-center justify-between border-t bg-card px-4 h-7 text-xs text-muted-foreground shrink-0">
      <div className="flex items-center gap-4">
        <span className="font-mono">PJ-{entityId}</span>
        <span>{enabledModuleCount} modules</span>
        <span className="text-orange-400">Project</span>
      </div>
      <div className="flex items-center gap-3">
        {onOversightOpen && (
          <button onClick={onOversightOpen} className="flex items-center gap-1 hover:text-foreground transition-colors">
            <Shield className="h-3 w-3 text-green-500" />
            <span>OK</span>
          </button>
        )}
        <div className="flex items-center gap-1">
          <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
          <span>Connected</span>
        </div>
      </div>
    </div>
  );
}

// ── Oversight Drawer ──

function ProjectOversightDrawer({ open, onOpenChange, entityId }: { open: boolean; onOpenChange: (open: boolean) => void; entityId: number }) {
  const checks = [
    { name: "Schema Valid", passed: true },
    { name: "Permissions OK", passed: true },
    { name: "Data Integrity", passed: true },
    { name: "Policy Compliance", passed: true },
    { name: "Resource Limits", passed: true },
    { name: "Agent Review Status", passed: true },
    { name: "Export Controls", passed: true },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[380px] sm:max-w-[380px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Project Oversight
          </SheetTitle>
          <SheetDescription>Governance and health for project {entityId}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="flex-1 mt-4">
          <div className="space-y-4 pr-4">
            <div className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Health Checks
              </h3>
              <div className="space-y-1">
                {checks.map((check, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground ml-2">
                    {check.passed ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-red-500" />}
                    <span>{check.name}</span>
                  </div>
                ))}
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Governance</h3>
              <div className="space-y-1 text-xs text-muted-foreground ml-2">
                <p>Audit Level: Full</p>
                <p>Approval Gates: Active (publish, deploy, export)</p>
                <p>Resource Tier: Elevated</p>
                <p>Max Concurrent Agents: 5</p>
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Approval Queue</h3>
              <p className="text-xs text-muted-foreground">Wire approval queue query here</p>
            </div>
            <Separator />
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Recent Activity</h3>
              <p className="text-xs text-muted-foreground">Wire project activity timeline here</p>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ── Main Shell ──

export default function ProjectWorkspaceShell() {
  const params = useParams<{ workspaceId: string }>();
  const workspaceId = parseInt(params.workspaceId || "0", 10);
  const [location, navigate] = useLocation();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [oversightOpen, setOversightOpen] = useState(false);
  const [pinned, setPinned] = useState(false);

  // ── Data fetching ──
  const { data: workspace, isLoading } = trpc.workspaces.get.useQuery({ id: workspaceId }, { enabled: workspaceId > 0 });
  const { data: modules = [] } = trpc.modules.manage.list.useQuery({ workspaceId }, { enabled: workspaceId > 0, retry: 2 });


  if (!workspace) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-2">
          <p className="text-destructive text-lg font-medium">{ENTITY_LABEL} not found</p>
          <Link href="/"><Button variant="outline">Go Back</Button></Link>
        </div>
      </div>
    );
  }

  const enabledModules = modules && modules.length > 0
    ? new Set(modules.filter((m) => m.enabled).map((m) => m.moduleKey))
    : new Set<string>(DEFAULT_MODULES);
  const enabledCount = enabledModules.size;
  const basePath = `${ROUTE_PREFIX}/${workspaceId}`;

  function ModuleGate({ moduleKey, moduleName, children }: ModuleGateProps) {
    if (!ALWAYS_ON_MODULES.includes(moduleKey as ModuleKey) && !enabledModules.has(moduleKey)) {
      return (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="text-center space-y-2">
            <p className="text-muted-foreground text-lg">{moduleName}</p>
            <p className="text-sm text-muted-foreground">This module is not enabled for this project.</p>
          </div>
        </div>
      );
    }
    return <>{children}</>;
  }

  // ── CONFIG OVERRIDES: Navigation entries for Project Workspace ──
  const navEntries: NavEntry[] = [
    { key: "overview", label: "Overview", icon: MODULE_ICONS.overview, path: basePath, always: true },
    {
      key: "pmt",
      label: "Projects",
      icon: MODULE_ICONS.pmt,
      path: `${basePath}/projects`,
      children: [
        { label: "Board", path: `${basePath}/projects/board` },
        { label: "Timeline", path: `${basePath}/projects/timeline` },
      ],
    },
    {
      key: "knowledge",
      label: "Knowledge",
      icon: MODULE_ICONS.knowledge,
      path: `${basePath}/knowledge`,
      children: [
        { label: "Decisions", path: `${basePath}/knowledge/decisions` },
        { label: "Search", path: `${basePath}/knowledge/search` },
      ],
    },
    {
      key: "agents",
      label: "Agents",
      icon: MODULE_ICONS.agents,
      path: `${basePath}/agents`,
      children: [
        { label: "Runs", path: `${basePath}/agents/runs` },
      ],
    },
    { key: "collaboration", label: "Collaboration", icon: MODULE_ICONS.collaboration, path: `${basePath}/collaboration` },
    { key: "reporting", label: "Reports", icon: MODULE_ICONS.reporting, path: `${basePath}/reports` },
    { key: "automation", label: "Automation", icon: MODULE_ICONS.automation, path: `${basePath}/automation` },
    { key: "deployments", label: "Deployments", icon: MODULE_ICONS.deployments, path: `${basePath}/deployments` },
  ];

  const shellContent = (
    <>
      <div className="flex flex-1 overflow-hidden">
        <ProjectSidebar
          entityId={workspaceId}
          entityName={workspace.name}
          enabledModules={enabledModules}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          onOversightOpen={() => setOversightOpen(true)}
          navEntries={navEntries}
          basePath={basePath}
        />
        <main className="flex-1 overflow-auto">
          <Switch>
            {/* ── CONFIG OVERRIDES: Project workspace module routes ── */}
            <Route path={`${basePath}/projects/board`}>
              <ModuleGate moduleKey="pmt" moduleName="Projects">
                <div className="p-6"><h2 className="text-xl font-bold">Kanban Board</h2><p className="text-sm text-muted-foreground mt-2">Project board view — wire PMTKanbanPage here</p></div>
              </ModuleGate>
            </Route>
            <Route path={`${basePath}/projects/timeline`}>
              <ModuleGate moduleKey="pmt" moduleName="Projects">
                <div className="p-6"><h2 className="text-xl font-bold">Timeline</h2><p className="text-sm text-muted-foreground mt-2">Gantt/timeline view — wire PMTTimelinePage here</p></div>
              </ModuleGate>
            </Route>
            <Route path={`${basePath}/projects`}>
              <ModuleGate moduleKey="pmt" moduleName="Projects">
                <div className="p-6"><h2 className="text-xl font-bold">Projects</h2><p className="text-sm text-muted-foreground mt-2">Project list — wire PMTProjectsPage here</p></div>
              </ModuleGate>
            </Route>
            <Route path={`${basePath}/knowledge/decisions`}>
              <ModuleGate moduleKey="knowledge" moduleName="Knowledge">
                <div className="p-6"><h2 className="text-xl font-bold">Decision Log</h2><p className="text-sm text-muted-foreground mt-2">Decisions — wire KnowledgeDecisionsPage here</p></div>
              </ModuleGate>
            </Route>
            <Route path={`${basePath}/knowledge/search`}>
              <ModuleGate moduleKey="knowledge" moduleName="Knowledge">
                <div className="p-6"><h2 className="text-xl font-bold">Knowledge Search</h2><p className="text-sm text-muted-foreground mt-2">Semantic search — wire KnowledgeSearchPage here</p></div>
              </ModuleGate>
            </Route>
            <Route path={`${basePath}/knowledge`}>
              <ModuleGate moduleKey="knowledge" moduleName="Knowledge">
                <div className="p-6"><h2 className="text-xl font-bold">Knowledge Base</h2><p className="text-sm text-muted-foreground mt-2">Documents — wire KnowledgeDocsPage here</p></div>
              </ModuleGate>
            </Route>
            <Route path={`${basePath}/agents/runs`}>
              <ModuleGate moduleKey="agents" moduleName="Agents">
                <div className="p-6"><h2 className="text-xl font-bold">Agent Runs</h2><p className="text-sm text-muted-foreground mt-2">Execution history — wire AgentRunsPage here</p></div>
              </ModuleGate>
            </Route>
            <Route path={`${basePath}/agents`}>
              <ModuleGate moduleKey="agents" moduleName="Agents">
                <div className="p-6"><h2 className="text-xl font-bold">Agent Roster</h2><p className="text-sm text-muted-foreground mt-2">Agent management — wire AgentsRosterPage here</p></div>
              </ModuleGate>
            </Route>
            <Route path={`${basePath}/collaboration`}>
              <ModuleGate moduleKey="collaboration" moduleName="Collaboration">
                <div className="p-6"><h2 className="text-xl font-bold">Collaboration</h2><p className="text-sm text-muted-foreground mt-2">Team threads — wire CollabThreadsPage here</p></div>
              </ModuleGate>
            </Route>
            <Route path={`${basePath}/reports`}>
              <ModuleGate moduleKey="reporting" moduleName="Reports">
                <div className="p-6"><h2 className="text-xl font-bold">Reports</h2><p className="text-sm text-muted-foreground mt-2">Project dashboards — wire ReportingDashboardPage here</p></div>
              </ModuleGate>
            </Route>
            <Route path={`${basePath}/automation`}>
              <ModuleGate moduleKey="automation" moduleName="Automation">
                <div className="p-6"><h2 className="text-xl font-bold">Automation</h2><p className="text-sm text-muted-foreground mt-2">Workflow builder — wire AutomationPage here</p></div>
              </ModuleGate>
            </Route>
            <Route path={`${basePath}/deployments`}>
              <ModuleGate moduleKey="deployments" moduleName="Deployments">
                <div className="p-6"><h2 className="text-xl font-bold">Deployments</h2><p className="text-sm text-muted-foreground mt-2">CI/CD pipeline — wire DeploymentsPage here</p></div>
              </ModuleGate>
            </Route>
            <Route path={`${basePath}/settings`}>
              <div className="p-6"><h2 className="text-xl font-bold">Project Settings</h2><p className="text-sm text-muted-foreground mt-2">Project configuration — wire SettingsPage here</p></div>
            </Route>

            {/* Default: Overview */}
            <Route>
              <div className="p-6 space-y-6">
                <h1 className="text-2xl font-bold">{workspace.name}</h1>
                <p className="text-sm text-muted-foreground">{enabledCount} modules enabled — Project workspace</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {navEntries.filter((i) => i.key !== "overview" && enabledModules.has(i.key)).map((item) => (
                    <Link key={item.key} href={item.path}>
                      <Card className="cursor-pointer hover:border-primary/50 transition-colors">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2">{item.icon} {item.label}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-muted-foreground">Open {item.label.toLowerCase()}</p>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            </Route>
          </Switch>
        </main>
      </div>
      <ProjectStatusBar entityId={workspaceId} enabledModuleCount={enabledCount} onOversightOpen={() => setOversightOpen(true)} />
      <ProjectOversightDrawer open={oversightOpen} onOpenChange={setOversightOpen} entityId={workspaceId} />
    </>
  );

  if (pinned) {
    return (
      <div className="-m-6 flex flex-col relative" style={{ height: "calc(100vh - 4rem)" }}>
        <button onClick={() => setPinned(false)} className="absolute top-2 right-2 z-10 p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Detach">
          <PinOff className="h-4 w-4" />
        </button>
        {shellContent}
      </div>
    );
  }

  return (
    <div className="-m-6 p-3 flex flex-col" style={{ height: "calc(100vh - 4rem)" }}>
      <div className="flex flex-col flex-1 rounded-lg border border-border bg-background shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/40 shrink-0">
          <div className="flex items-center gap-2">
            <Target className="h-3.5 w-3.5 text-orange-400" />
            <span className="text-xs font-medium text-muted-foreground truncate">{workspace.name}</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setPinned(true)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Pin"><Pin className="h-3.5 w-3.5" /></button>
            <button onClick={() => navigate("/")} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors" title="Close"><X className="h-3.5 w-3.5" /></button>
          </div>
        </div>
        <div className="flex flex-col flex-1 overflow-hidden">{shellContent}</div>
      </div>
    </div>
  );
}
