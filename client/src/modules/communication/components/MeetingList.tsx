/**
 * MeetingList — Communication meetings, with status badges.
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export interface MeetingListProps {
  workspaceId: number;
}

export function MeetingList({ workspaceId }: MeetingListProps) {
  const { data, isLoading } = trpc.communication.meetings.list.useQuery({
    workspaceId,
  });
  const utils = trpc.useUtils();
  const cancelMutation = trpc.communication.meetings.cancel.useMutation({
    onSuccess: () => {
      utils.communication.meetings.list.invalidate({ workspaceId });
      toast.success("Meeting cancelled");
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          No meetings scheduled.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {data.map((m) => (
        <Card key={m.id}>
          <CardContent className="p-3 flex items-center justify-between gap-3">
            <div>
              <div className="font-medium text-sm">{m.title}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                <Badge variant="outline">{m.meetingType}</Badge>
                <Badge variant={m.status === "scheduled" ? "default" : "secondary"}>
                  {m.status}
                </Badge>
                {m.startTime ? (
                  <span>{new Date(m.startTime).toLocaleString()}</span>
                ) : null}
              </div>
            </div>
            {m.status === "scheduled" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => cancelMutation.mutate({ id: m.id })}
                disabled={cancelMutation.isPending}
              >
                Cancel
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
