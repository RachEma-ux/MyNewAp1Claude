/**
 * PRM Status Badge — Color-coded case status indicator
 */
import { cn } from "@/lib/utils";

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  draft: { label: "Draft", color: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20" },
  intake: { label: "Intake", color: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
  triage: { label: "Triage", color: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  analysis: { label: "Analysis", color: "bg-purple-500/10 text-purple-500 border-purple-500/20" },
  decision_pending: { label: "Decision Pending", color: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
  in_resolution: { label: "In Resolution", color: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20" },
  resolved: { label: "Resolved", color: "bg-teal-500/10 text-teal-500 border-teal-500/20" },
  verification_pending: { label: "Verification Pending", color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" },
  verified_closed: { label: "Verified Closed", color: "bg-green-500/10 text-green-500 border-green-500/20" },
  reopened: { label: "Reopened", color: "bg-red-500/10 text-red-500 border-red-500/20" },
  cancelled: { label: "Cancelled", color: "bg-gray-500/10 text-gray-500 border-gray-500/20" },
};

export function PRMStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || { label: status, color: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20" };
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
