/**
 * PS Ideation — Workspace (center panel)
 *
 * Renders the correct tool panel for the current step.
 * Includes step-level error boundary and empty/loading states.
 */
import React from "react";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Save,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SaveStatus } from "./PSIdeationMobileBar";
import { IDEATION_STEP_LABELS, type IdeationStepKey } from "@shared/ps-ideation-constants";
import { ContextDefinitionToolPanel } from "./ContextDefinitionToolPanel";
import { ContextTranslatorPanel } from "./ContextTranslatorPanel";
import { ProblemDefinitionToolPanel } from "./ProblemDefinitionToolPanel";
import { OpportunityDefinitionToolPanel } from "./OpportunityDefinitionToolPanel";
import { GuidingWhatIfToolPanel } from "./GuidingWhatIfToolPanel";
import { IdeaGenerationToolPanel } from "./IdeaGenerationToolPanel";
import { ClusteringAndThemingToolPanel } from "./ClusteringAndThemingToolPanel";
import { InitialScreeningToolPanel } from "./InitialScreeningToolPanel";
import { ScenarioExplorationToolPanel } from "./ScenarioExplorationToolPanel";
import { FeasibilityCheckToolPanel } from "./FeasibilityCheckToolPanel";
import { ConceptSelectionToolPanel } from "./ConceptSelectionToolPanel";
import { OnePageSummaryToolPanel } from "./OnePageSummaryToolPanel";

