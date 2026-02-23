import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, BarChart3, Users, Activity } from "lucide-react";

export default function CollaborationIntelPanel() {
  const { data, isLoading, error } = trpc.hq.collaborationIntel.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-destructive text-center py-12">
        Failed to load collaboration intel: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Collaboration Intelligence</h1>
        <p className="text-muted-foreground mt-1">
          Workspace activity and collaboration metrics
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Activity</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.totalActivity ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">events tracked</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Action Types</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.actionBreakdown?.length ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">distinct actions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Actors</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.actorBreakdown?.length ?? 0}</div>
            <p className="text-xs text-muted-foreground mt-1">contributors</p>
          </CardContent>
        </Card>
      </div>

      {data?.actionBreakdown && data.actionBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Activity by Action Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.actionBreakdown.sort((a: any, b: any) => b.count - a.count).map((item: any) => (
                <div key={item.action} className="flex items-center justify-between py-1">
                  <span className="text-sm font-mono">{item.action}</span>
                  <Badge variant="outline">{item.count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent Events</CardTitle>
        </CardHeader>
        <CardContent>
          {data?.recentEvents && data.recentEvents.length > 0 ? (
            <div className="space-y-2">
              {data.recentEvents.map((e: any) => (
                <div key={e.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{e.actionType}</p>
                    <p className="text-xs text-muted-foreground">by {e.actorId}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={e.result === "success" ? "default" : "secondary"}>
                      {e.result}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {e.timestamp ? new Date(e.timestamp).toLocaleTimeString() : "—"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No recent events</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
