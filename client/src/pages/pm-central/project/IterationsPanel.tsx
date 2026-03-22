import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { trpc } from "@/lib/trpc";

export default function IterationsPanel({ projectId }: { projectId: number }) {
  const sprintsQuery = trpc.modules.pmt.shell.sprints.list.useQuery({ projectId });
  const sprints = sprintsQuery.data ?? [];


  const now = new Date();
  const active = sprints.find((s: any) => s.status === "active" || (s.startDate && s.endDate && new Date(s.startDate) <= now && new Date(s.endDate) >= now));

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Iterations</h2>
      <p className="text-sm text-muted-foreground">Sprint / iteration cycles for delivery cadence tracking</p>

      {sprints.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <Repeat className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No iterations defined. Create sprints to organize work into delivery cycles.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {sprints.map((sprint: any) => {
            const isCurrent = active?.id === sprint.id;
            const done = sprint.status === "completed" || sprint.status === "closed";
            return (
              <Card key={sprint.id} className={isCurrent ? "border-primary/50" : done ? "border-green-500/30" : ""}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium flex items-center gap-2">
                        {done ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Repeat className="h-4 w-4 text-muted-foreground" />}
                        {sprint.name}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        {sprint.startDate && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(sprint.startDate).toLocaleDateString()}</span>}
                        {sprint.endDate && <span>— {new Date(sprint.endDate).toLocaleDateString()}</span>}
                      </div>
                    </div>
                    <Badge variant={isCurrent ? "default" : done ? "secondary" : "outline"}>
                      {isCurrent ? "Active" : done ? "Done" : sprint.status || "planned"}
                    </Badge>
                  </div>
                  {sprint.goal && <p className="text-xs text-muted-foreground mt-2">{sprint.goal}</p>}
                  {isCurrent && <Progress value={sprint.progress || 0} className="h-1.5 mt-2" />}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
