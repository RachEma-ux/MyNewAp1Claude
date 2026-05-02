/**
 * PRM Action Ledger — Action list with ownership, due dates, status
 */
import { trpc } from "@/lib/trpc";
import { Loader2, CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PRMStatusBadge } from "./PRMStatusBadge";

export function PRMActionLedger({ caseId }: { caseId: number }) {
  const { data: actions, isLoading } = trpc.prm.actions.list.useQuery({ caseId });
  const utils = trpc.useUtils();
  const completeMutation = trpc.prm.actions.complete.useMutation({
    onSuccess: () => utils.prm.actions.list.invalidate({ caseId }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!actions || actions.length === 0) {
    return <p className="text-xs text-muted-foreground py-4">No actions defined yet.</p>;
  }

  return (
    <div className="space-y-2">
      {actions.map((action: any) => {
        const isOverdue =
          action.dueDate &&
          action.status !== "completed" &&
          new Date(action.dueDate) < new Date();

        return (
          <div key={action.id} className="border rounded-lg p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 flex-1 min-w-0">
                {action.status === "completed" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                ) : (
                  <Circle className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium truncate">{action.title}</h4>
                  {action.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {action.description}
                    </p>
                  )}
                </div>
              </div>
              {action.status !== "completed" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] shrink-0"
                  onClick={() => completeMutation.mutate({ id: action.id })}
                  disabled={completeMutation.isPending}
                >
                  Complete
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2 mt-2 text-[10px]">
              <span className="uppercase text-muted-foreground">{action.actionType}</span>
              <PRMStatusBadge status={action.status} />
              {isOverdue && (
                <span className="flex items-center gap-0.5 text-red-500">
                  <AlertTriangle className="h-3 w-3" /> Overdue
                </span>
              )}
              {action.dueDate && (
                <span className="text-muted-foreground">
                  Due: {new Date(action.dueDate).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
