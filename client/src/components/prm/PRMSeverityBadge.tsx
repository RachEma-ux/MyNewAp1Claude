/**
 * PRM Severity Badge — Severity level indicator
 */
import { cn } from "@/lib/utils";

const SEVERITY_CONFIG: Record<string, { label: string; color: string }> = {
  critical: { label: "Critical", color: "bg-red-500/10 text-red-600 border-red-500/20" },
  high: { label: "High", color: "bg-orange-500/10 text-orange-600 border-orange-500/20" },
  medium: { label: "Medium", color: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" },
  low: { label: "Low", color: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
};

export function PRMSeverityBadge({ severity }: { severity: string | null | undefined }) {
  if (!severity) return null;
  const config = SEVERITY_CONFIG[severity] || { label: severity, color: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20" };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
        config.color
      )}
    >
      {config.label}
    </span>
  );
}
