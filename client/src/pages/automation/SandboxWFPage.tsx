/**
 * Sandbox WF — Landing page (Simple IBM Shell)
 *
 * All data is live from the `wfdb` PostgreSQL database via tRPC.
 *
 * Single sidebar with 3 sections:
 *   1. Sandbox Tools (top) — switches content panel
 *   2. Categories (middle) — filters workflow list
 *   3. By Status (bottom) — status filter
 *
 * Simple Shell pattern (cloned from PmCentralSidebarLayout):
 *   - "flex -mx-6 -mt-6 overflow-hidden" + calc(100vh - 4rem)
 *   - Sidebar: w-12 collapsed (icon-only) / w-56 expanded
 *   - Single toggle, collapsed on mobile
 */
import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Workflow,
  GitBranch,
  Layers,
  Zap,
  Clock,
  BarChart3,
  Shield,
  Brain,
  Plug,
  WifiOff,
  LayoutDashboard,
  Eye,
  Gauge,
  Loader2,
  ChevronRight,
  Timer,
  Network,
  FileCode,
  Database,
  RefreshCw,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────

interface WFStep {
  id: number;
  workflowId: number;
  key: string;
  label: string;
  status: string;
  description: string;
  sortOrder: number;
  createdAt: Date;
}

interface WFWorkflow {
  id: number;
  name: string;
  category: string;
  status: string;
  description: string;
  steps: WFStep[];
  tags: string[] | null;
  updatedAgo: string | null;
  nodes: string | null;
  edges: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ── Sidebar sections ─────────────────────────────────────

const TOOLS = [
  { key: "editor", label: "WF Editor", icon: GitBranch, color: "text-blue-400" },
  { key: "triggers", label: "Triggers", icon: Zap, color: "text-yellow-400" },
  { key: "debug", label: "Debug Console", icon: Eye, color: "text-orange-400" },
  { key: "deploy", label: "Deploy", icon: Gauge, color: "text-green-400" },
  { key: "metrics", label: "Metrics", icon: BarChart3, color: "text-purple-400" },
];

const CATEGORIES = [
  { key: "all", label: "All Workflows", icon: Layers },
  { key: "decision", label: "Decision Engine", icon: GitBranch },
  { key: "integration", label: "Integrations", icon: Plug },
  { key: "ai", label: "AI Intelligence", icon: Brain },
  { key: "governance", label: "Governance", icon: Shield },
  { key: "offline", label: "Offline Exec", icon: WifiOff },
  { key: "canvas", label: "Canvas Builder", icon: LayoutDashboard },
];

const STATUSES = [
  { key: "running", label: "Running", icon: Play, color: "text-green-500" },
  { key: "completed", label: "Completed", icon: CheckCircle2, color: "text-blue-500" },
  { key: "failed", label: "Failed", icon: AlertTriangle, color: "text-red-500" },
  { key: "draft", label: "Drafts", icon: FileCode, color: "text-muted-foreground" },
];

// ── Step status cycle ────────────────────────────────────

const STEP_STATUS_CYCLE: Record<string, string> = {
  pending: "running",
  running: "done",
  done: "failed",
  failed: "pending",
};

// ── Status config ────────────────────────────────────────

const STATUS_BADGE: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  running: { variant: "default", label: "Running" },
  completed: { variant: "secondary", label: "Completed" },
  draft: { variant: "outline", label: "Draft" },
  failed: { variant: "destructive", label: "Failed" },
};

const STEP_STATUS_ICON: Record<string, React.ReactNode> = {
  done: <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />,
  running: <Loader2 className="h-3 w-3 text-blue-500 animate-spin shrink-0" />,
  pending: <Circle className="h-3 w-3 text-muted-foreground shrink-0" />,
  failed: <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />,
};

// ── Mobile hook ──────────────────────────────────────────

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false,
  );
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);
  return isMobile;
}

// ── Sidebar NavItem ──────────────────────────────────────

function NavItem({ icon, label, active, collapsed, count, color, onClick }: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  collapsed?: boolean;
  count?: number;
  color?: string;
  onClick: () => void;
}) {
  if (collapsed) {
    return (
      <button
        onClick={onClick}
        title={label}
        className={cn(
          "flex items-center justify-center w-full py-1.5 rounded-sm transition-colors",
          active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
        )}
      >
        <span className={cn("opacity-70", color)}>{icon}</span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 w-full px-3 py-1.5 text-xs rounded-sm transition-colors",
        active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
      )}
    >
      <span className={cn("shrink-0 opacity-70", color)}>{icon}</span>
      <span className="truncate flex-1 text-left">{label}</span>
      {count !== undefined && <span className="text-[10px] opacity-60">{count}</span>}
    </button>
  );
}

