/**
 * AI Agent Studio — Agent Overview Page
 *
 * Operational summary at a glance:
 *   - Hero card (name, description, lifecycle, environment, class)
 *   - Mission / Runtime / Governance triptych
 *   - Latest simulation + tests strip
 *   - Recent runs list
 *   - Active alerts/blockers callout
 */
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  Activity,
  AlertTriangle,
  Target,
  Cpu,
  ShieldCheck,
} from "lucide-react";
import {
  PageHeader,
  EmptyState,
  LifecycleBadge,
  VerdictBadge,
  SectionLabel,
  LoadingState,
} from "../components/ui";

export default function AgentOverviewPage({ agentId }: { agentId: number }) {
  const overviewQuery = trpc.agentStudio.shell.getOverview.useQuery({ agentId });

  if (overviewQuery.isLoading) {
    return <LoadingState label="Loading overview…" />;
  }
  if (!overviewQuery.data) {
    return (
      <div className="p-4">
        <EmptyState title="Overview unavailable" description="No data returned for this agent." />
      </div>
    );
  }

  const { agent, draft, readiness, governance, latestSimulation, latestTest, recentRuns } =
    overviewQuery.data;

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Overview"
        subtitle="Operational summary for the current draft"
        badges={
          <span className="ml-2 flex items-center gap-1.5">
            <LifecycleBadge state={agent.lifecycleState} />
            <Badge variant="outline" className="text-[9px] uppercase tracking-wider">
              env · {agent.environment}
            </Badge>
          </span>
        }
      />

      {/* Hero summary card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold tracking-tight truncate">
                {agent.name}
              </h3>
              <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                {agent.internalKey}
              </p>
              {agent.description && (
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  {agent.description}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <Badge variant="outline" className="text-[9px] uppercase tracking-wider">
                {agent.agentClass}
              </Badge>
              <span className="text-[9px] text-muted-foreground/60">
                visibility · {agent.visibility}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Mission / Runtime / Governance triptych */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 space-y-2">
            <SectionLabel icon={<Target className="h-3 w-3 text-blue-500" />}>
              Mission
            </SectionLabel>
            <p className="text-xs leading-relaxed">
              {draft?.mission ?? (
                <span className="text-muted-foreground/60 italic">Not defined</span>
              )}
            </p>
            <div className="pt-1">
              <SectionLabel className="text-[9px]">Autonomy</SectionLabel>
              <Badge variant="outline" className="text-[9px] uppercase tracking-wider mt-0.5">
                {(draft?.autonomyLevel ?? "—").replace(/_/g, " ")}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-2">
            <SectionLabel icon={<Cpu className="h-3 w-3 text-cyan-500" />}>
              Runtime
            </SectionLabel>
            <dl className="text-xs space-y-1">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Environment</dt>
                <dd className="font-mono uppercase text-[10px]">{agent.environment}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Class</dt>
                <dd className="font-mono uppercase text-[10px]">{agent.agentClass}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Visibility</dt>
                <dd className="font-mono uppercase text-[10px]">{agent.visibility}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-2">
            <SectionLabel icon={<ShieldCheck className="h-3 w-3 text-emerald-500" />}>
              Governance
            </SectionLabel>
            {/* The shell summary contract returns null for governance /
                readiness when the underlying service throws (e.g.,
                ASDB blip). The shell renders a structured warning
                banner; here we just show the unavailable state instead
                of crashing on `governance.verdict`. */}
            {governance ? (
              <>
                <VerdictBadge verdict={governance.verdict} showIcon size="md" />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Risk score{" "}
                  <span className="font-mono text-foreground/70">
                    {governance.riskScore}/100
                  </span>
                </p>
              </>
            ) : (
              <p className="text-[10px] text-muted-foreground italic">
                Governance unavailable
              </p>
            )}
            {readiness ? (
              <p className="text-[10px] text-muted-foreground">
                Readiness{" "}
                <span className="font-mono text-foreground/70">
                  {readiness.score}/100
                </span>
              </p>
            ) : (
              <p className="text-[10px] text-muted-foreground italic">
                Readiness unavailable
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Latest sim + tests */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4 space-y-2">
            <SectionLabel icon={<Sparkles className="h-3 w-3 text-purple-500" />}>
              Latest Simulation
            </SectionLabel>
            {latestSimulation ? (
              <>
                <VerdictBadge verdict={latestSimulation.verdict ?? "skipped"} />
                {latestSimulation.summary && (
                  <p className="text-xs leading-snug">{latestSimulation.summary}</p>
                )}
                <p className="text-[10px] text-muted-foreground">
                  Risk{" "}
                  <span className="font-mono">{latestSimulation.riskScore ?? 0}</span>{" "}
                  · Cost{" "}
                  <span className="font-mono">{latestSimulation.costEstimate ?? 0}</span>{" "}
                  ·{" "}
                  <span className="font-mono">{latestSimulation.durationMs ?? 0}ms</span>
                </p>
              </>
            ) : (
              <EmptyState
                compact
                title="No simulation runs yet"
                description="Use Simulate in the top bar."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-2">
            <SectionLabel icon={<Activity className="h-3 w-3 text-cyan-500" />}>
              Latest Tests
            </SectionLabel>
            {latestTest ? (
              <>
                <VerdictBadge verdict={latestTest.verdict ?? "skipped"} />
                <p className="text-xs">
                  <span className="text-emerald-400">
                    ✓ {latestTest.passedCount ?? 0} passed
                  </span>
                  {" · "}
                  <span className="text-red-400">
                    ✗ {latestTest.failedCount ?? 0} failed
                  </span>
                </p>
              </>
            ) : (
              <EmptyState
                compact
                title="No test runs yet"
                description="Add cases on the Testing page."
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent runs */}
      <Card>
        <CardContent className="p-4">
          <SectionLabel icon={<Activity className="h-3 w-3" />} className="mb-2">
            Recent Runs
          </SectionLabel>
          {recentRuns.length === 0 ? (
            <EmptyState
              compact
              title="No runtime runs yet"
              description="Simulation runs and live executions show here."
            />
          ) : (
            <ul className="space-y-1 text-xs">
              {recentRuns.map((r: any) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between border-b border-border/40 py-1.5 last:border-b-0"
                >
                  <span className="font-mono text-[10px] text-muted-foreground">
                    #{r.id}
                  </span>
                  <Badge variant="outline" className="text-[9px] uppercase tracking-wider">
                    {r.status}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    {r.createdAt ? new Date(r.createdAt).toLocaleString() : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Alerts / blockers — only renders when readiness loaded;
          if it failed we show its unavailable state in the
          governance card above. */}
      {readiness && (readiness.blockers.length > 0 || readiness.warnings.length > 0) && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <SectionLabel icon={<AlertTriangle className="h-3 w-3 text-yellow-500" />}>
              Alerts & Blockers
            </SectionLabel>
            <div className="space-y-1">
              {readiness.blockers.map((b: any, i: number) => (
                <div
                  key={`b${i}`}
                  className="text-[10px] border-l-2 border-red-500/40 pl-2"
                >
                  <span className="font-mono uppercase text-red-400/80 text-[9px]">
                    {b.section}
                  </span>
                  <div className="text-red-300">{b.message}</div>
                </div>
              ))}
              {readiness.warnings.slice(0, 6).map((w: any, i: number) => (
                <div
                  key={`w${i}`}
                  className="text-[10px] border-l-2 border-yellow-500/40 pl-2"
                >
                  <span className="font-mono uppercase text-yellow-400/80 text-[9px]">
                    {w.section}
                  </span>
                  <div className="text-yellow-200/80">{w.message}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
