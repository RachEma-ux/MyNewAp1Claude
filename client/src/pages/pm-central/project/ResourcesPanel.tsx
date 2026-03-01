import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, Users, BarChart3, Calendar } from "lucide-react";

export default function ResourcesPanel({ projectId }: { projectId: number }) {
  const tasksQuery = trpc.modules.pmt.shell.tasks.list.useQuery({ projectId });
  const allTasks = tasksQuery.data ?? [];

  if (tasksQuery.isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  // Aggregate resource allocation from tasks
  const assigneeMap: Record<number, { count: number; done: number; name: string }> = {};
  allTasks.forEach((t: any) => {
    const aid = t.assigneeId || 0;
    if (!assigneeMap[aid]) assigneeMap[aid] = { count: 0, done: 0, name: aid === 0 ? "Unassigned" : `User #${aid}` };
    assigneeMap[aid].count++;
    if (t.status === "done") assigneeMap[aid].done++;
  });

  const resources = Object.entries(assigneeMap).sort((a, b) => b[1].count - a[1].count);
  const totalAssigned = allTasks.filter((t: any) => t.assigneeId).length;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Resources & Capacity</h2>
      <p className="text-sm text-muted-foreground">Team allocation, capacity utilization, and workload distribution</p>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Team Members</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{Object.keys(assigneeMap).filter(k => k !== "0").length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Tasks Assigned</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{totalAssigned}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Unassigned</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-yellow-500">{allTasks.length - totalAssigned}</div></CardContent>
        </Card>
      </div>

      {resources.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <Users className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No tasks assigned yet. Assign tasks to team members to see resource allocation.</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" />Workload Distribution</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {resources.map(([id, data]) => {
              const pct = data.count > 0 ? Math.round((data.done / data.count) * 100) : 0;
              return (
                <div key={id} className="flex items-center gap-3">
                  <span className="text-sm w-28 truncate">{data.name}</span>
                  <div className="flex-1 bg-muted rounded-full h-2">
                    <div className="bg-primary rounded-full h-2 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground w-20 text-right">{data.done}/{data.count} done</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
