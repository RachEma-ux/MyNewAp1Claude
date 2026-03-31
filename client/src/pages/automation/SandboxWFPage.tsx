/**
 * Sandbox WF — Landing page (Double IBM Shell)
 *
 * Cloned from DoubleShellPage pattern:
 * - S1 (Workflows): always visible, icons when collapsed, full when expanded
 * - S2 (Steps): hidden when collapsed, visible when expanded
 * - Single toggle on S1 controls both
 * - Mobile: always collapsed
 *
 * No cross-module imports — standalone clone.
 */
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Pause,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Workflow,
  GitBranch,
  Layers,
  Settings,
  History,
  FileCode,
  Zap,
  Bug,
  Rocket,
  Clock,
  BarChart3,
} from "lucide-react";

// ── S1 nav items (Workflows) ─────────────────────────────
const S1_ITEMS = [
  { key: "all", label: "All Workflows", icon: Layers },
  { key: "running", label: "Running", icon: Play },
  { key: "completed", label: "Completed", icon: CheckCircle2 },
  { key: "failed", label: "Failed", icon: AlertTriangle },
  { key: "drafts", label: "Drafts", icon: FileCode },
  { key: "history", label: "History", icon: History },
  { key: "settings", label: "Settings", icon: Settings },
];

// ── S2 nav items (Sandbox Tools) ─────────────────────────
const S2_ITEMS = [
  { key: "editor", label: "WF Editor", icon: GitBranch },
  { key: "triggers", label: "Triggers", icon: Zap },
  { key: "debug", label: "Debug Console", icon: Bug },
  { key: "deploy", label: "Deploy", icon: Rocket },
  { key: "metrics", label: "Metrics", icon: BarChart3 },
];

// ── Sample workflows ─────────────────────────────────────
const SAMPLE_WORKFLOWS = [
  { id: 1, name: "Data Ingestion Pipeline", status: "running", steps: 5, completed: 3 },
  { id: 2, name: "User Onboarding Flow", status: "completed", steps: 8, completed: 8 },
  { id: 3, name: "Alert Escalation Chain", status: "draft", steps: 4, completed: 0 },
  { id: 4, name: "Document Processing", status: "failed", steps: 6, completed: 4 },
  { id: 5, name: "API Gateway Router", status: "running", steps: 3, completed: 1 },
  { id: 6, name: "Batch ETL Nightly", status: "completed", steps: 10, completed: 10 },
];

const STATUS_BADGE: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  running: { variant: "default", label: "Running" },
  completed: { variant: "secondary", label: "Completed" },
  draft: { variant: "outline", label: "Draft" },
  failed: { variant: "destructive", label: "Failed" },
};

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

