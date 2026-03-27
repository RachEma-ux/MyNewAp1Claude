/**
 * PS Ideation — Shell
 *
 * Composes: Header + WorkflowRail + Workspace + InsightPanel
 * This is the main layout for the PS Ideation detail view.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PSIdeationHeader } from "./PSIdeationHeader";
import { PSIdeationWorkflowRail } from "./PSIdeationWorkflowRail";
import { PSIdeationWorkspace } from "./PSIdeationWorkspace";
import { PSIdeationInsightPanel } from "./PSIdeationInsightPanel";
import type { IdeationStepKey } from "../../../../../server/ps/ps.ideation-types";

interface Props {
  ideationId: number;
}

export function PSIdeationShell({ ideationId }: Props) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  // Queries
  const { data: ideation, isLoading } = trpc.ps.ideation.getById.useQuery(
    { id: ideationId },
    { enabled: !!ideationId },
  );

  const { data: steps } = trpc.ps.ideation.steps.get.useQuery(
    { ideationId },
    { enabled: !!ideationId },
  );

  const { data: ideas } = trpc.ps.ideation.ideas.list.useQuery(
    { ideationId },
    { enabled: !!ideationId },
  );

  const { data: themes } = trpc.ps.ideation.themes.list.useQuery(
    { ideationId },
    { enabled: !!ideationId },
  );

  const { data: readiness } = trpc.ps.ideation.readiness.evaluate.useQuery(
    { ideationId },
    { enabled: !!ideationId },
  );

  const { data: scores } = trpc.ps.ideation.screening.list.useQuery(
    { ideationId },
    { enabled: !!ideationId },
  );

  const { data: scenarios } = trpc.ps.ideation.scenarios.list.useQuery(
    { ideationId },
    { enabled: !!ideationId },
  );

  const { data: checks } = trpc.ps.ideation.feasibility.list.useQuery(
    { ideationId },
    { enabled: !!ideationId },
  );

  const { data: activity } = trpc.ps.ideation.activity.useQuery(
    { ideationId },
    { enabled: !!ideationId },
  );

  // Mutations
  const saveStepMut = trpc.ps.ideation.steps.save.useMutation({
    onSuccess: () => {
      invalidateAll();
      toast.success("Step saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const addIdeaMut = trpc.ps.ideation.ideas.add.useMutation({
    onSuccess: () => {
      invalidateAll();
      toast.success("Idea added");
    },
    onError: (e) => toast.error(e.message),
  });

  const selectIdeaMut = trpc.ps.ideation.ideas.select.useMutation({
    onSuccess: () => {
      invalidateAll();
      toast.success("Concept selected");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateIdeaMut = trpc.ps.ideation.ideas.update.useMutation({
    onSuccess: () => invalidateAll(),
    onError: (e) => toast.error(e.message),
  });

  const upsertThemeMut = trpc.ps.ideation.themes.upsert.useMutation({
    onSuccess: () => {
      invalidateAll();
      toast.success("Theme saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const saveScreeningMut = trpc.ps.ideation.screening.save.useMutation({
    onSuccess: () => invalidateAll(),
    onError: (e) => toast.error(e.message),
  });

  const upsertScenarioMut = trpc.ps.ideation.scenarios.upsert.useMutation({
    onSuccess: () => {
      invalidateAll();
      toast.success("Scenario saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const upsertFeasibilityMut = trpc.ps.ideation.feasibility.upsert.useMutation({
    onSuccess: () => {
      invalidateAll();
      toast.success("Feasibility check saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const setCurrentStepMut = trpc.ps.ideation.setCurrentStep.useMutation({
    onSuccess: () => {
      utils.ps.ideation.getById.invalidate({ id: ideationId });
    },
  });

  const deleteMut = trpc.ps.ideation.deleteDraft.useMutation({
    onSuccess: () => {
      toast.success("Ideation deleted");
      navigate("/ps/ideation");
    },
    onError: (e) => toast.error(e.message),
  });

  function invalidateAll() {
    utils.ps.ideation.getById.invalidate({ id: ideationId });
    utils.ps.ideation.steps.get.invalidate({ ideationId });
    utils.ps.ideation.ideas.list.invalidate({ ideationId });
    utils.ps.ideation.themes.list.invalidate({ ideationId });
    utils.ps.ideation.screening.list.invalidate({ ideationId });
    utils.ps.ideation.scenarios.list.invalidate({ ideationId });
    utils.ps.ideation.feasibility.list.invalidate({ ideationId });
    utils.ps.ideation.readiness.evaluate.invalidate({ ideationId });
    utils.ps.ideation.activity.invalidate({ ideationId });
  }

  // Local state
  const currentStepKey = (ideation?.currentStepKey as IdeationStepKey) || "context";
  const isConverted = ideation?.lifecycleStatus === "converted";
  const [railOpen, setRailOpen] = useState(false);
  const [insightOpen, setInsightOpen] = useState(false);

  const handleStepClick = (stepKey: IdeationStepKey) => {
    setCurrentStepMut.mutate({ id: ideationId, stepKey });
  };

  const handleSaveStep = async (stepKey: string, payload: Record<string, unknown>) => {
    await saveStepMut.mutateAsync({ ideationId, stepKey, payload });
  };

  const handleAddIdea = async (title: string, description?: string) => {
    await addIdeaMut.mutateAsync({ ideationId, title, description });
  };

  const handleSelectIdea = async (ideaId: number) => {
    await selectIdeaMut.mutateAsync({ ideationId, ideaId });
  };

  const handleUpsertTheme = async (label: string, patternNotes?: string) => {
    await upsertThemeMut.mutateAsync({ ideationId, label, patternNotes });
  };

  const handleAssignIdea = async (ideaId: number, themeId: number | null) => {
    await updateIdeaMut.mutateAsync({ id: ideaId, themeId });
  };

  const handleSaveScore = async (ideaId: number, criterionKey: string, score: number) => {
    await saveScreeningMut.mutateAsync({ ideationId, ideaId, criterionKey, score });
  };

  const handleUpsertScenario = async (scenario: any) => {
    await upsertScenarioMut.mutateAsync({ ...scenario, ideationId });
  };

  const handleUpsertFeasibility = async (check: any) => {
    await upsertFeasibilityMut.mutateAsync({ ...check, ideationId });
  };

  const handleConvert = () => {
    navigate(`/ps/ideation/${ideationId}/convert`);
  };

  const handleDelete = () => {
    if (confirm("Delete this ideation draft? This cannot be undone.")) {
      deleteMut.mutate({ id: ideationId });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!ideation) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Ideation not found.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PSIdeationHeader
        title={ideation.title}
        lifecycleStatus={ideation.lifecycleStatus as any}
        isConverted={isConverted}
        readiness={readiness as any}
        onConvert={handleConvert}
        onDelete={handleDelete}
        deleting={deleteMut.isPending}
      />
      <div className="flex flex-1 min-h-0">
        {/* Left rail toggle */}
        {!railOpen && (
          <div className="border-r border-border flex flex-col items-center py-2 px-1">
            <Button variant="ghost" size="sm" onClick={() => setRailOpen(true)} title="Show workflow steps">
              <PanelLeftOpen className="w-4 h-4" />
            </Button>
          </div>
        )}
        {railOpen && (
          <PSIdeationWorkflowRail
            steps={(steps as any[]) || []}
            currentStep={currentStepKey}
            onStepClick={handleStepClick}
            isConverted={isConverted}
            onCollapse={() => setRailOpen(false)}
          />
        )}
        <PSIdeationWorkspace
          currentStep={currentStepKey}
          steps={(steps as any[]) || []}
          ideas={(ideas as any[]) || []}
          themes={(themes as any[]) || []}
          scores={(scores as any[]) || []}
          scenarios={(scenarios as any[]) || []}
          checks={(checks as any[]) || []}
          autoSummary={ideation.summaryGeneratedText || null}
          ideationId={ideationId}
          isConverted={isConverted}
          onSaveStep={handleSaveStep}
          onAddIdea={handleAddIdea}
          onSelectIdea={handleSelectIdea}
          onUpsertTheme={handleUpsertTheme}
          onAssignIdea={handleAssignIdea}
          onSaveScore={handleSaveScore}
          onUpsertScenario={handleUpsertScenario}
          onUpsertFeasibility={handleUpsertFeasibility}
        />
        {/* Right insight panel toggle */}
        {insightOpen ? (
          <PSIdeationInsightPanel
            readiness={readiness as any}
            activity={(activity as any[]) || []}
            onCollapse={() => setInsightOpen(false)}
          />
        ) : (
          <div className="border-l border-border flex flex-col items-center py-2 px-1">
            <Button variant="ghost" size="sm" onClick={() => setInsightOpen(true)} title="Show insights">
              <PanelLeftClose className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
