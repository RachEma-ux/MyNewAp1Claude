/**
 * PMGovernanceBadge — Governance status indicator for PM pages
 *
 * Displays green OK / yellow Warn / red Frozen based on workspace state.
 * When frozen, shows a banner message.
 */

import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldAlert, ShieldOff } from "lucide-react";

type GovernanceState = "ok" | "warn" | "frozen";

interface GovernanceBadgeProps {
  workspaceId: number;
}

const stateConfig: Record<GovernanceState, {
  label: string;
  icon: React.ReactNode;
  badgeClass: string;
}> = {
  ok: {
    label: "OK",
    icon: <ShieldCheck className="h-3 w-3" />,
    badgeClass: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  },
  warn: {
    label: "Warn",
    icon: <ShieldAlert className="h-3 w-3" />,
    badgeClass: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  },
  frozen: {
    label: "Frozen",
    icon: <ShieldOff className="h-3 w-3" />,
    badgeClass: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  },
};

export function PMGovernanceBadge({ workspaceId }: GovernanceBadgeProps) {
  // For now, default to "ok" state
  // In production, this would query subject_freezes and drift_events
  const state: GovernanceState = "ok";
  const config = stateConfig[state];

  return (
    <Badge className={`text-[10px] gap-1 ${config.badgeClass}`}>
      {config.icon}
      {config.label}
    </Badge>
  );
}

export function GovernanceBanner({ workspaceId }: GovernanceBadgeProps) {
  // Stub: would query actual freeze state
  const frozen = false;

  if (!frozen) return null;

  return (
    <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md p-3 mb-4 flex items-center gap-2">
      <ShieldOff className="h-4 w-4 text-red-600" />
      <span className="text-sm text-red-700 dark:text-red-300">
        Workspace is frozen — all create, edit, and delete actions are disabled.
      </span>
    </div>
  );
}
