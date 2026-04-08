/**
 * AI Agent Studio — Right Oversight Drawer
 *
 * Sticky on desktop. Acts as the operational control panel for the agent —
 * surfaces readiness, governance verdict, blockers, warnings, and latest
 * simulation/test signals in a disciplined panel layout.
 *
 * Sections (top to bottom):
 *   1. Readiness — score + bar + publish-ready chip
 *   2. Governance — verdict + risk + reason summary
 *   3. Blockers — only when present
 *   4. Warnings — only when present
 *   5. Last Simulation — verdict + summary
 *   6. Last Tests — pass/fail counts
 */
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Activity,
  Sparkles,
  Gauge,
} from "lucide-react";
import { cn } from "@/lib/utils";
import VerdictBadge from "./ui/VerdictBadge";

export interface OversightProps {
  readiness?: {
    score: number;
    completeness: number;
    blockers: Array<{ section: string; message: string }>;
    warnings: Array<{ section: string; message: string }>;
    publishReady: boolean;
  };
  governance?: {
    verdict: "pass" | "warning" | "blocked";
    riskScore: number;
    reasons: Array<{ severity: string; rule: string; message: string }>;
  };
  latestSimulation?: { verdict?: string | null; summary?: string | null; createdAt?: Date | string | null } | null;
  latestTest?: { verdict?: string | null; passedCount?: number | null; failedCount?: number | null } | null;
}

/** Drawer section header — small, uppercase, with optional icon */
function DrawerSection({
  icon,
  label,
  trailing,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70">
          <span className="opacity-70">{icon}</span>
          {label}
        </div>
        {trailing}
      </div>
      <div className="text-xs space-y-1">{children}</div>
    </section>
  );
}

