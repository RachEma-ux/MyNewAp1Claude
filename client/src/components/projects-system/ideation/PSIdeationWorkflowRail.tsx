/**
 * PS Ideation — Workflow Rail (left sidebar)
 *
 * Cloned from PM Central shell pattern (PMProjectSidebar):
 *   - h-full flex col with bg-background
 *   - w-12 collapsed (icon-only with title tooltip) / w-52 expanded
 *   - PanelLeftOpen/PanelLeftClose toggle in bordered header
 *   - ScrollArea wrapping nav items
 *   - NavSection/NavItem pattern matching PM Central exactly
 *
 * Shows the exact 11-step workflow plus 3 support views.
 * On mobile: renders inside a Sheet drawer.
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  CheckCircle2,
  Circle,
  Loader2,
  AlertCircle,
  Lock,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
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
  complete: <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />,
  in_progress: <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin shrink-0" />,
  blocked: <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />,
  not_started: <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />,
};

const SUPPORT_ITEMS: { key: SupportViewKey; label: string; icon: React.ReactNode }[] = [
  { key: "concept", label: "Concept", icon: <Target className="h-3.5 w-3.5" /> },
  { key: "wizard_handoff", label: "Wizard Handoff", icon: <Wand2 className="h-3.5 w-3.5" /> },
  { key: "activity", label: "Activity", icon: <Activity className="h-3.5 w-3.5" /> },
];

function getStepStatus(steps: StepState[], key: string): IdeationStepStatus {
  const s = steps.find((st) => st.stepKey === key);
  return (s?.stepStatus as IdeationStepStatus) || "not_started";
}

// ── NavSection (matches PM Central NavSection) ────────────────────────────────

function NavSection({ label, children, defaultOpen = true, collapsed }: {
  label: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (collapsed) {
    return <div className="py-1">{children}</div>;
  }

  return (
    <div className="py-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        <div className="flex items-center gap-1">
          {open ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
          {label}
        </div>
      </button>
      {open && <div className="mt-0.5">{children}</div>}
    </div>
  );
}

// ── NavItem (matches PM Central NavItem) ──────────────────────────────────────

function StepNavItem({ icon, label, active, collapsed, disabled, onClick }: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  collapsed?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  if (collapsed) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        title={label}
        className={cn(
          "flex items-center justify-center w-full py-1.5 rounded-sm transition-colors relative",
          active
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
          disabled && "opacity-60 cursor-not-allowed",
        )}
      >
        <span className="opacity-70">{icon}</span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-2 w-full px-3 py-1.5 text-xs rounded-sm transition-colors",
        active
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
        disabled && "opacity-60 cursor-not-allowed",
      )}
    >
      <span className="shrink-0 opacity-70">{icon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

// ── Rail content (shared between inline and sheet) ────────────────────────────

function RailContent({ steps, activeView, onViewSelect, isConverted, collapsed }: {
  steps: StepState[];
  activeView: ActiveView;
  onViewSelect: (view: ActiveView) => void;
  isConverted?: boolean;
  collapsed?: boolean;
}) {
  return (
    <div className={collapsed ? "px-1" : ""}>
      {/* Workflow Steps — 4 groups */}
      {Object.entries(IDEATION_STEP_GROUPS).map(([group, keys]) => (
        <NavSection key={group} label={group} collapsed={collapsed}>
          {keys.map((key) => {
            const status = getStepStatus(steps, key);
            const icon = isConverted
              ? <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              : (STATUS_ICON[status] || STATUS_ICON.not_started);

            return (
              <StepNavItem
                key={key}
                icon={icon}
                label={IDEATION_STEP_LABELS[key]}
                active={activeView === key}
                collapsed={collapsed}
                disabled={isConverted}
                onClick={() => !isConverted && onViewSelect(key)}
              />
            );
          })}
        </NavSection>
      ))}

      {/* Supporting Views */}
      <div className="py-1 border-t mt-1">
        {!collapsed && (
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Views
          </div>
        )}
        {SUPPORT_ITEMS.map(({ key, label, icon }) => (
          <StepNavItem
            key={key}
            icon={icon}
            label={label}
            active={activeView === key}
            collapsed={collapsed}
            onClick={() => onViewSelect(key)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

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
              <Lightbulb className="h-4 w-4 text-yellow-500" />
              PS Ideation
            </SheetTitle>
          </SheetHeader>
          <RailContent steps={steps} activeView={activeView} onViewSelect={(view) => { onViewSelect(view); onMobileClose?.(); }} isConverted={isConverted} />
        </SheetContent>
      </Sheet>
    );
  }

  // Desktop/tablet: PM Central shell pattern
  return (
    <div className={cn(
      "border-r bg-background flex flex-col h-full transition-all duration-200 shrink-0",
      collapsed ? "w-12" : "w-56",
    )}>
      {/* Toggle header — matches PM Central */}
      <div className={cn(
        "flex items-center border-b",
        collapsed ? "justify-center py-1.5" : "justify-between px-2 py-1.5",
      )}>
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <Lightbulb className="h-3.5 w-3.5 shrink-0 text-yellow-500" />
            <span className="text-xs font-semibold text-muted-foreground truncate">PS Ideation</span>
          </div>
        )}
        {onToggleCollapse && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 shrink-0"
            onClick={onToggleCollapse}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        )}
      </div>

      {/* Scrollable nav — matches PM Central ScrollArea pattern */}
      <ScrollArea className="flex-1">
        <RailContent
          steps={steps}
          activeView={activeView}
          onViewSelect={onViewSelect}
          isConverted={isConverted}
          collapsed={collapsed}
        />
      </ScrollArea>
    </div>
  );
}
