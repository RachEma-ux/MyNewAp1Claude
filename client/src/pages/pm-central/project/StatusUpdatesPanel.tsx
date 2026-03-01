import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, FileBarChart } from "lucide-react";

const HEALTH_COLORS: Record<string, string> = { green: "bg-green-500", yellow: "bg-yellow-500", red: "bg-red-500" };

export default function StatusUpdatesPanel({ projectId }: { projectId: number }) {
  const query = trpc.modules.pmt.shell.tools.statusUpdates.list.useQuery({ projectId });
  const updates = query.data ?? [];

  if (query.isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Status Updates</h2>
      <p className="text-sm text-muted-foreground">Periodic reports — progress, health, accomplishments, blockers</p>
      {updates.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <FileBarChart className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No status updates yet. Create a weekly status report.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {updates.map((u: any) => (
            <Card key={u.id}>
              <CardContent className="py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{u.period}</span>
                  <div className="flex items-center gap-1">
                    {["overallHealth", "scheduleHealth", "budgetHealth", "scopeHealth"].map((key) => (
                      <div key={key} className={`h-2.5 w-2.5 rounded-full ${HEALTH_COLORS[u[key]] || "bg-gray-400"}`} title={`${key.replace("Health", "")}: ${u[key]}`} />
                    ))}
                  </div>
                </div>
                {u.summary && <p className="text-xs text-muted-foreground">{u.summary}</p>}
                {u.accomplishments && <p className="text-xs mt-1"><span className="font-medium">Done:</span> {u.accomplishments}</p>}
                {u.planned && <p className="text-xs mt-0.5"><span className="font-medium">Planned:</span> {u.planned}</p>}
                {u.blockers && <p className="text-xs mt-0.5 text-red-400"><span className="font-medium">Blockers:</span> {u.blockers}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