export default function AgentStudioOversightDrawer({
  readiness,
  governance,
  latestSimulation,
  latestTest,
}: OversightProps) {
  const score = readiness?.score ?? 0;
  const scoreColor =
    score >= 70 ? "text-emerald-500" : score >= 40 ? "text-yellow-500" : "text-red-500";

  const govIcon =
    governance?.verdict === "pass" ? (
      <ShieldCheck className="h-3 w-3 text-emerald-500" />
    ) : governance?.verdict === "warning" ? (
      <ShieldAlert className="h-3 w-3 text-yellow-500" />
    ) : (
      <ShieldX className="h-3 w-3 text-red-500" />
    );

  return (
    <div className="hidden lg:flex w-64 border-l bg-background/40 flex-col h-full shrink-0">
      {/* Drawer header */}
      <div className="border-b px-3 py-2 flex items-center gap-2">
        <Gauge className="h-3.5 w-3.5 text-muted-foreground/70" />
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">
          Oversight
        </span>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-4">
          {/* ── Readiness ── */}
          <DrawerSection
            icon={<Gauge className="h-3 w-3" />}
            label="Readiness"
            trailing={
              <span className={cn("font-mono text-[11px] font-semibold", scoreColor)}>
                {score}
                <span className="text-muted-foreground/50">/100</span>
              </span>
            }
          >
            <Progress value={score} className="h-1.5" />
            <div className="flex items-center justify-between mt-1">
              <span className="text-[10px] text-muted-foreground">
                {readiness?.completeness ?? 0}% complete
              </span>
              {readiness?.publishReady && (
                <span className="text-[9px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded border bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                  Publish Ready
                </span>
              )}
            </div>
          </DrawerSection>

          {/* ── Governance ── */}
          <DrawerSection
            icon={govIcon}
            label="Governance"
            trailing={<VerdictBadge verdict={governance?.verdict} />}
          >
            <div className="text-[10px] text-muted-foreground">
              Risk score{" "}
              <span className="font-mono text-foreground/70">
                {governance?.riskScore ?? 0}/100
              </span>
            </div>
            {governance?.reasons && governance.reasons.length > 0 && (
              <ul className="space-y-1 mt-1">
                {governance.reasons.slice(0, 4).map((r, i) => (
                  <li key={i} className="flex gap-1.5 text-[10px] leading-snug">
                    <AlertTriangle
                      className={cn(
                        "h-2.5 w-2.5 mt-0.5 shrink-0",
                        r.severity === "blocker" && "text-red-500",
                        r.severity === "warning" && "text-yellow-500",
                        r.severity === "info" && "text-blue-500"
                      )}
                    />
                    <span className="text-muted-foreground">{r.message}</span>
                  </li>
                ))}
                {governance.reasons.length > 4 && (
                  <li className="text-[9px] text-muted-foreground/60 italic ml-3.5">
                    +{governance.reasons.length - 4} more
                  </li>
                )}
              </ul>
            )}
          </DrawerSection>

          {/* ── Blockers (only when present) ── */}
          {readiness?.blockers && readiness.blockers.length > 0 && (
            <DrawerSection
              icon={<ShieldX className="h-3 w-3 text-red-500" />}
              label={`Blockers (${readiness.blockers.length})`}
            >
              <ul className="space-y-1">
                {readiness.blockers.map((b, i) => (
                  <li
                    key={i}
                    className="text-[10px] leading-snug border-l-2 border-red-500/40 pl-2"
                  >
                    <span className="text-red-400/80 font-mono text-[9px] uppercase">
                      {b.section}
                    </span>
                    <div className="text-red-300">{b.message}</div>
                  </li>
                ))}
              </ul>
            </DrawerSection>
          )}

          {/* ── Warnings (only when present) ── */}
          {readiness?.warnings && readiness.warnings.length > 0 && (
            <DrawerSection
              icon={<AlertTriangle className="h-3 w-3 text-yellow-500" />}
              label={`Warnings (${readiness.warnings.length})`}
            >
              <ul className="space-y-1">
                {readiness.warnings.slice(0, 6).map((w, i) => (
                  <li
                    key={i}
                    className="text-[10px] leading-snug border-l-2 border-yellow-500/40 pl-2"
                  >
                    <span className="text-yellow-400/80 font-mono text-[9px] uppercase">
                      {w.section}
                    </span>
                    <div className="text-yellow-200/80">{w.message}</div>
                  </li>
                ))}
                {readiness.warnings.length > 6 && (
                  <li className="text-[9px] text-muted-foreground/60 italic pl-2">
                    +{readiness.warnings.length - 6} more
                  </li>
                )}
              </ul>
            </DrawerSection>
          )}

          {/* ── Last Simulation ── */}
          <DrawerSection
            icon={<Sparkles className="h-3 w-3 text-purple-500" />}
            label="Last Simulation"
            trailing={
              latestSimulation ? (
                <VerdictBadge verdict={latestSimulation.verdict ?? "skipped"} />
              ) : null
            }
          >
            {latestSimulation ? (
              <p className="text-[10px] text-muted-foreground leading-snug">
                {latestSimulation.summary ?? "Completed"}
              </p>
            ) : (
              <p className="text-[10px] text-muted-foreground/60 italic">
                No simulation runs yet
              </p>
            )}
          </DrawerSection>

          {/* ── Last Tests ── */}
          <DrawerSection
            icon={<Activity className="h-3 w-3 text-cyan-500" />}
            label="Last Tests"
          >
            {latestTest ? (
              <div className="text-[10px] flex items-center gap-2">
                <span className="text-emerald-400">
                  ✓ {latestTest.passedCount ?? 0}
                </span>
                <span className="text-red-400">
                  ✗ {latestTest.failedCount ?? 0}
                </span>
                <span className="text-muted-foreground/60">
                  · {latestTest.verdict ?? "—"}
                </span>
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground/60 italic">
                No test runs yet
              </p>
            )}
          </DrawerSection>
        </div>
      </ScrollArea>
    </div>
  );
}
