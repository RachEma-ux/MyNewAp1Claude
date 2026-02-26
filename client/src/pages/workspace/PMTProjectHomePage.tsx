/**
 * PMT Project Home — Dashboard with configurable widgets
 */

import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, LayoutDashboard, CheckCircle2, Clock, Users, Target } from "lucide-react";

const statusLabels: Record<string, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
};

export function PMTProjectHomePage({ workspaceId }: { workspaceId: number }) {
  const [selectedProject, setSelectedProject] = useState<number | null>(null);

  const { data: projects } = trpc.modules.pmt.projects.list.useQuery({ workspaceId });
  const projectId = selectedProject || projects?.[0]?.id;

  const { data: tasks, isLoading } = trpc.modules.pmt.tasks.list.useQuery(
    { workspaceId, projectId: projectId! },
    { enabled: !!projectId }
  );

  const { data: sprints } = trpc.modules.pmt.sprints.list.useQuery(
    { workspaceId, projectId: projectId! },
    { enabled: !!projectId }
  );

  const statusCounts = useMemo(() => {
    if (!tasks) return {};
    const counts: Record<string, number> = {};
    for (const t of tasks as any[]) {
      const s = t.status || "backlog";
      counts[s] = (counts[s] || 0) + 1;
    }
    return counts;
  }, [tasks]);

  const upcoming = useMemo(() => {
    if (!tasks) return [];
    const now = new Date();
    return (tasks as any[])
      .filter(t => t.dueDate && new Date(t.dueDate) > now && t.status !== "done")
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
      .slice(0, 5);
  }, [tasks]);

  const activeSprint = useMemo(() => {
    if (!sprints) return null;
    return (sprints as any[]).find(s => s.status === "active") || null;
  }, [sprints]);

  const assignees = useMemo(() => {
    if (!tasks) return [];
    const set = new Set<string>();
    for (const t of tasks as any[]) {
      if (t.assigneeId) set.add(`User #${t.assigneeId}`);
      if (t.assigneeType === "ai") set.add("AI Agent");
    }
    return Array.from(set);
  }, [tasks]);

  const total = tasks?.length || 0;
  const done = tasks ? (tasks as any[]).filter(t => t.status === "done").length : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <LayoutDashboard className="h-6 w-6" />
          Project Home
        </h1>
        {projects && projects.length > 0 && (
          <Select value={String(projectId || "")} onValueChange={(v) => setSelectedProject(parseInt(v))}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p: any) => (
                <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {!projectId ? (
        <div className="text-center py-12 text-muted-foreground">
          No projects available.
        </div>
      ) : isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Task Status */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4" />
                Task Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold mb-2">{done}/{total} done</div>
              {total > 0 && (
                <div className="h-2 bg-muted rounded-full overflow-hidden mb-3">
                  <div className="h-full bg-green-500 rounded-full" style={{ width: `${(done / total) * 100}%` }} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-1">
                {Object.entries(statusCounts).map(([status, count]) => (
                  <div key={status} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{statusLabels[status] || status}</span>
                    <Badge variant="secondary" className="text-[10px]">{count}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Upcoming Due */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Upcoming Due
              </CardTitle>
            </CardHeader>
            <CardContent>
              {upcoming.length === 0 ? (
                <div className="text-sm text-muted-foreground">No upcoming deadlines</div>
              ) : (
                <div className="space-y-2">
                  {upcoming.map((t: any) => (
                    <div key={t.id} className="flex items-center justify-between text-sm">
                      <span className="truncate flex-1">{t.title}</span>
                      <Badge variant="outline" className="text-[10px] ml-2">
                        {new Date(t.dueDate).toLocaleDateString()}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Sprint Progress */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1">
                <Target className="h-4 w-4" />
                Active Sprint
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!activeSprint ? (
                <div className="text-sm text-muted-foreground">No active sprint</div>
              ) : (
                <div className="space-y-2">
                  <div className="font-medium">{activeSprint.name}</div>
                  {activeSprint.goal && <div className="text-xs text-muted-foreground">{activeSprint.goal}</div>}
                  <div className="text-xs text-muted-foreground">
                    {new Date(activeSprint.startDate).toLocaleDateString()} — {new Date(activeSprint.endDate).toLocaleDateString()}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Team */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1">
                <Users className="h-4 w-4" />
                Team ({assignees.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {assignees.length === 0 ? (
                <div className="text-sm text-muted-foreground">No assignees</div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {assignees.map(a => (
                    <Badge key={a} variant="secondary" className="text-[10px]">{a}</Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
