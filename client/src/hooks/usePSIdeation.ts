/**
 * PS Ideation — React Hook
 *
 * Provides typed access to all PS Ideation tRPC procedures.
 */

import { trpc } from "@/lib/trpc";

export function usePSIdeation(workspaceId: number) {
  const utils = trpc.useUtils();

  // Queries
  const listQuery = trpc.ps.ideation.list.useQuery(
    { workspaceId },
    { enabled: !!workspaceId },
  );

  // Mutations with cache invalidation
  const createMut = trpc.ps.ideation.create.useMutation({
    onSuccess: () => utils.ps.ideation.list.invalidate(),
  });

  const updateMetaMut = trpc.ps.ideation.updateMeta.useMutation({
    onSuccess: () => {
      utils.ps.ideation.list.invalidate();
      utils.ps.ideation.getById.invalidate();
    },
  });

  const deleteDraftMut = trpc.ps.ideation.deleteDraft.useMutation({
    onSuccess: () => utils.ps.ideation.list.invalidate(),
  });

  const setCurrentStepMut = trpc.ps.ideation.setCurrentStep.useMutation({
    onSuccess: () => utils.ps.ideation.getById.invalidate(),
  });

  const setLifecycleMut = trpc.ps.ideation.setLifecycleStatus.useMutation({
    onSuccess: () => {
      utils.ps.ideation.list.invalidate();
      utils.ps.ideation.getById.invalidate();
    },
  });

  return {
    ideations: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    create: createMut,
    updateMeta: updateMetaMut,
    deleteDraft: deleteDraftMut,
    setCurrentStep: setCurrentStepMut,
    setLifecycle: setLifecycleMut,
  };
}

export function usePSIdeationDetail(id: number) {
  const utils = trpc.useUtils();

  const detailQuery = trpc.ps.ideation.getById.useQuery(
    { id },
    { enabled: !!id },
  );

  const stepsQuery = trpc.ps.ideation.steps.get.useQuery(
    { ideationId: id },
    { enabled: !!id },
  );

  const ideasQuery = trpc.ps.ideation.ideas.list.useQuery(
    { ideationId: id },
    { enabled: !!id },
  );

  const themesQuery = trpc.ps.ideation.themes.list.useQuery(
    { ideationId: id },
    { enabled: !!id },
  );

  const readinessQuery = trpc.ps.ideation.readiness.evaluate.useQuery(
    { ideationId: id },
    { enabled: !!id },
  );

  const saveStepMut = trpc.ps.ideation.steps.save.useMutation({
    onSuccess: () => {
      utils.ps.ideation.steps.get.invalidate();
      utils.ps.ideation.getById.invalidate();
      utils.ps.ideation.readiness.evaluate.invalidate();
    },
  });

  const addIdeaMut = trpc.ps.ideation.ideas.add.useMutation({
    onSuccess: () => utils.ps.ideation.ideas.list.invalidate(),
  });

  const selectIdeaMut = trpc.ps.ideation.ideas.select.useMutation({
    onSuccess: () => {
      utils.ps.ideation.ideas.list.invalidate();
      utils.ps.ideation.getById.invalidate();
      utils.ps.ideation.readiness.evaluate.invalidate();
    },
  });

  return {
    ideation: detailQuery.data,
    steps: stepsQuery.data ?? [],
    ideas: ideasQuery.data ?? [],
    themes: themesQuery.data ?? [],
    readiness: readinessQuery.data,
    isLoading: detailQuery.isLoading,
    saveStep: saveStepMut,
    addIdea: addIdeaMut,
    selectIdea: selectIdeaMut,
    invalidate: () => {
      utils.ps.ideation.getById.invalidate();
      utils.ps.ideation.steps.get.invalidate();
      utils.ps.ideation.ideas.list.invalidate();
      utils.ps.ideation.readiness.evaluate.invalidate();
    },
  };
}
