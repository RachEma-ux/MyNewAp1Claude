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
} from "lucide-react";

// ── Tab Components ────────────────────────────────────────────────────
import { PSMatrixVersionManager } from "./PSMatrixVersionManager";
import { PSImportPreviewPanel } from "./PSImportPreviewPanel";
import { PSScopeRegistryEditor } from "./PSScopeRegistryEditor";
import { PSQuestionEditor } from "./PSQuestionEditor";
import { PSDimensionEditor } from "./PSDimensionEditor";
import { PSMatrixGridEditor } from "./PSMatrixGridEditor";

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

export default PSControlPanelPage;