export default function SandboxWFPage() {
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);
  const [s1Active, setS1Active] = useState("all");
  const [s2Active, setS2Active] = useState("editor");
  const isCollapsed = isMobile || !expanded;

  // Filter workflows by S1 selection
  const filtered = s1Active === "all"
    ? SAMPLE_WORKFLOWS
    : SAMPLE_WORKFLOWS.filter((w) => w.status === s1Active || (s1Active === "drafts" && w.status === "draft"));

  return (
    <div
      className="flex -mx-6 -mt-6 overflow-hidden"
      style={{ height: "calc(100vh - 4rem)" }}
    >
      {/* ── S1: Workflows ─────────────────────────────── */}
      <div
        className={cn(
          "border-r bg-background flex flex-col h-full transition-all duration-200 shrink-0",
          isCollapsed ? "w-12" : "w-48",
        )}
      >
        {/* Toggle header */}
        <div
          className={cn(
            "flex items-center border-b",
            isCollapsed ? "justify-center py-1.5" : "justify-between px-2 py-1.5",
          )}
        >
          {!isCollapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <Workflow className="h-3.5 w-3.5 shrink-0 text-blue-500" />
              <span className="text-xs font-semibold text-muted-foreground truncate">
                Workflows
              </span>
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 shrink-0"
            onClick={() => setExpanded(!expanded)}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className={isCollapsed ? "px-1 py-1" : ""}>
            {S1_ITEMS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setS1Active(key)}
                title={label}
                className={cn(
                  "flex items-center w-full rounded-sm transition-colors",
                  isCollapsed ? "justify-center py-1.5" : "gap-2 px-3 py-1.5 text-xs",
                  s1Active === key
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                {!isCollapsed && <span className="truncate">{label}</span>}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* ── S2: Sandbox Tools ─────────────────────────── */}
      {!isCollapsed && (
        <div className="border-r bg-background flex flex-col h-full transition-all duration-200 shrink-0 w-48">
          <div className="flex items-center border-b px-2 py-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <Zap className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
              <span className="text-xs font-semibold text-muted-foreground truncate">
                Sandbox Tools
              </span>
            </div>
          </div>

          <ScrollArea className="flex-1">
            {S2_ITEMS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setS2Active(key)}
                className={cn(
                  "flex items-center gap-2 w-full px-3 py-1.5 text-xs rounded-sm transition-colors",
                  s2Active === key
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </ScrollArea>
        </div>
      )}

      {/* ── Content ───────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b px-4 h-10 shrink-0">
          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-blue-500" />
            <h1 className="text-sm font-semibold">Sandbox WF</h1>
            <Badge variant="outline" className="text-[10px]">
              {s1Active === "all" ? "All" : S1_ITEMS.find((i) => i.key === s1Active)?.label}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px]">
              Tool: {S2_ITEMS.find((i) => i.key === s2Active)?.label}
            </Badge>
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <Play className="h-4 w-4 text-green-500" />
                  <div>
                    <p className="text-lg font-bold">{SAMPLE_WORKFLOWS.filter((w) => w.status === "running").length}</p>
                    <p className="text-[10px] text-muted-foreground">Running</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-blue-500" />
                  <div>
                    <p className="text-lg font-bold">{SAMPLE_WORKFLOWS.filter((w) => w.status === "completed").length}</p>
                    <p className="text-[10px] text-muted-foreground">Completed</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  <div>
                    <p className="text-lg font-bold">{SAMPLE_WORKFLOWS.filter((w) => w.status === "failed").length}</p>
                    <p className="text-[10px] text-muted-foreground">Failed</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <FileCode className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-lg font-bold">{SAMPLE_WORKFLOWS.filter((w) => w.status === "draft").length}</p>
                    <p className="text-[10px] text-muted-foreground">Drafts</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Workflow cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((wf) => {
              const badge = STATUS_BADGE[wf.status] || STATUS_BADGE.draft;
              const progress = wf.steps > 0 ? Math.round((wf.completed / wf.steps) * 100) : 0;
              return (
                <Card key={wf.id} className="hover:border-primary/30 transition-colors cursor-pointer">
                  <CardHeader className="pb-2 p-3">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-sm">{wf.name}</CardTitle>
                      <Badge variant={badge.variant} className="text-[10px] shrink-0 ml-2">
                        {badge.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                      <span>{wf.completed}/{wf.steps} steps</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          wf.status === "failed" ? "bg-red-500" :
                          wf.status === "completed" ? "bg-green-500" :
                          wf.status === "running" ? "bg-blue-500" :
                          "bg-muted-foreground/30",
                        )}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>Updated 2h ago</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <Circle className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">No workflows in this category</p>
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between border-t bg-card/50 px-4 h-7 text-xs text-muted-foreground shrink-0">
          <div className="flex items-center gap-4">
            <span className="font-mono text-blue-500">Sandbox WF</span>
            <span>{SAMPLE_WORKFLOWS.length} workflows</span>
          </div>
          <div className="flex items-center gap-3">
            <span>View: {S1_ITEMS.find((i) => i.key === s1Active)?.label}</span>
            <span>Tool: {S2_ITEMS.find((i) => i.key === s2Active)?.label}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
