/**
 * PMT Backlog — Two-panel view: unassigned backlog items and sprint items
 */

import { useState } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, ArrowRight, ArrowLeft, List } from "lucide-react";
import { toast } from "sonner";

const typeColors: Record<string, string> = {
  task: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  bug: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  story: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  epic: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  milestone: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  feature: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200",
};

export function PMTBacklogPage() {
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [selectedSprintId, setSelectedSprintId] = useState<number | null>(null);
  const [createSprintOpen, setCreateSprintOpen] = useState(false);
  const [sprintName, setSprintName] = useState("");
  const [sprintGoal, setSprintGoal] = useState("");
  const [sprintStart, setSprintStart] = useState("");
  const [sprintEnd, setSprintEnd] = useState("");

  const utils = trpc.useUtils();
  const { data: projects } = trpc.modules.pmt.projects.list.useQuery();
  const projectId = selectedProject || projects?.[0]?.id;

  const { data: tasks } = trpc.modules.pmt.tasks.list.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId }
  );

  const { data: sprints } = trpc.modules.pmt.sprints.list.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId }
  );

  const activeSprint = selectedSprintId
    ? sprints?.find((s: any) => s.id === selectedSprintId)
    : sprints?.find((s: any) => s.status === "active") || sprints?.[0];

  const createSprintMut = trpc.modules.pmt.sprints.create.useMutation({
    onSuccess: () => {
      utils.modules.pmt.sprints.list.invalidate();
      setCreateSprintOpen(false);
      setSprintName("");
      setSprintGoal("");
      setSprintStart("");
      setSprintEnd("");
      toast.success("Sprint created");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const addItemsMut = trpc.modules.pmt.sprints.addItems.useMutation({
    onSuccess: () => {
      utils.modules.pmt.tasks.list.invalidate();
      toast.success("Moved to sprint");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const removeItemsMut = trpc.modules.pmt.sprints.removeItems.useMutation({
    onSuccess: () => {
      utils.modules.pmt.tasks.list.invalidate();
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
          <Button size="sm" onClick={() => setCreateSprintOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New Sprint
          </Button>
        </div>
      </div>

      {!projectId ? (
        <div className="text-center py-12 text-muted-foreground">
          No projects available. Create a project first.
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
          {/* Backlog panel */}
          <div className="flex flex-col border rounded-lg">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">Backlog</span>
                <Badge variant="secondary" className="text-xs">
                  {backlogTasks.length} items
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground">{backlogPoints} pts</span>
            </div>
            <ScrollArea className="flex-1 p-3">
              <div className="space-y-2">
                {backlogTasks.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    No items in backlog
                  </p>
                )}
                {backlogTasks.map((task: any) => (
                  <Card key={task.id} className="hover:border-primary/30 transition-colors">
                    <CardContent className="p-3 flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{task.title}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          {task.type && (
                            <Badge className={`text-[10px] px-1.5 py-0 ${typeColors[task.type] || typeColors.task}`}>
                              {task.type}
                            </Badge>
                          )}
                          {task.storyPoints != null && (
                            <Badge variant="outline" className="text-[10px]">
                              {task.storyPoints} pts
                            </Badge>
                          )}
                        </div>
                      </div>
                      {activeSprint && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          title="Move to sprint"
                          onClick={() =>
                            addItemsMut.mutate({
                              sprintId: activeSprint.id,
                              taskIds: [task.id],
                            })
                          }
                        >
                          <ArrowRight className="h-4 w-4" />
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
                <Badge variant="secondary" className="text-xs">
                  {sprintTasks.length} items
                </Badge>
              </div>
              <span className="text-xs text-muted-foreground">{sprintPoints} pts</span>
            </div>
            <ScrollArea className="flex-1 p-3">
              <div className="space-y-2">
                {!activeSprint && (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    Create a sprint to start planning
                  </p>
                )}
                {activeSprint && sprintTasks.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    No items in this sprint
                  </p>
                )}
                {sprintTasks.map((task: any) => (
                  <Card key={task.id} className="hover:border-primary/30 transition-colors">
                    <CardContent className="p-3 flex items-center justify-between gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        title="Remove from sprint"
                        onClick={() =>
                          removeItemsMut.mutate({
                            sprintId: activeSprint.id,
                            taskIds: [task.id],
                          })
                        }
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </Button>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{task.title}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          {task.type && (
                            <Badge className={`text-[10px] px-1.5 py-0 ${typeColors[task.type] || typeColors.task}`}>
                              {task.type}
                            </Badge>
                          )}
                          {task.storyPoints != null && (
                            <Badge variant="outline" className="text-[10px]">
                              {task.storyPoints} pts
                            </Badge>
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
              <Input
                value={sprintName}
                onChange={(e) => setSprintName(e.target.value)}
                placeholder="Sprint 1"
              />
            </div>
            <div className="space-y-2">
              <Label>Goal</Label>
              <Textarea
                value={sprintGoal}
                onChange={(e) => setSprintGoal(e.target.value)}
                placeholder="What should the team accomplish?"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={sprintStart}
                  onChange={(e) => setSprintStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={sprintEnd}
                  onChange={(e) => setSprintEnd(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateSprintOpen(false)}>
              Cancel
            </Button>
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
