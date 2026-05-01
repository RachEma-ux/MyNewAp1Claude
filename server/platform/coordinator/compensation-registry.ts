/**
 * Coordinator Compensation Registry
 *
 * Modules register named compensation handlers here so that a workflow's
 * `compensation` step can roll back side effects performed by an earlier
 * step in the same workflow. The coordinator looks up a handler by
 * (module, action) pair and invokes it via the platform lanes.
 *
 * Handlers are owned by their module — the coordinator never imports
 * private internals. A handler typically calls back into its own module
 * via the Module Gateway (so the call still goes through governance and
 * boundary enforcement).
 *
 * If a workflow declares a `compensation` step but no matching handler
 * is registered, the coordinator fails the step explicitly. It does NOT
 * silently no-op — that masking was the bug behind A2 in the PR review.
 */

import type { Workflow, WorkflowStep } from "./types";

export interface CompensationContext {
  workflow: Workflow;
  /** The compensation step itself. */
  step: WorkflowStep;
  /** Steps already completed in this workflow, oldest-first.
   *  Useful when the handler needs to know what to undo. */
  completedSteps: WorkflowStep[];
}

export type CompensationHandler = (
  ctx: CompensationContext,
) => Promise<{ status: "compensated" | "skipped"; details?: unknown }>;

interface RegisteredCompensation {
  module: string;
  action: string;
  handler: CompensationHandler;
}

const registry = new Map<string, RegisteredCompensation>();

function key(module: string, action: string): string {
  return `${module}::${action}`;
}

export interface RegisterCompensationOptions {
  module: string;
  action: string;
  handler: CompensationHandler;
}

/**
 * Register a compensation handler. Idempotent re-registration is
 * tolerated only if the handler reference is the same; otherwise we
 * throw so accidental double-registration is loud.
 */
export function registerCompensationHandler(
  opts: RegisterCompensationOptions,
): void {
  const k = key(opts.module, opts.action);
  const existing = registry.get(k);
  if (existing && existing.handler !== opts.handler) {
    throw new Error(
      `[coordinator] Duplicate compensation handler for ${k}`,
    );
  }
  registry.set(k, opts);
}

export function getCompensationHandler(
  module: string,
  action: string,
): CompensationHandler | undefined {
  return registry.get(key(module, action))?.handler;
}

export function listCompensationHandlers(): Array<{
  module: string;
  action: string;
}> {
  return [...registry.values()].map(({ module, action }) => ({
    module,
    action,
  }));
}

/** Test-only — clears all registered handlers. */
export function __resetCompensationRegistryForTests(): void {
  registry.clear();
}
