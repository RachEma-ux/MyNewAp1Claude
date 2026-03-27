/**
 * PS Ideation — Shell
 *
 * Composes: Header + WorkflowRail + Workspace + InsightPanel + MobileBar
 * This is the main layout for the PS Ideation detail view.
 *
 * Responsive:
 *   mobile  → drawers (Sheet) + sticky bottom bar
 *   tablet  → collapsible side panels
 *   desktop → persistent rails/panels when space allows
 */
import { useState, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, PanelLeftOpen, PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PSIdeationHeader } from "./PSIdeationHeader";
import { PSIdeationWorkflowRail } from "./PSIdeationWorkflowRail";
import { PSIdeationWorkspace } from "./PSIdeationWorkspace";
import { PSIdeationInsightPanel } from "./PSIdeationInsightPanel";
import { PSIdeationMobileBar, type SaveStatus } from "./PSIdeationMobileBar";
import {
  IDEATION_STEP_KEYS,
  IDEATION_STEP_LABELS,
  type IdeationStepKey,
} from "../../../../../server/ps/ps.ideation-types";

interface Props {
  ideationId: number;
}

/** Simple hook to detect mobile viewport */
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false,
  );
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);
  return isMobile;
}

export function PSIdeationShell({ ideationId }: Props) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const isMobile = useIsMobile();

  // ── Queries ───────────────────────────────────────────────────────────
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

  // ── Mutations ─────────────────────────────────────────────────────────
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const saveStepMut = trpc.ps.ideation.steps.save.useMutation({
    onMutate: () => setSaveStatus("saving"),
    onSuccess: () => {
      invalidateAll();
      setSaveStatus("saved");
      toast.success("Step saved");
      // Reset to idle after 2s
      setTimeout(() => setSaveStatus((s) => s === "saved" ? "idle" : s), 2000);
    },
    onError: (e) => {
      setSaveStatus("error");
      toast.error(e.message);
      setTimeout(() => setSaveStatus((s) => s === "error" ? "idle" : s), 4000);
    },
  });

  const addIdeaMut = trpc.ps.ideation.ideas.add.useMutation({
    onSuccess: () => { invalidateAll(); toast.success("Idea added"); },
    onError: (e) => toast.error(e.message),
  });

  const selectIdeaMut = trpc.ps.ideation.ideas.select.useMutation({
    onSuccess: () => { invalidateAll(); toast.success("Concept selected"); },
    onError: (e) => toast.error(e.message),
  });

  const updateIdeaMut = trpc.ps.ideation.ideas.update.useMutation({
    onSuccess: () => invalidateAll(),
    onError: (e) => toast.error(e.message),
  });

  const upsertThemeMut = trpc.ps.ideation.themes.upsert.useMutation({
    onSuccess: () => { invalidateAll(); toast.success("Theme saved"); },
    onError: (e) => toast.error(e.message),
  });

  const saveScreeningMut = trpc.ps.ideation.screening.save.useMutation({
    onSuccess: () => invalidateAll(),
    onError: (e) => toast.error(e.message),
  });

  const upsertScenarioMut = trpc.ps.ideation.scenarios.upsert.useMutation({
    onSuccess: () => { invalidateAll(); toast.success("Scenario saved"); },
    onError: (e) => toast.error(e.message),
  });

  const upsertFeasibilityMut = trpc.ps.ideation.feasibility.upsert.useMutation({
    onSuccess: () => { invalidateAll(); toast.success("Feasibility check saved"); },
    onError: (e) => toast.error(e.message),
  });

  const setCurrentStepMut = trpc.ps.ideation.setCurrentStep.useMutation({
    onSuccess: () => {
      utils.ps.ideation.getById.invalidate({ id: ideationId });
    },
  });

  const setLifecycleMut = trpc.ps.ideation.setLifecycleStatus.useMutation({
    onSuccess: () => { invalidateAll(); toast.success("Status updated"); },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.ps.ideation.deleteDraft.useMutation({
    onSuccess: () => { toast.success("Ideation deleted"); navigate("/ps/ideation"); },
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

  // ── Derived state ─────────────────────────────────────────────────────
  const currentStepKey = (ideation?.currentStepKey as IdeationStepKey) || "context";
  const isConverted = ideation?.lifecycleStatus === "converted";
  const stepIndex = IDEATION_STEP_KEYS.indexOf(currentStepKey);
  const stepLabel = IDEATION_STEP_LABELS[currentStepKey] || "";
  const completedCount = (steps as any[] || []).filter(
    (s: any) => s.stepStatus === "complete",
  ).length;
  const selectedConcept = ((ideas as any[]) || []).find((i: any) => i.isSelected === 1) || null;

  // ── Panel state ───────────────────────────────────────────────────────
  // Desktop: default expanded for wide screens
  const [railOpen, setRailOpen] = useState(!isMobile);
  const [insightOpen, setInsightOpen] = useState(!isMobile);
  // Mobile drawer state
  const [mobileRailOpen, setMobileRailOpen] = useState(false);
  const [mobileInsightOpen, setMobileInsightOpen] = useState(false);
  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; title: string; description: string; action: () => void; destructive?: boolean;
  }>({ open: false, title: "", description: "", action: () => {} });

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleStepClick = useCallback((stepKey: IdeationStepKey) => {
    setCurrentStepMut.mutate({ id: ideationId, stepKey });
  }, [ideationId]);

  const handleSaveStep = useCallback(async (stepKey: string, payload: Record<string, unknown>) => {
    await saveStepMut.mutateAsync({ ideationId, stepKey, payload });
  }, [ideationId]);

  const handleAddIdea = useCallback(async (title: string, description?: string) => {
    await addIdeaMut.mutateAsync({ ideationId, title, description });
  }, [ideationId]);

  const handleSelectIdea = useCallback(async (ideaId: number) => {
    await selectIdeaMut.mutateAsync({ ideationId, ideaId });
  }, [ideationId]);

  const handleUpsertTheme = useCallback(async (label: string, patternNotes?: string) => {
    await upsertThemeMut.mutateAsync({ ideationId, label, patternNotes });
  }, [ideationId]);

  const handleAssignIdea = useCallback(async (ideaId: number, themeId: number | null) => {
    await updateIdeaMut.mutateAsync({ id: ideaId, themeId });
  }, []);

  const handleSaveScore = useCallback(async (ideaId: number, criterionKey: string, score: number) => {
    await saveScreeningMut.mutateAsync({ ideationId, ideaId, criterionKey, score });
  }, [ideationId]);

  const handleUpsertScenario = useCallback(async (scenario: any) => {
    await upsertScenarioMut.mutateAsync({ ...scenario, ideationId });
  }, [ideationId]);

  const handleUpsertFeasibility = useCallback(async (check: any) => {
    await upsertFeasibilityMut.mutateAsync({ ...check, ideationId });
  }, [ideationId]);

  const handleConvert = useCallback(() => {
    navigate(`/ps/ideation/${ideationId}/convert`);
  }, [ideationId]);

  const handleDelete = useCallback(() => {
    setConfirmDialog({
      open: true,
      title: "Delete Ideation Draft",
      description: "This will permanently delete this ideation draft. This cannot be undone.",
      action: () => deleteMut.mutate({ id: ideationId }),
      destructive: true,
    });
  }, [ideationId]);

  const handleDefer = useCallback(() => {
    setConfirmDialog({
      open: true,
      title: "Defer Ideation",
      description: "This ideation will be marked as deferred. It can be resumed later.",
      action: () => setLifecycleMut.mutate({ id: ideationId, status: "deferred" }),
    });
  }, [ideationId]);

  const handleReject = useCallback(() => {
    setConfirmDialog({
      open: true,
      title: "Reject Ideation",
      description: "This ideation will be marked as rejected. This marks it as abandoned.",
      action: () => setLifecycleMut.mutate({ id: ideationId, status: "rejected" }),
      destructive: true,
    });
  }, [ideationId]);

  const handlePrev = useCallback(() => {
    if (stepIndex > 0) {
      handleStepClick(IDEATION_STEP_KEYS[stepIndex - 1]);
    }
  }, [stepIndex, handleStepClick]);

  const handleNext = useCallback(() => {
    if (stepIndex < IDEATION_STEP_KEYS.length - 1) {
      handleStepClick(IDEATION_STEP_KEYS[stepIndex + 1]);
    }
  }, [stepIndex, handleStepClick]);

  // ── Loading / Not found ───────────────────────────────────────────────
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

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <PSIdeationHeader
        title={ideation.title}
        lifecycleStatus={ideation.lifecycleStatus as any}
        isConverted={isConverted}
        readiness={readiness as any}
        saveStatus={saveStatus}
        stepIndex={stepIndex}
        stepCount={IDEATION_STEP_KEYS.length}
        stepLabel={stepLabel}
        completedCount={completedCount}
        onConvert={handleConvert}
        onDelete={handleDelete}
        onDefer={handleDefer}
        onReject={handleReject}
        deleting={deleteMut.isPending}
      />

      <div className="flex flex-1 min-h-0">
        {/* ── Left rail ────────────────────────────────────────── */}
        {isMobile ? (
          <>
            {/* Mobile: rail icon + sheet drawer */}
            <div className="border-r border-border flex flex-col items-center py-2 px-1">
              <Button variant="ghost" size="sm" onClick={() => setMobileRailOpen(true)} title="Workflow steps" className="h-7 w-7 p-0">
                <PanelLeftOpen className="w-4 h-4" />
              </Button>
            </div>
            <PSIdeationWorkflowRail
              steps={(steps as any[]) || []}
              currentStep={currentStepKey}
              onStepClick={handleStepClick}
              isConverted={isConverted}
              mobileSheet
              mobileOpen={mobileRailOpen}
              onMobileClose={() => setMobileRailOpen(false)}
            />
          </>
        ) : (
          <>
            {/* Desktop/tablet: collapsible inline rail */}
            {!railOpen ? (
              <div className="border-r border-border flex flex-col items-center py-2 px-1">
                <Button variant="ghost" size="sm" onClick={() => setRailOpen(true)} title="Show workflow steps" className="h-7 w-7 p-0">
                  <PanelLeftOpen className="w-4 h-4" />
                </Button>
              </div>
            ) : (
              <PSIdeationWorkflowRail
                steps={(steps as any[]) || []}
                currentStep={currentStepKey}
                onStepClick={handleStepClick}
                isConverted={isConverted}
                onCollapse={() => setRailOpen(false)}
              />
            )}
          </>
        )}

        {/* ── Center canvas ────────────────────────────────────── */}
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

        {/* ── Right insight panel ──────────────────────────────── */}
        {isMobile ? (
          <>
            {/* Mobile: insight icon + sheet drawer */}
            <div className="border-l border-border flex flex-col items-center py-2 px-1">
              <Button variant="ghost" size="sm" onClick={() => setMobileInsightOpen(true)} title="Insights" className="h-7 w-7 p-0">
                <PanelRightOpen className="w-4 h-4" />
              </Button>
            </div>
            <PSIdeationInsightPanel
              readiness={readiness as any}
              activity={(activity as any[]) || []}
              steps={(steps as any[]) || []}
              lifecycleStatus={ideation.lifecycleStatus as any}
              selectedConcept={selectedConcept}
              isConverted={isConverted}
              onConvert={handleConvert}
              mobileSheet
              mobileOpen={mobileInsightOpen}
              onMobileClose={() => setMobileInsightOpen(false)}
            />
          </>
        ) : (
          <>
            {insightOpen ? (
              <PSIdeationInsightPanel
                readiness={readiness as any}
                activity={(activity as any[]) || []}
                steps={(steps as any[]) || []}
                lifecycleStatus={ideation.lifecycleStatus as any}
                selectedConcept={selectedConcept}
                isConverted={isConverted}
                onConvert={handleConvert}
                onCollapse={() => setInsightOpen(false)}
              />
            ) : (
              <div className="border-l border-border flex flex-col items-center py-2 px-1">
                <Button variant="ghost" size="sm" onClick={() => setInsightOpen(true)} title="Show insights" className="h-7 w-7 p-0">
                  <PanelRightOpen className="w-4 h-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Mobile sticky action bar ─────────────────────────── */}
      {isMobile && (
        <PSIdeationMobileBar
          currentStep={currentStepKey}
          saveStatus={saveStatus}
          readinessReady={!!(readiness as any)?.ready}
          isConverted={isConverted}
          onPrev={handlePrev}
          onNext={handleNext}
          onSave={() => {}} // Steps save via their own Save buttons
          onWizard={handleConvert}
        />
      )}

      {/* ── Confirmation dialog ─────────────────────────────── */}
      <AlertDialog open={confirmDialog.open} onOpenChange={(open) => !open && setConfirmDialog((d) => ({ ...d, open: false }))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDialog.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { confirmDialog.action(); setConfirmDialog((d) => ({ ...d, open: false })); }}
              className={confirmDialog.destructive ? "bg-red-600 hover:bg-red-700" : ""}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
