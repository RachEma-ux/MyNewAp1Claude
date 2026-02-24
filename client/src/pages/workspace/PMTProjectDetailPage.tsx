/**
 * PMT Project Detail — Tasks list for a single project + task drawer
 */

import { useState } from "react";
import { useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Plus, ArrowLeft, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

export function PMTProjectDetailPage({ workspaceId }: { workspaceId: number }) {
  const params = useParams<{ projectId: string }>();
  const projectId = parseInt(params.projectId || "0", 10);

  const [createOpen, setCreateOpen] = useState(false);
  const [drawerTaskId, setDrawerTaskId] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState("medium");

  const utils = trpc.useUtils();
  const { data: project } = trpc.modules.pmt.projects.get.useQuery(
    { id: projectId, workspaceId },
    { enabled: projectId > 0 }
  );

  const { data: tasks } = trpc.modules.pmt.tasks.list.useQuery(
    { workspaceId, projectId },
    { enabled: projectId > 0 }
  );

  const { data: drawerTask } = trpc.modules.pmt.tasks.get.useQuery(
    { id: drawerTaskId!, workspaceId },
    { enabled: !!drawerTaskId }
  );

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
      toast.success("Task updated");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.modules.pmt.tasks.delete.useMutation({
    onSuccess: () => {
      utils.modules.pmt.tasks.list.invalidate();
      setDrawerTaskId(null);
      toast.success("Task deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <Link href={`/w/${workspaceId}/projects`}>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{project?.name || "Project"}</h1>
          {project?.description && (
            <p className="text-sm text-muted-foreground">{project.description}</p>
          )}
        </div>
        <div className="flex-1" />
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add Task
        </Button>
      </div>

      {/* Tasks list */}
      {tasks && tasks.length > 0 ? (
        <div className="space-y-2">
          {tasks.map((task) => (
            <Card
              key={task.id}
              className="cursor-pointer hover:border-primary/30 transition-colors"
              onClick={() => setDrawerTaskId(task.id)}
            >
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <input
                    type="checkbox"
                    checked={task.status === "done"}
                    onChange={(e) => {
                      e.stopPropagation();
                      updateMut.mutate({
                        id: task.id,
                        workspaceId,
                        status: task.status === "done" ? "todo" : "done",
                      });
                    }}
                    className="h-4 w-4 rounded"
                  />
                  <span
                    className={`text-sm ${
                      task.status === "done" ? "line-through text-muted-foreground" : ""
                    }`}
                  >
                    {task.title}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {task.priority && (
                    <Badge variant="outline" className="text-[10px]">
                      {task.priority}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[10px]">
                    {task.status || "backlog"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          No tasks yet. Click "Add Task" to create one.
        </div>
      )}

      {/* Task Drawer */}
      <Sheet open={!!drawerTaskId} onOpenChange={(open) => !open && setDrawerTaskId(null)}>
        <SheetContent side="right" className="w-[400px] sm:max-w-[400px]">
          <SheetHeader>
            <SheetTitle>{drawerTask?.title || "Task"}</SheetTitle>
            <SheetDescription>Task details and actions</SheetDescription>
          </SheetHeader>
          {drawerTask && (
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select
                  value={drawerTask.status || "backlog"}
                  onValueChange={(v) =>
                    updateMut.mutate({ id: drawerTask.id, workspaceId, status: v })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="backlog">Backlog</SelectItem>
                    <SelectItem value="todo">To Do</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="review">Review</SelectItem>
                    <SelectItem value="done">Done</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Priority</Label>
                <Select
                  value={drawerTask.priority || "medium"}
                  onValueChange={(v) =>
                    updateMut.mutate({ id: drawerTask.id, workspaceId, priority: v })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {drawerTask.description && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Description</Label>
                  <p className="text-sm">{drawerTask.description}</p>
                </div>
              )}

              <Separator />

              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (confirm("Delete this task?")) {
                    deleteMut.mutate({ id: drawerTask.id, workspaceId });
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete Task
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Create Dialog */}
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
              onClick={() =>
                createMut.mutate({
                  workspaceId,
                  projectId,
                  title: newTitle,
                  description: newDesc || undefined,
                  priority: newPriority as "low" | "medium" | "high" | "critical",
                })
              }
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
