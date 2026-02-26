/**
 * PMT Kanban Board — Task board grouped by status with drag-and-drop
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, LayoutGrid } from "lucide-react";
import { toast } from "sonner";
import { PMTTaskDetailDrawer } from "./PMTTaskDetailDrawer";

const COLUMNS = [
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

export function PMTKanbanPage({ workspaceId }: { workspaceId: number }) {
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState("medium");
  const [createColumn, setCreateColumn] = useState("todo");
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data: projects } = trpc.modules.pmt.projects.list.useQuery({ workspaceId });
  const projectId = selectedProject || projects?.[0]?.id;

  const { data: tasks } = trpc.modules.pmt.tasks.list.useQuery(
    { workspaceId, projectId: projectId! },
    { enabled: !!projectId }
  );

  // Check governance freeze from the project
  const { data: project } = trpc.modules.pmt.projects.get.useQuery(
    { id: projectId!, workspaceId },
    { enabled: !!projectId }
  );
  const isFrozen = project?.governanceStage === "frozen";

  const createMut = trpc.modules.pmt.tasks.create.useMutation({
    onSuccess: () => {
      utils.modules.pmt.tasks.list.invalidate();
      setCreateOpen(false);
      setNewTitle("");
      setNewDesc("");
      toast.success("Task created");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateMut = trpc.modules.pmt.tasks.update.useMutation({
    onSuccess: () => {
      utils.modules.pmt.tasks.list.invalidate();
      utils.modules.pmt.tasks.get.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const grouped: Record<string, typeof tasks> = {};
  for (const col of COLUMNS) grouped[col.key] = [];
  for (const task of tasks || []) {
    const status = task.status || "backlog";
    if (!grouped[status]) grouped[status] = [];
    grouped[status]!.push(task);
  }

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, taskId: number, currentStatus: string) => {
    e.dataTransfer.setData("taskId", String(taskId));
    e.dataTransfer.setData("fromStatus", currentStatus);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, colKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(colKey);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    const taskId = parseInt(e.dataTransfer.getData("taskId"), 10);
    const fromStatus = e.dataTransfer.getData("fromStatus");
    if (!taskId || fromStatus === targetStatus) return;
    updateMut.mutate({ id: taskId, workspaceId, status: targetStatus });
    toast.success(`Moved to ${COLUMNS.find((c) => c.key === targetStatus)?.label}`);
  };

  const handleDragEnd = () => {
    setDragOverColumn(null);
  };

  return (
    <div className="p-6 space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <LayoutGrid className="h-6 w-6" />
          Board
        </h1>
        <div className="flex items-center gap-2">
          {projects && projects.length > 0 && (
            <Select
              value={String(projectId || "")}
              onValueChange={(v) => setSelectedProject(parseInt(v))}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {!projectId ? (
        <div className="text-center py-12 text-muted-foreground">
          No projects available. Create a project first.
        </div>
      ) : (
        <div className="flex-1 flex gap-3 overflow-x-auto pb-4">
          {COLUMNS.map((col) => (
            <div
              key={col.key}
              className={`flex flex-col w-64 min-w-[256px] shrink-0 rounded-lg transition-colors ${
                dragOverColumn === col.key ? "bg-primary/5 ring-2 ring-primary/20" : ""
              }`}
              onDragOver={(e) => handleDragOver(e, col.key)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, col.key)}
            >
              {/* Column header */}
              <div className="flex items-center justify-between mb-2 px-1">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${col.color}`} />
                  <span className="text-sm font-medium">{col.label}</span>
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {grouped[col.key]?.length || 0}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => {
                    setCreateColumn(col.key);
                    setCreateOpen(true);
                  }}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              {/* Cards */}
              <ScrollArea className="flex-1">
                <div className="space-y-2">
                  {grouped[col.key]?.map((task) => (
                    <Card
                      key={task.id}
                      className="cursor-pointer hover:border-primary/30 transition-colors"
                      draggable={!isFrozen}
                      onDragStart={(e) => handleDragStart(e, task.id, task.status)}
                      onDragEnd={handleDragEnd}
                      onClick={() => setSelectedTaskId(task.id)}
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
                          {task.assigneeType && (
                            <Badge variant="outline" className="text-[10px]">
                              {task.assigneeType}
                            </Badge>
                          )}
                        </div>
                        {/* Quick status change */}
                        <div className="flex gap-1 flex-wrap">
                          {COLUMNS.filter((c) => c.key !== task.status).map((c) => (
                            <button
                              key={c.key}
                              onClick={(e) => {
                                e.stopPropagation();
                                updateMut.mutate({ id: task.id, workspaceId, status: c.key });
                              }}
                              className="text-[9px] text-muted-foreground hover:text-foreground transition-colors"
                            >
                              {c.label}
                            </button>
                          ))}
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
              <Input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Task title"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="Description"
                rows={2}
              />
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
                  workspaceId,
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

      {/* Task Detail Drawer */}
      <PMTTaskDetailDrawer
        workspaceId={workspaceId}
        taskId={selectedTaskId}
        open={!!selectedTaskId}
        onOpenChange={(open) => { if (!open) setSelectedTaskId(null); }}
      />
    </div>
  );
}
