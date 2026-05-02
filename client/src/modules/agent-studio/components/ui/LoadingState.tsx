/**
 * AI Agent Studio — Shared Loading State
 *
 * Replaces bare <Loader2 /> blocks with a labelled loading indicator that
 * tells the user what is being fetched.
 */
import { Loader2 } from "lucide-react";

interface Props {
  label?: string;
  /** When true, fills the parent block instead of using a fixed-height card */
  fill?: boolean;
}

export default function LoadingState({ label = "Loading…", fill = false }: Props) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-muted-foreground/70 gap-1.5 ${
        fill ? "h-full p-12" : "p-12"
      }`}
    >
      <Loader2 className="h-5 w-5 animate-spin" />
      <p className="text-[10px] uppercase tracking-wider">{label}</p>
    </div>
  );
}

/**
 * Skeleton block for use inside cards while data is loading. Looks like
 * a placeholder content row.
 */
export function SkeletonBlock({
  lines = 3,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-2 animate-pulse ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-3 bg-muted/40 rounded"
          style={{ width: `${100 - i * 12}%` }}
        />
      ))}
    </div>
  );
}