/** Error boundary for individual tool panels — catches render errors gracefully */
class StepErrorBoundary extends React.Component<
  { stepKey: string; children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { stepKey: string; children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidUpdate(prevProps: { stepKey: string }) {
    if (prevProps.stepKey !== this.props.stepKey && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
          <AlertCircle className="w-8 h-8 text-red-500" />
          <p className="text-sm font-medium">Failed to load step panel</p>
          <p className="text-xs text-muted-foreground max-w-md">{this.state.error?.message}</p>
          <Button size="sm" variant="outline" onClick={() => this.setState({ hasError: false, error: null })}>
            Retry
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

interface StepData {
  stepKey: string;
  payloadJson: Record<string, unknown> | null;
}

interface Idea {
  id: number;
  title: string;
  description: string | null;
  themeId: number | null;
  isShortlisted: number;
  isSelected: number;
  rankOrder: number;
}

interface Theme {
  id: number;
  label: string;
  patternNotes: string | null;
  sortOrder: number;
}

const SAVE_DISPLAY: Record<SaveStatus, { label: string; icon: React.ReactNode; className: string }> = {
  idle: { label: "Saved", icon: <CheckCircle2 className="w-3.5 h-3.5" />, className: "text-muted-foreground" },
  saving: { label: "Saving…", icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />, className: "text-blue-500" },
  saved: { label: "Saved", icon: <CheckCircle2 className="w-3.5 h-3.5" />, className: "text-green-500" },
  unsaved: { label: "Unsaved", icon: <Save className="w-3.5 h-3.5" />, className: "text-amber-500" },
  error: { label: "Save failed", icon: <AlertCircle className="w-3.5 h-3.5" />, className: "text-red-500" },
};

interface Props {
  currentStep: IdeationStepKey;
  steps: StepData[];
  ideas: Idea[];
  themes: Theme[];
  scores: any[];
  scenarios: any[];
  checks: any[];
  autoSummary: string | null;
  ideationId: number;
  isConverted: boolean;
  onSaveStep: (stepKey: string, payload: Record<string, unknown>) => Promise<void>;
  onAddIdea: (title: string, description?: string) => Promise<void>;
  onSelectIdea: (ideaId: number) => Promise<void>;
  onUpsertTheme: (label: string, patternNotes?: string) => Promise<void>;
  onAssignIdea: (ideaId: number, themeId: number | null) => Promise<void>;
  onSaveScore: (ideaId: number, criterionKey: string, score: number) => Promise<void>;
  onUpsertScenario: (scenario: any) => Promise<void>;
  onUpsertFeasibility: (check: any) => Promise<void>;
  onPrev: () => void;
  onNext: () => void;
  saveStatus: SaveStatus;
  stepIndex: number;
  stepCount: number;
}

function getStepPayload(steps: StepData[], key: string): Record<string, unknown> | null {
  const s = steps.find((st) => st.stepKey === key);
  return s?.payloadJson || null;
}

export function PSIdeationWorkspace({
  currentStep, steps, ideas, themes, scores, scenarios, checks,
  autoSummary, ideationId, isConverted,
  onSaveStep, onAddIdea, onSelectIdea, onUpsertTheme, onAssignIdea,
  onSaveScore, onUpsertScenario, onUpsertFeasibility,
  onPrev, onNext, saveStatus, stepIndex, stepCount,
}: Props) {
  const payload = getStepPayload(steps, currentStep);
  const disabled = isConverted;
  const hasPrev = stepIndex > 0;
  const hasNext = stepIndex < stepCount - 1;
  const saveDisplay = SAVE_DISPLAY[saveStatus];

  const saveHandler = (stepKey: string) => async (p: Record<string, unknown>) => {
    await onSaveStep(stepKey, p);
  };

  const stepTitle = IDEATION_STEP_LABELS[currentStep] || currentStep;

  return (
    <div className="flex-1 overflow-y-auto p-3 pb-4">
      {/* Step title visible on mobile (header shows it on desktop) */}
      <div className="mb-3 md:hidden">
        <h2 className="text-sm font-medium text-muted-foreground">{stepTitle}</h2>
      </div>
      <StepErrorBoundary stepKey={currentStep}>
        {currentStep === "context" && (
          <>
            <ContextTranslatorPanel ideationId={ideationId} disabled={disabled} />
            <div className="my-4 border-t border-border" />
            <ContextDefinitionToolPanel payload={payload} onSave={saveHandler("context")} disabled={disabled} />
          </>
        )}
        {currentStep === "problem" && (
          <ProblemDefinitionToolPanel payload={payload} onSave={saveHandler("problem")} disabled={disabled} />
        )}
        {currentStep === "opportunity" && (
          <OpportunityDefinitionToolPanel payload={payload} onSave={saveHandler("opportunity")} disabled={disabled} />
        )}
        {currentStep === "guiding_question" && (
          <GuidingWhatIfToolPanel payload={payload} onSave={saveHandler("guiding_question")} disabled={disabled} />
        )}
        {currentStep === "idea_generation" && (
          <IdeaGenerationToolPanel
            payload={payload}
            ideas={ideas}
            onSave={saveHandler("idea_generation")}
            onAddIdea={onAddIdea}
            disabled={disabled}
          />
        )}
        {currentStep === "clustering" && (
          <ClusteringAndThemingToolPanel
            payload={payload}
            themes={themes}
            ideas={ideas}
            onSave={saveHandler("clustering")}
            onUpsertTheme={onUpsertTheme}
            onAssignIdea={onAssignIdea}
            ideationId={ideationId}
            disabled={disabled}
          />
        )}
        {currentStep === "screening" && (
          <InitialScreeningToolPanel
            payload={payload}
            ideas={ideas}
            scores={scores}
            onSave={saveHandler("screening")}
            onSaveScore={onSaveScore}
            disabled={disabled}
          />
        )}
        {currentStep === "scenario_exploration" && (
          <ScenarioExplorationToolPanel
            payload={payload}
            ideas={ideas}
            scenarios={scenarios}
            onSave={saveHandler("scenario_exploration")}
            onUpsertScenario={onUpsertScenario}
            ideationId={ideationId}
            disabled={disabled}
          />
        )}
        {currentStep === "feasibility" && (
          <FeasibilityCheckToolPanel
            payload={payload}
            ideas={ideas}
            checks={checks}
            onSave={saveHandler("feasibility")}
            onUpsertCheck={onUpsertFeasibility}
            ideationId={ideationId}
            disabled={disabled}
          />
        )}
        {currentStep === "concept_selection" && (
          <ConceptSelectionToolPanel
            payload={payload}
            ideas={ideas}
            onSave={saveHandler("concept_selection")}
            onSelectIdea={onSelectIdea}
            disabled={disabled}
          />
        )}
        {currentStep === "one_page_summary" && (
          <OnePageSummaryToolPanel
            payload={payload}
            autoSummary={autoSummary}
            onSave={saveHandler("one_page_summary")}
            disabled={disabled}
          />
        )}
      </StepErrorBoundary>

      {/* ── Step card footer: Previous | Save | Next ─────────────── */}
      <div className="flex items-center justify-between border-t border-border bg-muted/30 rounded-b-lg px-4 py-3 mt-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onPrev}
          disabled={!hasPrev || disabled}
          className="h-9 px-3 gap-1"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="text-sm">Previous</span>
        </Button>

        <div className={`flex items-center gap-1.5 text-xs ${saveDisplay.className}`}>
          {saveDisplay.icon}
          <span>{saveDisplay.label}</span>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={onNext}
          disabled={!hasNext || disabled}
          className="h-9 px-3 gap-1"
        >
          <span className="text-sm">Next</span>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
