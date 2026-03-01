import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, Package } from "lucide-react";

export default function EvidencePanel({ projectId }: { projectId: number }) {
  const artifactsQuery = trpc.modules.pmt.shell.artifacts.list.useQuery({ projectId });
  const gatesQuery = trpc.modules.pmt.shell.gates.list.useQuery({ projectId });
  const artifacts = artifactsQuery.data ?? [];
  const gates = gatesQuery.data ?? [];
  const gatesWithVerdicts = gates.filter((g: any) => g.verdict);

  if (artifactsQuery.isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Evidence</h2>
      <p className="text-sm text-muted-foreground">Verdicts, integrity hashes, approval records, and evidence bundles</p>

      {/* Gate verdicts */}
      <Card>
        <CardHeader><CardTitle className="text-base">Gate Verdicts</CardTitle></CardHeader>
        <CardContent>
          {gatesWithVerdicts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No gate verdicts recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {gatesWithVerdicts.map((g: any) => (
                <div key={g.id} className="p-2 rounded border text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{g.gateId} — {g.status}</span>
                    <span className="text-muted-foreground">{new Date(g.evaluatedAt || g.createdAt).toLocaleDateString()}</span>
                  </div>
                  <pre className="mt-1 text-[10px] text-muted-foreground overflow-auto max-h-20">{JSON.stringify(g.verdict, null, 2)}</pre>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Artifact hashes */}
      <Card>
        <CardHeader><CardTitle className="text-base">Artifact Integrity</CardTitle></CardHeader>
        <CardContent>
          {artifacts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No artifacts with integrity hashes.</p>
          ) : (
            <div className="space-y-1.5">
              {artifacts.map((a: any) => (
                <div key={a.id} className="flex items-center justify-between p-1.5 rounded bg-muted/30 text-xs">
                  <div>
                    <span className="font-medium">{a.name}</span>
                    <span className="text-muted-foreground ml-2">v{a.version}</span>
                  </div>
                  <code className="font-mono text-[10px] text-muted-foreground">{a.sha256?.slice(0, 16)}...</code>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
