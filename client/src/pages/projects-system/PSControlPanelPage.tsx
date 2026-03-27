/**
 * PS Control Panel — Matrix Admin Surface
 *
 * Thin orchestrator: imports tab components from dedicated files.
 * Provides: matrix overview, version management, import center,
 * scope editor, question editor, dimension editor, matrix grid editor, validation panel.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Grid3X3,
  Loader2,
  Shield,
  Upload,
  Zap,
  LayoutGrid,
  List,
  FileQuestion,
  Target,
  Layers,
  BarChart3,
  TrendingUp,
  TrendingDown,
  FolderKanban,
  GitCompareArrows,
  PieChart,
} from "lucide-react";

// ── Tab Components ────────────────────────────────────────────────────
import { PSMatrixVersionManager } from "./PSMatrixVersionManager";
import { PSImportPreviewPanel } from "./PSImportPreviewPanel";
import { PSScopeRegistryEditor } from "./PSScopeRegistryEditor";
import { PSQuestionEditor } from "./PSQuestionEditor";
import { PSDimensionEditor } from "./PSDimensionEditor";
import { PSMatrixGridEditor } from "./PSMatrixGridEditor";
import { PSValidationQueueTab } from "./PSValidationQueueTab";

// ── Helpers ──────────────────────────────────────────────────────────

function formatDate(ts: string | Date | null | undefined): string {
  if (!ts) return "\u2014";
  const d = typeof ts === "string" ? new Date(ts) : ts;
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── Exported Version Selector (used by child components) ─────────────

export function PSVersionSelector({
  selectedVersionId,
  onSelectVersion,
}: {
  selectedVersionId: number | null;
  onSelectVersion: (id: number) => void;
}) {
  const { data: versions } = trpc.ps.matrix.listVersions.useQuery();

  if (!versions || versions.length === 0) {
    return <p className="text-sm text-muted-foreground">No versions. Create one in the Versions tab.</p>;
  }

  const statusColor = (s: string) => {
    if (s === "active") return "text-green-600 border-green-500/30";
    if (s === "draft") return "text-yellow-600 border-yellow-500/30";
    return "text-muted-foreground";
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm text-muted-foreground">Version:</span>
      {versions.map((v) => (
        <Button
          key={v.id}
          size="sm"
          variant={selectedVersionId === v.id ? "default" : "outline"}
          onClick={() => onSelectVersion(v.id)}
          className="text-xs"
        >
          {v.version} <Badge variant="outline" className={`ml-1 text-[10px] ${statusColor(v.status)}`}>{v.status}</Badge>
        </Button>
      ))}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────

export function PSControlPanelPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">PS Control Panel</h1>
        <Badge variant="outline" className="text-indigo-600 border-indigo-500/30">
          Matrix Admin
        </Badge>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="overview"><LayoutGrid className="w-3.5 h-3.5 mr-1" />Overview</TabsTrigger>
          <TabsTrigger value="versions"><List className="w-3.5 h-3.5 mr-1" />Versions</TabsTrigger>
          <TabsTrigger value="import"><Upload className="w-3.5 h-3.5 mr-1" />Import</TabsTrigger>
          <TabsTrigger value="scopes"><Target className="w-3.5 h-3.5 mr-1" />Scopes</TabsTrigger>
          <TabsTrigger value="questions"><FileQuestion className="w-3.5 h-3.5 mr-1" />Questions</TabsTrigger>
          <TabsTrigger value="dimensions"><Layers className="w-3.5 h-3.5 mr-1" />Dimensions</TabsTrigger>
          <TabsTrigger value="grid"><Grid3X3 className="w-3.5 h-3.5 mr-1" />Grid</TabsTrigger>
          <TabsTrigger value="validation"><Shield className="w-3.5 h-3.5 mr-1" />Validation</TabsTrigger>
          <TabsTrigger value="monitoring"><BarChart3 className="w-3.5 h-3.5 mr-1" />Monitoring</TabsTrigger>
          <TabsTrigger value="queue"><CheckCircle2 className="w-3.5 h-3.5 mr-1" />Queue</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab onSelectVersion={setSelectedVersionId} onChangeTab={setActiveTab} />
        </TabsContent>
        <TabsContent value="versions">
          <PSMatrixVersionManager selectedVersionId={selectedVersionId} onSelectVersion={setSelectedVersionId} />
        </TabsContent>
        <TabsContent value="import">
          <PSImportPreviewPanel />
        </TabsContent>
        <TabsContent value="scopes">
          <PSScopeRegistryEditor selectedVersionId={selectedVersionId} onSelectVersion={setSelectedVersionId} />
        </TabsContent>
        <TabsContent value="questions">
          <PSQuestionEditor selectedVersionId={selectedVersionId} onSelectVersion={setSelectedVersionId} />
        </TabsContent>
        <TabsContent value="dimensions">
          <PSDimensionEditor selectedVersionId={selectedVersionId} onSelectVersion={setSelectedVersionId} />
        </TabsContent>
        <TabsContent value="grid">
          <PSMatrixGridEditor selectedVersionId={selectedVersionId} onSelectVersion={setSelectedVersionId} />
        </TabsContent>
        <TabsContent value="validation">
          <ValidationTab selectedVersionId={selectedVersionId} onSelectVersion={setSelectedVersionId} />
        </TabsContent>
        <TabsContent value="monitoring">
          <MonitoringTab />
        </TabsContent>
        <TabsContent value="queue">
          <PSValidationQueueTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── A. Overview Tab (kept inline — small, uses formatDate) ───────────

function OverviewTab({
  onSelectVersion,
  onChangeTab,
}: {
  onSelectVersion: (id: number) => void;
  onChangeTab: (tab: string) => void;
}) {
  const { data, isLoading } = trpc.ps.matrix.getOverview.useQuery();

  if (isLoading) return <Loader2 className="w-5 h-5 animate-spin mx-auto mt-8" />;
  if (!data) return <p className="text-sm text-muted-foreground">Unable to load overview.</p>;

  return (
    <div className="grid md:grid-cols-3 gap-4">
      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Zap className="w-4 h-4 text-green-500" />Active Version</CardTitle></CardHeader>
        <CardContent>
          {data.activeVersion ? (
            <div className="space-y-1">
              <p className="font-medium">{data.activeVersion.version}</p>
              <p className="text-xs text-muted-foreground">{data.activeVersion.label}</p>
              <p className="text-xs text-muted-foreground">Activated: {formatDate(data.activeVersion.activatedAt)}</p>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2 text-xs"
                onClick={() => { onSelectVersion(data.activeVersion!.id); onChangeTab("grid"); }}
              >
                View Grid
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No active version</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Grid3X3 className="w-4 h-4 text-indigo-500" />Matrix Stats</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Total Versions</span><span className="font-medium">{data.totalVersions}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Scopes (active)</span><span className="font-medium">{data.totalScopes}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Questions (active)</span><span className="font-medium">{data.totalQuestions}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Cells</span><span className="font-medium">{data.totalCells}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Dimensions</span><span className="font-medium">{data.totalDimensions}</span></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Activity className="w-4 h-4 text-orange-500" />Activity</CardTitle></CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Last Import</span><span>{formatDate(data.lastImportAt)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Last Activation</span><span>{formatDate(data.lastActivationAt)}</span></div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── G. Validation Tab (kept inline — uses PSVersionSelector) ─────────

function ValidationTab({
  selectedVersionId,
  onSelectVersion,
}: {
  selectedVersionId: number | null;
  onSelectVersion: (id: number) => void;
}) {
  const utils = trpc.useUtils();
  const { data: report, isLoading, refetch } = trpc.ps.matrix.getValidationReport.useQuery(
    { versionId: selectedVersionId! },
    { enabled: !!selectedVersionId },
  );

  const activateMut = trpc.ps.matrix.activateVersion.useMutation({
    onSuccess: () => {
      utils.ps.matrix.listVersions.invalidate();
      utils.ps.matrix.getOverview.invalidate();
      toast.success("Version activated successfully!");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <PSVersionSelector selectedVersionId={selectedVersionId} onSelectVersion={onSelectVersion} />
      {!selectedVersionId ? null : isLoading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : !report ? <p className="text-sm text-muted-foreground">Unable to load validation report.</p> : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Validation Report</h2>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => refetch()}>Re-validate</Button>
              {report.isValid && (
                <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => activateMut.mutate({ id: selectedVersionId! })} disabled={activateMut.isPending}>
                  {activateMut.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                  Activate Version
                </Button>
              )}
            </div>
          </div>

          <Card>
            <CardContent className="pt-4 space-y-4">
              <div className="flex items-center gap-3">
                {report.isValid ? (
                  <Badge className="bg-green-600 text-white">VALID</Badge>
                ) : (
                  <Badge className="bg-red-600 text-white">INVALID — {report.errors.length} error(s)</Badge>
                )}
                <span className="text-sm text-muted-foreground">Coverage: {report.stats.coveragePercent}%</span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><span className="text-muted-foreground">Scopes</span> <span className="font-medium ml-1">{report.stats.activeScopeCount}/{report.stats.scopeCount}</span></div>
                <div><span className="text-muted-foreground">Questions</span> <span className="font-medium ml-1">{report.stats.activeQuestionCount}/{report.stats.questionCount}</span></div>
                <div><span className="text-muted-foreground">Cells</span> <span className="font-medium ml-1">{report.stats.cellCount}/{report.stats.expectedCellCount}</span></div>
                <div><span className="text-muted-foreground">Coverage</span> <span className="font-medium ml-1">{report.stats.coveragePercent}%</span></div>
              </div>

              {report.errors.length > 0 && (
                <div className="space-y-1">
                  <h3 className="text-sm font-medium text-red-600">Errors</h3>
                  {report.errors.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm rounded border border-red-500/20 bg-red-500/5 p-2">
                      <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                      <div>
                        <span className="font-mono text-xs text-red-400">[{e.type}]</span>
                        <span className="ml-1">{e.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {report.warnings.length > 0 && (
                <div className="space-y-1">
                  <h3 className="text-sm font-medium text-yellow-600">Warnings</h3>
                  {report.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm rounded border border-yellow-500/20 bg-yellow-500/5 p-2">
                      <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ── H. Monitoring Tab ────────────────────────────────────────────────

function MonitoringTab() {
  const { data, isLoading } = trpc.ps.getMonitoringSummary.useQuery();

  if (isLoading) return <Loader2 className="w-5 h-5 animate-spin mx-auto mt-8" />;
  if (!data) return <p className="text-sm text-muted-foreground">Unable to load monitoring data.</p>;

  return (
    <div className="space-y-6">
      {/* ── Row 1: Key Metrics ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          icon={<FolderKanban className="w-4 h-4 text-blue-500" />}
          label="PS Projects"
          value={data.projects.total}
          sub={`${data.projects.draft} draft / ${data.projects.validated} validated`}
        />
        <MetricCard
          icon={<CheckCircle2 className="w-4 h-4 text-green-500" />}
          label="Validation Rate"
          value={`${data.projects.validationRate}%`}
          sub={`${data.projects.validated} of ${data.projects.validated + data.projects.rejected} decided`}
        />
        <MetricCard
          icon={<AlertTriangle className="w-4 h-4 text-red-500" />}
          label="Rejection Rate"
          value={`${data.projects.rejectionRate}%`}
          sub={`${data.projects.rejected} rejected`}
        />
        <MetricCard
          icon={<GitCompareArrows className="w-4 h-4 text-orange-500" />}
          label="Override Rate"
          value={`${data.overrideRate.overrideRate}%`}
          sub={`${data.overrideRate.totalOverrides} of ${data.overrideRate.totalWizardRuns} runs`}
        />
      </div>

      {/* ── Row 2: Drift + Confidence Dist ────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Drift Rate */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-amber-500" />
              Drift Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.drift.totalFeedback === 0 ? (
              <p className="text-sm text-muted-foreground">No feedback submitted yet.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-bold">{data.drift.driftRate}%</span>
                  <span className="text-sm text-muted-foreground">
                    {data.drift.driftCount} of {data.drift.totalFeedback} feedback entries flagged drift
                  </span>
                </div>
                {data.drift.byOutcome.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase">By Outcome</p>
                    {data.drift.byOutcome.map((o) => (
                      <div key={o.outcome} className="flex justify-between text-sm">
                        <span className="capitalize">{o.outcome}</span>
                        <span>
                          {o.driftCount}/{o.count}
                          <span className="text-muted-foreground ml-1">
                            ({o.count > 0 ? Math.round((o.driftCount / o.count) * 100) : 0}%)
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Confidence Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <PieChart className="w-4 h-4 text-indigo-500" />
              Confidence Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.confidenceDistribution.every((b) => b.count === 0) ? (
              <p className="text-sm text-muted-foreground">No projects with confidence scores yet.</p>
            ) : (
              <div className="space-y-2">
                {data.confidenceDistribution.map((b) => (
                  <div key={b.bucket} className="flex items-center gap-3">
                    <span className="text-xs w-12 text-right text-muted-foreground">{b.bucket}</span>
                    <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                      <div
                        className="h-full bg-indigo-500 rounded-full transition-all"
                        style={{ width: `${Math.max(b.percent, b.count > 0 ? 2 : 0)}%` }}
                      />
                    </div>
                    <span className="text-xs w-16 text-muted-foreground">{b.count} ({b.percent}%)</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 3: Scope Distribution ────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Target className="w-4 h-4 text-purple-500" />
            Scope Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.scopeDistribution.length === 0 ? (
            <p className="text-sm text-muted-foreground">No wizard runs recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {data.scopeDistribution.map((s) => (
                <div key={s.scopeCode} className="flex items-center gap-3">
                  <span className="text-xs w-40 truncate font-mono" title={s.scopeCode}>{s.scopeCode}</span>
                  <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full transition-all"
                      style={{ width: `${Math.max(s.percent, s.count > 0 ? 2 : 0)}%` }}
                    />
                  </div>
                  <span className="text-xs w-20 text-muted-foreground">{s.count} ({s.percent}%)</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Row 4: Confidence Trends + Project Breakdown ─────────── */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Confidence Trends */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              Confidence Trends (12 weeks)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.confidenceTrends.length === 0 ? (
              <p className="text-sm text-muted-foreground">No wizard runs in the last 12 weeks.</p>
            ) : (
              <div className="space-y-1">
                {data.confidenceTrends.map((t) => (
                  <div key={t.period} className="flex items-center gap-3 text-sm">
                    <span className="w-24 text-xs text-muted-foreground font-mono">{t.period}</span>
                    <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all"
                        style={{ width: `${t.avgConfidence}%` }}
                      />
                    </div>
                    <span className="text-xs w-24 text-muted-foreground">
                      {t.avgConfidence}% ({t.runCount} runs)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Project Status Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <FolderKanban className="w-4 h-4 text-blue-500" />
              Project Status Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.projects.total === 0 ? (
              <p className="text-sm text-muted-foreground">No projects created yet.</p>
            ) : (
              <div className="space-y-2">
                {[
                  { label: "Draft", count: data.projects.draft, color: "bg-gray-400" },
                  { label: "Submitted", count: data.projects.submitted, color: "bg-yellow-500" },
                  { label: "Validated", count: data.projects.validated, color: "bg-green-500" },
                  { label: "Rejected", count: data.projects.rejected, color: "bg-red-500" },
                  { label: "Sent to PM", count: data.projects.sentToPm, color: "bg-blue-500" },
                ].map((row) => (
                  <div key={row.label} className="flex items-center gap-3">
                    <span className="text-xs w-20 text-muted-foreground">{row.label}</span>
                    <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                      <div
                        className={`h-full ${row.color} rounded-full transition-all`}
                        style={{ width: `${data.projects.total > 0 ? Math.max((row.count / data.projects.total) * 100, row.count > 0 ? 3 : 0) : 0}%` }}
                      />
                    </div>
                    <span className="text-xs w-8 text-right font-medium">{row.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Row 5: Override Rate Detail (30d) ─────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <GitCompareArrows className="w-4 h-4 text-orange-500" />
            Override Rate Detail
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">All-time</p>
              <p className="text-2xl font-bold">{data.overrideRate.overrideRate}%</p>
              <p className="text-xs text-muted-foreground">{data.overrideRate.totalOverrides} overrides / {data.overrideRate.totalWizardRuns} runs</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Last 30 days</p>
              <p className="text-2xl font-bold">{data.overrideRate.last30dOverrideRate}%</p>
              <p className="text-xs text-muted-foreground">{data.overrideRate.last30dOverrides} overrides / {data.overrideRate.last30dWizardRuns} runs</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Wizard Avg Confidence</p>
              <p className="text-2xl font-bold">{data.wizard.averageConfidence ?? "\u2014"}</p>
              <p className="text-xs text-muted-foreground">{data.wizard.total} total runs</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Metric Card (reusable) ───────────────────────────────────────────

function MetricCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          {icon}
          {label}
        </div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      </CardContent>
    </Card>
  );
}

export default PSControlPanelPage;
