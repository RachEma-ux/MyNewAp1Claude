/**
 * Sandbox WF Module Manifest
 *
 * Runtime: worker — owns wfdb, executor, scheduler.
 */

import type { ModuleManifest } from "../platform/modules/types";
import { sandboxWfRouter } from "./router";
import { dbPingHealth } from "../platform/modules/health";
import { registerModuleHealthAction } from "../platform/modules/register-module-health-action";
import { registerHandoffAcceptor } from "../platform/handoff";

export const sandboxWfManifest: ModuleManifest = {
  key: "sandboxWf",
  name: "Sandbox WF",
  version: "1.0.0",

  runtime: { mode: "worker", required: false },

  database: {
    kind: "owned",
    key: "wfdb",
    connect: async () => {
      const { getWfDb } = await import("./connection");
      return getWfDb();
    },
  },

  router: sandboxWfRouter,
  routerKey: "sandboxWf",

  permissions: {
    keys: ["sandboxWf.read", "sandboxWf.write", "sandboxWf.run"],
  },

  governanceActions: [
    {
      key: "sandboxWf.workflow.publish",
      description: "Publish a workflow",
      risk: "medium",
      receiptRequired: true,
    },
    {
      key: "sandboxWf.execute",
      description: "Execute a workflow",
      risk: "medium",
      receiptRequired: true,
    },
  ],

  routes: [{ path: "/workflows", label: "Workflows" }],
  navigation: [{ group: "build", label: "Workflows", order: 12 }],

  boot: async (ctx) => {
    registerModuleHealthAction(sandboxWfManifest);
    try {
      const { ensureWfDbSeeded } = await import("./seed");
      const result = await ensureWfDbSeeded();
      if (result.seeded) {
        ctx.log("info", `seeded ${result.workflows} workflows, ${result.triggers} triggers, ${result.steps} steps`);
      }
    } catch (err: any) {
      ctx.log("warn", `seed skipped — ${err?.message ?? err}`);
    }
    const { registerPublicApi } = await import("../platform/modules/module-gateway");
    registerPublicApi({
      module: "sandboxWf",
      action: "sandboxWf.execute",
      handler: async (input) => {
        const payload = input as { workflowId: number; triggerType?: string };
        if (typeof payload?.workflowId !== "number") throw new Error("workflowId is required");
        const { executeWorkflow } = await import("./executor");
        const executionId = await executeWorkflow(payload.workflowId, payload.triggerType ?? "gateway");
        return { executionId };
      },
      descriptor: {
        key: "sandboxWf.execute",
        description: "Execute a workflow",
        risk: "medium",
        receiptRequired: true,
      },
    });
    // Literal type string used so check:wiring:handoff can verify
    // statically; SANDBOX_WF_HANDOFFS.executeRequested is the constant.
    registerHandoffAcceptor(
      "sandboxWf",
      "sandboxWf.execute.requested",
      async (handoff) => {
        const payload = handoff.payload as {
          workflowId?: number;
          triggerType?: string;
        };
        if (typeof payload?.workflowId !== "number") {
          return { accepted: false, reason: "workflowId missing from payload" };
        }
        try {
          const { executeWorkflow } = await import("./executor");
          // Fire and forget — executeWorkflow runs synchronously through
          // its step loop but we don't block the acceptor on completion.
          // The handoff is "accepted" when the execution record exists;
          // run-completion lifecycle is signalled via sandboxWf events.
          void executeWorkflow(payload.workflowId, payload.triggerType ?? "handoff").catch(
            (err: unknown) => {
              const msg = err instanceof Error ? err.message : String(err);
              ctx.log("warn", `sandboxWf execution ${payload.workflowId} failed: ${msg}`);
            },
          );
          return { accepted: true };
        } catch (err: any) {
          ctx.log("warn", `sandboxWf.execute.requested handoff failed: ${err?.message ?? err}`);
          return { accepted: false, reason: err?.message ?? "internal error" };
        }
      },
    );
  },

  health: async () => {
    const { getWfDb } = await import("./connection");
    return dbPingHealth("WFDB", getWfDb);
  },

  publicApi: { path: "server/sandbox-wf/public-api.ts" },
  events: {
    emits: ["sandboxWf.execution.started", "sandboxWf.execution.completed", "sandboxWf.execution.failed"],
  },
  handoffs: { accepts: ["sandboxWf.execute.requested"], produces: [] },
  ports: { provided: ["sandboxWf.execute"], consumed: ["codeStudio.run"] },
  communication: { modes: ["gateway", "handoff", "event", "coordinator"] },
};
