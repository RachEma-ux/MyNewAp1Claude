import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Route,
  Eye,
  FileSearch,
  Clock,
  AlertTriangle,
  ShieldCheck,
  BarChart3,
  BrainCircuit,
} from "lucide-react";

interface OversightProps {
  workspaceId: number;
  envelope?: any;
  queryPlan?: any;
}

export default function KGIAOversightPage({ workspaceId, envelope, queryPlan }: OversightProps) {
  // Also load recent runs to show the latest oversight data even without shell state
  const runsQuery = trpc.modules.kgia.runs.list.useQuery({ workspaceId, limit: 1 });
  const latestRunId = runsQuery.data?.[0]?.id;
  const runDetail = trpc.modules.kgia.runs.get.useQuery(
    { id: latestRunId!, workspaceId },
    { enabled: !!latestRunId }
  );

  // Use shell envelope if available, otherwise use latest run
  const env = envelope ?? runDetail.data?.run?.envelope as any;
  const plan = queryPlan ?? (runDetail.data?.plans?.[0] || null);

  if (!env && !plan) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        <div className="text-center space-y-2">
          <Eye className="w-8 h-8 mx-auto opacity-40" />
          <p>Run a query to see oversight details</p>
          <p className="text-xs">Mode, confidence, query plan, evidence, provenance, governance verdict</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Oversight</h3>
        <p className="text-sm text-muted-foreground">
          Detailed audit of the latest KGIA run — mode, evidence, provenance, governance
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Mode */}
        {env?.selectedMode && (
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Route className="w-3.5 h-3.5" /> Selected Mode
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <Badge variant="outline">{env.selectedMode.replace(/_/g, " ")}</Badge>
            </CardContent>
          </Card>
        )}

        {/* Confidence */}
        {env?.confidence && (
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5" /> Confidence
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${(env.confidence.overall ?? env.confidence) * 100}%` }}
                  />
                </div>
                <span className="text-sm font-mono font-bold">
                  {((env.confidence.overall ?? env.confidence) * 100).toFixed(0)}%
                </span>
              </div>
              {env.confidence.dataCompleteness !== undefined && (
                <div className="grid grid-cols-3 gap-2 mt-2 text-[10px] text-muted-foreground">
                  <div>Data: {(env.confidence.dataCompleteness * 100).toFixed(0)}%</div>
                  <div>Path: {(env.confidence.pathStrength * 100).toFixed(0)}%</div>
                  <div>Trust: {(env.confidence.sourceTrust * 100).toFixed(0)}%</div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Governance Verdict */}
        {env?.governanceVerdict && (
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" /> Governance Verdict
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 space-y-2">
              <Badge variant={env.governanceVerdict.safe ? "default" : "destructive"}>
                {env.governanceVerdict.safe ? "Allow" : "Deny"}
              </Badge>
              {env.governanceVerdict.violations?.length > 0 && (
                <ul className="text-xs text-red-400 space-y-0.5">
                  {env.governanceVerdict.violations.map((v: string, i: number) => (
                    <li key={i}>{v}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}

        {/* Temporal Validity */}
        {env?.temporalValidity && (
          <Card>
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Temporal Validity
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 text-xs space-y-1">
              {env.temporalValidity.asOf && (
                <div><span className="text-muted-foreground">As of:</span> {new Date(env.temporalValidity.asOf).toLocaleString()}</div>
              )}
              {env.temporalValidity.temporalWarning && (
                <div className="text-yellow-500">{env.temporalValidity.temporalWarning}</div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Query Plan */}
      {plan?.queryText && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <FileSearch className="w-3.5 h-3.5" /> Query Plan
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 space-y-1">
            {plan.intent && (
              <div className="text-xs"><span className="text-muted-foreground">Intent:</span> {plan.intent}</div>
            )}
            {plan.queryLanguage && (
              <div className="text-xs"><span className="text-muted-foreground">Language:</span> {plan.queryLanguage}</div>
            )}
            <pre className="text-[11px] bg-muted/50 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all mt-2">
              {plan.queryText}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Observed Facts */}
      {env?.observedFacts?.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" /> Observed Facts ({env.observedFacts.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ul className="space-y-1 text-xs">
              {env.observedFacts.map((f: any, i: number) => (
                <li key={i} className="text-muted-foreground py-0.5">
                  {typeof f === "string" ? f : JSON.stringify(f)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Inferred Claims */}
      {env?.inferredClaims?.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <BrainCircuit className="w-3.5 h-3.5" /> Inferred Claims ({env.inferredClaims.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ul className="space-y-1 text-xs">
              {env.inferredClaims.map((c: any, i: number) => (
                <li key={i} className="text-muted-foreground py-0.5">
                  {typeof c === "string" ? c : JSON.stringify(c)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Provenance */}
      {env?.provenanceRefs?.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs text-muted-foreground flex items-center gap-1.5">
              <FileSearch className="w-3.5 h-3.5" /> Provenance ({env.provenanceRefs.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ul className="space-y-1">
              {env.provenanceRefs.map((p: any, i: number) => (
                <li key={i} className="text-xs py-1 px-2 rounded bg-muted/30 flex items-center gap-2">
                  <Badge variant="outline" className="text-[9px]">{p.sourceType}</Badge>
                  <span className="text-muted-foreground truncate">{p.sourceRef}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Missing Knowledge */}
      {env?.missingKnowledge?.length > 0 && (
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs text-yellow-500 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Missing Knowledge ({env.missingKnowledge.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <ul className="space-y-1">
              {env.missingKnowledge.map((g: any, i: number) => (
                <li key={i} className="text-xs text-yellow-500 py-1 px-2 rounded bg-yellow-500/5">
                  {typeof g === "string" ? g : JSON.stringify(g)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
