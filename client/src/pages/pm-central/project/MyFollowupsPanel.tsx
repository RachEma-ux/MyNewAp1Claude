import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";

export default function MyFollowupsPanel({ projectId }: { projectId: number }) {
  const summaryQuery = trpc.modules.pmt.shell.tools.sidebarSummary.get.useQuery({ projectId });
  const s = summaryQuery.data;


  if (!s) return <div className="text-center py-20 text-muted-foreground">Project data unavailable</div>;

  const items = [
    { icon: <CheckSquare className="h-4 w-4 text-red-500" />, label: "Overdue tasks", count: s.overdueTasksCount, severity: "block" as const },
    { icon: <ShieldCheck className="h-4 w-4 text-yellow-500" />, label: "Pending approvals", count: s.approvalsPendingCount, severity: "warn" as const },
    { icon: <AlertTriangle className="h-4 w-4 text-orange-500" />, label: "High risks (open)", count: s.highRisksCount, severity: "warn" as const },
    { icon: <AlertTriangle className="h-4 w-4 text-red-500" />, label: "Open issues", count: s.openIssuesCount, severity: "warn" as const },
    { icon: <Clock className="h-4 w-4 text-blue-500" />, label: "Pending changes", count: s.changesPendingCount, severity: "warn" as const },
    { icon: <ListChecks className="h-4 w-4 text-purple-500" />, label: "Open action items", count: s.openActionItemsCount, severity: "warn" as const },
    { icon: <Clock className="h-4 w-4 text-indigo-500" />, label: "Pending deliverables", count: s.pendingDeliverablesCount, severity: "warn" as const },
  ];

  const activeItems = items.filter(i => i.count > 0);
  const totalAttention = activeItems.reduce((sum, i) => sum + i.count, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">My Follow-ups</h2>
          <p className="text-sm text-muted-foreground">Items requiring your attention on this project</p>
        </div>
        {totalAttention > 0 && (
          <Badge variant="destructive">{totalAttention} items</Badge>
        )}
      </div>

      {activeItems.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <Bell className="h-10 w-10 mx-auto text-green-500 mb-3" />
          <h3 className="text-lg font-medium text-green-600">All Clear</h3>
          <p className="text-muted-foreground mt-1">No follow-up items need your attention right now.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {activeItems.map(item => (
            <Card key={item.label} className={item.severity === "block" ? "border-red-500/30" : "border-yellow-500/20"}>
              <CardContent className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {item.icon}
                  <span className="text-sm font-medium">{item.label}</span>
                </div>
                <Badge variant={item.severity === "block" ? "destructive" : "outline"}>
                  {item.count}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {s.freezeActive && (
        <Card className="border-red-500/50 bg-red-500/5">
          <CardContent className="py-3 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <div>
              <p className="text-sm font-medium text-red-500">Project Frozen — Control Hold</p>
              <p className="text-xs text-muted-foreground">Requires immediate remediation before work can resume.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
