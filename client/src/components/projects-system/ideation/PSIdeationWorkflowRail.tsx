/**
 * PS Ideation — Workflow Rail (left sidebar)
 *
 * IBM Carbon Shell pattern: branded header + icon-only collapsed state.
 *
 * Shows the exact 11-step workflow plus 3 support views:
 *   Workflow Steps (grouped): 11 items
 *   Supporting Views: Concept, Wizard Handoff, Activity
 *
 * On mobile: renders inside a Sheet drawer.
 * On desktop/tablet: renders as a persistent sidebar with icon-only collapse.
 */
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  Lock,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  Target,
  Wand2,
  Activity,
} from "lucide-react";
import {
  IDEATION_STEP_LABELS,
  IDEATION_STEP_GROUPS,
  IDEATION_STEP_KEYS,
  type IdeationStepKey,
  type IdeationStepStatus,
} from "@shared/ps-ideation-constants";

/** All possible views: workflow steps + 3 support views */
export type ActiveView = IdeationStepKey | "concept" | "wizard_handoff" | "activity";

export const SUPPORT_VIEW_KEYS = ["concept", "wizard_handoff", "activity"] as const;
export type SupportViewKey = (typeof SUPPORT_VIEW_KEYS)[number];

export function isStepView(view: ActiveView): view is IdeationStepKey {
  return (IDEATION_STEP_KEYS as readonly string[]).includes(view);
}

interface StepState {
  stepKey: string;
  stepStatus: string;
}

interface Props {
  steps: StepState[];
  activeView: ActiveView;
  onViewSelect: (view: ActiveView) => void;
  isConverted?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Mobile sheet mode */
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

const SUPPORT_ITEMS: { key: SupportViewKey; label: string; icon: React.ReactNode }[] = [
  { key: "concept", label: "Concept", icon: <Target className="w-4 h-4 shrink-0" /> },
  { key: "wizard_handoff", label: "Wizard Handoff", icon: <Wand2 className="w-4 h-4 shrink-0" /> },
  { key: "activity", label: "Activity", icon: <Activity className="w-4 h-4 shrink-0" /> },
];

function getStepStatus(steps: StepState[], key: string): IdeationStepStatus {
  const s = steps.find((st) => st.stepKey === key);
  return (s?.stepStatus as IdeationStepStatus) || "not_started";
}

/** The rail content — shared between inline and sheet modes */
function RailContent({ steps, activeView, onViewSelect, isConverted, collapsed }: {
  steps: StepState[];
  activeView: ActiveView;
  onViewSelect: (view: ActiveView) => void;
  isConverted?: boolean;
  collapsed?: boolean;
}) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex-1 overflow-y-auto">
        {/* Workflow Steps */}
        {Object.entries(IDEATION_STEP_GROUPS).map(([group, keys]) => (
          <div key={group} className="mb-3">
            {!collapsed && (
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group}
              </div>
            )}
            {collapsed && (
              <div className="flex justify-center py-1">
                <div className="w-5 border-t border-border/50" />
              </div>
            )}
            {keys.map((key) => {
              const status = getStepStatus(steps, key);
              const isActive = activeView === key;
              const icon = isConverted
                ? <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                : (STATUS_ICON[status] || STATUS_ICON.not_started);

              const btn = (
                <button
                  key={key}
                  onClick={() => !isConverted && onViewSelect(key)}
                  disabled={isConverted}
                  className={cn(
                    "flex items-center w-full text-left text-xs transition-colors",
                    collapsed ? "justify-center px-0 py-2" : "gap-2 px-3 py-2",
                    isActive
                      ? "bg-accent text-accent-foreground font-medium"
                      : "hover:bg-accent/50 text-muted-foreground",
                    isConverted && "opacity-60 cursor-not-allowed",
                  )}
                >
                  {icon}
                  {!collapsed && <span className="truncate leading-tight">{IDEATION_STEP_LABELS[key]}</span>}
                </button>
              );

              if (collapsed) {
                return (
                  <Tooltip key={key}>
                    <TooltipTrigger asChild>{btn}</TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">
                      {IDEATION_STEP_LABELS[key]}
                    </TooltipContent>
                  </Tooltip>
                );
              }
              return btn;
            })}
          </div>
        ))}

        {/* Supporting Views separator + items */}
        <div className="mb-3 mt-1 border-t border-border/50 pt-1">
          {!collapsed && (
            <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Supporting Views
            </div>
          )}
          {SUPPORT_ITEMS.map(({ key, label, icon }) => {
            const isActive = activeView === key;
            const btn = (
              <button
                key={key}
                onClick={() => onViewSelect(key)}
                className={cn(
                  "flex items-center w-full text-left text-xs transition-colors",
                  collapsed ? "justify-center px-0 py-2" : "gap-2 px-3 py-2",
                  isActive
                    ? "bg-accent text-accent-foreground font-medium"
                    : "hover:bg-accent/50 text-muted-foreground",
                )}
              >
                {icon}
                {!collapsed && <span className="truncate leading-tight">{label}</span>}
              </button>
            );

            if (collapsed) {
              return (
                <Tooltip key={key}>
                  <TooltipTrigger asChild>{btn}</TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    {label}
                  </TooltipContent>
                </Tooltip>
              );
            }
            return btn;
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}

export function PSIdeationWorkflowRail({
  steps, activeView, onViewSelect, isConverted,
  collapsed, onToggleCollapse,
  mobileSheet, mobileOpen, onMobileClose,
}: Props) {
  // Mobile: render as Sheet drawer
  if (mobileSheet) {
    return (
      <Sheet open={mobileOpen} onOpenChange={(open) => !open && onMobileClose?.()}>
        <SheetContent side="left" className="w-64 p-0 pt-2">
          <SheetHeader className="px-3 pb-2">
            <SheetTitle className="text-sm flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-yellow-500" />
              PS Ideation
            </SheetTitle>
          </SheetHeader>
          <RailContent steps={steps} activeView={activeView} onViewSelect={(view) => { onViewSelect(view); onMobileClose?.(); }} isConverted={isConverted} />
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop/tablet: Carbon Shell sidebar with branded header + icon-only collapse
  return (
    <aside className={cn(
      "flex flex-col border-r bg-card/50 transition-all duration-200 shrink-0",
      collapsed ? "w-12" : "w-52",
    )}>
      {/* Branded header */}
      <div className="flex items-center gap-2 border-b px-3 h-10">
        {!collapsed && (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Lightbulb className="h-4 w-4 shrink-0 text-yellow-500" />
            <span className="text-xs font-semibold truncate">PS Ideation</span>
          </div>
        )}
        {onToggleCollapse && (
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onToggleCollapse}>
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        )}
      </div>

      {/* Rail content */}
      <RailContent
        steps={steps}
        activeView={activeView}
        onViewSelect={onViewSelect}
        isConverted={isConverted}
        collapsed={collapsed}
      />
    </aside>
  );
}
