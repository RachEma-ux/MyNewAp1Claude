import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, Check, X } from "lucide-react";
import { toast } from "sonner";

export default function CodeStudioApprovalsPage() {
  const pendingQuery = trpc.codeStudio.approvals.pending.useQuery({});
  const pending = pendingQuery.data ?? [];

  const resolveMutation = trpc.codeStudio.approvals.resolve.useMutation({
    onSuccess: (_, vars) => {
      toast.success(`Permission ${vars.decision}`);
      pendingQuery.refetch();
    },
    onError: () => toast.error("Failed to resolve"),
  });

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-sm font-semibold flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-amber-500" /> Pending Approvals
        {pending.length > 0 && <Badge variant="secondary" className="text-[9px] px-1.5">{pending.length}</Badge>}
      </h2>

      {pendingQuery.isLoading && <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin" /></div>}
      {!pendingQuery.isLoading && pending.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-8">No pending approvals.</p>
      )}
      <div className="space-y-2">
        {pending.map((p: any) => (
          <Card key={p.id} className="border-amber-500/20">
            <CardContent className="p-3">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="outline" className="text-[9px]">{p.permissionType}</Badge>
                    {p.toolName && <Badge variant="secondary" className="text-[9px]">{p.toolName}</Badge>}
                    <Badge variant={p.riskLevel === "critical" ? "destructive" : "outline"} className="text-[9px]">{p.riskLevel}</Badge>
                  </div>
                  {p.description && <p className="text-[10px] text-muted-foreground mt-1">{p.description}</p>}
                  <p className="text-[9px] text-muted-foreground mt-1">Job #{p.jobId} | Request #{p.id}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-3">
                  <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 text-green-600 border-green-500/30"
                    onClick={() => resolveMutation.mutate({ permissionRequestId: p.id, decision: "approved", scope: "once" })}
                    disabled={resolveMutation.isPending}>
                    <Check className="h-3 w-3 mr-0.5" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 text-red-600 border-red-500/30"
                    onClick={() => resolveMutation.mutate({ permissionRequestId: p.id, decision: "denied" })}
                    disabled={resolveMutation.isPending}>
                    <X className="h-3 w-3 mr-0.5" /> Deny
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
