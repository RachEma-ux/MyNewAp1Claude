/**
 * Central Coordinator — public entry point.
 *
 * Important: the legacy `server/orchestrator/` operator runtime continues
 * to exist for the auditor/governance/builder/deploy operators. The
 * coordinator is the cross-module workflow driver; the orchestrator is
 * the per-operator job runner. The coordinator may eventually delegate
 * to the orchestrator via gateway-call, but never imports it directly.
 */
export * from "./types";
export {
  submitWorkflow,
  getWorkflow,
  listWorkflows,
  cancelWorkflow,
  setWorkflowStore,
  __resetCoordinatorForTests,
  __getWorkflowStoreForTests,
} from "./runtime";
export {
  registerCompensationHandler,
  getCompensationHandler,
  listCompensationHandlers,
  __resetCompensationRegistryForTests,
} from "./compensation-registry";
export type {
  CompensationContext,
  CompensationHandler,
  RegisterCompensationOptions,
} from "./compensation-registry";
export {
  InMemoryWorkflowStore,
  DbWorkflowStoreNotConfigured,
  type WorkflowStore,
} from "./store";
