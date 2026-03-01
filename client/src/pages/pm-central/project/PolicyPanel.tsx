import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, ShieldCheck } from "lucide-react";

export default function PolicyPanel({ projectId }: { projectId: number }) {
  const lifecycleQuery = trpc.modules.pmt.shell.lifecycle.history.useQuery({ projectId });
  const transitions = lifecycleQuery.data ?? [];

  if (lifecycleQuery.isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Policy & Scorecard</h2>
      <p className="text-sm text-muted-foreground">Governance scorecard snapshots and policy compliance</p>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Lifecycle Audit Trail</CardTitle></CardHeader>
        <CardContent>
          {transitions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No state transitions recorded.</p>
          ) : (
            <div className="space-y-1.5">
              {transitions.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between p-2 rounded border text-xs">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">{t.fromState.replace(/_/g, " ")}</Badge>
                    <span className="text-muted-foreground">→</span>
                    <Badge className="text-[10px]">{t.toState.replace(/_/g, " ")}</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    {t.reason && <span className="max-w-[200px] truncate">{t.reason}</span>}
                    <span>{new Date(t.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Policy Compliance</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Governance scorecards run during gate evaluations. Results are stored as evidence bundles
            with full provenance tracking. See the Evidence panel for detailed verdicts.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
