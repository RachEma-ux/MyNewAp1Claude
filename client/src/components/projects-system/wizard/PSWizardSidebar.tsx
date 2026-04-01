/**
 * PS Wizard — Sidebar (step progress rail)
 *
 * Cloned from PSIdeationWorkflowRail / PM Central shell pattern.
 * 11 steps in 4 phase groups, icon-only collapsed (w-12) / full expanded (w-56).
 * Shows completed / active / locked status per step.
 */
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Circle,
  Lock,
  Play,
  ClipboardList,
  SearchCode,
  HelpCircle,
  BarChart3,
  Eye,
  ThumbsUp,
  Handshake,
  PlusCircle,
  Shield,
  Building2,
  MessageSquare,
  Wand2,
} from "lucide-react";

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

interface StepDef {
  step: WizardStep;
  label: string;
  icon: React.ReactNode;
}

const WIZARD_PHASES: { label: string; steps: StepDef[] }[] = [
  {
    label: "Intake",
    steps: [
      { step: 1, label: "Intake", icon: <ClipboardList className="h-3.5 w-3.5" /> },
      { step: 2, label: "Analysis", icon: <SearchCode className="h-3.5 w-3.5" /> },
    ],
  },
  {
    label: "Classification",
    steps: [
      { step: 3, label: "Questions", icon: <HelpCircle className="h-3.5 w-3.5" /> },
      { step: 4, label: "Scoring", icon: <BarChart3 className="h-3.5 w-3.5" /> },
    ],
  },
  {
    label: "Decision",
    steps: [
      { step: 5, label: "Explainability", icon: <Eye className="h-3.5 w-3.5" /> },
      { step: 6, label: "Recommendation", icon: <ThumbsUp className="h-3.5 w-3.5" /> },
      { step: 7, label: "Accept", icon: <Handshake className="h-3.5 w-3.5" /> },
    ],
  },
  {
    label: "Execution",
    steps: [
      { step: 8, label: "Create", icon: <PlusCircle className="h-3.5 w-3.5" /> },
      { step: 9, label: "Validation", icon: <Shield className="h-3.5 w-3.5" /> },
      { step: 10, label: "PM Central", icon: <Building2 className="h-3.5 w-3.5" /> },
      { step: 11, label: "Feedback", icon: <MessageSquare className="h-3.5 w-3.5" /> },
    ],
  },
];

interface Props {
  currentStep: WizardStep;
  onStepSelect: (step: WizardStep) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

// ── NavSection ────────────────────────────────────────────────────────

function NavSection({
  label,
  children,
  defaultOpen = true,
  collapsed,
}: {
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

// ── StepNavItem ───────────────────────────────────────────────────────

function StepNavItem({
  icon,
  statusIcon,
  label,
  active,
  collapsed,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  statusIcon: React.ReactNode;
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
          disabled && "opacity-40 cursor-not-allowed",
        )}
      >
        <span className="opacity-70">{statusIcon}</span>
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
        disabled && "opacity-40 cursor-not-allowed",
      )}
    >
      <span className="shrink-0 opacity-70">{statusIcon}</span>
      <span className="truncate">{label}</span>
    </button>
  );
}

// ── Main export ───────────────────────────────────────────────────────

export function PSWizardSidebar({
  currentStep,
  onStepSelect,
  collapsed,
  onToggleCollapse,
}: Props) {
  function getStatusIcon(stepNum: WizardStep, defaultIcon: React.ReactNode) {
    if (stepNum < currentStep) {
      return <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />;
    }
    if (stepNum === currentStep) {
      return <Play className="h-3.5 w-3.5 text-blue-500 shrink-0" />;
    }
    return <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
  }

  return (
    <div
      className={cn(
        "border-r bg-background flex flex-col h-full transition-all duration-200 shrink-0",
        collapsed ? "w-12" : "w-56",
      )}
    >
      {/* Toggle header */}
      <div
        className={cn(
          "flex items-center border-b",
          collapsed ? "justify-center py-1.5" : "justify-between px-2 py-1.5",
        )}
      >
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <Wand2 className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
            <span className="text-xs font-semibold text-muted-foreground truncate">
              PS Wizard
            </span>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 shrink-0"
          onClick={onToggleCollapse}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Scrollable nav */}
      <ScrollArea className="flex-1">
        <div className={collapsed ? "px-1" : ""}>
          {WIZARD_PHASES.map((phase) => (
            <NavSection key={phase.label} label={phase.label} collapsed={collapsed}>
              {phase.steps.map((s) => (
                <StepNavItem
                  key={s.step}
                  icon={s.icon}
                  statusIcon={getStatusIcon(s.step, s.icon)}
                  label={`${s.step}. ${s.label}`}
                  active={currentStep === s.step}
                  collapsed={collapsed}
                  disabled={s.step > currentStep}
                  onClick={() => {
                    if (s.step <= currentStep) onStepSelect(s.step);
                  }}
                />
              ))}
            </NavSection>
          ))}
        </div>
      </ScrollArea>

      {/* Step counter footer */}
      <div className="border-t px-2 py-1.5 text-center">
        <span className="text-[10px] text-muted-foreground font-mono">
          {collapsed ? `${currentStep}/11` : `Step ${currentStep} of 11`}
        </span>
      </div>
    </div>
  );
}
