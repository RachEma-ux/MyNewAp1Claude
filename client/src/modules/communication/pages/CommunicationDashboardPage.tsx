/**
 * /communication — Communication module dashboard.
 */

import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CommunicationSummaryCards } from "../components/CommunicationSummaryCards";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

function useDefaultWorkspaceId(): number | undefined {
  const { data } = trpc.hq.workspaceDirectory.useQuery();
  return data?.workspaces?.[0]?.id;
}

export default function CommunicationDashboardPage() {
  const workspaceId = useDefaultWorkspaceId();
  const { data: summary } = trpc.communication.dashboard.summary.useQuery(
    { workspaceId: workspaceId ?? 0 },
    { enabled: typeof workspaceId === "number" && workspaceId > 0 },
  );
  const { data: health } = trpc.communication.dashboard.health.useQuery();

  const stats = useMemo(
    () => ({
      totalConversations: summary?.totalConversations ?? 0,
      activeConversations: summary?.activeConversations ?? 0,
      totalMessages: summary?.totalMessages ?? 0,
      scheduledMeetings: summary?.scheduledMeetings ?? 0,
      unreadNotifications: summary?.unreadNotifications ?? 0,
      dbConnected: summary?.dbConnected ?? false,
    }),
    [summary],
  );

  return (
    <div className="p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Communication</h1>
          <p className="text-sm text-muted-foreground">
            Conversations, chat, meetings and notifications — owned by the
            Communication module (dedicated <code>communicationdb</code>).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/communication/chat">
            <Button>Open chat</Button>
          </Link>
          <Link href="/communication/conversations">
            <Button variant="outline">Conversations</Button>
          </Link>
          <Link href="/communication/video-meeting">
            <Button variant="outline">Meetings</Button>
          </Link>
          <Link href="/communication/notifications">
            <Button variant="outline">Notifications</Button>
          </Link>
        </div>
      </div>

      <CommunicationSummaryCards {...stats} />

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Module health</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm">
            <strong>State:</strong> {health?.state ?? "checking…"}
          </div>
          {health?.message ? (
            <div className="text-xs text-muted-foreground mt-1">
              {health.message}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
