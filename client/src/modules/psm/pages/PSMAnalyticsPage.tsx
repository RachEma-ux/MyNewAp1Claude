import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart3, Target, Activity, CheckCircle2, TrendingUp } from "lucide-react";

export default function PSMAnalyticsPage() {
  const summaryQuery = trpc.psm.analytics.summary.useQuery({});
  const usageQuery = trpc.psm.analytics.methodUsage.useQuery();
  const accuracyQuery = trpc.psm.analytics.selectorAccuracy.useQuery();
  const completionQuery = trpc.psm.analytics.workflowCompletion.useQuery();
  const auditQuery = trpc.psm.audit.list.useQuery({});

  const summary = summaryQuery.data;
  const usage = usageQuery.data ?? [];
  const accuracy = accuracyQuery.data;
  const completion = completionQuery.data;
  const auditEvents = auditQuery.data ?? [];

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-teal-500" /> Analytics
      </h2>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <Target className="h-6 w-6 text-teal-500 opacity-60" />
            <div>
              <p className="text-xl font-bold">{summary?.methodCount ?? "—"}</p>
              <p className="text-[10px] text-muted-foreground">Methods</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <Activity className="h-6 w-6 text-blue-500 opacity-60" />
            <div>
              <p className="text-xl font-bold">{summary?.caseCount ?? "—"}</p>
              <p className="text-[10px] text-muted-foreground">Total Cases</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-green-500 opacity-60" />
            <div>
              <p className="text-xl font-bold">{summary?.completedCaseCount ?? "—"}</p>
              <p className="text-[10px] text-muted-foreground">Completed</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 flex items-center gap-3">
            <TrendingUp className="h-6 w-6 text-amber-500 opacity-60" />
            <div>
              <p className="text-xl font-bold">{summary?.activeRunCount ?? "—"}</p>
              <p className="text-[10px] text-muted-foreground">Active Runs</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Selector Accuracy + Workflow Completion */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-3">
            <h3 className="text-xs font-semibold mb-2">Selector Accuracy</h3>
            {accuracy ? (
              <div className="flex items-center gap-3">
                <p className="text-2xl font-bold">{accuracy.accuracy}%</p>
                <p className="text-[10px] text-muted-foreground">
                  Top-1 recommendation selected ({accuracy.total} total selections)
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No data yet.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <h3 className="text-xs font-semibold mb-2">Workflow Completion</h3>
            {completion ? (
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <p className="text-2xl font-bold">{completion.completionRate}%</p>
                  <p className="text-[10px] text-muted-foreground">{completion.total} total runs</p>
                </div>
                <div className="flex gap-2 text-[10px]">
                  <Badge variant="outline" className="text-[9px]">
                    Completed: {completion.completed}
                  </Badge>
                  <Badge variant="outline" className="text-[9px]">
                    Abandoned: {completion.abandoned}
                  </Badge>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No data yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Method Usage */}
      <Card>
        <CardContent className="p-3">
          <h3 className="text-xs font-semibold mb-2">Method Usage (Top Methods by Case Count)</h3>
          {usage.length > 0 ? (
            <div className="space-y-1.5">
              {usage.slice(0, 15).map((row: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between text-xs py-0.5">
                  <span className="truncate">{row.methodName || `Method #${row.methodId}`}</span>
                  <Badge variant="outline" className="text-[9px] shrink-0 ml-2">{row.count} cases</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No usage data yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Recent Audit Events */}
      <Card>
        <CardContent className="p-3">
          <h3 className="text-xs font-semibold mb-2">Recent Audit Events</h3>
          <ScrollArea className="max-h-48">
            {auditEvents.length > 0 ? (
              <div className="space-y-1">
                {auditEvents.slice(0, 20).map((evt: any) => (
                  <div key={evt.id} className="flex items-center justify-between text-[10px] py-0.5 px-1 rounded hover:bg-muted/50">
                    <span className="capitalize">{(evt.eventType || "").replace(/_/g, " ")}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-[8px] px-1 py-0">{evt.entityType} #{evt.entityId}</Badge>
                      {evt.createdAt && (
                        <span className="text-[9px] text-muted-foreground">
                          {new Date(evt.createdAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No audit events yet.</p>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
