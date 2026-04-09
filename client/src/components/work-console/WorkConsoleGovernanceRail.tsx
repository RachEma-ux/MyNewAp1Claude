/**
 * AI Work Console — Right Governance Rail
 *
 * Always-visible governance context: risk summary, policy status,
 * approval queue, audit trail preview, runtime health, and file
 * impact summary. The rail reads from the same `activeJob` prop as
 * the center tabs — no extra queries beyond the shared polling and
 * one extra audit-trail query for the preview strip.
 *
 * If no job is active, the rail collapses to a thin info block
 * explaining that governance context appears once a job is running.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  ShieldCheck,
  Shield,
  AlertTriangle,
  Activity,
  FileCode,
  Users,
  Server,
} from "lucide-react";

interface Props {
  jobId: string | null;
  job: any | null;
}

const FS_ACTIONS = new Set(["fs.write", "fs.delete", "fs.mkdir"]);

export default function WorkConsoleGovernanceRail({ jobId, job }: Props) {
  const auditQuery = trpc.orchestrator.getAuditTrail.useQuery(
    { jobId: jobId ?? "", limit: 10 },
    { enabled: jobId !== null }
  );

  return (
    <div className="w-72 border-l bg-background shrink-0 h-full flex flex-col overflow-hidden">
      <div className="px-3 py-2 border-b">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Shield className="h-3 w-3" />
          Governance
        </h2>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-3">
          {!jobId || !job ? (
            <EmptyRail />
          ) : (
            <>
              <RiskSummary job={job} />
              <PolicyStatus job={job} />
              <ApprovalQueue job={job} />
              <AuditPreview entries={auditQuery.data || []} loading={auditQuery.isLoading} />
              <RuntimeHealth job={job} />
              <FileImpactSummary job={job} />
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

// ── Empty rail ────────────────────────────────────────────────────────

function EmptyRail() {
  return (
    <Card>
      <CardContent className="p-3 text-center space-y-1.5">
        <Shield className="h-6 w-6 mx-auto opacity-30" />
        <p className="text-[11px] text-muted-foreground">
          Governance context will appear here once an intent is submitted.
        </p>
      </CardContent>
    </Card>
  );
}

// ── Risk summary ──────────────────────────────────────────────────────

function RiskSummary({ job }: { job: any }) {
  const riskLevel = job.result?.risk?.level as
    | "low"
    | "medium"
    | "high"
    | undefined;
  const riskReason = job.result?.risk?.reasoning;
  const planCount = job.result?.plan?.length ?? 0;
  const highRiskCount =
    (job.result?.plan || []).filter((s: any) => s.riskLevel === "high").length ?? 0;

  return (
    <Card>
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            Risk Summary
          </p>
          {riskLevel && (
            <Badge
              variant="outline"
              className={cn(
                "text-[9px]",
                riskLevel === "high" && "border-red-500/40 text-red-400",
                riskLevel === "medium" && "border-amber-500/40 text-amber-400",
                riskLevel === "low" && "border-emerald-500/40 text-emerald-400"
              )}
            >
              {riskLevel.toUpperCase()}
            </Badge>
          )}
        </div>
        {riskReason && (
          <p className="text-[11px] text-foreground/80">{riskReason}</p>
        )}
        <div className="flex gap-1 flex-wrap">
          <Badge variant="outline" className="text-[9px]">
            {planCount} syscalls
          </Badge>
          {highRiskCount > 0 && (
            <Badge variant="outline" className="text-[9px] border-red-500/40 text-red-400">
              {highRiskCount} high-risk
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Policy status ─────────────────────────────────────────────────────

function PolicyStatus({ job }: { job: any }) {
  const results = job.executionResult?.results || [];
  const denied = results.filter((r: any) => r.status === "denied").length;
  const allowed = results.filter(
    (r: any) => r.governanceDecision?.verdict === "allow"
  ).length;
  const escalated = results.filter(
    (r: any) => r.governanceDecision?.verdict === "escalate"
  ).length;

  return (
    <Card>
      <CardContent className="p-3 space-y-1.5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <ShieldCheck className="h-3 w-3" />
          Policy Status
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          <div className="text-center bg-muted/50 rounded-md p-1.5">
            <p className="text-sm font-bold text-emerald-500">{allowed}</p>
            <p className="text-[9px] text-muted-foreground">Allow</p>
          </div>
          <div className="text-center bg-muted/50 rounded-md p-1.5">
            <p className="text-sm font-bold text-amber-500">{escalated}</p>
            <p className="text-[9px] text-muted-foreground">Escalate</p>
          </div>
          <div className="text-center bg-muted/50 rounded-md p-1.5">
            <p className="text-sm font-bold text-red-500">{denied}</p>
            <p className="text-[9px] text-muted-foreground">Deny</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Approval queue ────────────────────────────────────────────────────

function ApprovalQueue({ job }: { job: any }) {
  // Pending approvals are derived from syscalls whose required
  // autonomy level exceeds the current job's granted autonomy.
  const granted = job.constraints?.autonomyLevel ?? 0;
  const plan = job.result?.plan || [];
  const pending = plan.filter(
    (sc: any) => (sc.requiredAutonomyLevel ?? 0) > granted
  );

  return (
    <Card>
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <Users className="h-3 w-3" />
            Approval Queue
          </p>
          <Badge variant="outline" className="text-[9px]">
            {pending.length}
          </Badge>
        </div>
        {pending.length === 0 ? (
          <p className="text-[10px] text-muted-foreground italic">
            No syscalls are awaiting approval at the current autonomy level.
          </p>
        ) : (
          <div className="space-y-1">
            {pending.slice(0, 4).map((sc: any, idx: number) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-1.5 text-[10px]"
              >
                <code className="font-mono truncate">{sc.action}</code>
                <Badge variant="outline" className="text-[9px] shrink-0">
                  needs L{sc.requiredAutonomyLevel}
                </Badge>
              </div>
            ))}
            {pending.length > 4 && (
              <p className="text-[9px] text-muted-foreground italic">
                …and {pending.length - 4} more
              </p>
            )}
            <a
              href="/code-studio/approvals"
              className="text-[9px] text-primary hover:underline block mt-1"
            >
              Open in Code Studio Approvals →
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Audit preview ─────────────────────────────────────────────────────

function AuditPreview({
  entries,
  loading,
}: {
  entries: any[];
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-3 space-y-1.5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <Activity className="h-3 w-3" />
          Audit Preview
        </p>
        {loading ? (
          <p className="text-[10px] text-muted-foreground italic">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-[10px] text-muted-foreground italic">
            No audit entries yet.
          </p>
        ) : (
          <div className="space-y-0.5">
            {entries.slice(0, 6).map((entry: any, idx: number) => (
              <div
                key={idx}
                className="flex items-center gap-1.5 text-[10px] font-mono truncate"
              >
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[9px] shrink-0",
                    entry.verdict === "allow" && "text-emerald-500",
                    entry.verdict === "deny" && "text-red-500",
                    entry.verdict === "escalate" && "text-amber-500"
                  )}
                >
                  {entry.verdict}
                </Badge>
                <span className="truncate">{entry.action}</span>
              </div>
            ))}
            {entries.length > 6 && (
              <p className="text-[9px] text-muted-foreground italic">
                …and {entries.length - 6} more (see Audit tab)
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Runtime health ────────────────────────────────────────────────────

function RuntimeHealth({ job }: { job: any }) {
  const totalDurationMs = job.executionResult?.totalDurationMs ?? null;
  const summary = job.executionResult?.summary;
  const successRate =
    summary && summary.total > 0
      ? ((summary.succeeded / summary.total) * 100).toFixed(0)
      : null;

  return (
    <Card>
      <CardContent className="p-3 space-y-1.5">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <Server className="h-3 w-3" />
          Runtime Health
        </p>
        <div className="space-y-0.5 text-[10px]">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Operator</span>
            <span className="capitalize">{job.operator}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Autonomy</span>
            <span>L{job.constraints?.autonomyLevel ?? 0}</span>
          </div>
          {job.result?.modelUsed && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Model</span>
              <span className="truncate max-w-[120px]" title={job.result.modelUsed}>
                {job.result.modelUsed}
              </span>
            </div>
          )}
          {totalDurationMs != null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Duration</span>
              <span>{totalDurationMs}ms</span>
            </div>
          )}
          {successRate != null && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Success rate</span>
              <span className="text-emerald-500">{successRate}%</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── File impact summary ───────────────────────────────────────────────

function FileImpactSummary({ job }: { job: any }) {
  const plan = job.result?.plan || [];
  const fileChanges = plan.filter((sc: any) => FS_ACTIONS.has(sc.action));
  const paths = Array.from(
    new Set(
      fileChanges
        .map((sc: any) => (sc.args?.path || sc.args?.file || sc.args?.filename) as string | undefined)
        .filter(Boolean)
    )
  ) as string[];

  return (
    <Card>
      <CardContent className="p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <FileCode className="h-3 w-3" />
            File Impact
          </p>
          <Badge variant="outline" className="text-[9px]">
            {paths.length}
          </Badge>
        </div>
        {paths.length === 0 ? (
          <p className="text-[10px] text-muted-foreground italic">
            No file changes in the plan.
          </p>
        ) : (
          <div className="space-y-0.5">
            {paths.slice(0, 5).map((p: string, idx: number) => (
              <code
                key={idx}
                className="text-[10px] block truncate text-foreground/80"
                title={p}
              >
                {p}
              </code>
            ))}
            {paths.length > 5 && (
              <p className="text-[9px] text-muted-foreground italic">
                …and {paths.length - 5} more (see Diffs tab)
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
