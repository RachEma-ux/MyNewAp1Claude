/**
 * PM Shell — Standalone PM Central Shell
 *
 * A headless IBM Carbon-inspired project management shell.
 * Fully independent of workspaces. Lives at /pm-central/pm-shell.
 * Uses trpc.modules.pmt.shell.* routes (workspace-free).
 */

import { useState, useMemo, useRef } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  FolderKanban,
  LayoutGrid,
  List,
  CalendarDays,
  BarChart3,
  Settings,
  Target,
  Plus,
  FolderOpen,
  Loader2,
  CheckCircle,
  Trash2,
  ZoomIn,
  ZoomOut,
  Calendar,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

// ── Shared constants ──

const STATUS_COLUMNS = [
  { key: "backlog", label: "Backlog", color: "bg-slate-500" },
  { key: "todo", label: "To Do", color: "bg-blue-500" },
  { key: "in_progress", label: "In Progress", color: "bg-yellow-500" },
  { key: "review", label: "Review", color: "bg-purple-500" },
  { key: "done", label: "Done", color: "bg-green-500" },
];

const priorityColors: Record<string, string> = {
  low: "text-green-500",
  medium: "text-yellow-500",
  high: "text-orange-500",
  critical: "text-red-500",
};

const typeColors: Record<string, string> = {
  task: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  bug: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  story: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  epic: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  milestone: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  feature: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
};

const TYPE_SVG_COLORS: Record<string, string> = {
  task: "#3b82f6",
  bug: "#ef4444",
  story: "#22c55e",
  epic: "#a855f7",
  milestone: "#f97316",
  feature: "#06b6d4",
};

const STATUS_CHART_COLORS: Record<string, string> = {
  backlog: "#64748b",
  todo: "#3b82f6",
  in_progress: "#eab308",
  review: "#a855f7",
  done: "#22c55e",
};

const TYPE_CHART_COLORS: Record<string, string> = {
  task: "#3b82f6",
  bug: "#ef4444",
  story: "#22c55e",
  epic: "#a855f7",
  milestone: "#f97316",
  feature: "#06b6d4",
};

// ── Sidebar nav items ──

