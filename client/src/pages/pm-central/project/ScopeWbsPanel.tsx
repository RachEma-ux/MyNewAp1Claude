import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";

export default function ScopeWbsPanel({ projectId }: { projectId: number }) {
  const tasksQuery = trpc.modules.pmt.shell.tasks.list.useQuery({ projectId });
  const allTasks = tasksQuery.data ?? [];


  // Group tasks by parent (simulate WBS hierarchy)
  const topLevel = allTasks.filter((t: any) => !t.parentId);
  const childMap: Record<number, any[]> = {};
  allTasks.forEach((t: any) => {
    if (t.parentId) {
      if (!childMap[t.parentId]) childMap[t.parentId] = [];
      childMap[t.parentId].push(t);
    }
  });

  const statusIcon = (status: string) => {
    if (status === "done") return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
    if (status === "in_progress" || status === "review") return <Clock className="h-3.5 w-3.5 text-blue-500" />;
    return <Circle className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  const totalDone = allTasks.filter((t: any) => t.status === "done").length;
  const completionPct = allTasks.length > 0 ? Math.round((totalDone / allTasks.length) * 100) : 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Scope & WBS</h2>
        <p className="text-sm text-muted-foreground">Work breakdown structure — hierarchical view of all deliverable work packages</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Total Work Packages</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{allTasks.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Completed</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold text-green-500">{totalDone}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Completion</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">{completionPct}%</div></CardContent>
        </Card>
      </div>

      {allTasks.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <Network className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No work packages defined. Break down scope into tasks to build the WBS.</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Network className="h-4 w-4" />Work Breakdown</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1">
              {topLevel.map((task: any) => (
                <div key={task.id}>
                  <div className="flex items-center gap-2 p-2 rounded hover:bg-muted/50">
                    {statusIcon(task.status)}
                    <span className="text-sm font-medium flex-1">{task.title}</span>
                    <Badge variant="outline" className="text-[10px]">{task.status?.replace(/_/g, " ")}</Badge>
                  </div>
                  {childMap[task.id]?.map((child: any) => (
                    <div key={child.id} className="flex items-center gap-2 p-2 pl-8 rounded hover:bg-muted/50">
                      {statusIcon(child.status)}
                      <span className="text-sm flex-1">{child.title}</span>
                      <Badge variant="outline" className="text-[10px]">{child.status?.replace(/_/g, " ")}</Badge>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
