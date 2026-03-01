/**
 * ProjectControlStrip — PM Shell / Project Control Strip
 *
 * Always visible when inside a project. Shows:
 * - Project name + key
 * - Lifecycle state badge
 * - Gate status badge (next gate)
 * - Freeze indicator + reason
 * - "Next action" CTA button (contextual)
 */

import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Lock, ArrowRight } from "lucide-react";

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

// Next action CTA per state → { label, tool }
const NEXT_ACTIONS: Record<string, { label: string; tool: string } | null> = {
  draft_shell: { label: "Submit Intake", tool: "gates" },
  intake_review: { label: "Evaluate G0", tool: "gates" },
  planning: { label: "Submit Plan Gate", tool: "gates" },
  plan_gate_pending: { label: "Evaluate G1", tool: "gates" },
  authorized: { label: "Start Execution", tool: "tasks" },
  executing: { label: "Track Progress", tool: "follow-ups" },
  control_hold: { label: "Resolve Freeze", tool: "freeze-holds" },
  change_pending: { label: "Evaluate G2", tool: "gates" },
  closing: { label: "Submit Close Gate", tool: "gates" },
  close_gate_pending: { label: "Evaluate G4", tool: "gates" },
  closed: null,
  rejected: null,
  archived: null,
};

interface ProjectControlStripProps {
  projectId: number;
  projectName: string;
  projectState: string;
  freezeActive?: boolean;
  gateStatus?: string;
}

export default function ProjectControlStrip({
  projectId,
  projectName,
  projectState,
  freezeActive,
  gateStatus,
}: ProjectControlStripProps) {
  const [, setLocation] = useLocation();
  const stateLabel = STATE_LABELS[projectState] || projectState;
  const stateColor = STATE_COLORS[projectState] || "bg-gray-500";
  const nextAction = NEXT_ACTIONS[projectState];

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
      {nextAction && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start h-6 px-1 text-[10px] text-primary hover:text-primary font-medium gap-1"
          onClick={() => setLocation(`/pm-central/p/${projectId}/${nextAction.tool}`)}
        >
          <ArrowRight className="h-2.5 w-2.5" />
          {nextAction.label}
        </Button>
      )}
    </div>
  );
}
