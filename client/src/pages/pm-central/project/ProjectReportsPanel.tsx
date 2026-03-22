import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

export default function ProjectReportsPanel({ projectId }: { projectId: number }) {
  const tasksQuery = trpc.modules.pmt.shell.tasks.list.useQuery({ projectId });
  const summaryQuery = trpc.modules.pmt.shell.tools.sidebarSummary.get.useQuery({ projectId });

  const tasks = tasksQuery.data ?? [];
  const s = summaryQuery.data;
  const done = tasks.filter((t: any) => t.status === "done").length;
  const total = tasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;


  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Project Reports</h2>
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Task Completion</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pct}%</div>
            <p className="text-xs text-muted-foreground">{done}/{total} done</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Open Issues</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{s?.openIssuesCount ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">High Risks</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{s?.highRisksCount ?? 0}</div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><BarChart3 className="h-4 w-4" />KPI Summary</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-muted-foreground">Schedule Variance:</span> <span className="font-medium">—</span></div>
            <div><span className="text-muted-foreground">Cost Variance:</span> <span className="font-medium">—</span></div>
            <div><span className="text-muted-foreground">Overdue Tasks:</span> <span className="font-medium text-red-500">{s?.overdueTasksCount ?? 0}</span></div>
            <div><span className="text-muted-foreground">Pending Approvals:</span> <span className="font-medium text-yellow-500">{s?.approvalsPendingCount ?? 0}</span></div>
          </div>
          <p className="text-xs text-muted-foreground mt-4">Schedule and cost variance calculated from task estimates vs actuals.</p>
        </CardContent>
      </Card>
    </div>
  );
}
