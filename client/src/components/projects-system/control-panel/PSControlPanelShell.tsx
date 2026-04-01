/**
 * PS Control Panel — Shell (IBM Carbon pattern)
 *
 * Fragment pattern: returns <>sidebar + content</> — parent page provides
 * the flex wrapper cloned from PmCentralSidebarLayout.
 *
 * Owns: activeView + selectedVersionId state.
 * Renders: sidebar (left) + content area (right) matching the 11 original tabs.
 */
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Grid3X3,
  Loader2,
  Shield,
  Zap,
  FolderKanban,
  GitCompareArrows,
  PieChart,
  Target,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

import { PSControlPanelSidebar, type ControlPanelView } from "./PSControlPanelSidebar";

// ── Tab Components ────────────────────────────────────────────────────
import { PSMatrixVersionManager } from "@/pages/projects-system/PSMatrixVersionManager";
import { PSImportPreviewPanel } from "@/pages/projects-system/PSImportPreviewPanel";
import { PSScopeRegistryEditor } from "@/pages/projects-system/PSScopeRegistryEditor";
import { PSQuestionEditor } from "@/pages/projects-system/PSQuestionEditor";
import { PSDimensionEditor } from "@/pages/projects-system/PSDimensionEditor";
import { PSMatrixGridEditor } from "@/pages/projects-system/PSMatrixGridEditor";
import { PSValidationQueueTab } from "@/pages/projects-system/PSValidationQueueTab";
import { PSVersionSelector } from "./PSVersionSelector";

// ── Helpers ──────────────────────────────────────────────────────────

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false,
  );
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);
  return isMobile;
}

