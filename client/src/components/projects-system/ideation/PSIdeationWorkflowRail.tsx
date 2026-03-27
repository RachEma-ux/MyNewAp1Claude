/**
 * PS Ideation — Workflow Rail
 *
 * Left sidebar showing the exact 11-step workflow as numbered steps.
 * Each step shows its completion status and can be clicked to navigate.
 * On mobile: renders inside a Sheet drawer.
 * On desktop/tablet: renders as a persistent sidebar panel.
 */
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CheckCircle2, Circle, Loader2, AlertCircle, Lock, PanelLeftClose } from "lucide-react";
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
  /** Mobile sheet mode — when true, renders inside a Sheet */
  mobileSheet?: boolean;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  complete: <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />,
  in_progress: <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />,
  blocked: <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />,
  not_started: <Circle className="w-4 h-4 text-muted-foreground shrink-0" />,
};

function getStepStatus(steps: StepState[], key: string): IdeationStepStatus {
  const s = steps.find((st) => st.stepKey === key);
  return (s?.stepStatus as IdeationStepStatus) || "not_started";
}

/** The rail content — shared between inline and sheet modes */
function RailContent({ steps, currentStep, onStepClick, isConverted }: {
  steps: StepState[];
  currentStep: IdeationStepKey;
  onStepClick: (stepKey: IdeationStepKey) => void;
  isConverted?: boolean;
}) {
  return (
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
                  "flex items-center gap-2 w-full px-3 py-2 text-left text-xs transition-colors",
                  isActive
                    ? "bg-accent text-accent-foreground font-medium"
                    : "hover:bg-accent/50 text-muted-foreground",
                  isConverted && "opacity-60 cursor-not-allowed",
                )}
              >
                {isConverted ? <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : (STATUS_ICON[status] || STATUS_ICON.not_started)}
                <span className="truncate leading-tight">{IDEATION_STEP_LABELS[key]}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function PSIdeationWorkflowRail({
  steps, currentStep, onStepClick, isConverted, onCollapse,
  mobileSheet, mobileOpen, onMobileClose,
}: Props) {
  // Mobile: render as Sheet drawer
  if (mobileSheet) {
    return (
      <Sheet open={mobileOpen} onOpenChange={(open) => !open && onMobileClose?.()}>
        <SheetContent side="left" className="w-64 p-0 pt-2">
          <SheetHeader className="px-3 pb-2">
            <SheetTitle className="text-sm">Workflow Steps</SheetTitle>
          </SheetHeader>
          <RailContent steps={steps} currentStep={currentStep} onStepClick={(key) => { onStepClick(key); onMobileClose?.(); }} isConverted={isConverted} />
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop/tablet: inline persistent panel
  return (
    <nav className="w-48 shrink-0 border-r border-border overflow-y-auto py-2 flex flex-col">
      {onCollapse && (
        <div className="flex justify-end px-2 mb-1">
          <Button variant="ghost" size="sm" onClick={onCollapse} title="Collapse sidebar" className="h-6 w-6 p-0">
            <PanelLeftClose className="w-3.5 h-3.5" />
          </Button>
        </div>
      )}
      <RailContent steps={steps} currentStep={currentStep} onStepClick={onStepClick} isConverted={isConverted} />
    </nav>
  );
}
