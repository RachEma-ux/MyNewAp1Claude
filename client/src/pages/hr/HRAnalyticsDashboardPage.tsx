/**
 * HR Analytics Dashboard Page — HR-wide metrics and reports
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";

export default function HRAnalyticsDashboardPage() {
  const dashboard = trpc.hr.analytics.getDashboardSummary.useQuery();
  const reports = trpc.hr.analytics.listReportDefinitions.useQuery({ limit: 50 });
  const metrics = trpc.hr.analytics.listMetricSnapshots.useQuery({ limit: 50 });

  const kpis = [
    { label: "Total Workers", value: dashboard.data?.totalWorkers ?? "—", color: "text-foreground" },
    { label: "Active Workers", value: dashboard.data?.activeWorkers ?? "—", color: "text-green-500" },
    { label: "Open Incidents", value: dashboard.data?.openIncidents ?? "—", color: "text-orange-500" },
    { label: "Open Grievances", value: dashboard.data?.openGrievances ?? "—", color: "text-yellow-500" },
    { label: "Non-Compliant", value: dashboard.data?.complianceItems ?? "—", color: "text-red-500" },
    { label: "Open Risks", value: dashboard.data?.openRisks ?? "—", color: "text-purple-500" },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">HR Analytics</h1>
        <p className="text-muted-foreground">Workforce metrics, reports, and insights</p>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">{kpi.label}</div>
              <div className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="reports">
        <TabsList>
          <TabsTrigger value="reports">Report Definitions</TabsTrigger>
          <TabsTrigger value="metrics">Metric Snapshots</TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="space-y-4">
          <div className="grid gap-3">
            {reports.data?.length === 0 && (
              <Card><CardContent className="p-4 text-muted-foreground">No report definitions yet.</CardContent></Card>
            )}
            {reports.data?.map((r) => (
              <Card key={r.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-sm text-muted-foreground">
                      Type: {r.reportType}
                      {r.category && <span> | Category: {r.category}</span>}
                    </div>
                    {r.description && <div className="text-xs text-muted-foreground mt-1">{r.description}</div>}
                  </div>
                  <Badge className={r.isActive ? "bg-green-500/10 text-green-500" : "bg-gray-500/10 text-gray-400"}>
                    {r.isActive ? "Active" : "Inactive"}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="metrics" className="space-y-4">
          <div className="grid gap-3">
            {metrics.data?.length === 0 && (
              <Card><CardContent className="p-4 text-muted-foreground">No metric snapshots yet.</CardContent></Card>
            )}
            {metrics.data?.map((m) => (
              <Card key={m.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{m.metricName}</div>
                    <div className="text-sm text-muted-foreground">
                      Category: {m.metricCategory}
                      <span> | Value: {m.value}{m.unit ? ` ${m.unit}` : ""}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">Period: {m.periodStart} – {m.periodEnd}</div>
                  </div>
                  <Badge variant="outline">{m.metricCategory}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
