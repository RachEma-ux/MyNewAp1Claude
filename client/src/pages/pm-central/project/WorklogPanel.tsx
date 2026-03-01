import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { Loader2, Clock, BarChart3 } from "lucide-react";

export default function WorklogPanel({ projectId }: { projectId: number }) {
  const query = trpc.modules.pmt.shell.tools.budget.list.useQuery({ projectId });
  // Work logs would normally come from a dedicated endpoint; reusing budget as proxy for now
  const items = query.data ?? [];

  if (query.isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Worklog</h2>
      <p className="text-sm text-muted-foreground">Time tracking and effort logging per team member</p>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Total Hours Logged</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">0h</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">This Week</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">0h</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Contributors</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold">0</div></CardContent>
        </Card>
      </div>

      <Card><CardContent className="py-12 text-center">
        <Clock className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        <p className="text-muted-foreground">No work log entries yet. Log hours against tasks to track effort and utilization.</p>
        <p className="text-xs text-muted-foreground mt-2">
          Work log entries are linked to individual tasks and aggregated at the project level.
        </p>
      </CardContent></Card>
    </div>
  );
}
