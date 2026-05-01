/**
 * NotificationList — Communication notifications panel.
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export interface NotificationListProps {
  workspaceId: number;
  userId?: number;
}

export function NotificationList({ workspaceId, userId }: NotificationListProps) {
  const { data, isLoading } = trpc.communication.notifications.list.useQuery({
    workspaceId,
    userId,
  });
  const utils = trpc.useUtils();
  const markRead = trpc.communication.notifications.markRead.useMutation({
    onSuccess: () => {
      utils.communication.notifications.list.invalidate({
        workspaceId,
        userId,
      });
    },
    onError: (err) => toast.error(err.message),
  });
  const archive = trpc.communication.notifications.archive.useMutation({
    onSuccess: () => {
      utils.communication.notifications.list.invalidate({
        workspaceId,
        userId,
      });
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
          No notifications.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {data.map((n) => (
        <Card key={n.id}>
          <CardContent className="p-3 flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Badge variant={n.status === "unread" ? "default" : "outline"}>
                  {n.status}
                </Badge>
                <span className="font-medium text-sm">{n.title}</span>
              </div>
              {n.body ? (
                <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                  {n.body}
                </div>
              ) : null}
              <div className="text-xs text-muted-foreground mt-1">
                {n.eventType} · {new Date(n.createdAt).toLocaleString()}
              </div>
            </div>
            <div className="flex flex-col gap-1">
              {n.status === "unread" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => markRead.mutate({ id: n.id })}
                  disabled={markRead.isPending}
                >
                  Mark read
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => archive.mutate({ id: n.id })}
                disabled={archive.isPending}
              >
                Archive
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
