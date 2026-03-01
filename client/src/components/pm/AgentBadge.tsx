/**
 * AgentBadge — Reusable status badge for agent engine entities
 *
 * Used across AgentEnginePanel, AgentRunDetailPanel, and project views.
 */

import { cn } from "@/lib/utils";

type BadgeVariant =
  | "pending" | "running" | "completed" | "failed" | "cancelled" | "skipped"
  | "committed" | "rejected"
  | "pass" | "fail" | "warn";

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  pending: "bg-muted text-muted-foreground",
  running: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  completed: "bg-green-500/15 text-green-500 border-green-500/30",
  failed: "bg-red-500/15 text-red-500 border-red-500/30",
  cancelled: "bg-muted text-muted-foreground line-through",
  skipped: "bg-muted text-muted-foreground italic",
  committed: "bg-green-500/15 text-green-500 border-green-500/30",
  rejected: "bg-red-500/15 text-red-500 border-red-500/30",
  pass: "bg-green-500/15 text-green-500",
  fail: "bg-red-500/15 text-red-500",
  warn: "bg-yellow-500/15 text-yellow-500",
};

interface AgentBadgeProps {
  variant: BadgeVariant;
  label?: string;
  className?: string;
}

export default function AgentBadge({ variant, label, className }: AgentBadgeProps) {
  const displayLabel = label || variant.charAt(0).toUpperCase() + variant.slice(1);

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full border border-transparent",
        VARIANT_STYLES[variant] || VARIANT_STYLES.pending,
        className,
      )}
    >
      {(variant === "running") && (
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse mr-1" />
      )}
      {displayLabel}
    </span>
  );
}
