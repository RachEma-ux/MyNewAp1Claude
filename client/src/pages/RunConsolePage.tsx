/**
 * Run Console — Intent submission, operator routing, and execution monitoring
 *
 * Features:
 *   - Intent submission form with autonomy level selection
 *   - Operator auto-detection and manual override
 *   - SyscallBatch preview (plan view)
 *   - Live execution result viewer
 *   - Job history list
 */

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Play, Shield, Eye, Rocket, Hammer, CheckCircle, XCircle, Clock,
  AlertTriangle, ChevronRight, Terminal, FileCode, Activity,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/hooks/use-toast";

type OperatorName = "builder" | "auditor" | "governance" | "deploy";
type AutonomyLevel = 0 | 1 | 2 | 3 | 4 | 5;

const OPERATOR_ICONS: Record<OperatorName, typeof Hammer> = {
  builder: Hammer,
  auditor: Eye,
  governance: Shield,
  deploy: Rocket,
};

const OPERATOR_COLORS: Record<OperatorName, string> = {
  builder: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  auditor: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  governance: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  deploy: "bg-green-500/10 text-green-500 border-green-500/20",
};

const AUTONOMY_LABELS: Record<AutonomyLevel, string> = {
  0: "L0 — Plan Only",
  1: "L1 — Local Artifacts",
  2: "L2 — Dev Branch",
  3: "L3 — PR Creation",
  4: "L4 — CI Trigger",
  5: "L5 — Production",
};

const STATUS_BADGES: Record<string, { color: string; icon: typeof Clock }> = {
  pending: { color: "bg-gray-500/10 text-gray-400", icon: Clock },
  routing: { color: "bg-blue-500/10 text-blue-400", icon: Activity },
  generating: { color: "bg-amber-500/10 text-amber-400", icon: Terminal },
  validating: { color: "bg-purple-500/10 text-purple-400", icon: Shield },
  executing: { color: "bg-cyan-500/10 text-cyan-400", icon: Play },
  completed: { color: "bg-green-500/10 text-green-400", icon: CheckCircle },
  failed: { color: "bg-red-500/10 text-red-400", icon: XCircle },
  denied: { color: "bg-red-500/10 text-red-400", icon: AlertTriangle },
};

