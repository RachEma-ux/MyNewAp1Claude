/**
 * HR Analytics Dashboard Page — Enhanced HR-wide metrics, reminders, and reports (Phase 5)
 */

import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Bell, AlertTriangle, Clock, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

const urgencyColor: Record<string, string> = {
  info: "bg-blue-500/10 text-blue-500",
  warning: "bg-yellow-500/10 text-yellow-500",
  critical: "bg-red-500/10 text-red-500",
};

export default function HRAnalyticsDashboardPage() {
  const dashboard = trpc.hr.analytics.getDashboardSummary.useQuery();
  const breakdown = trpc.hr.analytics.getWorkforceBreakdown.useQuery();
  const reports = trpc.hr.analytics.listReportDefinitions.useQuery({ limit: 50 });
  const metrics = trpc.hr.analytics.listMetricSnapshots.useQuery({ limit: 50 });
  const reminders = trpc.hr.analytics.getReminders.useQuery();

  const kpis = [
    { label: "Total Workers", value: dashboard.data?.totalWorkers ?? "—", color: "text-foreground" },
    { label: "Active", value: dashboard.data?.activeWorkers ?? "—", color: "text-green-500" },
    { label: "On Leave", value: dashboard.data?.onLeave ?? "—", color: "text-yellow-500" },
    { label: "Terminated", value: dashboard.data?.terminated ?? "—", color: "text-red-500" },
    { label: "Open Incidents", value: dashboard.data?.openIncidents ?? "—", color: "text-orange-500" },
    { label: "Open Grievances", value: dashboard.data?.openGrievances ?? "—", color: "text-yellow-500" },
    { label: "Non-Compliant", value: dashboard.data?.complianceItems ?? "—", color: "text-red-500" },
    { label: "Open Risks", value: dashboard.data?.openRisks ?? "—", color: "text-purple-500" },
  ];

  const operationalKpis = [
    { label: "Pending Leave", value: dashboard.data?.pendingLeave ?? "—", color: "text-blue-500" },
    { label: "Overdue Training", value: dashboard.data?.overdueTraining ?? "—", color: "text-orange-500" },
    { label: "Pending Reviews", value: dashboard.data?.pendingReviews ?? "—", color: "text-yellow-500" },
    { label: "Expiring Certs", value: dashboard.data?.expiringCerts ?? "—", color: "text-red-500" },
  ];

  if (dashboard.isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-20 bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/hr">
          <Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">HR Analytics</h1>
          <p className="text-muted-foreground">Workforce metrics, reminders, and insights</p>
        </div>
      </div>

      {dashboard.isError && (
        <Card className="border-red-500/50">
          <CardContent className="p-4 text-red-500">
            Failed to load dashboard data. {dashboard.error?.message}
          </CardContent>
        </Card>
      )}

      {/* KPI Tiles — Core */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        {kpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">{kpi.label}</div>
              <div className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* KPI Tiles — Operational */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {operationalKpis.map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">{kpi.label}</div>
              <div className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="reminders">
        <TabsList>
          <TabsTrigger value="reminders">
            <Bell className="w-4 h-4 mr-1" /> Reminders {reminders.data?.length ? `(${reminders.data.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="breakdown">Workforce Breakdown</TabsTrigger>
          <TabsTrigger value="reports">Report Definitions</TabsTrigger>
          <TabsTrigger value="metrics">Metric Snapshots</TabsTrigger>
        </TabsList>

        <TabsContent value="reminders" className="space-y-4">
          <div className="grid gap-2">
            {reminders.isLoading && (
              <Card><CardContent className="p-4 text-muted-foreground">Loading reminders...</CardContent></Card>
            )}
            {reminders.data?.length === 0 && (
              <Card><CardContent className="p-4 text-muted-foreground">No upcoming reminders.</CardContent></Card>
            )}
            {reminders.data?.map((r, i) => (
              <Card key={`${r.type}-${r.entityId}-${i}`}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {r.urgency === "critical" ? (
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                    ) : (
                      <Clock className="w-4 h-4 text-yellow-500" />
                    )}
                    <div>
                      <div className="text-sm font-medium">{r.message}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.targetWorkerId && `Worker #${r.targetWorkerId} · `}{r.dueDate}
                      </div>
                    </div>
                  </div>
                  <Badge className={urgencyColor[r.urgency] ?? ""}>{r.urgency}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="breakdown" className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">By Worker Type</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {breakdown.data?.byType?.length === 0 && <div className="text-muted-foreground text-sm">No data</div>}
                {breakdown.data?.byType?.map((r) => (
                  <div key={r.workerType} className="flex justify-between text-sm">
                    <span>{r.workerType}</span>
                    <span className="font-mono">{r.count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">By Category</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {breakdown.data?.byCategory?.length === 0 && <div className="text-muted-foreground text-sm">No data</div>}
                {breakdown.data?.byCategory?.map((r) => (
                  <div key={r.category} className="flex justify-between text-sm">
                    <span>{r.category}</span>
                    <span className="font-mono">{r.count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">By Status</CardTitle></CardHeader>
              <CardContent className="space-y-1">
                {breakdown.data?.byStatus?.length === 0 && <div className="text-muted-foreground text-sm">No data</div>}
                {breakdown.data?.byStatus?.map((r) => (
                  <div key={r.status} className="flex justify-between text-sm">
                    <span>{r.status}</span>
                    <span className="font-mono">{r.count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

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
