import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";

export default function FreezeHoldsPanel({ projectId }: { projectId: number }) {
  const projectQuery = trpc.modules.pmt.shell.projects.get.useQuery({ id: projectId });
  const gatesQuery = trpc.modules.pmt.shell.gates.list.useQuery({ projectId });
  const historyQuery = trpc.modules.pmt.shell.lifecycle.history.useQuery({ projectId });

  const project = projectQuery.data;
  const gates = gatesQuery.data ?? [];
  const transitions = historyQuery.data ?? [];


  const isFrozen = project?.status === "control_hold";
  const failedGates = gates.filter((g: any) => g.status === "failed");
  const holdTransitions = transitions.filter((t: any) => t.toState === "control_hold");

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Freeze & Holds</h2>
      <p className="text-sm text-muted-foreground">Control holds, freeze events, and remediation status</p>

      {/* Current freeze status */}
      <Card className={isFrozen ? "border-red-500/50 bg-red-500/5" : "border-green-500/30"}>
        <CardContent className="py-4 flex items-center gap-3">
          {isFrozen ? (
            <>
              <Lock className="h-6 w-6 text-red-500" />
              <div>
                <p className="font-medium text-red-500">Project is FROZEN — Control Hold Active</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  All execution is suspended. Remediate the G3 compliance failure to resume.
                </p>
              </div>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-6 w-6 text-green-500" />
              <div>
                <p className="font-medium text-green-600">No Active Freeze</p>
                <p className="text-sm text-muted-foreground mt-0.5">Project is operating normally.</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Remediation checklist (when frozen) */}
      {isFrozen && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-red-500" />Remediation Checklist</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {[
                "Identify root cause of G3 compliance failure",
                "Document corrective actions taken",
                "Submit evidence of remediation",
                "Request G3 re-evaluation",
                "Obtain approval to lift freeze",
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded border">
                  <div className="h-4 w-4 rounded-full border-2 border-muted-foreground shrink-0" />
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Failed gates */}
      {failedGates.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Failed Gate Evaluations</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {failedGates.map((g: any) => (
              <div key={g.id} className="flex items-center justify-between p-2 rounded border border-red-500/20 text-sm">
                <div>
                  <span className="font-medium">{g.gateId}</span>
                  {g.reason && <span className="text-muted-foreground ml-2">— {g.reason}</span>}
                </div>
                <Badge variant="destructive" className="text-[10px]">Failed</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Hold history */}
      {holdTransitions.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Hold History</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {holdTransitions.map((t: any) => (
              <div key={t.id} className="flex items-center justify-between p-2 rounded bg-muted/30 text-xs">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                  <span>{t.fromState?.replace(/_/g, " ")} → control hold</span>
                </div>
                <span className="text-muted-foreground">{new Date(t.createdAt).toLocaleDateString()}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!isFrozen && failedGates.length === 0 && holdTransitions.length === 0 && (
        <Card><CardContent className="py-8 text-center text-muted-foreground text-sm">
          No freeze events or hold history for this project.
        </CardContent></Card>
      )}
    </div>
  );
}
