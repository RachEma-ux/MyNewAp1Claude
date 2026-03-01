import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Loader2, AlertTriangle } from "lucide-react";

const PROB_LABEL: Record<string, string> = { very_low: "Very Low", low: "Low", medium: "Medium", high: "High", very_high: "Very High" };
const IMPACT_COLORS: Record<string, string> = { very_high: "text-red-600", high: "text-orange-500", medium: "text-yellow-500", low: "text-green-500", very_low: "text-gray-400" };

export default function ProjectRisksPanel({ projectId }: { projectId: number }) {
  const query = trpc.modules.pmt.shell.tools.risks.list.useQuery({ projectId });
  const risks = query.data ?? [];

  if (query.isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const openRisks = risks.filter((r: any) => r.status === "open" || r.status === "mitigating");
  const closedRisks = risks.filter((r: any) => r.status === "closed" || r.status === "accepted");

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">Risks</h2>
      <p className="text-sm text-muted-foreground">Future threats — probability × impact assessment</p>
      {risks.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <AlertTriangle className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">No risks identified yet.</p>
        </CardContent></Card>
      ) : (
        <>
          {openRisks.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Open ({openRisks.length})</h3>
              {openRisks.map((risk: any) => (
                <Card key={risk.id}>
                  <CardContent className="py-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium">{risk.title}</p>
                        {risk.description && <p className="text-xs text-muted-foreground mt-0.5">{risk.description}</p>}
                        <div className="flex items-center gap-3 mt-1.5 text-[10px]">
                          <span>P: {PROB_LABEL[risk.probability] || risk.probability}</span>
                          <span className={IMPACT_COLORS[risk.impact] || ""}>I: {PROB_LABEL[risk.impact] || risk.impact}</span>
                          <span className="font-bold">Score: {risk.riskScore || "—"}</span>
                        </div>
                      </div>
                      <Badge variant={risk.status === "mitigating" ? "default" : "outline"} className="text-[10px]">{risk.status}</Badge>
                    </div>
                    {risk.mitigationPlan && <p className="text-xs text-muted-foreground mt-2 border-t pt-1.5">Mitigation: {risk.mitigationPlan}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          {closedRisks.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Closed ({closedRisks.length})</h3>
              {closedRisks.map((risk: any) => (
                <Card key={risk.id} className="opacity-60">
                  <CardContent className="py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{risk.title}</span>
                      <Badge variant="secondary" className="text-[10px]">{risk.status}</Badge>
                    </div>
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
