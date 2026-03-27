/**
 * PS Ideation — Workspace (center panel)
 *
 * Renders the correct tool panel for the current step.
 */
import type { IdeationStepKey } from "../../../../../server/ps/ps.ideation-types";
import { ContextDefinitionToolPanel } from "./ContextDefinitionToolPanel";
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
}: Props) {
  const payload = getStepPayload(steps, currentStep);
  const disabled = isConverted;

  const saveHandler = (stepKey: string) => async (p: Record<string, unknown>) => {
    await onSaveStep(stepKey, p);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4">
      {currentStep === "context" && (
        <ContextDefinitionToolPanel payload={payload} onSave={saveHandler("context")} disabled={disabled} />
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
    </div>
  );
}
