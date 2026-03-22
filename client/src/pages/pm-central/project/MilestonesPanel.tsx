import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";

export default function MilestonesPanel({ projectId }: { projectId: number }) {
  const tasksQuery = trpc.modules.pmt.shell.tasks.list.useQuery({ projectId });
  const allTasks = tasksQuery.data ?? [];


  // Milestones = tasks tagged as milestones or top-level with due dates
  const milestones = allTasks.filter((t: any) => t.isMilestone || t.priority === "critical");
  const now = new Date();

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Milestones</h2>
      <p className="text-sm text-muted-foreground">Key delivery checkpoints and target dates</p>

      {milestones.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <Flag className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No milestones defined. Mark critical tasks as milestones to track key delivery dates.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {milestones.map((m: any) => {
            const due = m.dueDate ? new Date(m.dueDate) : null;
            const overdue = due && due < now && m.status !== "done";
            const done = m.status === "done";
            return (
              <Card key={m.id} className={overdue ? "border-red-500/30" : done ? "border-green-500/30" : ""}>
                <CardContent className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {done ? <CheckCircle2 className="h-5 w-5 text-green-500" /> :
                     overdue ? <AlertCircle className="h-5 w-5 text-red-500" /> :
                     <Clock className="h-5 w-5 text-muted-foreground" />}
                    <div>
                      <p className="text-sm font-medium">{m.title}</p>
                      {due && <p className="text-xs text-muted-foreground">{due.toLocaleDateString()}</p>}
                    </div>
                  </div>
                  <Badge variant={done ? "default" : overdue ? "destructive" : "outline"}>
                    {done ? "Complete" : overdue ? "Overdue" : "Upcoming"}
                  </Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
