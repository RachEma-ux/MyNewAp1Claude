/**
 * PS Ideation — Workflow Rail
 *
 * Left sidebar showing the exact 11-step workflow as numbered steps.
 * Each step shows its completion status and can be clicked to navigate.
 * Collapsible via the chevron button at the top.
 */
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, Loader2, AlertCircle, PanelLeftClose } from "lucide-react";
import {
  IDEATION_STEP_LABELS,
  IDEATION_STEP_GROUPS,
  type IdeationStepKey,
  type IdeationStepStatus,
} from "../../../../../server/ps/ps.ideation-types";

interface StepState {
  stepKey: string;
  stepStatus: string;
}

interface Props {
  steps: StepState[];
  currentStep: IdeationStepKey;
  onStepClick: (stepKey: IdeationStepKey) => void;
  isConverted?: boolean;
  onCollapse?: () => void;
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  complete: <CheckCircle2 className="w-4 h-4 text-green-500" />,
  in_progress: <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />,
  blocked: <AlertCircle className="w-4 h-4 text-red-500" />,
  not_started: <Circle className="w-4 h-4 text-muted-foreground" />,
};

function getStepStatus(steps: StepState[], key: string): IdeationStepStatus {
  const s = steps.find((st) => st.stepKey === key);
  return (s?.stepStatus as IdeationStepStatus) || "not_started";
}

export function PSIdeationWorkflowRail({ steps, currentStep, onStepClick, isConverted, onCollapse }: Props) {
  return (
    <nav className="w-44 shrink-0 border-r border-border overflow-y-auto py-2 flex flex-col">
      {/* Collapse button */}
      {onCollapse && (
        <div className="flex justify-end px-2 mb-1">
          <Button variant="ghost" size="sm" onClick={onCollapse} title="Collapse sidebar" className="h-6 w-6 p-0">
            <PanelLeftClose className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {Object.entries(IDEATION_STEP_GROUPS).map(([group, keys]) => (
          <div key={group} className="mb-3">
            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {group}
            </div>
            {keys.map((key) => {
              const status = getStepStatus(steps, key);
              const isActive = currentStep === key;
              return (
                <button
                  key={key}
                  onClick={() => !isConverted && onStepClick(key)}
                  disabled={isConverted}
                  className={cn(
                    "flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground font-medium"
                      : "hover:bg-accent/50 text-muted-foreground",
                    isConverted && "opacity-60 cursor-not-allowed",
                  )}
                >
                  {STATUS_ICON[status] || STATUS_ICON.not_started}
                  <span className="truncate">{IDEATION_STEP_LABELS[key]}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
