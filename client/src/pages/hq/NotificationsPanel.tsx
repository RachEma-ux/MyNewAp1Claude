import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, Bell, AlertTriangle, Snowflake } from "lucide-react";

export default function NotificationsPanel() {
  const { data, isLoading, error } = trpc.hq.notifications.useQuery();

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
        Failed to load notifications: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Notifications</h1>
        <p className="text-muted-foreground mt-1">
          Recent platform events and alerts
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.totalEvents ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Freeze Alerts</CardTitle>
            <Snowflake className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.frozenAlerts?.length ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Drift Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.driftAlerts?.length ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Events</CardTitle>
        </CardHeader>
        <CardContent>
          {data?.events && data.events.length > 0 ? (
            <div className="space-y-2">
              {data.events.slice(0, 20).map((e: any) => (
                <div key={e.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{e.actionType}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.targetType}:{e.targetId} by {e.actorId}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <Badge variant={e.result === "success" ? "default" : e.result === "denied" ? "destructive" : "secondary"}>
                      {e.result}
                    </Badge>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
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
