/**
 * Coordinator Runtime — drives WorkflowSteps through the platform lanes.
 *
 * The runtime is intentionally minimal. It does NOT import any module
 * internals. It only calls:
 *   - gatewayCall()      from server/platform/modules/module-gateway
 *   - submitHandoff()    from server/platform/handoff
 *   - publishEvent()     from server/platform/events
 *   - subscribeEvent()   from server/platform/events
 *
 * That contract is enforced by `scripts/check-coordinator-boundaries.ts`.
 */

import { randomUUID } from "crypto";
import { gatewayCall } from "../modules/module-gateway";
import { submitHandoff } from "../handoff";
import { publishEvent, subscribeEvent, unsubscribeEvent, makeEnvelope } from "../events";
import { getCompensationHandler } from "./compensation-registry";
import { InMemoryWorkflowStore, type WorkflowStore } from "./store";
import type {
  SubmitWorkflowInput,
  Workflow,
  WorkflowStep,
  WorkflowStatus,
} from "./types";

let _store: WorkflowStore = new InMemoryWorkflowStore();
export function setWorkflowStore(store: WorkflowStore) {
  _store = store;
}

export async function submitWorkflow(input: SubmitWorkflowInput): Promise<Workflow> {
  const now = new Date().toISOString();
  const workflow: Workflow = {
    workflowId: randomUUID(),
    workflowType: input.workflowType,
    workspaceId: input.workspaceId,
    actorId: input.actorId,
    correlationId: input.correlationId ?? randomUUID(),
    status: "running",
    steps: input.steps.map((s) => ({ ...s, status: "pending" })),
    createdAt: now,
    updatedAt: now,
  };
  await _store.insert(workflow);

  // Drive synchronously for the MVP. A worker can pick this up later.
  void runWorkflow(workflow.workflowId).catch((err) => {
    void _store.update(workflow.workflowId, {
      status: "failed",
      failureReason: err instanceof Error ? err.message : String(err),
      completedAt: new Date().toISOString(),
    });
  });

  return workflow;
}

async function runWorkflow(workflowId: string): Promise<void> {
  const wf = await _store.get(workflowId);
  if (!wf) return;
  for (const step of wf.steps) {
    if (step.status !== "pending") continue;
    step.status = "running";
    step.startedAt = new Date().toISOString();
    await _store.update(workflowId, { steps: wf.steps });

    try {
      step.result = await runStep(wf, step);
      step.status = "completed";
      step.completedAt = new Date().toISOString();
    } catch (err) {
      step.status = "failed";
      step.error = err instanceof Error ? err.message : String(err);
      step.completedAt = new Date().toISOString();
      await _store.update(workflowId, {
        steps: wf.steps,
        status: "failed",
        failureReason: step.error,
        completedAt: step.completedAt,
      });
      return;
    }
    await _store.update(workflowId, { steps: wf.steps });
  }
  await _store.update(workflowId, {
    status: "completed",
    completedAt: new Date().toISOString(),
  });
}

async function runStep(wf: Workflow, step: WorkflowStep): Promise<unknown> {
  switch (step.kind) {
    case "gateway-call": {
      if (!step.module || !step.action) throw new Error("gateway-call missing module/action");
      return gatewayCall({
        ctx: {
          sourceModule: "coordinator",
          targetModule: step.module,
          actionKey: step.action,
          workspaceId: wf.workspaceId,
          actorId: wf.actorId,
          correlationId: wf.correlationId,
          governanceReceiptId: step.governanceReceiptId,
        },
        input: step.payload ?? {},
      });
    }
    case "handoff": {
      if (!step.module || !step.action) throw new Error("handoff missing module/action");
      return submitHandoff({
        fromModule: "coordinator",
        toModule: step.module,
        type: step.action,
        payload: step.payload ?? {},
        actorId: wf.actorId,
        workspaceId: wf.workspaceId,
        governanceReceipt: step.governanceReceiptId,
        correlationId: wf.correlationId,
      });
    }
    case "event-publish": {
      if (!step.eventType) throw new Error("event-publish missing eventType");
      const env = makeEnvelope({
        eventType: step.eventType,
        sourceModule: "coordinator",
        priority: "normal",
        workspaceId: wf.workspaceId,
        actorId: wf.actorId,
        correlationId: wf.correlationId,
        payload: step.payload ?? {},
        governanceReceiptId: step.governanceReceiptId,
      });
      await publishEvent(env);
      return { eventId: env.eventId };
    }
    case "wait-for-event": {
      if (!step.eventType) throw new Error("wait-for-event missing eventType");
      return new Promise((resolve, reject) => {
        const consumerKey = `coord:${wf.workflowId}:${step.stepId}`;
        const timer = setTimeout(() => {
          unsubscribeEvent(consumerKey);
          reject(new Error(`wait-for-event '${step.eventType}' timed out`));
        }, 30_000);
        subscribeEvent(step.eventType!, consumerKey, (env) => {
          clearTimeout(timer);
          unsubscribeEvent(consumerKey);
          resolve(env);
        });
      });
    }
    case "compensation": {
      // A2 — explicit compensation: look up a registered handler for
      // (module, action). If none exists, fail the step loudly so a
      // workflow can't silently claim it rolled back when no handler
      // ran. Modules register handlers via
      // `server/platform/coordinator/compensation-registry`.
      if (!step.module || !step.action) {
        throw new Error(
          `compensation step '${step.stepId}' missing module/action`,
        );
      }
      const handler = getCompensationHandler(step.module, step.action);
      if (!handler) {
        throw new Error(
          `No compensation handler registered for '${step.module}::${step.action}'`,
        );
      }
      const completedSteps = wf.steps.filter((s) => s.status === "completed");
      const result = await handler({ workflow: wf, step, completedSteps });
      return result;
    }
    default:
      throw new Error(`Unknown step kind '${(step as any).kind}'`);
  }
}

export async function getWorkflow(id: string): Promise<Workflow | null> {
  return _store.get(id);
}

export async function listWorkflows(filter?: {
  workspaceId?: number | string;
  status?: WorkflowStatus;
}): Promise<Workflow[]> {
  return _store.list(filter);
}

export async function cancelWorkflow(id: string, reason?: string): Promise<void> {
  await _store.update(id, {
    status: "cancelled",
    failureReason: reason,
    completedAt: new Date().toISOString(),
  });
}

/** Test-only — clears in-memory state. */
export function __resetCoordinatorForTests(): void {
  _store = new InMemoryWorkflowStore();
}

/** Get the active store (for test introspection only). */
export function __getWorkflowStoreForTests(): WorkflowStore {
  return _store;
}
