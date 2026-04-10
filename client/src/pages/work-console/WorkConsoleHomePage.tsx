/**
 * AI Work Console — Home Page
 *
 * Landing view when no job is active. Shows a quick-hit summary of
 * recent intents grouped by status. On desktop the S2 left rail has
 * the full intent form; on MOBILE the rails are hidden so this page
 * includes a compact inline submit form at the top.
 */
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useLocation } from "wouter";
import { useIsMobile } from "@/hooks/useMobile";
import { useToast } from "@/hooks/use-toast";
import {
  Rocket,
  CheckCircle2,
  AlertTriangle,
  Clock,
  XCircle,
  Activity,
  Play,
  Hammer,
  Eye,
  Shield,
  Terminal,
} from "lucide-react";

type OperatorName = "builder" | "auditor" | "governance" | "deploy";

const OPERATOR_ICONS: Record<OperatorName, typeof Hammer> = {
  builder: Hammer,
  auditor: Eye,
  governance: Shield,
  deploy: Rocket,
};

export default function WorkConsoleHomePage() {
  const [, navigate] = useLocation();
  const isMobile = useIsMobile();
  const { toast } = useToast();
  const [mobileDesc, setMobileDesc] = useState("");
  const jobsQuery = trpc.orchestrator.listJobs.useQuery({ limit: 50 });
  const jobs = (jobsQuery.data || []) as any[];
  const submitMut = trpc.orchestrator.submit.useMutation({
    onSuccess: (job: any) => {
      toast({ title: "Submitted", description: `Job ${job.jobId} → ${job.operator}` });
      jobsQuery.refetch();
      navigate(`/work-console/${encodeURIComponent(job.jobId)}`);
    },
    onError: (e) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  // Counters per status
  const counts = {
    total: jobs.length,
    active: jobs.filter((j) =>
      ["pending", "routing", "generating", "validating", "executing"].includes(j.status)
    ).length,
    completed: jobs.filter((j) => j.status === "completed").length,
    failed: jobs.filter((j) => j.status === "failed" || j.status === "denied").length,
  };

  const recent = jobs.slice(0, 8);

  return (
    <div className="flex-1 min-w-0 min-h-0 overflow-auto p-4">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Rocket className="h-4 w-4 text-blue-500" />
            AI Work Console
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Submit work in plain English, generate governed plans, execute
            through the right runtime, and review diffs / logs / audit in one
            console.
          </p>
        </div>

        {/* Mobile inline submit — replaces S2 rail which is hidden on
            small screens. Only renders when isMobile. */}
        {isMobile && (
          <Card>
            <CardContent className="p-3 space-y-2">
              <Textarea
                placeholder="Describe a task…"
                value={mobileDesc}
                onChange={(e) => setMobileDesc(e.target.value)}
                rows={3}
                className="text-sm resize-none"
              />
              <Button
                size="sm"
                className="w-full"
                disabled={!mobileDesc.trim() || submitMut.isPending}
                onClick={() => {
                  submitMut.mutate({
                    description: mobileDesc.trim(),
                    autonomyLevel: 0,
                  });
                  setMobileDesc("");
                }}
              >
                <Play className="h-3 w-3 mr-1" />
                {submitMut.isPending ? "Submitting…" : "Run (Plan Only)"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Counters */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold">{counts.total}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Total
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-cyan-500">{counts.active}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Active
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-emerald-500">
                {counts.completed}
              </p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Completed
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-red-500">{counts.failed}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Failed / Denied
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Recent */}
        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-2 border-b">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Recent Intents
              </h2>
            </div>
            {recent.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Terminal className="h-8 w-8 mx-auto opacity-30 mb-2" />
                <p className="text-xs">No intents yet.</p>
                <p className="text-[11px] mt-1">
                  Describe a task in the left panel and click Run.
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {recent.map((job: any) => {
                  const Icon = OPERATOR_ICONS[job.operator as OperatorName] || Terminal;
                  const StatusIcon = STATUS_ICON_BY_STATUS[job.status] || Clock;
                  const statusColor = STATUS_COLOR_BY_STATUS[job.status] || "text-slate-400";
                  return (
                    <button
                      key={job.jobId}
                      type="button"
                      className="w-full flex items-center gap-3 px-4 py-2 hover:bg-muted/50 transition-colors text-left"
                      onClick={() =>
                        navigate(`/work-console/${encodeURIComponent(job.jobId)}`)
                      }
                    >
                      <Icon className="h-4 w-4 shrink-0 opacity-70" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs truncate">
                          {job.intent?.description || job.jobId}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {job.jobId} · {job.operator} · L
                          {job.constraints?.autonomyLevel ?? 0}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] shrink-0", statusColor)}
                      >
                        <StatusIcon className="h-2.5 w-2.5 mr-0.5" />
                        {job.status}
                      </Badge>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Footnote */}
        <p className="text-[10px] text-muted-foreground text-center">
          Backed by the existing orchestrator runtime. Deep links to Code
          Studio and OpenCode are available in the sidebar.
        </p>
      </div>
    </div>
  );
}

const STATUS_ICON_BY_STATUS: Record<string, typeof Clock> = {
  pending: Clock,
  routing: Activity,
  generating: Terminal,
  validating: Shield,
  executing: Rocket,
  completed: CheckCircle2,
  failed: XCircle,
  denied: AlertTriangle,
};

const STATUS_COLOR_BY_STATUS: Record<string, string> = {
  pending: "text-slate-400",
  routing: "text-blue-400",
  generating: "text-amber-400",
  validating: "text-purple-400",
  executing: "text-cyan-400",
  completed: "text-emerald-400",
  failed: "text-red-400",
  denied: "text-red-400",
};
