/**
 * /communication/notifications — Communication-owned notifications.
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NotificationList } from "../components/NotificationList";

function useDefaultWorkspaceId(): number | undefined {
  const { data } = trpc.hq.workspaceDirectory.useQuery();
  return data?.workspaces?.[0]?.id;
}

export default function CommunicationNotificationsPage() {
  const workspaceId = useDefaultWorkspaceId();

  if (!workspaceId) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Resolving workspace…
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col gap-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <NotificationList workspaceId={workspaceId} />
        </CardContent>
      </Card>
    </div>
  );
}
