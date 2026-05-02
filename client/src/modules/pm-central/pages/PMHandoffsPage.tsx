/**
 * /pm-central/rtlm/handoffs — PS → PM handoff inbox + control surface.
 *
 * The dedicated `pmCentral.handoffs.*` queries return individual
 * handoff records once we add list endpoints; today this view leans
 * on `dashboard.summary` for the count and exposes the action surface
 * for accept/reject/convert by id.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

function useDefaultWorkspaceId(): number | undefined {
  const { data } = trpc.hq.workspaceDirectory.useQuery();
  return data?.workspaces?.[0]?.id;
}

export default function PMHandoffsPage() {
  const workspaceId = useDefaultWorkspaceId();
  const [handoffId, setHandoffId] = useState("");
  const [reason, setReason] = useState("");
  const utils = trpc.useUtils();

  const summaryQuery = trpc.pmCentral.dashboard.summary.useQuery(
    { workspaceId: workspaceId ?? 0 },
    { enabled: !!workspaceId },
  );

  const accept = trpc.pmCentral.handoffs.accept.useMutation({
    onSuccess: () => {
      utils.pmCentral.dashboard.summary.invalidate();
      utils.pmCentral.projects.list.invalidate();
      toast.success("Handoff accepted");
    },
    onError: (e) => toast.error(e.message),
  });
  const reject = trpc.pmCentral.handoffs.reject.useMutation({
    onSuccess: () => {
      utils.pmCentral.dashboard.summary.invalidate();
      toast.success("Handoff rejected");
      setReason("");
    },
    onError: (e) => toast.error(e.message),
  });
  const convert = trpc.pmCentral.handoffs.convertToProject.useMutation({
    onSuccess: () => {
      utils.pmCentral.dashboard.summary.invalidate();
      utils.pmCentral.projects.list.invalidate();
      toast.success("Handoff converted to project");
    },
    onError: (e) => toast.error(e.message),
  });

  if (!workspaceId)
    return (
      <div className="p-6 text-sm text-muted-foreground">Resolving workspace…</div>
    );

  const id = Number(handoffId);
  const idValid = Number.isFinite(id) && id > 0;

  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-1">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">PS → PM inbox</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summaryQuery.data?.pendingHandoffs ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">
              handoffs awaiting accept / convert
            </p>
            <Badge variant="outline" className="mt-2">
              source: PS only (handoff lane)
            </Badge>
          </CardContent>
        </Card>
      </div>
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Act on a handoff</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Input
              type="number"
              value={handoffId}
              onChange={(e) => setHandoffId(e.target.value)}
              placeholder="Handoff id"
            />
            <div className="flex gap-2">
              <Button
                disabled={!idValid || accept.isPending}
                onClick={() => accept.mutate({ id })}
              >
                Accept
              </Button>
              <Button
                disabled={!idValid || convert.isPending}
                onClick={() => convert.mutate({ id })}
              >
                Convert to project
              </Button>
            </div>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Rejection reason"
            />
            <Button
              variant="destructive"
              disabled={!idValid || !reason.trim() || reject.isPending}
              onClick={() => reject.mutate({ id, reason })}
            >
              Reject
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
