/**
 * PM Shell — Standalone PM Central Shell
 *
 * A headless IBM Carbon-inspired project management shell.
 * Fully independent of workspaces. Lives at /pm-central/pm-shell.
 */

import { useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle } from "lucide-react";
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  FolderKanban,
  ListTodo,
  CalendarDays,
  BarChart3,
  Settings,
  Target,
  Plus,
  FolderOpen,
} from "lucide-react";

// ── Sidebar nav items ──

const NAV_ITEMS = [
  { key: "overview", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
  { key: "projects", label: "Projects", icon: <FolderKanban className="h-4 w-4" /> },
  { key: "tasks", label: "Tasks", icon: <ListTodo className="h-4 w-4" /> },
  { key: "timeline", label: "Timeline", icon: <CalendarDays className="h-4 w-4" /> },
  { key: "reports", label: "Reports", icon: <BarChart3 className="h-4 w-4" /> },
  { key: "settings", label: "Settings", icon: <Settings className="h-4 w-4" /> },
] as const;

type NavKey = (typeof NAV_ITEMS)[number]["key"];

// ── Sidebar ──

function ShellSidebar({ active, onSelect, collapsed, onToggle }: {
  active: NavKey;
  onSelect: (key: NavKey) => void;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <aside className={cn(
      "flex flex-col border-r bg-card/50 transition-all duration-200 shrink-0",
      collapsed ? "w-12" : "w-56"
    )}>
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-3 h-12">
        {!collapsed && (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Target className="h-4 w-4 shrink-0 text-blue-400" />
            <span className="text-sm font-semibold truncate">PM Shell</span>
          </div>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onToggle}>
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2 space-y-0.5 px-1.5">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => onSelect(item.key)}
            className={cn(
              "flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded-md transition-colors",
              active === item.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              collapsed && "justify-center px-0"
            )}
          >
            {item.icon}
            {!collapsed && <span className="truncate">{item.label}</span>}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t px-3 py-2">
        <Link href="/pm-central">
          <button className={cn(
            "flex items-center gap-2 w-full px-3 py-1.5 text-sm rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors",
            collapsed && "justify-center px-0"
          )}>
            <ChevronLeft className="h-4 w-4" />
            {!collapsed && <span>Back to PM Central</span>}
          </button>
        </Link>
      </div>
    </aside>
  );
}

// ── Status bar ──

function ShellStatusBar() {
  return (
    <div className="flex items-center justify-between border-t bg-card/50 px-4 h-7 text-xs text-muted-foreground shrink-0">
      <div className="flex items-center gap-4">
        <span className="font-mono text-blue-400">PM Shell</span>
        <span>Standalone</span>
      </div>
      <div className="flex items-center gap-1">
        <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
        <span>Ready</span>
      </div>
    </div>
  );
}

// ── Panel: Overview ──

function OverviewPanel() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">PM Shell Overview</h1>
      <p className="text-muted-foreground">
        Standalone project management shell. Use the sidebar to navigate between modules.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {NAV_ITEMS.filter((i) => i.key !== "overview" && i.key !== "settings").map((item) => (
          <Card key={item.key} className="hover:border-primary/50 transition-colors">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">{item.icon} {item.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">Open {item.label.toLowerCase()}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Panel: Projects (draft + active) ──

function ProjectsPanel() {
  const { data: workspaces } = trpc.workspaces.list.useQuery();
  const wsId = (workspaces || []).find((w: any) => w.type === "project")?.id || (workspaces || [])[0]?.id;

  const { data: projects, isLoading } = trpc.modules.pmt.projects.list.useQuery(
    { workspaceId: wsId! },
    { enabled: !!wsId }
  );

  const utils = trpc.useUtils();
  const validateMutation = trpc.modules.pmt.projects.update.useMutation({
    onSuccess: () => utils.modules.pmt.projects.list.invalidate(),
  });

  const drafts = (projects || []).filter((p: any) => p.status === "draft");
  const active = (projects || []).filter((p: any) => p.status === "active");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Draft projects */}
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-amber-500" />
              Draft Projects
              {drafts.length > 0 && <Badge variant="outline" className="text-amber-500 border-amber-500/30">{drafts.length}</Badge>}
            </h2>
            {drafts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No draft projects.</p>
            ) : (
              <div className="space-y-2">
                {drafts.map((proj: any) => (
                  <div key={proj.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                    <div className="flex items-center gap-3">
                      <FolderOpen className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{proj.name}</p>
                        <p className="text-xs text-muted-foreground">{proj.description || `Project #${proj.id}`}</p>
                      </div>
                      <Badge variant="outline" className="text-amber-500 border-amber-500/30">Draft</Badge>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => validateMutation.mutate({ id: proj.id, workspaceId: proj.workspaceId, status: "active" })}
                      disabled={validateMutation.isPending}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Validate
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Active projects */}
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <FolderKanban className="h-5 w-5 text-green-500" />
              Active Projects
              {active.length > 0 && <Badge variant="outline" className="text-green-500 border-green-500/30">{active.length}</Badge>}
            </h2>
            {active.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active projects. Validate a draft to promote it.</p>
            ) : (
              <div className="space-y-2">
                {active.map((proj: any) => (
                  <div key={proj.id} className="flex items-center justify-between rounded-lg border px-4 py-3">
                    <div className="flex items-center gap-3">
                      <FolderKanban className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{proj.name}</p>
                        <p className="text-xs text-muted-foreground">{proj.description || `Project #${proj.id}`}</p>
                      </div>
                      <Badge variant="outline" className="text-green-500 border-green-500/30">Active</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Placeholder panels ──

function TasksPanel() {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Tasks</h1>
      <p className="text-muted-foreground">Task board and backlog — select a project to view its tasks.</p>
    </div>
  );
}

function TimelinePanel() {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Timeline</h1>
      <p className="text-muted-foreground">Gantt chart and timeline view for project scheduling.</p>
    </div>
  );
}

function ReportsPanel() {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Reports</h1>
      <p className="text-muted-foreground">Project dashboards, burndown charts, and velocity tracking.</p>
    </div>
  );
}

function SettingsPanel() {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="text-muted-foreground">PM Shell configuration — statuses, types, custom fields.</p>
    </div>
  );
}

// ── Main Shell ──

export default function PMShellPage() {
  const [activeNav, setActiveNav] = useState<NavKey>("overview");
  const [collapsed, setCollapsed] = useState(false);

  const renderPanel = () => {
    switch (activeNav) {
      case "overview": return <OverviewPanel />;
      case "projects": return <ProjectsPanel />;
      case "tasks": return <TasksPanel />;
      case "timeline": return <TimelinePanel />;
      case "reports": return <ReportsPanel />;
      case "settings": return <SettingsPanel />;
      default: return <OverviewPanel />;
    }
  };

  return (
    <div className="-m-6 flex flex-col" style={{ height: "calc(100vh - 4rem)" }}>
      <div className="flex flex-1 overflow-hidden">
        <ShellSidebar
          active={activeNav}
          onSelect={setActiveNav}
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
        />
        <main className="flex-1 overflow-auto">
          {renderPanel()}
        </main>
      </div>
      <ShellStatusBar />
    </div>
  );
}
