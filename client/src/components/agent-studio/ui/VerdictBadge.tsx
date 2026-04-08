/**
 * AI Agent Studio — Shared Verdict Badge
 *
 * Single source of truth for rendering pass / warning / blocked verdicts
 * across governance, simulation, testing, and publish surfaces.
 */
import { cn } from "@/lib/utils";
import { ShieldCheck, ShieldAlert, ShieldX, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

export type Verdict = "pass" | "warning" | "blocked" | "fail" | "skipped" | "error" | string;

const META: Record<string, { label: string; classes: string; Icon: typeof ShieldCheck }> = {
  pass: {
    label: "Pass",
    classes: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    Icon: ShieldCheck,
  },
  warning: {
    label: "Warning",
    classes: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    Icon: ShieldAlert,
  },
  blocked: {
    label: "Blocked",
    classes: "bg-red-500/10 text-red-400 border-red-500/30",
    Icon: ShieldX,
  },
  fail: {
    label: "Fail",
    classes: "bg-red-500/10 text-red-400 border-red-500/30",
    Icon: XCircle,
  },
  skipped: {
    label: "Skipped",
    classes: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
    Icon: AlertTriangle,
  },
  error: {
    label: "Error",
    classes: "bg-red-500/10 text-red-400 border-red-500/30",
    Icon: XCircle,
  },
};

interface Props {
  verdict: Verdict | null | undefined;
  showIcon?: boolean;
  size?: "sm" | "md";
  className?: string;
}

export default function VerdictBadge({
  verdict,
  showIcon = false,
  size = "sm",
  className,
}: Props) {
  const key = (verdict ?? "skipped").toLowerCase();
  const meta = META[key] ?? META.skipped;
  const Icon = showIcon ? meta.Icon : null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border font-medium uppercase tracking-wider",
        size === "sm" ? "text-[9px] px-1.5 py-0.5" : "text-[10px] px-2 py-0.5",
        meta.classes,
        className
      )}
      title={meta.label}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {meta.label}
    </span>
  );
}

/** Pure helper — get the icon component for a verdict (for non-badge uses) */
export function getVerdictIcon(verdict: Verdict | null | undefined) {
  const key = (verdict ?? "skipped").toLowerCase();
  return (META[key] ?? META.skipped).Icon;
}
