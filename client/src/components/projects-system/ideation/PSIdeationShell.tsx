/**
 * PS Ideation — Shell (IBM Carbon pattern)
 *
 * Composes: Header + WorkflowRail (left sidebar) + Center Canvas + Status Bar
 *
 * Carbon Shell elements:
 *   - Branded sidebar header with icon + title + collapse toggle
 *   - Icon-only collapsed state (w-12) instead of full hide
 *   - Persistent status bar footer with live stats
 *
 * Single-sidebar architecture:
 *   Left sidebar = workflow steps + Concept + Wizard Handoff + Activity
 *   Center canvas = active content (step tool panel or support view)
 *   Step navigation = in-card footer (Previous | Save | Next)
 *
 * Responsive:
 *   mobile  → left drawer (Sheet) + in-card footer navigation
 *   tablet  → collapsible left sidebar (icon-only)
 *   desktop → persistent left sidebar
 */
import { useState, useCallback, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PSIdeationHeader } from "./PSIdeationHeader";
import { PSIdeationWorkflowRail, isStepView, type ActiveView } from "./PSIdeationWorkflowRail";
import { PSIdeationWorkspace } from "./PSIdeationWorkspace";
import { PSIdeationConceptView } from "./PSIdeationConceptView";
import { PSIdeationWizardHandoffView } from "./PSIdeationWizardHandoffView";
import { PSIdeationActivityView } from "./PSIdeationActivityView";
import type { SaveStatus } from "./PSIdeationMobileBar";
import { PSIdeationChatWindow } from "./PSIdeationChatWindow";
import {
  IDEATION_STEP_KEYS,
  IDEATION_STEP_LABELS,
  type IdeationStepKey,
} from "@shared/ps-ideation-constants";

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

// ── Status Bar ────────────────────────────────────────────────────────────────

const STATUS_COLORS_SB: Record<string, string> = {
  draft: "text-gray-400",
  in_exploration: "text-blue-400",
  screening: "text-amber-400",
  concept_selected: "text-purple-400",
  ready_for_wizard: "text-green-400",
  deferred: "text-orange-400",
  rejected: "text-red-400",
  converted: "text-indigo-400",
};

const STATUS_LABELS_SB: Record<string, string> = {
  draft: "Draft",
  in_exploration: "Exploring",
  screening: "Screening",
  concept_selected: "Concept Selected",
  ready_for_wizard: "Ready",
  deferred: "Deferred",
  rejected: "Rejected",
  converted: "Converted",
};

