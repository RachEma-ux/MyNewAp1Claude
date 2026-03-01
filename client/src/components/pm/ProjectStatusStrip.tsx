/**
 * ProjectStatusStrip — Compact always-visible project status header
 *
 * Shows: lifecycle state, gate status, freeze indicator, next required action
 */

import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldAlert, Lock, ArrowRight } from "lucide-react";

const STATE_LABELS: Record<string, string> = {
  draft_shell: "Draft",
  intake_review: "Intake Review",
  planning: "Planning",
  plan_gate_pending: "G1 Pending",
  authorized: "Authorized",
  executing: "Executing",
  control_hold: "Control Hold",
  change_pending: "Change Pending",
  closing: "Closing",
  close_gate_pending: "G4 Pending",
  closed: "Closed",
  rejected: "Rejected",
  archived: "Archived",
};

const STATE_COLORS: Record<string, string> = {
  draft_shell: "bg-gray-500",
  intake_review: "bg-blue-500",
  planning: "bg-indigo-500",
  plan_gate_pending: "bg-yellow-500",
  authorized: "bg-green-500",
  executing: "bg-emerald-500",
  control_hold: "bg-red-500",
  change_pending: "bg-orange-500",
  closing: "bg-purple-500",
  close_gate_pending: "bg-yellow-500",
  closed: "bg-slate-500",
  rejected: "bg-red-600",
  archived: "bg-zinc-500",
};

const NEXT_ACTIONS: Record<string, string> = {
  draft_shell: "Submit for Intake",
  intake_review: "Evaluate G0 Gate",
  planning: "Submit Plan for G1",
  plan_gate_pending: "Evaluate G1 Gate",
  authorized: "Start Execution",
  executing: "Monitor & Deliver",
  control_hold: "Remediate & Resume",
  change_pending: "Evaluate G2 Gate",
  closing: "Submit for G4",
  close_gate_pending: "Evaluate G4 Gate",
  closed: "Archive",
  rejected: "—",
  archived: "—",
};

interface ProjectStatusStripProps {
  projectName: string;
  projectState: string;
  freezeActive?: boolean;
  gateStatus?: string; // "G0 pending", "G1 passed", etc.
}

export default function ProjectStatusStrip({
  projectName,
  projectState,
  freezeActive,
  gateStatus,
}: ProjectStatusStripProps) {
  const stateLabel = STATE_LABELS[projectState] || projectState;
  const stateColor = STATE_COLORS[projectState] || "bg-gray-500";
  const nextAction = NEXT_ACTIONS[projectState] || "—";

  return (
    <div className="px-3 py-2 border-b bg-muted/30 space-y-1.5">
      <div className="font-medium text-sm truncate" title={projectName}>
        {projectName}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge className={`${stateColor} text-white text-[10px] px-1.5 py-0`}>
          {stateLabel}
        </Badge>
        {gateStatus && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
            <ShieldCheck className="h-2.5 w-2.5" />
            {gateStatus}
          </Badge>
        )}
        {freezeActive && (
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0 gap-0.5">
            <Lock className="h-2.5 w-2.5" />
            Frozen
          </Badge>
        )}
      </div>
      {nextAction !== "—" && (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <ArrowRight className="h-2.5 w-2.5" />
          <span>{nextAction}</span>
        </div>
      )}
    </div>
  );
}
