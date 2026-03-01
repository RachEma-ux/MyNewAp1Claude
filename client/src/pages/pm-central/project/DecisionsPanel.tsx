import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, Stamp } from "lucide-react";

export default function DecisionsPanel({ projectId }: { projectId: number }) {
  const query = trpc.modules.pmt.shell.tools.decisions.list.useQuery({ projectId });
  const decisions = query.data ?? [];

  if (query.isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Decision Log</h2>
      <p className="text-sm text-muted-foreground">Who decided what, when, and why — full audit trail</p>
      {decisions.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <Stamp className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No decisions recorded yet.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {decisions.map((d: any) => (
            <Card key={d.id}>
              <CardContent className="py-3">
                <div className="flex items-start justify-between">
                  <p className="text-sm font-medium">{d.title}</p>
                  <Badge variant={d.status === "approved" ? "default" : "outline"} className="text-[10px]">{d.status}</Badge>
                </div>
                <p className="text-xs mt-1 font-medium text-primary">{d.decision}</p>
                {d.rationale && <p className="text-xs text-muted-foreground mt-1">Why: {d.rationale}</p>}
                {d.context && <p className="text-xs text-muted-foreground mt-0.5">Context: {d.context}</p>}
                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                  {d.decidedAt && <span>Decided: {new Date(d.decidedAt).toLocaleDateString()}</span>}
                  <span>Recorded: {new Date(d.createdAt).toLocaleDateString()}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
