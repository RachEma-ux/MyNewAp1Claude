/**
 * AI Agent Studio — Shared Lifecycle Badge
 *
 * Single source of truth for rendering an agent lifecycle state. Maps
 * raw state strings (snake_case) to readable labels and consistent colors.
 *
 * Used by:
 *  - top action bar
 *  - home table
 *  - identity page
 *  - overview cards
 *  - oversight drawer
 *
 * Pure presentation — does NOT change backend semantics.
 */
import { cn } from "@/lib/utils";

export type LifecycleState =
  | "new"
  | "draft"
  | "in_design"
  | "simulated"
  | "tested"
  | "review_required"
  | "blocked"
  | "ready_to_publish"
  | "published"
  | "deprecated"
  | "archived"
  | string;

const STATE_META: Record<
  string,
  { label: string; classes: string; dot: string }
> = {
  new: {
    label: "New",
    classes: "bg-slate-500/10 text-slate-400 border-slate-500/30",
    dot: "bg-slate-400",
  },
  draft: {
    label: "Draft",
    classes: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    dot: "bg-blue-400",
  },
  in_design: {
    label: "In Design",
    classes: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    dot: "bg-blue-400",
  },
  simulated: {
    label: "Simulated",
    classes: "bg-purple-500/10 text-purple-400 border-purple-500/30",
    dot: "bg-purple-400",
  },
  tested: {
    label: "Tested",
    classes: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
    dot: "bg-cyan-400",
  },
  review_required: {
    label: "Review Required",
    classes: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    dot: "bg-yellow-400",
  },
  blocked: {
    label: "Blocked",
    classes: "bg-red-500/10 text-red-400 border-red-500/30",
    dot: "bg-red-400",
  },
  ready_to_publish: {
    label: "Ready to Publish",
    classes: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    dot: "bg-emerald-400",
  },
  published: {
    label: "Published",
    classes: "bg-green-500/10 text-green-400 border-green-500/30",
    dot: "bg-green-400",
  },
  deprecated: {
    label: "Deprecated",
    classes: "bg-orange-500/10 text-orange-400 border-orange-500/30",
    dot: "bg-orange-400",
  },
  archived: {
    label: "Archived",
    classes: "bg-zinc-500/10 text-zinc-400 border-zinc-500/30",
    dot: "bg-zinc-400",
  },
};

const FALLBACK = {
  label: "Unknown",
  classes: "bg-muted/30 text-muted-foreground border-muted-foreground/20",
  dot: "bg-muted-foreground",
};

interface Props {
  state: LifecycleState;
  size?: "sm" | "md";
  className?: string;
}

export default function LifecycleBadge({ state, size = "sm", className }: Props) {
  const meta = STATE_META[state] ?? FALLBACK;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded border font-medium uppercase tracking-wider",
        size === "sm" ? "text-[9px] px-1.5 py-0.5" : "text-[10px] px-2 py-0.5",
        meta.classes,
        className
      )}
      title={meta.label}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", meta.dot)} />
      {meta.label}
    </span>
  );
}