const NAV_ITEMS = [
  { key: "overview", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
  { key: "projects", label: "Projects", icon: <FolderKanban className="h-4 w-4" /> },
  { key: "board", label: "Board", icon: <LayoutGrid className="h-4 w-4" /> },
  { key: "backlog", label: "Backlog", icon: <List className="h-4 w-4" /> },
  { key: "timeline", label: "Timeline", icon: <CalendarDays className="h-4 w-4" /> },
  { key: "calendar", label: "Calendar", icon: <Calendar className="h-4 w-4" /> },
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

// ── Project selector (shared) ──

function ProjectSelector({ projects, projectId, onChange }: {
  projects: any[] | undefined;
  projectId: number | null;
  onChange: (id: number) => void;
}) {
  if (!projects || projects.length === 0) return null;
  return (
    <Select
      value={String(projectId || "")}
      onValueChange={(v) => onChange(parseInt(v))}
    >
      <SelectTrigger className="w-48">
        <SelectValue placeholder="Select project" />
      </SelectTrigger>
      <SelectContent>
        {projects.map((p: any) => (
          <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ════════════════════════════════════════════════════════════════════
// Panel: Overview
// ════════════════════════════════════════════════════════════════════

function OverviewPanel() {
  const { data: projects } = trpc.modules.pmt.shell.projects.list.useQuery();
  const projectId = projects?.[0]?.id;
  const { data: tasks } = trpc.modules.pmt.shell.tasks.list.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId }
  );

  const drafts = (projects || []).filter((p: any) => p.status === "draft").length;
  const active = (projects || []).filter((p: any) => p.status === "active").length;
  const totalTasks = (tasks || []).length;
  const doneTasks = (tasks || []).filter((t: any) => t.status === "done").length;
  const inProgress = (tasks || []).filter((t: any) => t.status === "in_progress").length;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">PM Shell Overview</h1>
      <p className="text-muted-foreground">
        Standalone project management shell. Use the sidebar to navigate between modules.
      </p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Draft Projects</p>
            <p className="text-3xl font-bold text-amber-500">{drafts}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Active Projects</p>
            <p className="text-3xl font-bold text-green-500">{active}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total Tasks</p>
            <p className="text-3xl font-bold">{totalTasks}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">In Progress</p>
            <p className="text-3xl font-bold text-yellow-500">{inProgress}</p>
          </CardContent>
        </Card>
      </div>
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

// ════════════════════════════════════════════════════════════════════
// Panel: Projects — create, validate, delete
// ════════════════════════════════════════════════════════════════════

function ProjectsPanel() {
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const utils = trpc.useUtils();
  const { data: projects, isLoading } = trpc.modules.pmt.shell.projects.list.useQuery();

  const createMut = trpc.modules.pmt.shell.projects.create.useMutation({
    onSuccess: () => {
      utils.modules.pmt.shell.projects.list.invalidate();
      setCreateOpen(false);
      setNewName("");
      setNewDesc("");
      toast.success("Project created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateMut = trpc.modules.pmt.shell.projects.update.useMutation({
    onSuccess: () => utils.modules.pmt.shell.projects.list.invalidate(),
  });

  const deleteMut = trpc.modules.pmt.shell.projects.delete.useMutation({
    onSuccess: () => {
      utils.modules.pmt.shell.projects.list.invalidate();
      toast.success("Project deleted");
    },
  });

  const drafts = (projects || []).filter((p: any) => p.status === "draft");
  const active = (projects || []).filter((p: any) => p.status === "active");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Projects</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          New Project
        </Button>
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
              <p className="text-sm text-muted-foreground">No draft projects. Click "New Project" to create one.</p>
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
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => updateMut.mutate({ id: proj.id, status: "active" })}
                        disabled={updateMut.isPending}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Validate
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => deleteMut.mutate({ id: proj.id })}
                        disabled={deleteMut.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
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
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteMut.mutate({ id: proj.id })}
                      disabled={deleteMut.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Create Project Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Project name" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMut.mutate({ name: newName, description: newDesc || undefined })}
              disabled={!newName.trim() || createMut.isPending}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Panel: Board (Kanban)
// ════════════════════════════════════════════════════════════════════

function BoardPanel() {
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState("medium");
  const [createColumn, setCreateColumn] = useState("todo");
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data: projects } = trpc.modules.pmt.shell.projects.list.useQuery();
  const projectId = selectedProject || projects?.[0]?.id;

  const { data: tasks } = trpc.modules.pmt.shell.tasks.list.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId }
  );

  const createMut = trpc.modules.pmt.shell.tasks.create.useMutation({
    onSuccess: () => {
      utils.modules.pmt.shell.tasks.list.invalidate();
      setCreateOpen(false);
      setNewTitle("");
      setNewDesc("");
      toast.success("Task created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateMut = trpc.modules.pmt.shell.tasks.update.useMutation({
    onSuccess: () => utils.modules.pmt.shell.tasks.list.invalidate(),
    onError: (e: any) => toast.error(e.message),
  });

  const grouped: Record<string, any[]> = {};
  for (const col of STATUS_COLUMNS) grouped[col.key] = [];
  for (const task of tasks || []) {
    const key = task.status || "backlog";
    if (!grouped[key]) grouped[key] = [];
    grouped[key]!.push(task);
  }

  const handleDragStart = (e: React.DragEvent, taskId: number) => {
    e.dataTransfer.setData("taskId", String(taskId));
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e: React.DragEvent, colKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(colKey);
  };
  const handleDrop = (e: React.DragEvent, targetKey: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    const taskId = parseInt(e.dataTransfer.getData("taskId"), 10);
    if (!taskId) return;
    updateMut.mutate({ id: taskId, status: targetKey });
    toast.success(`Moved to ${STATUS_COLUMNS.find((c) => c.key === targetKey)?.label}`);
  };

  return (
    <div className="p-6 space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <LayoutGrid className="h-6 w-6" />
          Board
        </h1>
        <ProjectSelector projects={projects} projectId={projectId || null} onChange={setSelectedProject} />
      </div>

      {!projectId ? (
        <div className="text-center py-12 text-muted-foreground">
          No projects available. Create a project first.
        </div>
      ) : (
        <div className="flex-1 flex gap-3 overflow-x-auto pb-4">
          {STATUS_COLUMNS.map((col) => (
            <div
              key={col.key}
              className={`flex flex-col w-64 min-w-[256px] shrink-0 rounded-lg transition-colors ${
                dragOverColumn === col.key ? "bg-primary/5 ring-2 ring-primary/20" : ""
              }`}
              onDragOver={(e) => handleDragOver(e, col.key)}
              onDragLeave={() => setDragOverColumn(null)}
              onDrop={(e) => handleDrop(e, col.key)}
            >
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${col.color}`} />
                  <span className="text-sm font-medium">{col.label}</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {grouped[col.key]?.length || 0}
                  </Badge>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setCreateColumn(col.key); setCreateOpen(true); }}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
              <ScrollArea className="flex-1">
                <div className="space-y-2">
                  {grouped[col.key]?.map((task: any) => (
                    <Card
                      key={task.id}
                      className="cursor-grab hover:border-primary/30 transition-colors"
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      onDragEnd={() => setDragOverColumn(null)}
                    >
                      <CardContent className="p-3 space-y-2">
                        <p className="text-sm font-medium leading-tight">{task.title}</p>
                        <div className="flex items-center gap-1.5">
                          {task.type && (
                            <Badge className={`text-[10px] px-1.5 py-0 ${typeColors[task.type] || typeColors.task}`}>
                              {task.type}
                            </Badge>
                          )}
                          {task.priority && (
                            <Badge variant="outline" className={`text-[10px] ${priorityColors[task.priority] || ""}`}>
                              {task.priority}
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </div>
          ))}
        </div>
      )}

      {/* Create Task Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Task title" />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Description" rows={2} />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={newPriority} onValueChange={setNewPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!projectId) return;
                createMut.mutate({
                  projectId,
                  title: newTitle,
                  description: newDesc || undefined,
                  priority: newPriority as "low" | "medium" | "high" | "critical",
                });
              }}
              disabled={!newTitle.trim() || createMut.isPending}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Panel: Backlog — Sprint planning
// ════════════════════════════════════════════════════════════════════

function BacklogPanel() {
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [selectedSprintId, setSelectedSprintId] = useState<number | null>(null);
  const [createSprintOpen, setCreateSprintOpen] = useState(false);
  const [sprintName, setSprintName] = useState("");
  const [sprintGoal, setSprintGoal] = useState("");
  const [sprintStart, setSprintStart] = useState("");
  const [sprintEnd, setSprintEnd] = useState("");

  const utils = trpc.useUtils();
  const { data: projects } = trpc.modules.pmt.shell.projects.list.useQuery();
  const projectId = selectedProject || projects?.[0]?.id;

  const { data: tasks, isLoading } = trpc.modules.pmt.shell.tasks.list.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId }
  );

  const { data: sprints } = trpc.modules.pmt.shell.sprints.list.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId }
  );

  const activeSprint = selectedSprintId
    ? sprints?.find((s: any) => s.id === selectedSprintId)
    : sprints?.find((s: any) => s.status === "active") || sprints?.[0];

  const createSprintMut = trpc.modules.pmt.shell.sprints.create.useMutation({
    onSuccess: () => {
      utils.modules.pmt.shell.sprints.list.invalidate();
      setCreateSprintOpen(false);
      setSprintName("");
      setSprintGoal("");
      setSprintStart("");
      setSprintEnd("");
      toast.success("Sprint created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const addItemsMut = trpc.modules.pmt.shell.sprints.addItems.useMutation({
    onSuccess: () => {
      utils.modules.pmt.shell.tasks.list.invalidate();
      toast.success("Moved to sprint");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeItemsMut = trpc.modules.pmt.shell.sprints.removeItems.useMutation({
    onSuccess: () => {
      utils.modules.pmt.shell.tasks.list.invalidate();
      toast.success("Removed from sprint");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const backlogTasks = (tasks || []).filter((t: any) => !t.sprintId);
  const sprintTasks = activeSprint
    ? (tasks || []).filter((t: any) => t.sprintId === activeSprint.id)
    : [];

  const backlogPoints = backlogTasks.reduce((s: number, t: any) => s + (t.storyPoints || 0), 0);
  const sprintPoints = sprintTasks.reduce((s: number, t: any) => s + (t.storyPoints || 0), 0);

  return (
    <div className="p-6 space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <List className="h-6 w-6" />
          Backlog
        </h1>
        <div className="flex items-center gap-2">
          <ProjectSelector projects={projects} projectId={projectId || null} onChange={setSelectedProject} />
          {sprints && sprints.length > 0 && (
            <Select
              value={String(activeSprint?.id || "")}
              onValueChange={(v) => setSelectedSprintId(parseInt(v))}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select sprint" />
              </SelectTrigger>
              <SelectContent>
                {sprints.map((s: any) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name} ({s.status})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button size="sm" onClick={() => setCreateSprintOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New Sprint
          </Button>
        </div>
      </div>

      {!projectId ? (
        <div className="text-center py-12 text-muted-foreground">No projects available. Create a project first.</div>
      ) : isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
          {/* Backlog panel */}
          <div className="flex flex-col border rounded-lg">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">Backlog</span>
                <Badge variant="secondary" className="text-xs">{backlogTasks.length} items</Badge>
              </div>
              <span className="text-xs text-muted-foreground">{backlogPoints} pts</span>
            </div>
            <ScrollArea className="flex-1 p-3">
              <div className="space-y-2">
                {backlogTasks.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-8">No items in backlog</p>
                )}
                {backlogTasks.map((task: any) => (
                  <Card key={task.id} className="hover:border-primary/30 transition-colors">
                    <CardContent className="p-3 flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{task.title}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          {task.type && (
                            <Badge className={`text-[10px] px-1.5 py-0 ${typeColors[task.type] || typeColors.task}`}>{task.type}</Badge>
                          )}
                          {task.storyPoints != null && (
                            <Badge variant="outline" className="text-[10px]">{task.storyPoints} pts</Badge>
                          )}
                        </div>
                      </div>
                      {activeSprint && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          title="Move to sprint"
                          onClick={() => addItemsMut.mutate({ sprintId: activeSprint.id, taskIds: [task.id] })}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Sprint panel */}
          <div className="flex flex-col border rounded-lg">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">
                  {activeSprint ? `Sprint: ${activeSprint.name}` : "No Sprint Selected"}
                </span>
                <Badge variant="secondary" className="text-xs">{sprintTasks.length} items</Badge>
              </div>
              <span className="text-xs text-muted-foreground">{sprintPoints} pts</span>
            </div>
            <ScrollArea className="flex-1 p-3">
              <div className="space-y-2">
                {!activeSprint && (
                  <p className="text-center text-sm text-muted-foreground py-8">Create a sprint to start planning</p>
                )}
                {activeSprint && sprintTasks.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-8">No items in this sprint</p>
                )}
                {sprintTasks.map((task: any) => (
                  <Card key={task.id} className="hover:border-primary/30 transition-colors">
                    <CardContent className="p-3 flex items-center justify-between gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        title="Remove from sprint"
                        onClick={() => removeItemsMut.mutate({ sprintId: activeSprint.id, taskIds: [task.id] })}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{task.title}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          {task.type && (
                            <Badge className={`text-[10px] px-1.5 py-0 ${typeColors[task.type] || typeColors.task}`}>{task.type}</Badge>
                          )}
                          {task.storyPoints != null && (
                            <Badge variant="outline" className="text-[10px]">{task.storyPoints} pts</Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}

      {/* Create Sprint Dialog */}
      <Dialog open={createSprintOpen} onOpenChange={setCreateSprintOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Sprint</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={sprintName} onChange={(e) => setSprintName(e.target.value)} placeholder="Sprint 1" />
            </div>
            <div className="space-y-2">
              <Label>Goal</Label>
              <Textarea value={sprintGoal} onChange={(e) => setSprintGoal(e.target.value)} placeholder="What should the team accomplish?" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={sprintStart} onChange={(e) => setSprintStart(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date" value={sprintEnd} onChange={(e) => setSprintEnd(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateSprintOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!projectId) return;
                createSprintMut.mutate({
                  projectId,
                  name: sprintName,
                  goal: sprintGoal || undefined,
                  startDate: sprintStart,
                  endDate: sprintEnd,
                });
              }}
              disabled={!sprintName.trim() || !sprintStart || !sprintEnd || createSprintMut.isPending}
            >
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Panel: Timeline (Gantt)
// ════════════════════════════════════════════════════════════════════

const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 48;
const SIDEBAR_WIDTH = 200;

function daysBetween(a: Date, b: Date) {
  return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function formatMonthYear(d: Date) {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function TimelinePanel() {
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [pxPerDay, setPxPerDay] = useState(14);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: projects } = trpc.modules.pmt.shell.projects.list.useQuery();
  const projectId = selectedProject || projects?.[0]?.id;

  const { data: tasks, isLoading } = trpc.modules.pmt.shell.tasks.list.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId }
  );

  const timeline = useMemo(() => {
    if (!tasks || tasks.length === 0) return null;
    const tasksWithDates = tasks.filter((t: any) => t.startDate || t.dueDate);
    if (tasksWithDates.length === 0) return null;
    let minDate = new Date();
    let maxDate = new Date();
    let first = true;
    for (const t of tasksWithDates) {
      const start = t.startDate ? new Date(t.startDate) : null;
      const end = t.dueDate ? new Date(t.dueDate) : null;
      const d = start || end!;
      const e = end || start!;
      if (first) { minDate = new Date(d); maxDate = new Date(e); first = false; }
      else { if (d < minDate) minDate = new Date(d); if (e > maxDate) maxDate = new Date(e); }
    }
    minDate.setDate(minDate.getDate() - 7);
    maxDate.setDate(maxDate.getDate() + 7);
    const totalDays = daysBetween(minDate, maxDate);
    return { minDate, maxDate, totalDays, totalWidth: totalDays * pxPerDay };
  }, [tasks, pxPerDay]);

  const taskPositions = useMemo(() => {
    if (!tasks || !timeline) return new Map();
    const map = new Map<number, { x: number; w: number; y: number }>();
    tasks.forEach((t: any, i: number) => {
      const start = t.startDate ? new Date(t.startDate) : t.dueDate ? new Date(t.dueDate) : null;
      const end = t.dueDate ? new Date(t.dueDate) : t.startDate ? new Date(t.startDate) : null;
      if (!start || !end) return;
      const x = daysBetween(timeline.minDate, start) * pxPerDay;
      const w = Math.max(daysBetween(start, end) * pxPerDay, pxPerDay);
      map.set(t.id, { x, w, y: HEADER_HEIGHT + i * ROW_HEIGHT });
    });
    return map;
  }, [tasks, timeline, pxPerDay]);

  const dateLabels = useMemo(() => {
    if (!timeline) return [];
    const labels: { x: number; label: string; isMonth: boolean }[] = [];
    const d = new Date(timeline.minDate);
    for (let i = 0; i <= timeline.totalDays; i++) {
      const x = i * pxPerDay;
      if (pxPerDay >= 10 && i % 7 === 0) {
        labels.push({ x, label: `${d.getMonth() + 1}/${d.getDate()}`, isMonth: d.getDate() <= 7 });
      } else if (pxPerDay < 10 && (d.getDate() === 1 || i === 0)) {
        labels.push({ x, label: formatMonthYear(d), isMonth: true });
      }
      d.setDate(d.getDate() + 1);
    }
    return labels;
  }, [timeline, pxPerDay]);

  const todayX = useMemo(() => {
    if (!timeline) return null;
    const today = new Date();
    if (today < timeline.minDate || today > timeline.maxDate) return null;
    return daysBetween(timeline.minDate, today) * pxPerDay;
  }, [timeline, pxPerDay]);

  const svgHeight = tasks ? HEADER_HEIGHT + tasks.length * ROW_HEIGHT + 20 : 200;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarDays className="h-6 w-6" />
          Timeline
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPxPerDay((p) => Math.max(p / 1.5, 4))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPxPerDay((p) => Math.min(p * 1.5, 40))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            if (todayX != null && scrollRef.current) scrollRef.current.scrollLeft = todayX - scrollRef.current.clientWidth / 2;
          }}>Today</Button>
          <ProjectSelector projects={projects} projectId={projectId || null} onChange={setSelectedProject} />
        </div>
      </div>

      {!projectId ? (
        <div className="text-center py-12 text-muted-foreground">No projects available.</div>
      ) : isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !timeline ? (
        <div className="text-center py-12 text-muted-foreground">No tasks with dates. Set start or due dates on tasks.</div>
      ) : (
        <div className="border rounded-md flex overflow-hidden bg-background">
          <div className="flex-shrink-0 border-r bg-muted/30" style={{ width: SIDEBAR_WIDTH }}>
            <div className="px-3 font-semibold text-xs text-muted-foreground flex items-center border-b" style={{ height: HEADER_HEIGHT }}>Task</div>
            {(tasks || []).map((t: any) => (
              <div key={t.id} className="px-3 flex items-center text-sm truncate border-b border-border/50 hover:bg-muted/50" style={{ height: ROW_HEIGHT }} title={t.title}>
                <span className="w-2 h-2 rounded-full mr-2 flex-shrink-0" style={{ backgroundColor: TYPE_SVG_COLORS[t.type || "task"] || TYPE_SVG_COLORS.task }} />
                <span className="truncate">{t.title}</span>
              </div>
            ))}
          </div>
          <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden">
            <svg width={timeline.totalWidth} height={svgHeight} className="select-none">
              {(tasks || []).map((_: any, i: number) => (
                <rect key={`row-${i}`} x={0} y={HEADER_HEIGHT + i * ROW_HEIGHT} width={timeline.totalWidth} height={ROW_HEIGHT} fill={i % 2 === 0 ? "transparent" : "rgba(128,128,128,0.05)"} />
              ))}
              {dateLabels.map((dl, i) => (
                <line key={`grid-${i}`} x1={dl.x} y1={HEADER_HEIGHT} x2={dl.x} y2={svgHeight} stroke={dl.isMonth ? "rgba(128,128,128,0.3)" : "rgba(128,128,128,0.1)"} strokeWidth={dl.isMonth ? 1 : 0.5} />
              ))}
              {dateLabels.map((dl, i) => (
                <text key={`label-${i}`} x={dl.x + 4} y={HEADER_HEIGHT - 8} fontSize={10} fill="currentColor" className="text-muted-foreground" opacity={0.7}>{dl.label}</text>
              ))}
              <line x1={0} y1={HEADER_HEIGHT} x2={timeline.totalWidth} y2={HEADER_HEIGHT} stroke="rgba(128,128,128,0.3)" strokeWidth={1} />
              {(tasks || []).map((t: any) => {
                const pos = taskPositions.get(t.id);
                if (!pos) return null;
                const color = TYPE_SVG_COLORS[t.type || "task"] || TYPE_SVG_COLORS.task;
                const pct = (t.percentComplete ?? 0) / 100;
                const barY = pos.y + 6;
                const barH = ROW_HEIGHT - 12;
                return (
                  <g key={`bar-${t.id}`}>
                    <rect x={pos.x} y={barY} width={pos.w} height={barH} rx={3} fill={color} opacity={0.3} />
                    {pct > 0 && <rect x={pos.x} y={barY} width={pos.w * pct} height={barH} rx={3} fill={color} opacity={0.8} />}
                    <rect x={pos.x} y={barY} width={pos.w} height={barH} rx={3} fill="none" stroke={color} strokeWidth={1} />
                    {pos.w > 60 && (
                      <text x={pos.x + 6} y={barY + barH / 2 + 4} fontSize={10} fill="white" className="pointer-events-none">
                        {t.title.length > pos.w / 7 ? t.title.slice(0, Math.floor(pos.w / 7)) + "..." : t.title}
                      </text>
                    )}
                  </g>
                );
              })}
              {todayX != null && (
                <g>
                  <line x1={todayX} y1={0} x2={todayX} y2={svgHeight} stroke="#ef4444" strokeWidth={2} opacity={0.7} />
                  <text x={todayX + 4} y={12} fontSize={10} fill="#ef4444" fontWeight="bold">Today</text>
                </g>
              )}
            </svg>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Panel: Calendar
// ════════════════════════════════════════════════════════════════════

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function CalendarPanel() {
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const { data: projects } = trpc.modules.pmt.shell.projects.list.useQuery();
  const projectId = selectedProject || projects?.[0]?.id;

  const { data: tasks, isLoading } = trpc.modules.pmt.shell.tasks.list.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId }
  );

  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    const days: { date: Date; isCurrentMonth: boolean }[] = [];
    for (let i = firstDay - 1; i >= 0; i--) days.push({ date: new Date(year, month - 1, daysInPrevMonth - i), isCurrentMonth: false });
    for (let d = 1; d <= daysInMonth; d++) days.push({ date: new Date(year, month, d), isCurrentMonth: true });
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) days.push({ date: new Date(year, month + 1, d), isCurrentMonth: false });
    return days;
  }, [currentMonth]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    if (!tasks) return map;
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const d = new Date(t.dueDate);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [tasks]);

  const today = new Date();
  const monthLabel = currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const calTypeColors: Record<string, string> = {
    task: "bg-blue-500", bug: "bg-red-500", story: "bg-green-500",
    epic: "bg-purple-500", milestone: "bg-orange-500", feature: "bg-cyan-500",
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Calendar className="h-6 w-6" />
          Calendar
        </h1>
        <ProjectSelector projects={projects} projectId={projectId || null} onChange={setSelectedProject} />
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold min-w-[180px] text-center">{monthLabel}</h2>
        <Button variant="outline" size="icon" onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => { const now = new Date(); setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1)); }}>Today</Button>
      </div>

      {!projectId ? (
        <div className="text-center py-12 text-muted-foreground">No projects available.</div>
      ) : isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="border rounded-md overflow-hidden">
          <div className="grid grid-cols-7 bg-muted/50">
            {DAY_NAMES.map((d) => (
              <div key={d} className="px-2 py-2 text-xs font-semibold text-muted-foreground text-center border-b">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {calendarDays.map((day, i) => {
              const key = `${day.date.getFullYear()}-${day.date.getMonth()}-${day.date.getDate()}`;
              const dayTasks = tasksByDate.get(key) || [];
              const isToday = day.date.getFullYear() === today.getFullYear() && day.date.getMonth() === today.getMonth() && day.date.getDate() === today.getDate();
              return (
                <div key={i} className={`min-h-[100px] border-b border-r p-1 ${!day.isCurrentMonth ? "bg-muted/20 text-muted-foreground/50" : ""} ${isToday ? "bg-blue-500/10" : ""}`}>
                  <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? "bg-blue-500 text-white" : ""}`}>{day.date.getDate()}</div>
                  <div className="space-y-0.5">
                    {dayTasks.slice(0, 3).map((t: any) => (
                      <div key={t.id} className={`text-[10px] px-1 py-0.5 rounded truncate text-white ${calTypeColors[t.type || "task"] || calTypeColors.task}`} title={t.title}>{t.title}</div>
                    ))}
                    {dayTasks.length > 3 && <div className="text-[10px] text-muted-foreground px-1">+{dayTasks.length - 3} more</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Panel: Reports
// ════════════════════════════════════════════════════════════════════

function DonutChart({ data, colors, size = 160 }: { data: { label: string; value: number }[]; colors: Record<string, string>; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div className="text-sm text-muted-foreground text-center py-4">No data</div>;
  const r = size / 2 - 10;
  const cx = size / 2;
  const cy = size / 2;
  let cumAngle = -Math.PI / 2;
  return (
    <svg width={size} height={size} className="mx-auto">
      {data.filter(d => d.value > 0).map((d) => {
        const angle = (d.value / total) * 2 * Math.PI;
        const startX = cx + r * Math.cos(cumAngle);
        const startY = cy + r * Math.sin(cumAngle);
        cumAngle += angle;
        const endX = cx + r * Math.cos(cumAngle);
        const endY = cy + r * Math.sin(cumAngle);
        const large = angle > Math.PI ? 1 : 0;
        return (
          <path key={d.label} d={`M ${cx} ${cy} L ${startX} ${startY} A ${r} ${r} 0 ${large} 1 ${endX} ${endY} Z`} fill={colors[d.label] || "#94a3b8"} stroke="white" strokeWidth={2} />
        );
      })}
      <circle cx={cx} cy={cy} r={r * 0.55} fill="var(--background, white)" />
      <text x={cx} y={cy} textAnchor="middle" dy="0.35em" fontSize={20} fontWeight="bold" fill="currentColor">{total}</text>
    </svg>
  );
}

function ReportsPanel() {
  const [selectedProject, setSelectedProject] = useState<number | null>(null);

  const { data: projects } = trpc.modules.pmt.shell.projects.list.useQuery();
  const projectId = selectedProject || projects?.[0]?.id;

  const { data: tasks, isLoading } = trpc.modules.pmt.shell.tasks.list.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId }
  );

  const statusData = useMemo(() => {
    if (!tasks) return [];
    const counts: Record<string, number> = {};
    for (const t of tasks as any[]) { const s = t.status || "backlog"; counts[s] = (counts[s] || 0) + 1; }
    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  }, [tasks]);

  const typeData = useMemo(() => {
    if (!tasks) return [];
    const counts: Record<string, number> = {};
    for (const t of tasks as any[]) { const tp = t.type || "task"; counts[tp] = (counts[tp] || 0) + 1; }
    return Object.entries(counts).map(([label, value]) => ({ label, value }));
  }, [tasks]);

  const overdue = useMemo(() => {
    if (!tasks) return [];
    const now = new Date();
    return (tasks as any[]).filter(t => t.dueDate && new Date(t.dueDate) < now && t.status !== "done");
  }, [tasks]);

  const workload = useMemo(() => {
    if (!tasks) return [];
    const counts: Record<string, number> = {};
    for (const t of tasks as any[]) {
      const assignee = t.assigneeType === "ai" ? "AI Agent" : t.assigneeId ? `User #${t.assigneeId}` : "Unassigned";
      counts[assignee] = (counts[assignee] || 0) + 1;
    }
    return Object.entries(counts).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  }, [tasks]);

  const maxWorkload = Math.max(...workload.map(w => w.value), 1);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-6 w-6" />
          Reports
        </h1>
        <ProjectSelector projects={projects} projectId={projectId || null} onChange={setSelectedProject} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Status Distribution</CardTitle></CardHeader>
            <CardContent>
              <DonutChart data={statusData} colors={STATUS_CHART_COLORS} />
              <div className="flex flex-wrap gap-2 mt-3 justify-center">
                {statusData.map(d => (
                  <div key={d.label} className="flex items-center gap-1 text-xs">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_CHART_COLORS[d.label] || "#94a3b8" }} />
                    {d.label} ({d.value})
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Overdue Tasks
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-destructive mb-3">{overdue.length}</div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {overdue.slice(0, 5).map((t: any) => (
                  <div key={t.id} className="text-xs flex items-center justify-between">
                    <span className="truncate">{t.title}</span>
                    <Badge variant="destructive" className="text-[9px]">{new Date(t.dueDate).toLocaleDateString()}</Badge>
                  </div>
                ))}
                {overdue.length > 5 && <div className="text-xs text-muted-foreground">+{overdue.length - 5} more</div>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Workload by Assignee</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {workload.map(w => (
                  <div key={w.label} className="space-y-1">
                    <div className="flex justify-between text-xs"><span>{w.label}</span><span>{w.value}</span></div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${(w.value / maxWorkload) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Type Breakdown</CardTitle></CardHeader>
            <CardContent>
              <DonutChart data={typeData} colors={TYPE_CHART_COLORS} />
              <div className="flex flex-wrap gap-2 mt-3 justify-center">
                {typeData.map(d => (
                  <div key={d.label} className="flex items-center gap-1 text-xs">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: TYPE_CHART_COLORS[d.label] || "#94a3b8" }} />
                    {d.label} ({d.value})
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Panel: Settings
// ════════════════════════════════════════════════════════════════════

function SettingsPanel() {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>
      <p className="text-muted-foreground">PM Shell configuration — statuses, types, custom fields.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Task Statuses</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {STATUS_COLUMNS.map((col) => (
                <div key={col.key} className="flex items-center gap-2">
                  <div className={`h-3 w-3 rounded-full ${col.color}`} />
                  <span className="text-sm">{col.label}</span>
                  <span className="text-xs text-muted-foreground ml-auto">{col.key}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Work Item Types</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(typeColors).map(([key, cls]) => (
                <div key={key} className="flex items-center gap-2">
                  <Badge className={`text-[10px] px-1.5 py-0 ${cls}`}>{key}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// Main Shell
// ════════════════════════════════════════════════════════════════════

export default function PMShellPage() {
  const [activeNav, setActiveNav] = useState<NavKey>("overview");
  const [collapsed, setCollapsed] = useState(false);

  const renderPanel = () => {
    switch (activeNav) {
      case "overview": return <OverviewPanel />;
      case "projects": return <ProjectsPanel />;
      case "board": return <BoardPanel />;
      case "backlog": return <BacklogPanel />;
      case "timeline": return <TimelinePanel />;
      case "calendar": return <CalendarPanel />;
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
