import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, ShieldAlert, ShieldCheck, Lock } from "lucide-react";

const GATE_INFO = [
  { id: "G0", name: "Intake Review", description: "Validates project charter, sponsor approval, and initial risk assessment" },
  { id: "G1", name: "Planning Authorization", description: "Reviews WBS, timeline, budget baseline, and resource allocation" },
  { id: "G2", name: "Change Control", description: "Evaluates change request impact on scope, schedule, and budget" },
  { id: "G3", name: "Operational Compliance", description: "Continuous compliance monitoring during execution" },
  { id: "G4", name: "Closure", description: "Validates all deliverables accepted, lessons learned, and final reporting" },
];

const STATUS_COLORS: Record<string, string> = { pending: "bg-yellow-500", evaluating: "bg-blue-500", passed: "bg-green-500", failed: "bg-red-500", waived: "bg-gray-500" };

export default function GateCenterPanel({ projectId }: { projectId: number }) {
  const gatesQuery = trpc.modules.pmt.shell.gates.list.useQuery({ projectId });
  const projectQuery = trpc.modules.pmt.shell.projects.get.useQuery({ id: projectId });
  const gates = gatesQuery.data ?? [];
  const project = projectQuery.data;

  if (gatesQuery.isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  // Build gate status map (latest request per gate)
  const gateMap: Record<string, any> = {};
  gates.forEach((g: any) => {
    if (!gateMap[g.gateId] || new Date(g.createdAt) > new Date(gateMap[g.gateId].createdAt)) {
      gateMap[g.gateId] = g;
    }
  });

  const isFrozen = project?.status === "control_hold";

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Gate Center</h2>
      <p className="text-sm text-muted-foreground">Governance gates — 5 quality checkpoints through the project lifecycle</p>

      {isFrozen && (
        <Card className="border-red-500/50 bg-red-500/5">
          <CardContent className="py-3 flex items-center gap-3">
            <Lock className="h-5 w-5 text-red-500" />
            <div>
              <p className="text-sm font-medium text-red-500">Project Frozen — Control Hold</p>
              <p className="text-xs text-muted-foreground">G3 compliance failure. Execution is frozen until remediation.</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {GATE_INFO.map(gate => {
          const request = gateMap[gate.id];
          const status = request?.status;
          return (
            <Card key={gate.id} className={status === "failed" ? "border-red-500/30" : status === "passed" ? "border-green-500/30" : ""}>
              <CardContent className="py-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{gate.id}</span>
                      <span className="text-sm font-medium">{gate.name}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{gate.description}</p>
                  </div>
                  {status ? (
                    <Badge className={`${STATUS_COLORS[status]} text-white text-[10px]`}>{status}</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">Not requested</Badge>
                  )}
                </div>
                {request?.reason && (
                  <p className="text-xs text-muted-foreground mt-1.5 border-t pt-1.5">{request.reason}</p>
                )}
                {request?.evaluatedAt && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Evaluated: {new Date(request.evaluatedAt).toLocaleString()}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* All gate history */}
      {gates.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Gate History</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {gates.map((g: any) => (
                <div key={g.id} className="flex items-center justify-between text-xs p-1.5 rounded bg-muted/30">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{g.gateId}</span>
                    <span className="text-muted-foreground">{new Date(g.createdAt).toLocaleDateString()}</span>
                  </div>
                  <Badge className={`${STATUS_COLORS[g.status]} text-white text-[9px] px-1`}>{g.status}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
