/**
 * Reporting Dashboard — Real data: velocity, agent reliability, risk heatmap, activity
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  BarChart3,
  TrendingUp,
  Bot,
  AlertTriangle,
  Activity,
  CheckCircle2,
  XCircle,
  FolderKanban,
  FileText,
  MessageSquare,
} from "lucide-react";

const riskColors: Record<string, string> = {
  low: "bg-green-500",
  medium: "bg-yellow-500",
  high: "bg-orange-500",
  critical: "bg-red-500",
};

export function ReportingDashboardPage({ workspaceId }: { workspaceId: number }) {
  const { data: summary } = trpc.modules.reporting.summary.useQuery({ workspaceId });
  const { data: velocity } = trpc.modules.reporting.velocity.useQuery({ workspaceId });
  const { data: agentRel } = trpc.modules.reporting.agentReliability.useQuery({ workspaceId });
  const { data: riskMap } = trpc.modules.reporting.riskHeatmap.useQuery({ workspaceId });
  const { data: activity } = trpc.modules.reporting.activityTimeline.useQuery({
    workspaceId,
    limit: 20,
  });

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <BarChart3 className="h-6 w-6" />
        Reports
      </h1>

      {/* Summary Counters */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        <Card>
          <CardContent className="py-3 text-center">
            <FolderKanban className="h-5 w-5 mx-auto text-muted-foreground" />
            <p className="text-2xl font-bold mt-1">{summary?.projects ?? "-"}</p>
            <p className="text-xs text-muted-foreground">Projects</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <CheckCircle2 className="h-5 w-5 mx-auto text-muted-foreground" />
            <p className="text-2xl font-bold mt-1">{summary?.tasks ?? "-"}</p>
            <p className="text-xs text-muted-foreground">Tasks</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <Bot className="h-5 w-5 mx-auto text-muted-foreground" />
            <p className="text-2xl font-bold mt-1">{summary?.agents ?? "-"}</p>
            <p className="text-xs text-muted-foreground">Agent Runs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <MessageSquare className="h-5 w-5 mx-auto text-muted-foreground" />
            <p className="text-2xl font-bold mt-1">{summary?.threads ?? "-"}</p>
            <p className="text-xs text-muted-foreground">Threads</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <FileText className="h-5 w-5 mx-auto text-muted-foreground" />
            <p className="text-2xl font-bold mt-1">{summary?.documents ?? "-"}</p>
            <p className="text-xs text-muted-foreground">Documents</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Velocity */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Task Velocity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {velocity?.total ?? 0} total tasks
            </p>
            {velocity?.byStatus &&
              Object.entries(velocity.byStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between text-sm">
                  <span className="capitalize">{status.replace(/_/g, " ")}</span>
                  <div className="flex items-center gap-2">
                    <Progress
                      value={velocity.total > 0 ? (count / velocity.total) * 100 : 0}
                      className="w-24 h-2"
                    />
                    <span className="text-xs text-muted-foreground w-8 text-right">
                      {count}
                    </span>
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>

        {/* Agent Reliability */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Bot className="h-4 w-4" />
              Agent Reliability
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-center gap-2">
              <p className="text-4xl font-bold">
                {agentRel?.successRate ?? 0}%
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-lg font-semibold">{agentRel?.total ?? 0}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-green-500">
                  {agentRel?.completed ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">Completed</p>
              </div>
              <div>
                <p className="text-lg font-semibold text-red-500">
                  {agentRel?.failed ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
            </div>
            {agentRel && agentRel.total > 0 && (
              <Progress value={agentRel.successRate} className="h-2" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Risk Heatmap */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Risk Heatmap
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Project Risk Distribution
              </p>
              {riskMap?.projects && riskMap.projects.length > 0 ? (
                <div className="flex gap-2 flex-wrap">
                  {riskMap.projects.map((r) => (
                    <div key={r.riskLevel} className="flex items-center gap-1.5">
                      <div
                        className={`h-3 w-3 rounded-sm ${
                          riskColors[r.riskLevel || "low"] || "bg-gray-500"
                        }`}
                      />
                      <span className="text-xs">
                        {r.riskLevel || "none"}: {r.count}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No data</p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Task Risk Distribution
              </p>
              {riskMap?.tasks && riskMap.tasks.length > 0 ? (
                <div className="flex gap-2 flex-wrap">
                  {riskMap.tasks.map((r) => (
                    <div key={r.riskLevel} className="flex items-center gap-1.5">
                      <div
                        className={`h-3 w-3 rounded-sm ${
                          riskColors[r.riskLevel || "low"] || "bg-gray-500"
                        }`}
                      />
                      <span className="text-xs">
                        {r.riskLevel || "none"}: {r.count}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No data</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activity Timeline */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activity && activity.length > 0 ? (
            <div className="space-y-2">
              {activity.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between text-sm border-b last:border-0 pb-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground shrink-0" />
                    <span className="truncate">{entry.action}</span>
                    {entry.moduleKey && (
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {entry.moduleKey}
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0 ml-2">
                    {new Date(entry.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No activity yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
