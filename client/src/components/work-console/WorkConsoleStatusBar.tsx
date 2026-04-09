/**
 * AI Work Console — Top Status Bar
 *
 * Fixed header strip that sits above the workspace + governance rail.
 * Shows: job id, operator, autonomy level, status badge, duration,
 * and a deep-link into Code Studio's Jobs view for the same job.
 *
 * Renders nothing when there's no active job (home/new views).
 */
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Clock,
  Activity,
  Terminal,
  Shield,
  Play,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Hammer,
  Eye,
  Rocket,
  ExternalLink,
} from "lucide-react";

type OperatorName = "builder" | "auditor" | "governance" | "deploy";
type JobStatus =
  | "pending"
  | "routing"
  | "generating"
  | "validating"
  | "executing"
  | "completed"
  | "failed"
  | "denied";

const OPERATOR_ICONS: Record<OperatorName, typeof Hammer> = {
  builder: Hammer,
  auditor: Eye,
  governance: Shield,
  deploy: Rocket,
};

const STATUS_META: Record<
  JobStatus,
  { label: string; color: string; icon: typeof Clock }
> = {
  pending: { label: "Pending", color: "bg-slate-500/10 text-slate-400 border-slate-500/30", icon: Clock },
  routing: { label: "Routing", color: "bg-blue-500/10 text-blue-400 border-blue-500/30", icon: Activity },
  generating: { label: "Planning", color: "bg-amber-500/10 text-amber-400 border-amber-500/30", icon: Terminal },
  validating: { label: "Validating", color: "bg-purple-500/10 text-purple-400 border-purple-500/30", icon: Shield },
  executing: { label: "Executing", color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30", icon: Play },
  completed: { label: "Completed", color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", icon: CheckCircle },
  failed: { label: "Failed", color: "bg-red-500/10 text-red-400 border-red-500/30", icon: XCircle },
  denied: { label: "Denied", color: "bg-red-500/10 text-red-400 border-red-500/30", icon: AlertTriangle },
};

interface Props {
  job: any | null;
}

export default function WorkConsoleStatusBar({ job }: Props) {
  if (!job) {
    return (
      <div className="h-9 border-b bg-card/30 flex items-center px-4 text-[10px] text-muted-foreground">
        AI Work Console — Home
      </div>
    );
  }

  const operator = job.operator as OperatorName;
  const OperatorIcon = OPERATOR_ICONS[operator] ?? Terminal;
  const status = (job.status ?? "pending") as JobStatus;
  const statusMeta = STATUS_META[status] ?? STATUS_META.pending;
  const StatusIcon = statusMeta.icon;
  const autonomy = job.constraints?.autonomyLevel ?? 0;

  // Duration — compute from createdAt / updatedAt
  let durationMs: number | null = null;
  try {
    if (job.createdAt && job.updatedAt) {
      durationMs = new Date(job.updatedAt).getTime() - new Date(job.createdAt).getTime();
    }
  } catch {
    /* ignore */
  }
  const durationDisplay =
    durationMs != null
      ? durationMs < 1000
        ? `${durationMs}ms`
        : durationMs < 60000
        ? `${(durationMs / 1000).toFixed(1)}s`
        : `${Math.floor(durationMs / 60000)}m ${Math.floor((durationMs % 60000) / 1000)}s`
      : null;

  return (
    <div className="h-9 border-b bg-card/30 flex items-center px-3 gap-3 text-[11px] min-w-0">
      <OperatorIcon className="h-3.5 w-3.5 shrink-0 text-foreground/70" />
      <code className="font-mono text-[10px] truncate min-w-0" title={job.jobId}>
        {job.jobId}
      </code>
      <span className="text-muted-foreground shrink-0">·</span>
      <span className="capitalize shrink-0 text-foreground/80">{operator}</span>
      <span className="text-muted-foreground shrink-0">·</span>
      <span className="shrink-0 text-muted-foreground">L{autonomy}</span>
      <Badge
        variant="outline"
        className={cn("text-[10px] shrink-0 border", statusMeta.color)}
      >
        <StatusIcon className="h-2.5 w-2.5 mr-1" />
        {statusMeta.label}
      </Badge>
      {durationDisplay && (
        <>
          <span className="text-muted-foreground shrink-0">·</span>
          <span className="text-muted-foreground shrink-0">{durationDisplay}</span>
        </>
      )}
      <div className="flex-1" />
      <a
        href={`/code-studio/jobs`}
        className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        title="Open in Code Studio Jobs view"
      >
        Code Studio Jobs
        <ExternalLink className="h-2.5 w-2.5" />
      </a>
    </div>
  );
}
