import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import {
  Loader2,
  Play,
  Download,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileSearch,
  RefreshCw,
} from "lucide-react";

type AuditStatus = "queued" | "running" | "pass" | "fail" | "error";
type DesignProfile = "executive" | "standard" | "forensics";
type AuditFormat = "json" | "txt" | "both";

const STATUS_CONFIG: Record<AuditStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle2 }> = {
  queued: { label: "QUEUED", variant: "secondary", icon: Clock },
  running: { label: "RUNNING", variant: "outline", icon: RefreshCw },
  pass: { label: "PASS", variant: "default", icon: CheckCircle2 },
  fail: { label: "FAIL", variant: "destructive", icon: XCircle },
  error: { label: "ERROR", variant: "destructive", icon: AlertTriangle },
};

export default function PlatformAuditPanel() {
  // Form state
  const [format, setFormat] = useState<AuditFormat>("json");
  const [strict, setStrict] = useState(false);
  const [design, setDesign] = useState<DesignProfile>("standard");
  const [saveAsDefault, setSaveAsDefault] = useState(false);

  // Viewer state
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"summary" | "violations" | "coverage" | "artifacts">("summary");

  // Filters for history
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDesign, setFilterDesign] = useState<string>("all");

  // Load saved preferences
  const prefsQuery = trpc.governance.audit.preferences.useQuery(undefined, {
    onSuccess: (data: any) => {
      if (data) {
        setFormat(data.defaultFormat || "json");
        setDesign(data.defaultDesign || "standard");
        setStrict(data.defaultStrict || false);
      }
    },
  });

  // Latest run (for live status)
  const latestQuery = trpc.governance.audit.latest.useQuery(undefined, {
    refetchInterval: (data: any) => {
      if (data && (data.status === "queued" || data.status === "running")) return 2000;
      return false;
    },
  });

  // Selected run detail
  const runQuery = trpc.governance.audit.get.useQuery(
    { runId: selectedRunId! },
    { enabled: !!selectedRunId }
  );

  // History list
  const historyQuery = trpc.governance.audit.list.useQuery({
    limit: 20,
    ...(filterStatus !== "all" ? { status: filterStatus as AuditStatus } : {}),
    ...(filterDesign !== "all" ? { design: filterDesign as DesignProfile } : {}),
  });

  // Run mutation
  const runMutation = trpc.governance.audit.run.useMutation({
    onSuccess: (data: any) => {
      setSelectedRunId(data.runId);
      latestQuery.refetch();
      historyQuery.refetch();
    },
  });

  const handleRunAudit = () => {
    runMutation.mutate({ format, strict, design, saveAsDefault });
  };

  // Determine which run to display
  const displayRun = selectedRunId ? runQuery.data : latestQuery.data;
  const isActive = displayRun?.status === "queued" || displayRun?.status === "running";

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <FileSearch className="w-8 h-8" />
          Platform Audit
        </h1>
        <p className="text-muted-foreground mt-2">
          Run comprehensive platform audits and view results with customizable detail levels
        </p>
      </div>

      {/* A) Run Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Run Configuration</CardTitle>
          <CardDescription>Configure and trigger a new platform audit</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-6">
            {/* Format */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Format</label>
              <Select value={format} onValueChange={(v) => setFormat(v as AuditFormat)}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="json">JSON</SelectItem>
                  <SelectItem value="txt">TXT</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Design Profile */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Design Profile</label>
              <Select value={design} onValueChange={(v) => setDesign(v as DesignProfile)}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="executive">Executive</SelectItem>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="forensics">Forensics</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Strict */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Strict Mode</label>
              <div className="flex items-center h-10">
                <Switch checked={strict} onCheckedChange={setStrict} />
              </div>
            </div>

            {/* Save as default */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Save as default</label>
              <div className="flex items-center h-10">
                <Switch checked={saveAsDefault} onCheckedChange={setSaveAsDefault} />
              </div>
            </div>

            {/* Run Button */}
            <Button
              onClick={handleRunAudit}
              disabled={runMutation.isPending || isActive}
              className="h-10"
            >
              {runMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              Run Audit
            </Button>
          </div>

          {runMutation.error && (
            <p className="text-destructive text-sm mt-4">{runMutation.error.message}</p>
          )}
        </CardContent>
      </Card>

      {/* B) Live Status */}
      {displayRun && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                Run #{displayRun.id}
              </CardTitle>
              <StatusBadge status={displayRun.status as AuditStatus} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Started</span>
                <p className="font-medium">{formatDate(displayRun.startedAt)}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Duration</span>
                <p className="font-medium">
                  {displayRun.durationMs != null
                    ? `${(displayRun.durationMs / 1000).toFixed(1)}s`
                    : isActive
                      ? "In progress..."
                      : "—"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Format</span>
                <p className="font-medium uppercase">{displayRun.format}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Design</span>
                <p className="font-medium capitalize">{displayRun.design}</p>
              </div>
            </div>

            {displayRun.errorMessage && (
              <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive">
                {displayRun.errorMessage}
              </div>
            )}

            {isActive && (
              <div className="mt-4 flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Audit in progress — polling for updates...
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* C) Results Viewer */}
      {displayRun && !isActive && displayRun.status !== "error" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Results</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Tab buttons */}
            <div className="flex gap-2 mb-6">
              {(["summary", "violations", "coverage", "artifacts"] as const).map((tab) => (
                <Button
                  key={tab}
                  variant={activeTab === tab ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveTab(tab)}
                  className="capitalize"
                >
                  {tab}
                </Button>
              ))}
            </div>

            <Separator className="mb-6" />

            {/* Tab content */}
            {activeTab === "summary" && <SummaryView run={displayRun} design={design} />}
            {activeTab === "violations" && <ViolationsView run={displayRun} design={design} />}
            {activeTab === "coverage" && <CoverageView run={displayRun} design={design} />}
            {activeTab === "artifacts" && <ArtifactsView run={displayRun} />}
          </CardContent>
        </Card>
      )}

      {/* D) History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Run History</CardTitle>
          <CardDescription>Previous audit runs</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex gap-4 mb-4">
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pass">Pass</SelectItem>
                <SelectItem value="fail">Fail</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="running">Running</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterDesign} onValueChange={setFilterDesign}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All designs" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All designs</SelectItem>
                <SelectItem value="executive">Executive</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="forensics">Forensics</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {historyQuery.isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (historyQuery.data as any[])?.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No audit runs yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">ID</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4">Design</th>
                    <th className="pb-2 pr-4">Format</th>
                    <th className="pb-2 pr-4">Strict</th>
                    <th className="pb-2 pr-4">Started</th>
                    <th className="pb-2 pr-4">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {(historyQuery.data as any[])?.map((run: any) => (
                    <tr
                      key={run.id}
                      onClick={() => {
                        setSelectedRunId(run.id);
                        setDesign(run.design);
                      }}
                      className={`border-b cursor-pointer hover:bg-accent/50 transition-colors ${
                        selectedRunId === run.id ? "bg-accent" : ""
                      }`}
                    >
                      <td className="py-2 pr-4 font-mono">#{run.id}</td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={run.status} />
                      </td>
                      <td className="py-2 pr-4 capitalize">{run.design}</td>
                      <td className="py-2 pr-4 uppercase">{run.format}</td>
                      <td className="py-2 pr-4">{run.strict ? "Yes" : "No"}</td>
                      <td className="py-2 pr-4">{formatDate(run.startedAt)}</td>
                      <td className="py-2 pr-4">
                        {run.durationMs != null ? `${(run.durationMs / 1000).toFixed(1)}s` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function StatusBadge({ status }: { status: AuditStatus }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.error;
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}

function SummaryView({ run, design }: { run: any; design: DesignProfile }) {
  const summary = run.summaryJson;
  if (!summary) return <p className="text-muted-foreground">No summary data available</p>;

  if (design === "executive") {
    return (
      <div className="space-y-4">
        {/* Banner */}
        <div className={`p-4 rounded-lg text-center text-lg font-bold ${
          run.status === "pass"
            ? "bg-green-500/10 text-green-500 border border-green-500/20"
            : "bg-red-500/10 text-red-500 border border-red-500/20"
        }`}>
          Platform Audit: {run.status === "pass" ? "PASSED" : "FAILED"}
        </div>

        {/* Key metrics */}
        {summary.severityCounts && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(summary.severityCounts as Record<string, number>).map(([sev, count]) => (
              <Card key={sev}>
                <CardHeader className="pb-2">
                  <CardDescription className="capitalize">{sev}</CardDescription>
                  <CardTitle className="text-xl">{count}</CardTitle>
                </CardHeader>
              </Card>
            ))}
          </div>
        )}

        {/* Top-level stats */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          {summary.totalChecks != null && (
            <div><span className="text-muted-foreground">Total Checks:</span> {summary.totalChecks}</div>
          )}
          {summary.passedChecks != null && (
            <div><span className="text-muted-foreground">Passed:</span> {summary.passedChecks}</div>
          )}
          {summary.failedChecks != null && (
            <div><span className="text-muted-foreground">Failed:</span> {summary.failedChecks}</div>
          )}
          {summary.score != null && (
            <div><span className="text-muted-foreground">Score:</span> {summary.score}</div>
          )}
        </div>
      </div>
    );
  }

  // Standard & Forensics — full summary
  return (
    <div className="space-y-4">
      <pre className="bg-muted p-4 rounded-md text-sm overflow-auto max-h-[60vh]">
        {JSON.stringify(summary, null, 2)}
      </pre>
    </div>
  );
}

