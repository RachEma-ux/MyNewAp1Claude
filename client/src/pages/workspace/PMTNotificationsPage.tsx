/**
 * PMT Notifications — View and manage PM event notifications
 */

import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Bell, CheckCheck, Check } from "lucide-react";
import { toast } from "sonner";

export function PMTNotificationsPage({ workspaceId }: { workspaceId: number }) {
  const utils = trpc.useUtils();
  const { data: notifications, isLoading } = trpc.modules.pmt.notifications.list.useQuery({
    workspaceId,
  });

  const markReadMut = trpc.modules.pmt.notifications.markRead.useMutation({
    onSuccess: () => utils.modules.pmt.notifications.list.invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const markAllMut = trpc.modules.pmt.notifications.markAllRead.useMutation({
    onSuccess: () => {
      utils.modules.pmt.notifications.list.invalidate();
      toast.success("All marked as read");
    },
    onError: (e) => toast.error(e.message),
  });

  const unreadCount = notifications
    ? (notifications as any[]).filter((n: any) => !n.readAt).length
    : 0;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Bell className="h-6 w-6" />
          Notifications
          {unreadCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {unreadCount}
            </Badge>
          )}
        </h1>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllMut.mutate({ workspaceId })}
            disabled={markAllMut.isPending}
          >
            <CheckCheck className="h-4 w-4 mr-1" />
            Mark All Read
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !notifications || (notifications as any[]).length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No notifications.
        </div>
      ) : (
        <div className="space-y-2">
          {(notifications as any[]).map((n: any) => (
            <Card
              key={n.id}
              className={`${!n.readAt ? "border-primary/30 bg-primary/5" : ""}`}
            >
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {n.type}
                    </Badge>
                    {n.workItemId && (
                      <span className="text-xs text-muted-foreground">
                        Task #{n.workItemId}
                      </span>
                    )}
                    {!n.readAt && (
                      <div className="h-2 w-2 bg-blue-500 rounded-full" />
                    )}
                  </div>
                  <p className="text-sm">{n.message}</p>
                  <div className="text-xs text-muted-foreground">
                    {new Date(n.createdAt).toLocaleString()}
                  </div>
                </div>
                {!n.readAt && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      markReadMut.mutate({ id: n.id, workspaceId })
                    }
                    disabled={markReadMut.isPending}
                    className="shrink-0"
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
