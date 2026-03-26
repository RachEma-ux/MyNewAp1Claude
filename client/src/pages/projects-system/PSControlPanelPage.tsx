/**
 * PS Control Panel — Operational dashboard with real metrics
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock,
  FolderOpen,
  Loader2,
  PieChart,
  Users,
  Wand2,
  AlertTriangle,
} from "lucide-react";

function formatTime(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}

function MetricRow({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium ${color || ""}`}>{value}</span>
    </div>
  );
}

function PercentBar({ label, percent, color }: { label: string; percent: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{percent}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function PSControlPanelPage({ workspaceId }: { workspaceId: number }) {
  const { data, isLoading, error } = trpc.ps.getMonitoringSummary.useQuery(
    { workspaceId },
    { staleTime: 15_000, refetchInterval: 30_000 },
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4">
        <div className="text-sm text-destructive">
          Failed to load monitoring data{error ? `: ${error.message}` : ""}
        </div>
      </div>
    );
  }

  const { systems, wizard, demand, assignments, fulfillment, activity } = data;

  const hasNoData = systems.total === 0 && demand.total === 0 && assignments.total === 0;
  const hasHighUnfilled = fulfillment.totalRequests > 0 && fulfillment.unfilledPercent > 50;
  const hasNoRecentActivity = activity.length === 0;

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">PS Control Panel</h1>
        <Badge
          variant="outline"
          className={hasNoData ? "text-muted-foreground" : hasHighUnfilled ? "text-amber-600 border-amber-500/30" : "text-green-600 border-green-500/30"}
        >
          {hasNoData ? "No Data" : hasHighUnfilled ? "Needs Attention" : "Healthy"}
        </Badge>
      </div>

      {/* Alerts */}
      {hasHighUnfilled && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-600">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>High number of unfilled requests ({fulfillment.unfilledPercent}% unfilled)</span>
        </div>
      )}
      {hasNoRecentActivity && systems.total > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-muted bg-muted/30 p-3 text-sm text-muted-foreground">
          <Clock className="w-4 h-4 shrink-0" />
          <span>No recent activity detected</span>
        </div>
      )}

      {/* Row 1: Systems + Wizard */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <FolderOpen className="w-4 h-4 text-indigo-500" />
              System Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <MetricRow label="Total Systems" value={systems.total} />
            <MetricRow label="Active" value={systems.active} color="text-green-600" />
            <MetricRow label="Draft" value={systems.draft} color="text-yellow-600" />
            <MetricRow label="Archived" value={systems.archived} color="text-muted-foreground" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Wand2 className="w-4 h-4 text-purple-500" />
              Wizard Activity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <MetricRow label="Total Runs" value={wizard.total} />
            <MetricRow label="Last 24h" value={wizard.last24h} />
            <MetricRow label="Last 7 Days" value={wizard.last7d} />
            {wizard.averageConfidence !== null && (
              <MetricRow label="Avg Confidence" value={`${wizard.averageConfidence}%`} />
            )}
            <MetricRow label="Last Run" value={formatTime(wizard.lastRunAt)} />
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Demand + Assignments */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4 text-amber-500" />
              Demand Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <MetricRow label="Total Requests" value={demand.total} />
            <MetricRow label="Draft" value={demand.draft} color="text-muted-foreground" />
            <MetricRow label="Open" value={demand.open} color="text-amber-600" />
            <MetricRow label="Partially Filled" value={demand.partiallyFilled} color="text-blue-600" />
            <MetricRow label="Filled" value={demand.filled} color="text-green-600" />
            <MetricRow label="Closed" value={demand.closed} color="text-muted-foreground" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              Assignment Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <MetricRow label="Total Assignments" value={assignments.total} />
            <MetricRow label="Active" value={assignments.active} color="text-green-600" />
            <MetricRow label="Completed" value={assignments.completed} color="text-blue-600" />
            <MetricRow label="Rejected" value={assignments.rejected} color="text-red-600" />
            <MetricRow label="Cancelled" value={assignments.cancelled} color="text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Fulfillment + Recent Activity */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <PieChart className="w-4 h-4 text-teal-500" />
              Fulfillment Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {fulfillment.totalRequests === 0 ? (
              <p className="text-sm text-muted-foreground">No requests to measure</p>
            ) : (
              <>
                <PercentBar label="Filled" percent={fulfillment.filledPercent} color="bg-green-500" />
                <PercentBar label="Partially Filled" percent={fulfillment.partialPercent} color="bg-blue-500" />
                <PercentBar label="Unfilled" percent={fulfillment.unfilledPercent} color="bg-amber-500" />
                <div className="pt-1 text-xs text-muted-foreground">
                  Based on {fulfillment.totalRequests} total request{fulfillment.totalRequests !== 1 ? "s" : ""}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity className="w-4 h-4 text-orange-500" />
              Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet</p>
            ) : (
              <div className="space-y-3">
                {activity.map((a, i) => (
                  <div key={i} className="flex items-start justify-between gap-2 text-sm">
                    <span className="truncate">{a.label}</span>
                    <span className="text-muted-foreground text-xs whitespace-nowrap shrink-0">
                      {formatTime(a.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default PSControlPanelPage;
