/**
 * PMHandoffQueue — visualises pending PS → PM handoffs (count via summary).
 *
 * The full handoff list view lives at /pm-central/rtlm/handoffs and uses
 * the dedicated tRPC procedures there. Detailed records require the
 * handoff inbox (still being grown).
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Inbox } from "lucide-react";

export function PMHandoffQueue({ workspaceId }: { workspaceId: number }) {
  const { data } = trpc.pmCentral.dashboard.summary.useQuery({ workspaceId });
  const count = data?.pendingHandoffs ?? 0;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">PS → PM inbox</CardTitle>
        <Inbox className="w-5 h-5 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{count}</div>
        <p className="text-xs text-muted-foreground">
          handoffs awaiting accept / convert
        </p>
        {count > 0 && (
          <Badge variant="destructive" className="mt-2">
            attention
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}
