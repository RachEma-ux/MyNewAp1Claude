/**
 * PRM Timeline View — Case event history (audit trail)
 */
import { trpc } from "@/lib/trpc";
import { Loader2, Clock } from "lucide-react";

const EVENT_LABELS: Record<string, string> = {
  status_change: "Status changed",
  assignment: "Assigned",
  comment: "Comment",
  reopen: "Reopened",
  close: "Closed",
  evidence_added: "Evidence added",
  verification_added: "Verification added",
  method_started: "Method started",
  method_completed: "Method completed",
  decision_added: "Decision added",
  action_added: "Action added",
  action_completed: "Action completed",
  closure_blocked: "Closure blocked",
  closure_approved: "Closure approved",
};

export function PRMTimelineView({ caseId }: { caseId: number }) {
  const { data: events, isLoading } = trpc.prm.events.list.useQuery({ caseId });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!events || events.length === 0) {
    return <p className="text-xs text-muted-foreground py-4">No events recorded yet.</p>;
  }

  return (
    <div className="space-y-2">
      {events.map((event: any) => (
        <div key={event.id} className="flex items-start gap-2 text-xs">
          <Clock className="h-3 w-3 mt-0.5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="font-medium">
              {EVENT_LABELS[event.eventType] || event.eventType}
            </span>
            {event.fromStatus && event.toStatus && (
              <span className="text-muted-foreground">
                {" "}{event.fromStatus} → {event.toStatus}
              </span>
            )}
            {event.reason && (
              <p className="text-muted-foreground mt-0.5 truncate">{event.reason}</p>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {new Date(event.createdAt).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}
