import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, Calendar, ArrowRight } from "lucide-react";

export default function TimelinePanel({ projectId }: { projectId: number }) {
  const projectQuery = trpc.modules.pmt.shell.projects.get.useQuery({ id: projectId });
  const tasksQuery = trpc.modules.pmt.shell.tasks.list.useQuery({ projectId });
  const sprintsQuery = trpc.modules.pmt.shell.sprints.list.useQuery({ projectId });

  const project = projectQuery.data;
  const tasks = tasksQuery.data ?? [];
  const sprints = sprintsQuery.data ?? [];
  const milestoneTasks = tasks.filter((t: any) => t.type === "milestone");

  if (projectQuery.isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Timeline</h2>

      {/* Project dates */}
      {project && (
        <Card>
          <CardContent className="pt-4 flex items-center gap-4">
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Start</div>
              <div className="text-sm font-medium">{project.startDate ? new Date(project.startDate).toLocaleDateString() : "TBD"}</div>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <div className="text-center">
              <div className="text-xs text-muted-foreground">Target</div>
              <div className="text-sm font-medium">{project.targetDate ? new Date(project.targetDate).toLocaleDateString() : "TBD"}</div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sprints */}
      <Card>
        <CardHeader><CardTitle className="text-base">Sprints / Iterations</CardTitle></CardHeader>
        <CardContent>
          {sprints.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sprints defined yet.</p>
          ) : (
            <div className="space-y-2">
              {sprints.map((sprint: any) => (
                <div key={sprint.id} className="flex items-center justify-between p-2 rounded border">
                  <div>
                    <span className="text-sm font-medium">{sprint.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {new Date(sprint.startDate).toLocaleDateString()} — {new Date(sprint.endDate).toLocaleDateString()}
                    </span>
                  </div>
                  <Badge variant={sprint.status === "active" ? "default" : "secondary"}>{sprint.status}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Milestones */}
      <Card>
        <CardHeader><CardTitle className="text-base">Milestones</CardTitle></CardHeader>
        <CardContent>
          {milestoneTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No milestones defined. Create tasks with type "milestone".</p>
          ) : (
            <div className="space-y-2">
              {milestoneTasks.map((task: any) => (
                <div key={task.id} className="flex items-center justify-between p-2 rounded border">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm">{task.title}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : "No date"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
