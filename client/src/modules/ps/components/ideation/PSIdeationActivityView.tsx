/**
 * PS Ideation — Activity View (center canvas)
 *
 * Shows the activity log for this ideation record.
 * Empty state: "No activity yet."
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";

interface ActivityEntry {
  id: number;
  eventType: string;
  payload: Record<string, unknown> | null;
  createdAt: string | Date;
}

interface Props {
  activity: ActivityEntry[];
}

export function PSIdeationActivityView({ activity }: Props) {
  if (activity.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center p-8">
        <Activity className="w-10 h-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Activity className="w-4 h-4" />
            Activity Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {activity.map((a) => (
              <div
                key={a.id}
                className="flex items-start justify-between gap-4 py-2 border-b border-border/50 last:border-0"
              >
                <div>
                  <span className="text-sm font-mono">{a.eventType}</span>
                  {a.payload && Object.keys(a.payload).length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {Object.entries(a.payload)
                        .filter(([, v]) => v !== null && v !== undefined)
                        .map(([k, v]) => `${k}: ${v}`)
                        .join(", ")}
                    </p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">
                  {new Date(a.createdAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