// ── Main Component ───────────────────────────────────────

export default function SandboxWFPage() {
  const isMobile = useIsMobile();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [activeTool, setActiveTool] = useState("editor");
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeStatus, setActiveStatus] = useState<string | null>(null);
  const [selectedWF, setSelectedWF] = useState<WFWorkflow | null>(null);
  const [activeExecutionId, setActiveExecutionId] = useState<number | null>(null);
  const collapsed = sidebarCollapsed;

  // ── tRPC Queries ───────────────────────────────────────

  const utils = trpc.useUtils();

  const workflowsQuery = trpc.sandboxWf.workflows.list.useQuery({
    category: activeCategory !== "all" ? activeCategory : undefined,
    status: activeStatus || undefined,
  });

  const allWorkflowsQuery = trpc.sandboxWf.workflows.list.useQuery({});

  const statsQuery = trpc.sandboxWf.stats.useQuery();
  const triggersQuery = trpc.sandboxWf.triggers.list.useQuery({});
  const executionsQuery = trpc.sandboxWf.executions.list.useQuery({});

  const executionLogsQuery = trpc.sandboxWf.executions.getLogs.useQuery(
    { executionId: activeExecutionId! },
    { enabled: !!activeExecutionId },
  );

  // ── tRPC Mutations ─────────────────────────────────────

  const seedMutation = trpc.sandboxWf.seed.useMutation({
    onSuccess: () => {
      utils.sandboxWf.invalidate();
    },
  });

  const updateStepMutation = trpc.sandboxWf.steps.updateStatus.useMutation({
    onSuccess: () => {
      utils.sandboxWf.invalidate();
    },
  });

  const executeWfMutation = trpc.sandboxWf.executions.create.useMutation({
    onSuccess: (data) => {
      utils.sandboxWf.invalidate();
      if (data) setActiveExecutionId(data.id);
    },
  });

  // ── Derived data ───────────────────────────────────────

  const workflows: WFWorkflow[] = workflowsQuery.data ?? [];
  const allWorkflows: WFWorkflow[] = allWorkflowsQuery.data ?? [];
  const stats = statsQuery.data ?? { total: 0, running: 0, completed: 0, failed: 0, draft: 0, totalSteps: 0, doneSteps: 0 };
  const triggers = triggersQuery.data ?? [];
  const executions = executionsQuery.data ?? [];
  const executionLogs = executionLogsQuery.data ?? [];
  const isLoading = workflowsQuery.isLoading;
  const isEmpty = !isLoading && allWorkflows.length === 0;

  // Keep selectedWF in sync with query data
  useEffect(() => {
    if (selectedWF && workflows.length > 0) {
      const updated = workflows.find((w) => w.id === selectedWF.id);
      if (updated) setSelectedWF(updated);
    }
  }, [workflows]);

  // ── Handlers ───────────────────────────────────────────

  const handleToolClick = (key: string) => { setActiveTool(key); if (isMobile) setSidebarCollapsed(true); };
  const handleCategoryClick = (key: string) => { setActiveCategory(key); setActiveStatus(null); setSelectedWF(null); setActiveTool("editor"); if (isMobile) setSidebarCollapsed(true); };
  const handleStatusClick = (key: string) => { setActiveStatus(activeStatus === key ? null : key); setActiveCategory("all"); setSelectedWF(null); setActiveTool("editor"); if (isMobile) setSidebarCollapsed(true); };

  const handleStepClick = (workflowId: number, stepKey: string, currentStatus: string) => {
    const nextStatus = STEP_STATUS_CYCLE[currentStatus] || "pending";
    updateStepMutation.mutate({ workflowId, stepKey, status: nextStatus });
  };

  const handleExecute = (workflowId: number) => {
    executeWfMutation.mutate({ workflowId, triggerType: "manual" });
    setActiveTool("debug");
  };

  // ── Category counts from all workflows (unfiltered) ────

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allWorkflows.length };
    for (const wf of allWorkflows) {
      counts[wf.category] = (counts[wf.category] || 0) + 1;
    }
    return counts;
  }, [allWorkflows]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const wf of allWorkflows) {
      counts[wf.status] = (counts[wf.status] || 0) + 1;
    }
    return counts;
  }, [allWorkflows]);

  return (
    <div
      className="flex -mx-6 -mt-6 overflow-hidden"
      style={{ height: "calc(100vh - 4rem)" }}
    >
      {/* ── Sidebar ──────────────────────────────────── */}
      <div
        className={cn(
          "border-r bg-background flex flex-col h-full transition-all duration-200 shrink-0",
          collapsed ? "w-12" : "w-56",
        )}
      >
        {/* Header + toggle */}
        <div className={cn(
          "flex items-center border-b shrink-0",
          collapsed ? "justify-center py-1.5" : "justify-between px-2 py-1.5",
        )}>
          {!collapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <Workflow className="h-3.5 w-3.5 shrink-0 text-blue-500" />
              <span className="text-xs font-semibold text-muted-foreground truncate">Sandbox WF</span>
            </div>
          )}
          <Button
            variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className={collapsed ? "px-1 py-1" : "py-1"}>
            {/* Section 1: Sandbox Tools */}
            {!collapsed && (
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Sandbox Tools
              </div>
            )}
            {TOOLS.map(({ key, label, icon: Icon, color }) => (
              <NavItem
                key={key}
                icon={<Icon className="h-3.5 w-3.5" />}
                label={label}
                active={activeTool === key}
                collapsed={collapsed}
                color={activeTool === key ? undefined : color}
                onClick={() => handleToolClick(key)}
              />
            ))}

            <Separator className="my-1.5" />

            {/* Section 2: Categories */}
            {!collapsed && (
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Categories
              </div>
            )}
            {CATEGORIES.map(({ key, label, icon: Icon }) => (
              <NavItem
                key={key}
                icon={<Icon className="h-3.5 w-3.5" />}
                label={label}
                active={activeCategory === key && !activeStatus}
                collapsed={collapsed}
                count={categoryCounts[key] || 0}
                onClick={() => handleCategoryClick(key)}
              />
            ))}

            <Separator className="my-1.5" />

            {/* Section 3: By Status */}
            {!collapsed && (
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                By Status
              </div>
            )}
            {STATUSES.map(({ key, label, icon: Icon, color }) => (
              <NavItem
                key={key}
                icon={<Icon className="h-3.5 w-3.5" />}
                label={label}
                active={activeStatus === key}
                collapsed={collapsed}
                count={statusCounts[key] || 0}
                color={color}
                onClick={() => handleStatusClick(key)}
              />
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* ── Content ───────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b px-4 h-10 shrink-0">
          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-blue-500" />
            <h1 className="text-sm font-semibold">Sandbox WF</h1>
            <Badge variant="outline" className="text-[10px]">
              {CATEGORIES.find((c) => c.key === activeCategory)?.label}
            </Badge>
            {activeStatus && (
              <Badge variant="secondary" className="text-[10px] capitalize">{activeStatus}</Badge>
            )}
            <span className="text-[10px] text-muted-foreground">{workflows.length} workflows</span>
            {isLoading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">
              {TOOLS.find((t) => t.key === activeTool)?.label}
            </Badge>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => utils.sandboxWf.invalidate()} title="Refresh">
              <RefreshCw className="h-3 w-3" />
            </Button>
            {selectedWF && (
              <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setSelectedWF(null)}>
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Main content — switches based on activeTool */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4">

          {/* ═══ Empty State — Seed ═══ */}
          {isEmpty && (
            <div className="flex flex-col items-center justify-center h-60 text-muted-foreground">
              <Database className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm mb-1">No workflows in WfDB</p>
              <p className="text-xs mb-4 opacity-60">Seed the database with 12 reference workflows</p>
              <Button
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
                size="sm"
              >
                {seedMutation.isPending ? (
                  <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Seeding...</>
                ) : (
                  <><Database className="h-3 w-3 mr-1" /> Seed Data</>
                )}
              </Button>
            </div>
          )}

          {/* ═══ WF Editor ═══ */}
          {!isEmpty && activeTool === "editor" && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {[
                  { label: "Running", count: stats.running, icon: Play, color: "text-green-500" },
                  { label: "Completed", count: stats.completed, icon: CheckCircle2, color: "text-blue-500" },
                  { label: "Failed", count: stats.failed, icon: AlertTriangle, color: "text-red-500" },
                  { label: "Steps Done", count: `${stats.doneSteps}/${stats.totalSteps}`, icon: Gauge, color: "text-purple-500" },
                ].map(({ label, count, icon: Icon, color }) => (
                  <Card key={label}>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2">
                        <Icon className={cn("h-4 w-4", color)} />
                        <div>
                          <p className="text-lg font-bold">{count}</p>
                          <p className="text-[10px] text-muted-foreground">{label}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {selectedWF && (
                <Card className="mb-4 border-primary/20">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{selectedWF.name}</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">{selectedWF.description}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <Button
                          variant="outline" size="sm" className="h-6 text-[10px] px-2"
                          onClick={(e) => { e.stopPropagation(); handleExecute(selectedWF.id); }}
                          disabled={executeWfMutation.isPending}
                        >
                          {executeWfMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
                          Execute
                        </Button>
                        <Badge variant={(STATUS_BADGE[selectedWF.status] || STATUS_BADGE.draft).variant}>
                          {(STATUS_BADGE[selectedWF.status] || STATUS_BADGE.draft).label}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-2">
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {(selectedWF.tags || []).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground mb-2">Click a step to cycle its status</p>
                    <div className="flex items-center gap-1 overflow-x-auto pb-2">
                      {selectedWF.steps.map((step, i) => (
                        <div key={step.key} className="flex items-center">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleStepClick(selectedWF.id, step.key, step.status); }}
                            className={cn(
                              "flex items-center gap-1 px-2 py-1 rounded text-[10px] whitespace-nowrap border cursor-pointer hover:opacity-80 transition-opacity",
                              step.status === "done" && "bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400",
                              step.status === "running" && "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400",
                              step.status === "pending" && "bg-muted border-muted-foreground/20 text-muted-foreground",
                              step.status === "failed" && "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400",
                            )}
                            title={`${step.description}\nClick to change status`}
                          >
                            {STEP_STATUS_ICON[step.status] || STEP_STATUS_ICON.pending}
                            <span>{step.label}</span>
                          </button>
                          {i < selectedWF.steps.length - 1 && (
                            <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0 mx-0.5" />
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Timer className="h-3 w-3" /> {selectedWF.updatedAgo}</span>
                      <span className="flex items-center gap-1"><Network className="h-3 w-3" /> {selectedWF.category}</span>
                      <span className="flex items-center gap-1">
                        <Gauge className="h-3 w-3" />
                        {selectedWF.steps.filter((s) => s.status === "done").length}/{selectedWF.steps.length} steps
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {workflows.map((wf) => {
                  const badge = STATUS_BADGE[wf.status] || STATUS_BADGE.draft;
                  const doneCount = wf.steps.filter((s) => s.status === "done").length;
                  const progress = wf.steps.length > 0 ? Math.round((doneCount / wf.steps.length) * 100) : 0;
                  const isSelected = selectedWF?.id === wf.id;
                  return (
                    <Card key={wf.id} className={cn("hover:border-primary/30 transition-colors cursor-pointer", isSelected && "border-primary ring-1 ring-primary/20")} onClick={() => setSelectedWF(isSelected ? null : wf)}>
                      <CardHeader className="pb-2 p-3">
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-sm leading-tight">{wf.name}</CardTitle>
                          <Badge variant={badge.variant} className="text-[10px] shrink-0 ml-2">{badge.label}</Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground line-clamp-2 mt-1">{wf.description}</p>
                      </CardHeader>
                      <CardContent className="p-3 pt-0">
                        <div className="flex flex-wrap gap-1 mb-2">
                          {(wf.tags || []).slice(0, 3).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-[9px] px-1 py-0">{tag}</Badge>
                          ))}
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                          <span>{doneCount}/{wf.steps.length} steps</span>
                          <span>{progress}%</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={cn("h-full rounded-full transition-all", wf.status === "failed" ? "bg-red-500" : wf.status === "completed" ? "bg-green-500" : wf.status === "running" ? "bg-blue-500" : "bg-muted-foreground/30")} style={{ width: `${progress}%` }} />
                        </div>
                        <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                          <Clock className="h-3 w-3" /><span>{wf.updatedAgo}</span>
                          <span className="ml-auto capitalize opacity-60">{wf.category}</span>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
              {!isLoading && workflows.length === 0 && !isEmpty && (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                  <Circle className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-sm">No workflows match this filter</p>
                </div>
              )}
            </>
          )}

          {/* ═══ Triggers ═══ */}
          {!isEmpty && activeTool === "triggers" && (
            <>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Zap className="h-4 w-4 text-yellow-500" /> Triggers</h2>
              {triggersQuery.isLoading && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading triggers...</div>}
              <div className="space-y-2">
                {triggers.map((t) => (
                  <Card key={t.id}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <div><p className="text-xs font-medium">{t.name}</p><p className="text-[10px] text-muted-foreground mt-0.5">Fires → <span className="text-foreground">{t.targetWorkflowName}</span></p></div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <Badge variant="outline" className="text-[9px]">{t.type}</Badge>
                          <Badge variant={t.status === "active" ? "default" : "secondary"} className="text-[9px]">{t.status}</Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground"><span>{t.fireCount} total fires</span></div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}

          {/* ═══ Debug Console ═══ */}
          {!isEmpty && activeTool === "debug" && (
            <>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Eye className="h-4 w-4 text-orange-500" /> Debug Console</h2>

              {/* Execution selector */}
              {executions.length > 0 && (
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="text-[10px] text-muted-foreground">Executions:</span>
                  {executions.slice(0, 10).map((exec) => (
                    <Button
                      key={exec.id}
                      variant={activeExecutionId === exec.id ? "default" : "outline"}
                      size="sm"
                      className="h-6 text-[10px] px-2"
                      onClick={() => setActiveExecutionId(exec.id)}
                    >
                      #{exec.id} ({exec.status})
                    </Button>
                  ))}
                </div>
              )}

              <Card><CardContent className="p-0">
                <div className="bg-zinc-950 rounded-lg p-3 font-mono text-[11px] leading-relaxed max-h-[60vh] overflow-y-auto">
                  {activeExecutionId && executionLogs.length > 0 ? (
                    <>
                      {executionLogs.map((log, i) => (
                        <div key={i} className="flex gap-2">
                          <span className="text-zinc-500 shrink-0">
                            {new Date(log.startedAt).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                          </span>
                          <span className={cn(
                            "shrink-0 w-12",
                            log.logLevel === "ERROR" && "text-red-400",
                            log.logLevel === "WARN" && "text-yellow-400",
                            log.logLevel === "WAIT" && "text-blue-400",
                            log.logLevel === "INFO" && "text-green-400",
                          )}>{log.logLevel}</span>
                          <span className="text-zinc-300">{log.message}</span>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="text-zinc-500">
                      {activeExecutionId ? "Loading logs..." : "Select an execution above, or execute a workflow to see logs here."}
                    </div>
                  )}
                  <div className="flex gap-2 mt-1"><span className="text-zinc-500">{new Date().toLocaleTimeString("en-US", { hour12: false })}</span><span className="text-green-400 animate-pulse">_</span></div>
                </div>
              </CardContent></Card>
            </>
          )}

          {/* ═══ Deploy ═══ */}
          {!isEmpty && activeTool === "deploy" && (
            <>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Gauge className="h-4 w-4 text-green-500" /> Deploy</h2>
              <div className="space-y-3">
                {allWorkflows.map((wf) => {
                  const doneCount = wf.steps.filter((s) => s.status === "done").length;
                  const canDeploy = wf.status === "completed" || wf.status === "draft";
                  const isDeployed = wf.status === "running" || wf.status === "completed";
                  return (
                    <Card key={wf.id}><CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="min-w-0"><p className="text-xs font-medium truncate">{wf.name}</p><p className="text-[10px] text-muted-foreground">{doneCount}/{wf.steps.length} steps · {wf.category}</p></div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          {isDeployed && <Badge variant="default" className="text-[9px] bg-green-600">Deployed</Badge>}
                          {wf.status === "draft" && <Badge variant="outline" className="text-[9px]">Draft</Badge>}
                          {wf.status === "failed" && <Badge variant="destructive" className="text-[9px]">Failed</Badge>}
                          <Button
                            variant={canDeploy ? "default" : "outline"} size="sm" className="h-6 text-[10px] px-2"
                            disabled={!canDeploy}
                            onClick={() => handleExecute(wf.id)}
                          >
                            {wf.status === "completed" ? "Redeploy" : wf.status === "draft" ? "Deploy" : wf.status === "running" ? "Live" : "Fix First"}
                          </Button>
                        </div>
                      </div>
                    </CardContent></Card>
                  );
                })}
              </div>
            </>
          )}

          {/* ═══ Metrics ═══ */}
          {!isEmpty && activeTool === "metrics" && (
            <>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-purple-500" /> Metrics</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                {[
                  { label: "Total Workflows", value: stats.total },
                  { label: "Total Steps", value: stats.totalSteps },
                  { label: "Steps Completed", value: stats.doneSteps },
                  { label: "Completion Rate", value: stats.totalSteps > 0 ? `${Math.round((stats.doneSteps / stats.totalSteps) * 100)}%` : "0%" },
                  { label: "Avg Steps/WF", value: stats.total > 0 ? (stats.totalSteps / stats.total).toFixed(1) : "0" },
                  { label: "Categories", value: CATEGORIES.length - 1 },
                ].map(({ label, value }) => (
                  <Card key={label}><CardContent className="p-3 text-center"><p className="text-lg font-bold">{value}</p><p className="text-[10px] text-muted-foreground">{label}</p></CardContent></Card>
                ))}
              </div>
              <h3 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">By Category</h3>
              <div className="space-y-2 mb-4">
                {CATEGORIES.filter((c) => c.key !== "all").map(({ key, label, icon: Icon }) => {
                  const catWFs = allWorkflows.filter((w) => w.category === key);
                  const catSteps = catWFs.reduce((a, w) => a + w.steps.length, 0);
                  const catDone = catWFs.reduce((a, w) => a + w.steps.filter((s) => s.status === "done").length, 0);
                  const pct = catSteps > 0 ? Math.round((catDone / catSteps) * 100) : 0;
                  return (
                    <Card key={key}><CardContent className="p-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2"><Icon className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-xs font-medium">{label}</span></div>
                        <span className="text-xs text-muted-foreground">{catWFs.length} WFs · {catDone}/{catSteps} · {pct}%</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full rounded-full bg-purple-500 transition-all" style={{ width: `${pct}%` }} /></div>
                    </CardContent></Card>
                  );
                })}
              </div>
              <h3 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Per Workflow</h3>
              <Card><CardContent className="p-0"><div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b text-left text-muted-foreground">
                    <th className="p-2 font-medium">Workflow</th><th className="p-2 font-medium">Category</th><th className="p-2 font-medium">Status</th><th className="p-2 font-medium">Steps</th><th className="p-2 font-medium">Progress</th>
                  </tr></thead>
                  <tbody>
                    {allWorkflows.map((wf) => {
                      const done = wf.steps.filter((s) => s.status === "done").length;
                      const pct = wf.steps.length > 0 ? Math.round((done / wf.steps.length) * 100) : 0;
                      return (
                        <tr key={wf.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="p-2 font-medium">{wf.name}</td>
                          <td className="p-2 capitalize text-muted-foreground">{wf.category}</td>
                          <td className="p-2"><Badge variant={(STATUS_BADGE[wf.status] || STATUS_BADGE.draft).variant} className="text-[9px]">{(STATUS_BADGE[wf.status] || STATUS_BADGE.draft).label}</Badge></td>
                          <td className="p-2 text-muted-foreground">{done}/{wf.steps.length}</td>
                          <td className="p-2"><div className="flex items-center gap-2"><div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden"><div className={cn("h-full rounded-full", wf.status === "failed" ? "bg-red-500" : wf.status === "completed" ? "bg-green-500" : "bg-blue-500")} style={{ width: `${pct}%` }} /></div><span className="text-muted-foreground">{pct}%</span></div></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div></CardContent></Card>
            </>
          )}
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between border-t bg-card/50 px-4 h-7 text-xs text-muted-foreground shrink-0">
          <div className="flex items-center gap-4">
            <span className="font-mono text-blue-500">Sandbox WF</span>
            <span>{stats.total} workflows</span>
            <span>{stats.doneSteps}/{stats.totalSteps} steps</span>
            <Badge variant="outline" className="text-[9px] px-1 py-0">
              <Database className="h-2.5 w-2.5 mr-0.5" /> wfdb
            </Badge>
          </div>
          <div className="flex items-center gap-3">
            <span>{TOOLS.find((t) => t.key === activeTool)?.label}</span>
            {selectedWF && <span className="text-primary truncate max-w-[200px]">{selectedWF.name}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