export default function RunConsolePage() {
  const { toast } = useToast();
  const [description, setDescription] = useState("");
  const [autonomyLevel, setAutonomyLevel] = useState<AutonomyLevel>(0);
  const [operatorOverride, setOperatorOverride] = useState<string>("auto");
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const submitMutation = trpc.orchestrator.submit.useMutation({
    onSuccess: (job) => {
      setActiveJobId(job.jobId);
      toast({ title: "Intent Submitted", description: `Job ${job.jobId} → ${job.operator}` });
      jobsQuery.refetch();
    },
    onError: (err) => {
      toast({ title: "Submission Failed", description: err.message, variant: "destructive" });
    },
  });

  const jobsQuery = trpc.orchestrator.listJobs.useQuery({ limit: 30 });
  const activeJobQuery = trpc.orchestrator.getJob.useQuery(
    { jobId: activeJobId || "" },
    { enabled: !!activeJobId, refetchInterval: activeJobId ? 2000 : false },
  );

  const operatorsQuery = trpc.orchestrator.getOperators.useQuery();

  const handleSubmit = () => {
    if (!description.trim()) return;
    submitMutation.mutate({
      description: description.trim(),
      autonomyLevel,
      operator: operatorOverride !== "auto" ? operatorOverride as OperatorName : undefined,
    });
  };

  const activeJob = activeJobQuery.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Run Console</h1>
        <p className="text-muted-foreground">Submit intents to the multi-operator autonomous runtime</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Intent Form + Job List */}
        <div className="lg:col-span-1 space-y-4">
          {/* Intent Submission */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Submit Intent</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                placeholder="Describe what you want to accomplish..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Autonomy</label>
                  <Select value={String(autonomyLevel)} onValueChange={(v) => setAutonomyLevel(Number(v) as AutonomyLevel)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {([0, 1, 2, 3, 4, 5] as AutonomyLevel[]).map((level) => (
                        <SelectItem key={level} value={String(level)} className="text-xs">
                          {AUTONOMY_LABELS[level]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Operator</label>
                  <Select value={operatorOverride} onValueChange={setOperatorOverride}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto" className="text-xs">Auto-detect</SelectItem>
                      <SelectItem value="builder" className="text-xs">Builder</SelectItem>
                      <SelectItem value="auditor" className="text-xs">Auditor</SelectItem>
                      <SelectItem value="governance" className="text-xs">Governance</SelectItem>
                      <SelectItem value="deploy" className="text-xs">Deploy</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                onClick={handleSubmit}
                disabled={!description.trim() || submitMutation.isPending}
                className="w-full"
                size="sm"
              >
                <Play className="h-3 w-3 mr-1" />
                {submitMutation.isPending ? "Submitting..." : "Execute Intent"}
              </Button>
            </CardContent>
          </Card>

          {/* Job History */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Job History</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[400px]">
                {(jobsQuery.data || []).map((job) => {
                  const Icon = OPERATOR_ICONS[job.operator as OperatorName] || Terminal;
                  const statusBadge = STATUS_BADGES[job.status] || STATUS_BADGES.pending;
                  const StatusIcon = statusBadge.icon;
                  return (
                    <div
                      key={job.jobId}
                      className={`flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-muted/50 border-b ${
                        activeJobId === job.jobId ? "bg-muted/50" : ""
                      }`}
                      onClick={() => setActiveJobId(job.jobId)}
                    >
                      <Icon className="h-3 w-3 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs truncate">{job.intent?.description || job.jobId}</p>
                        <p className="text-[10px] text-muted-foreground">{job.operator} &middot; {job.jobId.slice(0, 16)}</p>
                      </div>
                      <Badge variant="outline" className={`text-[10px] ${statusBadge.color}`}>
                        <StatusIcon className="h-2 w-2 mr-0.5" />
                        {job.status}
                      </Badge>
                    </div>
                  );
                })}
                {(!jobsQuery.data || jobsQuery.data.length === 0) && (
                  <p className="text-xs text-muted-foreground text-center py-8">No jobs yet</p>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* Right: Active Job Details */}
        <div className="lg:col-span-2">
          {activeJob ? (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {(() => { const Icon = OPERATOR_ICONS[activeJob.operator as OperatorName] || Terminal; return <Icon className="h-4 w-4" />; })()}
                      {activeJob.jobId}
                    </CardTitle>
                    <CardDescription className="mt-1">{activeJob.intent?.description}</CardDescription>
                  </div>
                  <Badge variant="outline" className={OPERATOR_COLORS[activeJob.operator as OperatorName]}>
                    {activeJob.operator}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent>
                <Tabs defaultValue="plan">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="plan" className="text-xs">Plan</TabsTrigger>
                    <TabsTrigger value="results" className="text-xs">Results</TabsTrigger>
                    <TabsTrigger value="audit" className="text-xs">Audit</TabsTrigger>
                  </TabsList>

                  {/* Plan Tab */}
                  <TabsContent value="plan" className="mt-3">
                    {activeJob.result ? (
                      <div className="space-y-3">
                        <div className="bg-muted/50 rounded-md p-3">
                          <p className="text-xs font-medium mb-1">Explanation</p>
                          <p className="text-xs text-muted-foreground">{activeJob.result.explain}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">
                            Risk: {activeJob.result.risk?.level}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {activeJob.result.plan?.length || 0} syscalls
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {activeJob.result.modelUsed}
                          </Badge>
                        </div>

                        <Separator />

                        <ScrollArea className="h-[350px]">
                          <div className="space-y-2">
                            {(activeJob.result.plan || []).map((sc: any, idx: number) => (
                              <div key={idx} className="border rounded-md p-2">
                                <div className="flex items-center justify-between mb-1">
                                  <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                                    {idx}. {sc.action}
                                  </code>
                                  <Badge variant="outline" className="text-[10px]">
                                    {sc.riskLevel} / L{sc.requiredAutonomyLevel}
                                  </Badge>
                                </div>
                                <p className="text-[11px] text-muted-foreground">{sc.description}</p>
                                <pre className="text-[10px] mt-1 bg-muted/50 p-1.5 rounded overflow-x-auto">
                                  {JSON.stringify(sc.args, null, 2)}
                                </pre>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground text-sm">
                        {activeJob.status === "generating" ? "Generating plan..." :
                         activeJob.status === "pending" ? "Waiting to start..." :
                         "No plan generated"}
                      </div>
                    )}
                  </TabsContent>

                  {/* Results Tab */}
                  <TabsContent value="results" className="mt-3">
                    {activeJob.executionResult ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-5 gap-2">
                          {[
                            { label: "Total", value: activeJob.executionResult.summary.total, color: "text-foreground" },
                            { label: "OK", value: activeJob.executionResult.summary.succeeded, color: "text-green-500" },
                            { label: "Fail", value: activeJob.executionResult.summary.failed, color: "text-red-500" },
                            { label: "Denied", value: activeJob.executionResult.summary.denied, color: "text-amber-500" },
                            { label: "Skip", value: activeJob.executionResult.summary.skipped, color: "text-gray-400" },
                          ].map((stat) => (
                            <div key={stat.label} className="text-center bg-muted/50 rounded-md p-2">
                              <p className={`text-lg font-bold ${stat.color}`}>{stat.value}</p>
                              <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                            </div>
                          ))}
                        </div>

                        <Badge variant="outline" className="text-[10px]">
                          Duration: {activeJob.executionResult.totalDurationMs}ms
                        </Badge>

                        <Separator />

                        <ScrollArea className="h-[300px]">
                          <div className="space-y-2">
                            {(activeJob.executionResult.results || []).map((r: any, idx: number) => (
                              <div key={idx} className={`border rounded-md p-2 ${
                                r.status === "success" ? "border-green-500/20" :
                                r.status === "denied" ? "border-amber-500/20" :
                                "border-red-500/20"
                              }`}>
                                <div className="flex items-center justify-between">
                                  <code className="text-xs font-mono">{r.syscallIndex}. {r.action}</code>
                                  <Badge variant="outline" className={`text-[10px] ${
                                    r.status === "success" ? "text-green-500" :
                                    r.status === "denied" ? "text-amber-500" :
                                    "text-red-500"
                                  }`}>
                                    {r.status} ({r.durationMs}ms)
                                  </Badge>
                                </div>
                                {r.error && (
                                  <p className="text-[10px] text-red-400 mt-1">{r.error}</p>
                                )}
                                {r.governanceDecision && (
                                  <p className="text-[10px] text-muted-foreground mt-1">
                                    Gate: {r.governanceDecision.verdict} — {r.governanceDecision.reason}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    ) : (
                      <div className="text-center py-12 text-muted-foreground text-sm">
                        {activeJob.status === "executing" ? "Executing..." :
                         activeJob.constraints?.autonomyLevel === 0 ? "Plan-only mode (L0) — no execution" :
                         "No execution results"}
                      </div>
                    )}
                  </TabsContent>

                  {/* Audit Tab */}
                  <TabsContent value="audit" className="mt-3">
                    <AuditTrailPanel jobId={activeJob.jobId} />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-center h-[500px] text-muted-foreground text-sm">
                <div className="text-center">
                  <Terminal className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>Select a job or submit a new intent</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function AuditTrailPanel({ jobId }: { jobId: string }) {
  const auditQuery = trpc.orchestrator.getAuditTrail.useQuery({ jobId, limit: 200 });

  if (!auditQuery.data || auditQuery.data.length === 0) {
    return <p className="text-xs text-muted-foreground text-center py-8">No audit entries</p>;
  }

  return (
    <ScrollArea className="h-[350px]">
      <div className="space-y-1">
        {auditQuery.data.map((entry: any, idx: number) => (
          <div key={idx} className="flex items-start gap-2 text-[11px] font-mono border-b py-1.5">
            <Badge variant="outline" className={`text-[9px] shrink-0 ${
              entry.verdict === "allow" ? "text-green-500" : "text-red-500"
            }`}>
              {entry.verdict}
            </Badge>
            <span className="text-muted-foreground shrink-0">[{entry.syscallIndex}]</span>
            <span className="font-medium">{entry.action}</span>
            <span className="text-muted-foreground truncate flex-1">{entry.reason}</span>
            <span className="text-muted-foreground shrink-0">{entry.durationMs}ms</span>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