function formatDate(ts: string | Date | null | undefined): string {
  if (!ts) return "\u2014";
  const d = typeof ts === "string" ? new Date(ts) : ts;
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

// ── A. Overview Tab ──────────────────────────────────────────────────

function OverviewTab({
  onSelectVersion,
  onChangeView,
}: {
  onSelectVersion: (id: number) => void;
  onChangeView: (view: ControlPanelView) => void;
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
                onClick={() => { onSelectVersion(data.activeVersion!.id); onChangeView("grid"); }}
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

// ── G. Validation Tab ────────────────────────────────────────────────

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
                  {report.errors.map((e: any, i: number) => (
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
                  {report.warnings.map((w: any, i: number) => (
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard icon={<FolderKanban className="w-4 h-4 text-blue-500" />} label="PS Projects" value={data.projects.total} sub={`${data.projects.draft} draft / ${data.projects.validated} validated`} />
        <MetricCard icon={<CheckCircle2 className="w-4 h-4 text-green-500" />} label="Validation Rate" value={`${data.projects.validationRate}%`} sub={`${data.projects.validated} of ${data.projects.validated + data.projects.rejected} decided`} />
        <MetricCard icon={<AlertTriangle className="w-4 h-4 text-red-500" />} label="Rejection Rate" value={`${data.projects.rejectionRate}%`} sub={`${data.projects.rejected} rejected`} />
        <MetricCard icon={<GitCompareArrows className="w-4 h-4 text-orange-500" />} label="Override Rate" value={`${data.overrideRate.overrideRate}%`} sub={`${data.overrideRate.totalOverrides} of ${data.overrideRate.totalWizardRuns} runs`} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><TrendingDown className="w-4 h-4 text-amber-500" />Drift Rate</CardTitle></CardHeader>
          <CardContent>
            {data.drift.totalFeedback === 0 ? (
              <p className="text-sm text-muted-foreground">No feedback submitted yet.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-bold">{data.drift.driftRate}%</span>
                  <span className="text-sm text-muted-foreground">{data.drift.driftCount} of {data.drift.totalFeedback} feedback entries flagged drift</span>
                </div>
                {data.drift.byOutcome.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase">By Outcome</p>
                    {data.drift.byOutcome.map((o: any) => (
                      <div key={o.outcome} className="flex justify-between text-sm">
                        <span className="capitalize">{o.outcome}</span>
                        <span>{o.driftCount}/{o.count}<span className="text-muted-foreground ml-1">({o.count > 0 ? Math.round((o.driftCount / o.count) * 100) : 0}%)</span></span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><PieChart className="w-4 h-4 text-indigo-500" />Confidence Distribution</CardTitle></CardHeader>
          <CardContent>
            {data.confidenceDistribution.every((b: any) => b.count === 0) ? (
              <p className="text-sm text-muted-foreground">No projects with confidence scores yet.</p>
            ) : (
              <div className="space-y-2">
                {data.confidenceDistribution.map((b: any) => (
                  <div key={b.bucket} className="flex items-center gap-3">
                    <span className="text-xs w-12 text-right text-muted-foreground">{b.bucket}</span>
                    <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${Math.max(b.percent, b.count > 0 ? 2 : 0)}%` }} />
                    </div>
                    <span className="text-xs w-16 text-muted-foreground">{b.count} ({b.percent}%)</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Target className="w-4 h-4 text-purple-500" />Scope Distribution</CardTitle></CardHeader>
        <CardContent>
          {data.scopeDistribution.length === 0 ? (
            <p className="text-sm text-muted-foreground">No wizard runs recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {data.scopeDistribution.map((s: any) => (
                <div key={s.scopeCode} className="flex items-center gap-3">
                  <span className="text-xs w-40 truncate font-mono" title={s.scopeCode}>{s.scopeCode}</span>
                  <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${Math.max(s.percent, s.count > 0 ? 2 : 0)}%` }} />
                  </div>
                  <span className="text-xs w-20 text-muted-foreground">{s.count} ({s.percent}%)</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-green-500" />Confidence Trends (12 weeks)</CardTitle></CardHeader>
          <CardContent>
            {data.confidenceTrends.length === 0 ? (
              <p className="text-sm text-muted-foreground">No wizard runs in the last 12 weeks.</p>
            ) : (
              <div className="space-y-1">
                {data.confidenceTrends.map((t: any) => (
                  <div key={t.period} className="flex items-center gap-3 text-sm">
                    <span className="w-24 text-xs text-muted-foreground font-mono">{t.period}</span>
                    <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
                      <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${t.avgConfidence}%` }} />
                    </div>
                    <span className="text-xs w-24 text-muted-foreground">{t.avgConfidence}% ({t.runCount} runs)</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><FolderKanban className="w-4 h-4 text-blue-500" />Project Status Breakdown</CardTitle></CardHeader>
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
                      <div className={`h-full ${row.color} rounded-full transition-all`} style={{ width: `${data.projects.total > 0 ? Math.max((row.count / data.projects.total) * 100, row.count > 0 ? 3 : 0) : 0}%` }} />
                    </div>
                    <span className="text-xs w-8 text-right font-medium">{row.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><GitCompareArrows className="w-4 h-4 text-orange-500" />Override Rate Detail</CardTitle></CardHeader>
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

// ── Ideation KPIs Tab ────────────────────────────────────────────────

function IdeationKPIsTab() {
  const { data: kpis, isLoading } = trpc.ps.ideation.kpis.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (!kpis) {
    return <p className="text-sm text-muted-foreground p-4">No ideation data available.</p>;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">PS Ideation KPIs</h3>
      <div className="grid md:grid-cols-4 gap-4">
        <MetricCard icon={<FolderKanban className="w-4 h-4 text-blue-500" />} label="Total Ideations" value={kpis.total ?? 0} sub="All ideation records" />
        <MetricCard icon={<TrendingUp className="w-4 h-4 text-green-500" />} label="Active" value={kpis.active ?? 0} sub="In exploration / screening" />
        <MetricCard icon={<GitCompareArrows className="w-4 h-4 text-purple-500" />} label="Converted" value={kpis.converted ?? 0} sub="Sent to PS Wizard" />
        <MetricCard icon={<PieChart className="w-4 h-4 text-amber-500" />} label="Conversion Rate" value={kpis.total ? `${Math.round(((kpis.converted ?? 0) / kpis.total) * 100)}%` : "\u2014"} sub="Converted / Total" />
      </div>
    </div>
  );
}

// ── Main Shell ───────────────────────────────────────────────────────

export function PSControlPanelShell() {
  const [activeView, setActiveView] = useState<ControlPanelView>("overview");
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const isMobile = useIsMobile();

  // ── Content resolver ─────────────────────────────────────────────────
  function renderContent() {
    switch (activeView) {
      case "overview":
        return <OverviewTab onSelectVersion={setSelectedVersionId} onChangeView={setActiveView} />;
      case "versions":
        return <PSMatrixVersionManager selectedVersionId={selectedVersionId} onSelectVersion={setSelectedVersionId} />;
      case "import":
        return <PSImportPreviewPanel />;
      case "scopes":
        return <PSScopeRegistryEditor selectedVersionId={selectedVersionId} onSelectVersion={setSelectedVersionId} />;
      case "questions":
        return <PSQuestionEditor selectedVersionId={selectedVersionId} onSelectVersion={setSelectedVersionId} />;
      case "dimensions":
        return <PSDimensionEditor selectedVersionId={selectedVersionId} onSelectVersion={setSelectedVersionId} />;
      case "grid":
        return <PSMatrixGridEditor selectedVersionId={selectedVersionId} onSelectVersion={setSelectedVersionId} />;
      case "validation":
        return <ValidationTab selectedVersionId={selectedVersionId} onSelectVersion={setSelectedVersionId} />;
      case "monitoring":
        return <MonitoringTab />;
      case "queue":
        return <PSValidationQueueTab />;
      case "ideation":
        return <IdeationKPIsTab />;
      default:
        return null;
    }
  }

  // ── Render (Fragment pattern — parent provides flex wrapper) ──────────
  return (
    <>
      <PSControlPanelSidebar
        activeView={activeView}
        onViewSelect={setActiveView}
        collapsed={isMobile || sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
      />

      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b shrink-0">
          <h1 className="text-lg font-bold">PS Control Panel</h1>
          <Badge variant="outline" className="text-indigo-600 border-indigo-500/30">
            Matrix Admin
          </Badge>
        </div>

        {/* Content area */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {renderContent()}
        </div>
      </div>
    </>
  );
}
