/**
 * PMT Sprint Board — Kanban board filtered to the active sprint
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Columns3 } from "lucide-react";
import { toast } from "sonner";

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

export function PMTSprintBoardPage({ workspaceId }: { workspaceId: number }) {
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [selectedSprintId, setSelectedSprintId] = useState<number | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const utils = trpc.useUtils();
  const { data: projects } = trpc.modules.pmt.projects.list.useQuery({ workspaceId });
  const projectId = selectedProject || projects?.[0]?.id;

  const { data: sprints } = trpc.modules.pmt.sprints.list.useQuery(
    { workspaceId, projectId: projectId! },
    { enabled: !!projectId }
  );

  const activeSprint = selectedSprintId
    ? sprints?.find((s: any) => s.id === selectedSprintId)
    : sprints?.find((s: any) => s.status === "active");

  const { data: tasks, isLoading } = trpc.modules.pmt.tasks.list.useQuery(
    { workspaceId, projectId: projectId! },
    { enabled: !!projectId }
  );

  const updateMut = trpc.modules.pmt.tasks.update.useMutation({
    onSuccess: () => {
      utils.modules.pmt.tasks.list.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const sprintTasks = activeSprint
    ? (tasks || []).filter((t: any) => t.sprintId === activeSprint.id)
    : [];

  const grouped: Record<string, any[]> = {};
  for (const col of COLUMNS) grouped[col.key] = [];
  for (const task of sprintTasks) {
    const status = task.status || "backlog";
    if (!grouped[status]) grouped[status] = [];
    grouped[status]!.push(task);
  }

  const doneCount = grouped["done"]?.length || 0;
  const totalCount = sprintTasks.length;
  const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, taskId: number) => {
    e.dataTransfer.setData("taskId", String(taskId));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, colKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(colKey);
  };

  const handleDrop = (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    setDragOverColumn(null);
    const taskId = parseInt(e.dataTransfer.getData("taskId"), 10);
    if (!taskId) return;
    updateMut.mutate({ id: taskId, workspaceId, status: targetStatus });
    toast.success(`Moved to ${COLUMNS.find((c) => c.key === targetStatus)?.label}`);
  };

  return (
    <div className="p-6 space-y-4 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Columns3 className="h-6 w-6" />
          Sprint Board
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
                {projects.map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
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
        </div>
      </div>

      {/* Sprint header bar */}
      {activeSprint && (
        <div className="flex items-center gap-4 bg-muted/30 border rounded-lg px-4 py-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{activeSprint.name}</span>
              <Badge variant={activeSprint.status === "active" ? "default" : "secondary"}>
                {activeSprint.status}
              </Badge>
            </div>
            {activeSprint.goal && (
              <p className="text-sm text-muted-foreground mt-0.5">{activeSprint.goal}</p>
            )}
          </div>
          <div className="text-right text-sm">
            <p className="text-muted-foreground">
              {activeSprint.startDate && new Date(activeSprint.startDate).toLocaleDateString()} —{" "}
              {activeSprint.endDate && new Date(activeSprint.endDate).toLocaleDateString()}
            </p>
            <p className="text-xs text-muted-foreground">
              {progressPct}% complete ({doneCount}/{totalCount})
            </p>
          </div>
        </div>
      )}

      {!projectId ? (
        <div className="text-center py-12 text-muted-foreground">
          No projects available. Create a project first.
        </div>
      ) : !activeSprint ? (
        <div className="text-center py-12 text-muted-foreground">
          No active sprint. Start a sprint from the Backlog page.
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
              onDragLeave={() => setDragOverColumn(null)}
              onDrop={(e) => handleDrop(e, col.key)}
            >
              <div className="flex items-center gap-2 mb-2 px-1">
                <div className={`h-2 w-2 rounded-full ${col.color}`} />
                <span className="text-sm font-medium">{col.label}</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {grouped[col.key]?.length || 0}
                </Badge>
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
                        <div className="flex items-center gap-1.5 flex-wrap">
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
                          {task.storyPoints != null && (
                            <Badge variant="secondary" className="text-[10px]">
                              {task.storyPoints} pts
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
    </div>
  );
}
