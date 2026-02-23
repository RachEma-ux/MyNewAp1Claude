import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, Activity } from "lucide-react";

function formatTime(ts: string | Date): string {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function decisionColor(result: string) {
  switch (result) {
    case "success":
      return "default" as const;
    case "failure":
      return "destructive" as const;
    case "denied":
      return "secondary" as const;
    default:
      return "outline" as const;
  }
}

export default function ActivityPanel() {
  const { data, isLoading, error } = trpc.hq.activityFeed.useQuery(
    { limit: 50 },
    { refetchInterval: 15000 },
  );

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
        Failed to load activity: {error.message}
      </div>
    );
  }

  const events = data?.events ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Activity</h1>
        <p className="text-muted-foreground mt-1">
          Recent audit events and platform activity
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Event Feed
          </CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-muted-foreground text-sm text-center py-8">
              No recent activity
            </p>
          ) : (
            <div className="space-y-3">
              {events
                .slice()
                .reverse()
                .map((ev: any) => (
                  <div
                    key={ev.event_id}
                    className="flex items-start justify-between py-2 border-b last:border-0 gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {ev.action_type}
                        </span>
                        <Badge variant={decisionColor(ev.decision_result)} className="text-xs">
                          {ev.decision_result}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {ev.target_type}
                        {ev.target_id ? `:${ev.target_id}` : ""}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatTime(ev.timestamp)}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
