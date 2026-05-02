/**
 * PRM Decision Log — Decision entries with rationale
 */
import { trpc } from "@/lib/trpc";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PRMDecisionLog({ caseId }: { caseId: number }) {
  const { data: decisions, isLoading } = trpc.prm.decisions.list.useQuery({ caseId });
  const utils = trpc.useUtils();
  const approveMutation = trpc.prm.decisions.approve.useMutation({
    onSuccess: () => utils.prm.decisions.list.invalidate({ caseId }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!decisions || decisions.length === 0) {
    return <p className="text-xs text-muted-foreground py-4">No decisions recorded yet.</p>;
  }

  return (
    <div className="space-y-3">
      {decisions.map((d: any) => (
        <div key={d.id} className="border rounded-lg p-3">
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-medium">{d.title}</h4>
            {d.approvedAt ? (
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[10px]"
                onClick={() => approveMutation.mutate({ id: d.id })}
                disabled={approveMutation.isPending}
              >
                Approve
              </Button>
            )}
          </div>
          {d.chosenPath && (
            <p className="text-xs text-muted-foreground mt-1">Path: {d.chosenPath}</p>
          )}
          <p className="text-xs mt-1">{d.rationale}</p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {new Date(d.createdAt).toLocaleDateString()}
          </p>
        </div>
      ))}
    </div>
  );
}