function PSIdeationStatusBar({
  lifecycleStatus,
  stepIndex,
  stepCount,
  completedCount,
  ideaCount,
  conceptName,
}: {
  lifecycleStatus: string;
  stepIndex: number;
  stepCount: number;
  completedCount: number;
  ideaCount: number;
  conceptName: string | null;
}) {
  return (
    <div className="flex items-center justify-between border-t bg-card/50 px-4 h-7 text-xs text-muted-foreground shrink-0">
      <div className="flex items-center gap-4">
        <span className="font-mono text-yellow-500">PS Ideation</span>
        <span>Step {stepIndex + 1}/{stepCount}</span>
        <span>{completedCount} complete</span>
        {ideaCount > 0 && <span>{ideaCount} ideas</span>}
      </div>
      <div className="flex items-center gap-3">
        {conceptName && (
          <span className="truncate max-w-[200px]">Concept: {conceptName}</span>
        )}
        <div className="flex items-center gap-1">
          <div className={cn(
            "h-1.5 w-1.5 rounded-full",
            lifecycleStatus === "converted" ? "bg-indigo-500" :
            lifecycleStatus === "ready_for_wizard" ? "bg-green-500" :
            lifecycleStatus === "rejected" ? "bg-red-500" :
            lifecycleStatus === "deferred" ? "bg-orange-500" :
            "bg-yellow-500"
          )} />
          <span className={STATUS_COLORS_SB[lifecycleStatus] || "text-muted-foreground"}>
            {STATUS_LABELS_SB[lifecycleStatus] || lifecycleStatus}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Main Shell ────────────────────────────────────────────────────────────────

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

  // Maestro chat — available AI agents from catalog
  const { data: availableAgents } = trpc.catalogManage.available.useQuery(
    { entryType: "agent" },
  );

  // Map catalog entries to the CatalogImport shape expected by MaestroChatWindow
  const catalogImports = useMemo(() => {
    if (!availableAgents) return [];
    return availableAgents.map((e: any) => ({
      id: e.id,
      catalogEntryId: e.id,
      entryType: e.sourceType,
      name: e.displayName || e.name,
      description: e.description || "",
      category: e.category || "",
      tags: e.tags || [],
      config: e.metadata?.config || {},
      status: e.status || "active",
      importedAt: new Date(),
    }));
  }, [availableAgents]);

  // ── Mutations ─────────────────────────────────────────────────────────
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const saveStepMut = trpc.ps.ideation.steps.save.useMutation({
    onMutate: () => setSaveStatus("saving"),
    onSuccess: () => {
      invalidateAll();
      setSaveStatus("saved");
      toast.success("Step saved");
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

  const duplicateMut = trpc.ps.ideation.duplicate.useMutation({
    onSuccess: (data) => {
      toast.success("Ideation duplicated");
      navigate(`/ps/ideation/${data.id}`);
    },
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
  const ideaCount = ((ideas as any[]) || []).length;

  // ── View state (local — support views are not persisted) ──────────────
  const [activeView, setActiveView] = useState<ActiveView>(currentStepKey);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileRailOpen, setMobileRailOpen] = useState(false);

  // Sync activeView when server step changes (e.g. on initial load)
  useEffect(() => {
    if (currentStepKey && isStepView(activeView)) {
      setActiveView(currentStepKey);
    }
  }, [currentStepKey]);

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; title: string; description: string; action: () => void; destructive?: boolean;
  }>({ open: false, title: "", description: "", action: () => {} });

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleViewSelect = useCallback((view: ActiveView) => {
    setActiveView(view);
    // Only persist to server when selecting a workflow step
    if (isStepView(view)) {
      setCurrentStepMut.mutate({ id: ideationId, stepKey: view });
    }
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

  const handleDuplicate = useCallback(() => {
    duplicateMut.mutate({ id: ideationId, carryPayloads: true });
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
      handleViewSelect(IDEATION_STEP_KEYS[stepIndex - 1]);
    }
  }, [stepIndex, handleViewSelect]);

  const handleNext = useCallback(() => {
    if (stepIndex < IDEATION_STEP_KEYS.length - 1) {
      handleViewSelect(IDEATION_STEP_KEYS[stepIndex + 1]);
    }
  }, [stepIndex, handleViewSelect]);

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

  // ── Center canvas content resolver ────────────────────────────────────
  function renderCenterCanvas() {
    if (isStepView(activeView)) {
      return (
        <PSIdeationWorkspace
          currentStep={activeView}
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
          onPrev={handlePrev}
          onNext={handleNext}
          onApplied={invalidateAll}
          saveStatus={saveStatus}
          stepIndex={stepIndex}
          stepCount={IDEATION_STEP_KEYS.length}
        />
      );
    }

    if (activeView === "concept") {
      return (
        <div className="flex-1 overflow-y-auto p-4">
          <PSIdeationConceptView
            selectedConcept={selectedConcept}
            lifecycleStatus={ideation.lifecycleStatus as any}
            rationaleSummary={ideation.rationaleSummary || null}
            problemSnapshot={ideation.problemStatementSnapshot || null}
            opportunitySnapshot={ideation.opportunityStatementSnapshot || null}
            guidingQuestionSnapshot={ideation.guidingQuestionSnapshot || null}
          />
        </div>
      );
    }

    if (activeView === "wizard_handoff") {
      return (
        <div className="flex-1 overflow-y-auto p-4">
          <PSIdeationWizardHandoffView
            ideationId={ideationId}
            readiness={readiness as any}
            isConverted={isConverted}
            onConvert={handleConvert}
          />
        </div>
      );
    }

    if (activeView === "activity") {
      return (
        <div className="flex-1 overflow-y-auto p-4">
          <PSIdeationActivityView activity={(activity as any[]) || []} />
        </div>
      );
    }

    return null;
  }

  // ── Render ────────────────────────────────────────────────────────────
  // Returns Fragment — parent (PSIdeationDetailPage) provides the flex wrapper
  // cloned from PmCentralSidebarLayout pattern.
  return (
    <>
      {/* Sidebar — always collapsed on mobile, same as PM Central */}
      <PSIdeationWorkflowRail
        steps={(steps as any[]) || []}
        activeView={activeView}
        onViewSelect={handleViewSelect}
        isConverted={isConverted}
        collapsed={isMobile || sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
      />

      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        <PSIdeationHeader
          title={ideation.title}
          sourceType={ideation.sourceType}
          lifecycleStatus={ideation.lifecycleStatus as any}
          isConverted={isConverted}
          readiness={readiness as any}
          saveStatus={saveStatus}
          stepIndex={stepIndex}
          stepCount={IDEATION_STEP_KEYS.length}
          stepLabel={stepLabel}
          completedCount={completedCount}
          onConvert={handleConvert}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onDefer={handleDefer}
          onReject={handleReject}
          deleting={deleteMut.isPending}
          duplicating={duplicateMut.isPending}
        />

        <div className="flex-1 min-h-0 overflow-y-auto">
          {renderCenterCanvas()}
        </div>

        <PSIdeationStatusBar
          lifecycleStatus={ideation.lifecycleStatus}
          stepIndex={stepIndex}
          stepCount={IDEATION_STEP_KEYS.length}
          completedCount={completedCount}
          ideaCount={ideaCount}
          conceptName={selectedConcept?.title || null}
        />
      </div>

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

      {/* PS Ideation AI Chat — floating FAB */}
      <PSIdeationChatWindow catalogImports={catalogImports} />
    </>
  );
}
