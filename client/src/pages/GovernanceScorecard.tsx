import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Shield,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  FileText,
  Activity,
  Lock,
  Unlock,
  Package,
  Ban,
} from "lucide-react";

type Stage = "submit" | "register" | "validate" | "publish" | "catalog";

export default function GovernanceScorecard() {
  const [selectedStage, setSelectedStage] = useState<Stage>("validate");

  // Use preview endpoint (no 409 throws) for UI display
  const scorecardQuery = trpc.governance.scorecardPreview.useQuery(
    { stage: selectedStage },
    { refetchOnWindowFocus: false }
  );

  const catalogQuery = trpc.governance.controlCatalog.useQuery();
  const driftQuery = trpc.governance.driftLatest.useQuery();
  const driftStatusQuery = trpc.governance.driftStatus.useQuery();
  const frozenQuery = trpc.governance.frozenSubjects.useQuery();
  const unfreezeMutation = trpc.governance.unfreezeSubject.useMutation({
    onSuccess: () => {
      frozenQuery.refetch();
      driftStatusQuery.refetch();
    },
  });

  const scorecard = scorecardQuery.data;
  const catalog = catalogQuery.data;

  const score = scorecard?.scorecard?.score?.score ?? 0;
  const gatePassed = scorecard?.scorecard?.gateStatus?.passed ?? false;
  const risk = scorecard?.scorecard?.riskBreakdown ?? { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
  const results = scorecard?.scorecard?.controlResults ?? [];
  const evidence = scorecard?.evidence;
  const packResolution = scorecard?.packResolution;
  const subjectValidation = scorecard?.subjectValidation;
  const isBlocked = scorecard?.blocked ?? false;

  const getScoreColor = (s: number) => {
    if (s >= 90) return "text-green-400";
    if (s >= 70) return "text-yellow-400";
    if (s >= 50) return "text-orange-400";
    return "text-red-400";
  };

  const getSeverityBadge = (severity: string) => {
    const variants: Record<string, string> = {
      critical: "bg-red-600 text-white",
      high: "bg-orange-500 text-white",
      medium: "bg-yellow-500 text-black",
      low: "bg-blue-500 text-white",
    };
    return variants[severity] || "bg-gray-500 text-white";
  };

  const getPackBadge = (pack: string) => {
    const variants: Record<string, string> = {
      base: "bg-slate-600 text-white",
      provider: "bg-purple-600 text-white",
      llm: "bg-blue-600 text-white",
      model: "bg-green-600 text-white",
      agent: "bg-amber-600 text-white",
      bot: "bg-pink-600 text-white",
    };
    return variants[pack] || "bg-gray-500 text-white";
  };

  return (
    <div className="space-y-6 p-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Governance Scorecard</h1>
            <p className="text-sm text-muted-foreground">
              CGT v2 Automated Compliance Engine — Pack-Aware
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedStage} onValueChange={(v) => setSelectedStage(v as Stage)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Stage" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="register">Register</SelectItem>
              <SelectItem value="validate">Validate</SelectItem>
              <SelectItem value="publish">Publish</SelectItem>
              <SelectItem value="catalog">Catalog</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => scorecardQuery.refetch()}
            disabled={scorecardQuery.isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${scorecardQuery.isFetching ? "animate-spin" : ""}`} />
            Re-scan
          </Button>
        </div>
      </div>

      {/* Freeze Banner */}
      {(frozenQuery.data?.length ?? 0) > 0 && (
        <Card className="border-red-600 bg-red-950/20">
          <CardContent className="py-3 flex items-center gap-3">
            <Lock className="h-5 w-5 text-red-400" />
            <div>
              <span className="text-red-400 font-bold">GOVERNANCE FREEZE ACTIVE</span>
              <span className="text-sm text-muted-foreground ml-2">
                {frozenQuery.data?.length} subject(s) frozen — transitions blocked
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 409 Blocked Banner */}
      {isBlocked && (
        <Card className="border-orange-600 bg-orange-950/20">
          <CardContent className="py-3 flex items-center gap-3">
            <Ban className="h-5 w-5 text-orange-400" />
            <div>
              <span className="text-orange-400 font-bold">HTTP 409 — TRANSITION BLOCKED</span>
              <span className="text-sm text-muted-foreground ml-2">
                {scorecard?.scorecard?.gateStatus?.reason}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Score + Gate + Risk Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Overall Score */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Overall Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-5xl font-bold ${getScoreColor(score)}`}>
              {scorecardQuery.isLoading ? "..." : score}
              <span className="text-lg text-muted-foreground">/100</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {scorecard?.controlsEvaluated ?? 0} controls evaluated
              {scorecard?.runnersInvoked && ` via ${scorecard.runnersInvoked.length} runners`}
            </p>
          </CardContent>
        </Card>

        {/* Gate Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {selectedStage.toUpperCase()} Gate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              {gatePassed ? (
                <CheckCircle2 className="h-10 w-10 text-green-400" />
              ) : (
                <XCircle className="h-10 w-10 text-red-400" />
              )}
              <div>
                <span className={`text-3xl font-bold ${gatePassed ? "text-green-400" : "text-red-400"}`}>
                  {scorecardQuery.isLoading ? "..." : gatePassed ? "PASS" : "FAIL"}
                </span>
                {isBlocked && (
                  <span className="text-xs text-orange-400 block">409 Conflict</span>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {scorecard?.scorecard?.gateStatus?.reason || "Loading..."}
            </p>
          </CardContent>
        </Card>

        {/* Risk Breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Risk Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div>
                <div className="text-2xl font-bold text-red-400">{risk.critical}</div>
                <div className="text-xs text-muted-foreground">Critical</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-400">{risk.high}</div>
                <div className="text-xs text-muted-foreground">High</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-400">{risk.medium}</div>
                <div className="text-xs text-muted-foreground">Medium</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-blue-400">{risk.low}</div>
                <div className="text-xs text-muted-foreground">Low</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              {results.filter((r: any) => r.status === "pass").length} passed / {results.filter((r: any) => r.status === "fail").length} failed / {results.filter((r: any) => r.status === "skip").length} skipped
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Pack Resolution + Subject Validation Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Pack Resolution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Package className="h-4 w-4" />
              Pack Resolution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {packResolution ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {packResolution.resolved ? (
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-400" />
                  )}
                  <span className="text-sm">
                    {packResolution.resolved ? "Packs resolved" : "Pack resolution FAILED"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(packResolution.loadedPacks ?? []).map((pack: string) => (
                    <span key={pack} className={`text-xs px-1.5 py-0.5 rounded ${getPackBadge(pack)}`}>
                      {pack}
                    </span>
                  ))}
                </div>
                {(packResolution.missingPacks ?? []).length > 0 && (
                  <div className="text-xs text-red-400">
                    Missing: {(packResolution.missingPacks as string[]).join(", ")}
                  </div>
                )}
                {packResolution.error && (
                  <div className="text-xs text-red-400 mt-1">{packResolution.error}</div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No subject — base pack only</p>
            )}
          </CardContent>
        </Card>

        {/* Subject Validation */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Subject Validation
            </CardTitle>
          </CardHeader>
          <CardContent>
            {subjectValidation ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {subjectValidation.valid ? (
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-400" />
                  )}
                  <span className="text-sm">
                    {subjectValidation.valid ? "GovernedSubject contract valid" : "Contract validation FAILED"}
                  </span>
                </div>
                {(subjectValidation.errors ?? []).length > 0 && (
                  <div className="text-xs text-red-400 space-y-1">
                    {(subjectValidation.errors as string[]).map((e: string, i: number) => (
                      <div key={i}>- {e}</div>
                    ))}
                  </div>
                )}
                {(subjectValidation.warnings ?? []).length > 0 && (
                  <div className="text-xs text-yellow-400 space-y-1">
                    {(subjectValidation.warnings as string[]).map((w: string, i: number) => (
                      <div key={i}>- {w}</div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No subject — system-wide check</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Domain Scores */}
      {scorecard?.scorecard?.score?.domainScores && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Domain Scores</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {Object.entries(scorecard.scorecard.score.domainScores).map(([domain, data]: [string, any]) => (
                <div key={domain} className="text-center p-3 rounded-lg bg-muted/50">
                  <div className={`text-2xl font-bold ${getScoreColor(data.score)}`}>{data.score}%</div>
                  <div className="text-xs text-muted-foreground capitalize">{domain}</div>
                  <div className="text-xs text-muted-foreground">{data.achievedWeight}/{data.maxWeight} weight</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Control Results */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Control Results
          </CardTitle>
          <CardDescription>
            {results.length} controls evaluated for {selectedStage} stage gate
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {results.map((result: any, i: number) => (
              <div
                key={result.controlId || i}
                className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="mt-0.5">
                  {result.status === "pass" ? (
                    <CheckCircle2 className="h-5 w-5 text-green-400" />
                  ) : result.status === "fail" ? (
                    <XCircle className="h-5 w-5 text-red-400" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-yellow-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{result.controlId}</code>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${getSeverityBadge(result.severity)}`}>
                      {result.severity}
                    </span>
                    <span className="text-sm">{result.details}</span>
                  </div>
                  {result.status === "fail" && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Remediation: {result.remediation}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Drift Detection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Drift Detection
          </CardTitle>
          <CardDescription>
            {driftStatusQuery.data?.active ? "Active" : "Inactive"} — monitors governance posture changes
            {(driftStatusQuery.data?.frozenCount ?? 0) > 0 && (
              <span className="text-red-400 ml-2">
                ({driftStatusQuery.data?.frozenCount} frozen)
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {driftQuery.data ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className={`text-xl font-bold ${driftQuery.data.scoreDelta >= 0 ? "text-green-400" : "text-red-400"}`}>
                  {driftQuery.data.scoreDelta > 0 ? "+" : ""}{driftQuery.data.scoreDelta}
                </div>
                <div className="text-xs text-muted-foreground">Score Delta</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold">{driftQuery.data.currentScore}</div>
                <div className="text-xs text-muted-foreground">Current Score</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold">{driftQuery.data.newViolations?.length ?? 0}</div>
                <div className="text-xs text-muted-foreground">New Violations</div>
              </div>
              <div className="text-center">
                <div className={`text-xl font-bold ${driftQuery.data.escalationNeeded ? "text-red-400" : "text-green-400"}`}>
                  {driftQuery.data.escalationNeeded ? "YES" : "NO"}
                </div>
                <div className="text-xs text-muted-foreground">Escalation</div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No drift data yet. Run a scorecard first.</p>
          )}
        </CardContent>
      </Card>

      {/* Frozen Subjects */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Frozen Subjects
            {(frozenQuery.data?.length ?? 0) > 0 && (
              <Badge variant="destructive" className="ml-1">
                {frozenQuery.data?.length}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Frozen subjects have all lifecycle transitions blocked until explicitly unfrozen
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(frozenQuery.data?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">No frozen subjects. Governance posture is clean.</p>
          ) : (
            <div className="space-y-2">
              {frozenQuery.data?.map((subject: any) => (
                <div
                  key={subject.subjectId}
                  className="flex items-start gap-3 p-3 rounded-lg border border-red-500/30 bg-red-500/5"
                >
                  <Lock className="h-5 w-5 text-red-400 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">
                        {subject.subjectId === 0 ? "System-wide freeze" : `#${subject.subjectId}`}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {subject.subjectName}
                      </span>
                      <Badge variant="outline" className="text-xs bg-red-500/10 text-red-400 border-red-500/30">
                        Score: {subject.scoreAtFreeze}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{subject.reason}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>Frozen by: {subject.frozenBy}</span>
                      <span>At: {new Date(subject.frozenAt).toLocaleString()}</span>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 border-red-500/30 hover:bg-red-500/10"
                    disabled={unfreezeMutation.isPending}
                    onClick={() => unfreezeMutation.mutate({ subjectId: subject.subjectId })}
                  >
                    <Unlock className="h-3 w-3 mr-1" />
                    Unfreeze
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Evidence Bundle */}
      {evidence && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evidence Bundle</CardTitle>
            <CardDescription>Immutable audit artifact with SHA-256 integrity hash</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Bundle ID: </span>
                <code className="text-xs">{evidence.bundleId}</code>
              </div>
              <div>
                <span className="text-muted-foreground">Commit: </span>
                <code className="text-xs">{evidence.commitRef?.slice(0, 12)}</code>
              </div>
              <div>
                <span className="text-muted-foreground">Timestamp: </span>
                <span className="text-xs">{evidence.timestamp}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Hash: </span>
                <code className="text-xs break-all">{evidence.integrityHash?.slice(0, 24)}...</code>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Control Catalog with Pack Badges */}
      {catalog && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Control Catalog</CardTitle>
            <CardDescription>
              {catalog.activeControls?.length ?? 0} active controls across {catalog.availablePacks?.length ?? 0} packs,{" "}
              {catalog.runners?.length ?? 0} runners
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Pack summary */}
              <div className="flex flex-wrap gap-2">
                {(catalog.availablePacks ?? []).map((pack: string) => (
                  <span key={pack} className={`text-xs px-2 py-1 rounded ${getPackBadge(pack)}`}>
                    {pack}: {(catalog.activeControls ?? []).filter((c: any) => c.pack === pack).length}
                  </span>
                ))}
              </div>

              {/* Controls */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                {(catalog.activeControls ?? []).map((control: any) => (
                  <div key={control.id} className="flex items-center gap-2 p-2 rounded border">
                    <code className="text-xs font-mono bg-muted px-1 rounded">{control.id}</code>
                    <span className={`text-xs px-1 rounded ${getPackBadge(control.pack)}`}>
                      {control.pack}
                    </span>
                    <span className={`text-xs px-1 rounded ${getSeverityBadge(control.severity)}`}>
                      {control.severity}
                    </span>
                    <span className="text-xs truncate">{control.name}</span>
                    <span className="text-xs text-muted-foreground ml-auto">w:{control.weight}</span>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
