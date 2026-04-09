/**
 * AI Work Console — S2 Rail: Task & Controls
 *
 * S2 in the Double IBM Shell pattern — sits between the S1 module
 * sidebar and the center workspace. Collapse toggle lives at the
 * bottom of S1 (WorkConsoleSidebar); when collapsed this component
 * is fully unmounted so only S1 remains visible, matching
 * CodeStudioShell's OpenCodeSettingsRail behavior.
 *
 * Contains the task submission form: description textarea, mode
 * selector, autonomy level control, operator override, runtime
 * selector, quick actions, and the submit button. Also renders a
 * compact recent-history list below the form so the user can jump
 * between jobs without leaving the rail.
 *
 * Backend: `trpc.orchestrator.submit` (existing, from
 * server/orchestrator/router.ts:23). NO new backend code.
 *
 * Behavior logic ported from client/src/pages/RunConsolePage.tsx
 * lines 65-208 (submit form + history list). Reused as-is because
 * the repo convention is clone-only, but the JSX here is adapted
 * for the narrower S2 rail layout and compact controls.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Play,
  Shield,
  Eye,
  Rocket,
  Hammer,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Terminal,
  Activity,
  Save,
  RotateCcw,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type OperatorName = "builder" | "auditor" | "governance" | "deploy";
type AutonomyLevel = 0 | 1 | 2 | 3 | 4 | 5;
type WorkMode = "plan-only" | "dry-run" | "execute";

const OPERATOR_ICONS: Record<OperatorName, typeof Hammer> = {
  builder: Hammer,
  auditor: Eye,
  governance: Shield,
  deploy: Rocket,
};

// Match the RunConsole label list so autonomy semantics stay
// consistent across the two surfaces.
const AUTONOMY_LABELS: Record<AutonomyLevel, string> = {
  0: "L0 — Plan Only",
  1: "L1 — Local Artifacts",
  2: "L2 — Dev Branch",
  3: "L3 — PR Creation",
  4: "L4 — CI Trigger",
  5: "L5 — Production",
};

const MODE_LABELS: Record<WorkMode, string> = {
  "plan-only": "Plan Only",
  "dry-run": "Dry Run",
  execute: "Execute",
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

interface Props {
  activeJobId: string | null;
  onJobSelected: (jobId: string) => void;
}

export default function WorkConsoleLeftRail({ activeJobId, onJobSelected }: Props) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [description, setDescription] = useState("");
  const [mode, setMode] = useState<WorkMode>("plan-only");
  const [autonomyLevel, setAutonomyLevel] = useState<AutonomyLevel>(0);
  const [operatorOverride, setOperatorOverride] = useState<string>("auto");
  const [runtimeHint, setRuntimeHint] = useState<string>("auto");

  const submitMutation = trpc.orchestrator.submit.useMutation({
    onSuccess: (job: any) => {
      const newId = job.jobId;
      toast({
        title: "Intent Submitted",
        description: `Job ${newId} → ${job.operator}`,
      });
      jobsQuery.refetch();
      onJobSelected(newId);
      navigate(`/work-console/${encodeURIComponent(newId)}`);
    },
    onError: (err) => {
      toast({
        title: "Submission Failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const jobsQuery = trpc.orchestrator.listJobs.useQuery({ limit: 30 });

  const handleSubmit = () => {
    const text = description.trim();
    if (!text) return;
    // Mode is an operating-model hint for the user — the actual
    // gating happens via the orchestrator's autonomyLevel. "Plan
    // Only" forces L0 regardless of what the slider shows; other
    // modes honor the slider.
    const effectiveAutonomy =
      mode === "plan-only" ? (0 as AutonomyLevel) : autonomyLevel;
    submitMutation.mutate({
      description: text,
      autonomyLevel: effectiveAutonomy,
      operator:
        operatorOverride !== "auto"
          ? (operatorOverride as OperatorName)
          : undefined,
    });
  };

  const handleReset = () => {
    setDescription("");
    setMode("plan-only");
    setAutonomyLevel(0);
    setOperatorOverride("auto");
    setRuntimeHint("auto");
  };

  const saveAsDraft = () => {
    // Draft persistence is a follow-up; for v1 we flash a toast so
    // the button is wired to something visible.
    toast({
      title: "Draft save",
      description: "Draft persistence is not implemented in v1 — follow-up.",
    });
  };

  return (
    <div className="w-72 border-r bg-background flex flex-col h-full shrink-0 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Task &amp; Controls
        </h2>
      </div>

      {/* Scrollable body */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-3">
          {/* Intent */}
          <Card>
            <CardContent className="p-3 space-y-2">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider block">
                Describe the task
              </label>
              <Textarea
                placeholder="Build a feature, review code, run automation, prepare a release…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                className="text-xs resize-none"
              />

              {/* Mode */}
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">
                  Mode
                </label>
                <Select value={mode} onValueChange={(v) => setMode(v as WorkMode)}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["plan-only", "dry-run", "execute"] as WorkMode[]).map((m) => (
                      <SelectItem key={m} value={m} className="text-xs">
                        {MODE_LABELS[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Autonomy */}
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">
                  Autonomy
                </label>
                <Select
                  value={String(autonomyLevel)}
                  onValueChange={(v) => setAutonomyLevel(Number(v) as AutonomyLevel)}
                  disabled={mode === "plan-only"}
                >
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
                {mode === "plan-only" && (
                  <p className="text-[9px] text-muted-foreground mt-1">
                    Plan-only forces L0 regardless of this value.
                  </p>
                )}
              </div>

              {/* Operator */}
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">
                  Operator
                </label>
                <Select value={operatorOverride} onValueChange={setOperatorOverride}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto" className="text-xs">
                      Auto-detect
                    </SelectItem>
                    <SelectItem value="builder" className="text-xs">
                      Builder
                    </SelectItem>
                    <SelectItem value="auditor" className="text-xs">
                      Auditor
                    </SelectItem>
                    <SelectItem value="governance" className="text-xs">
                      Governance
                    </SelectItem>
                    <SelectItem value="deploy" className="text-xs">
                      Deploy
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Runtime (advisory — orchestrator currently auto-picks) */}
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider block mb-1">
                  Runtime
                </label>
                <Select value={runtimeHint} onValueChange={setRuntimeHint}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto" className="text-xs">
                      Auto (operator picks)
                    </SelectItem>
                    <SelectItem value="opencode" className="text-xs">
                      OpenCode
                    </SelectItem>
                    <SelectItem value="code-studio" className="text-xs">
                      Code Studio
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Quick actions + submit */}
              <div className="grid grid-cols-3 gap-1.5 pt-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[10px] col-span-1"
                  onClick={saveAsDraft}
                  title="Save as draft (v1: not persisted)"
                >
                  <Save className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-[10px] col-span-1"
                  onClick={handleReset}
                  title="Reset form"
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-[10px] col-span-1"
                  onClick={handleSubmit}
                  disabled={!description.trim() || submitMutation.isPending}
                  title="Submit intent"
                >
                  <Play className="h-3 w-3 mr-0.5" />
                  {submitMutation.isPending ? "…" : "Run"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recent jobs */}
          <Card>
            <CardContent className="p-0">
              <div className="px-3 py-2 border-b">
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Recent Intents
                </h3>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {(jobsQuery.data || []).length === 0 ? (
                  <p className="text-[10px] text-muted-foreground text-center py-4">
                    {jobsQuery.isLoading ? "Loading…" : "No jobs yet"}
                  </p>
                ) : (
                  (jobsQuery.data || []).map((job: any) => {
                    const Icon = OPERATOR_ICONS[job.operator as OperatorName] || Terminal;
                    const statusBadge = STATUS_BADGES[job.status] || STATUS_BADGES.pending;
                    const StatusIcon = statusBadge.icon;
                    const isActive = activeJobId === job.jobId;
                    return (
                      <button
                        key={job.jobId}
                        type="button"
                        className={cn(
                          "flex items-center gap-2 w-full px-3 py-1.5 text-left transition-colors border-b last:border-b-0",
                          isActive
                            ? "bg-primary/10"
                            : "hover:bg-muted/50"
                        )}
                        onClick={() => {
                          onJobSelected(job.jobId);
                          navigate(`/work-console/${encodeURIComponent(job.jobId)}`);
                        }}
                      >
                        <Icon className="h-3 w-3 shrink-0 opacity-70" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] truncate">
                            {job.intent?.description || job.jobId}
                          </p>
                          <p className="text-[9px] text-muted-foreground truncate">
                            {job.operator} · {job.jobId.slice(0, 12)}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn("text-[9px] px-1 shrink-0", statusBadge.color)}
                        >
                          <StatusIcon className="h-2 w-2 mr-0.5" />
                          {job.status}
                        </Badge>
                      </button>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
}
