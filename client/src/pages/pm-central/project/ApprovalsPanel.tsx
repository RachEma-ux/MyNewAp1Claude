import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";

const GATE_LABELS: Record<string, string> = { G0: "Intake", G1: "Planning Auth", G2: "Change Control", G3: "Compliance", G4: "Closure" };
const STATUS_COLORS: Record<string, string> = { pending: "bg-yellow-500", evaluating: "bg-blue-500", passed: "bg-green-500", failed: "bg-red-500", waived: "bg-gray-500" };

export default function ApprovalsPanel({ projectId }: { projectId: number }) {
  const query = trpc.modules.pmt.shell.gates.list.useQuery({ projectId });
  const gates = query.data ?? [];


  const pending = gates.filter((g: any) => g.status === "pending" || g.status === "evaluating");
  const completed = gates.filter((g: any) => g.status !== "pending" && g.status !== "evaluating");

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Approvals</h2>
      <p className="text-sm text-muted-foreground">Stage gates, change gates, and acceptance gates</p>
      {gates.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No gate requests yet.</p>
        </CardContent></Card>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-yellow-500">Pending ({pending.length})</h3>
              {pending.map((gate: any) => (
                <Card key={gate.id} className="border-yellow-500/30">
                  <CardContent className="py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{gate.gateId} — {GATE_LABELS[gate.gateId] || gate.gateId}</p>
                      {gate.reason && <p className="text-xs text-muted-foreground mt-0.5">{gate.reason}</p>}
                      <span className="text-[10px] text-muted-foreground">{new Date(gate.createdAt).toLocaleDateString()}</span>
                    </div>
                    <Badge className={`${STATUS_COLORS[gate.status]} text-white text-[10px]`}>{gate.status}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {completed.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Completed ({completed.length})</h3>
              {completed.map((gate: any) => (
                <Card key={gate.id} className="opacity-80">
                  <CardContent className="py-2 flex items-center justify-between">
                    <div>
                      <span className="text-sm">{gate.gateId} — {GATE_LABELS[gate.gateId] || gate.gateId}</span>
                      {gate.evaluatedAt && <span className="text-[10px] text-muted-foreground ml-2">{new Date(gate.evaluatedAt).toLocaleDateString()}</span>}
                    </div>
                    <Badge className={`${STATUS_COLORS[gate.status]} text-white text-[10px]`}>{gate.status}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