function ViolationsView({ run, design }: { run: any; design: DesignProfile }) {
  const violations: any[] = run.violationsJson || [];

  if (violations.length === 0) {
    return <p className="text-muted-foreground">No violations found</p>;
  }

  if (design === "executive") {
    // Top 10 only
    const top10 = violations.slice(0, 10);
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Top 10 violations (Executive view)</p>
        {top10.map((v: any, i: number) => (
          <div key={i} className="p-3 bg-muted rounded-md text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium">{v.rule || v.name || `Violation #${i + 1}`}</span>
              {v.severity && (
                <Badge variant={v.severity === "critical" || v.severity === "high" ? "destructive" : "secondary"}>
                  {v.severity}
                </Badge>
              )}
            </div>
            {v.message && <p className="text-muted-foreground mt-1">{v.message}</p>}
          </div>
        ))}
      </div>
    );
  }

  // Standard — paginated table
  return (
    <div className="overflow-x-auto">
      <p className="text-sm text-muted-foreground mb-3">
        {violations.length} violation{violations.length !== 1 ? "s" : ""} found
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="pb-2 pr-4">#</th>
            <th className="pb-2 pr-4">Rule</th>
            <th className="pb-2 pr-4">Severity</th>
            <th className="pb-2 pr-4">Message</th>
            {design === "forensics" && <th className="pb-2 pr-4">Details</th>}
          </tr>
        </thead>
        <tbody>
          {violations.map((v: any, i: number) => (
            <tr key={i} className="border-b">
              <td className="py-2 pr-4">{i + 1}</td>
              <td className="py-2 pr-4 font-medium">{v.rule || v.name || "—"}</td>
              <td className="py-2 pr-4">
                {v.severity && (
                  <Badge variant={v.severity === "critical" || v.severity === "high" ? "destructive" : "secondary"} className="text-xs">
                    {v.severity}
                  </Badge>
                )}
              </td>
              <td className="py-2 pr-4">{v.message || "—"}</td>
              {design === "forensics" && (
                <td className="py-2 pr-4">
                  <pre className="text-xs bg-muted p-1 rounded max-w-[300px] overflow-auto">
                    {JSON.stringify(v, null, 1)}
                  </pre>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CoverageView({ run, design }: { run: any; design: DesignProfile }) {
  const coverage = run.coverageJson;
  if (!coverage) return <p className="text-muted-foreground">No coverage data available</p>;

  if (design === "executive") {
    // Key sections only
    const sections = coverage.sections || coverage;
    const entries = Array.isArray(sections)
      ? sections.slice(0, 5)
      : Object.entries(sections).slice(0, 5);

    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">Top 5 coverage sections (Executive view)</p>
        {Array.isArray(entries) ? entries.map((entry: any, i: number) => {
          const name = Array.isArray(entry) ? entry[0] : entry.name || `Section ${i + 1}`;
          const value = Array.isArray(entry) ? entry[1] : entry.coverage || entry.value;
          return (
            <div key={i} className="flex justify-between items-center p-3 bg-muted rounded-md">
              <span className="font-medium text-sm">{String(name)}</span>
              <span className="text-sm">{typeof value === "number" ? `${value}%` : JSON.stringify(value)}</span>
            </div>
          );
        }) : null}
      </div>
    );
  }

  // Standard — summary view
  if (design === "standard") {
    return (
      <pre className="bg-muted p-4 rounded-md text-sm overflow-auto max-h-[60vh]">
        {JSON.stringify(coverage, null, 2)}
      </pre>
    );
  }

  // Forensics — full coverage map table + raw JSON
  return (
    <div className="space-y-6">
      <pre className="bg-muted p-4 rounded-md text-sm overflow-auto max-h-[60vh]">
        {JSON.stringify(coverage, null, 2)}
      </pre>
    </div>
  );
}

function ArtifactsView({ run }: { run: any }) {
  const hasJson = !!run.jsonRef;
  const hasTxt = !!run.txtRef;

  if (!hasJson && !hasTxt) {
    return <p className="text-muted-foreground">No artifacts stored for this run</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Download audit report artifacts</p>
      <div className="flex gap-4">
        {hasJson && (
          <a href={`/api/governance/audit/${run.id}/artifacts/json`} download>
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Download JSON
            </Button>
          </a>
        )}
        {hasTxt && (
          <a href={`/api/governance/audit/${run.id}/artifacts/txt`} download>
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Download TXT
            </Button>
          </a>
        )}
      </div>
      <div className="text-xs text-muted-foreground space-y-1">
        {hasJson && <p>JSON SHA-256: <code className="bg-muted px-1 rounded">{run.jsonRef}</code></p>}
        {hasTxt && <p>TXT SHA-256: <code className="bg-muted px-1 rounded">{run.txtRef}</code></p>}
      </div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

function formatDate(d: any): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return String(d);
  }
}
