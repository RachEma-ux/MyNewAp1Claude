/**
 * Coordinator — Worked Workflow Examples
 *
 * These tests document, end-to-end, when and how to use the coordinator.
 * Each `describe` block corresponds to one "should I use a coordinator
 * workflow, or just a handoff / event?" decision in the modularity docs.
 *
 * The tests double as the canonical examples — read `docs/architecture/
 * modularity/CROSS_MODULE_COMMUNICATION_MAP.md` alongside this file.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  __resetCoordinatorForTests,
  __resetCompensationRegistryForTests,
  registerCompensationHandler,
  submitWorkflow,
  getWorkflow,
  listCompensationHandlers,
} from "./index";
import {
  __resetEventBusForTests,
  publishEvent,
  subscribeEvent,
  makeEnvelope,
} from "../events";
import { __resetHandoffsForTests } from "../handoff";
import {
  __resetGatewayForTests,
  registerPublicApi,
} from "../modules/module-gateway";
import {
  __resetModuleRegistryForTests,
  getModuleRegistry,
} from "../modules/registry";

beforeEach(() => {
  __resetCoordinatorForTests();
  __resetCompensationRegistryForTests();
  __resetEventBusForTests();
  __resetHandoffsForTests();
  __resetGatewayForTests();
  __resetModuleRegistryForTests();
});

function registerModule(key: string) {
  getModuleRegistry().register({
    key,
    name: key,
    version: "1.0.0",
    runtime: { mode: "shared" },
    database: { kind: "none" },
  } as any);
}

describe("Workflow example: gateway-call chain (sync command sequence)", () => {
  it("runs A -> B -> C via the module gateway and returns each step's result", async () => {
    // Use a coordinator workflow when:
    //   - 3+ modules participate, OR
    //   - the steps need durable ordering / compensation, OR
    //   - the flow has to be observable end-to-end in Digital HQ.
    // For just A -> B with no compensation, a handoff is enough.
    registerModule("alpha");
    registerModule("beta");
    registerModule("gamma");
    let trail: string[] = [];
    registerPublicApi({
      module: "alpha",
      action: "step1",
      handler: () => {
        trail.push("alpha");
        return { id: 1 };
      },
    });
    registerPublicApi({
      module: "beta",
      action: "step2",
      handler: () => {
        trail.push("beta");
        return { id: 2 };
      },
    });
    registerPublicApi({
      module: "gamma",
      action: "step3",
      handler: () => {
        trail.push("gamma");
        return { id: 3 };
      },
    });

    const wf = await submitWorkflow({
      workflowType: "examples.chain",
      workspaceId: 1,
      actorId: 1,
      steps: [
        { stepId: "s1", kind: "gateway-call", module: "alpha", action: "step1" },
        { stepId: "s2", kind: "gateway-call", module: "beta", action: "step2" },
        { stepId: "s3", kind: "gateway-call", module: "gamma", action: "step3" },
      ],
    });

    await new Promise((r) => setTimeout(r, 50));
    const fetched = await getWorkflow(wf.workflowId);
    expect(fetched?.status).toBe("completed");
    expect(trail).toEqual(["alpha", "beta", "gamma"]);
    expect(fetched?.steps.map((s) => s.status)).toEqual([
      "completed",
      "completed",
      "completed",
    ]);
  });
});

describe("Workflow example: registered compensation runs explicitly", () => {
  it("invokes the registered compensation handler when the step is reached", async () => {
    // A registered compensation handler is now mandatory: the silent
    // no-op behavior was removed in PR #46 review-fix and the registry
    // now throws if no handler is found.
    //
    // Compensation steps run like any other step — to roll back partial
    // work, define them as the next step after the work that needs to
    // be undone. (The MVP coordinator halts on first failure, so an
    // earlier step's failure currently aborts the workflow.)
    registerModule("alpha");
    let compensated: string[] = [];
    registerPublicApi({
      module: "alpha",
      action: "ok",
      handler: () => ({ ok: true }),
    });
    registerCompensationHandler({
      module: "alpha",
      action: "ok.compensate",
      handler: async (ctx) => {
        compensated.push(`alpha:${ctx.workflow.workflowId}`);
        return { status: "compensated", details: { rolledBack: true } };
      },
    });

    const wf = await submitWorkflow({
      workflowType: "examples.compensation",
      workspaceId: 1,
      actorId: 1,
      steps: [
        { stepId: "s1", kind: "gateway-call", module: "alpha", action: "ok" },
        {
          stepId: "comp",
          kind: "compensation",
          module: "alpha",
          action: "ok.compensate",
        },
      ],
    });

    await new Promise((r) => setTimeout(r, 50));
    const fetched = await getWorkflow(wf.workflowId);
    expect(fetched?.status).toBe("completed");
    expect(compensated).toEqual([`alpha:${wf.workflowId}`]);
  });

  it("fails loudly if a compensation step has no registered handler (A2)", async () => {
    // The whole point of the A2 fix: an unregistered compensation must
    // not silently succeed. The workflow must fail.
    const wf = await submitWorkflow({
      workflowType: "examples.compensation.unregistered",
      workspaceId: 1,
      actorId: 1,
      steps: [
        {
          stepId: "comp",
          kind: "compensation",
          module: "alpha",
          action: "alpha.unknown",
        },
      ],
    });

    await new Promise((r) => setTimeout(r, 50));
    const fetched = await getWorkflow(wf.workflowId);
    expect(fetched?.status).toBe("failed");
    expect(fetched?.failureReason).toMatch(/compensation handler/i);
  });

  it("listCompensationHandlers reports registered handlers per module", () => {
    registerCompensationHandler({
      module: "alpha",
      action: "alpha.undo",
      handler: async () => ({ status: "compensated" }),
    });
    registerCompensationHandler({
      module: "beta",
      action: "beta.undo",
      handler: async () => ({ status: "compensated" }),
    });
    const handlers = listCompensationHandlers();
    expect(handlers.length).toBe(2);
    expect(handlers.map((h) => h.module).sort()).toEqual(["alpha", "beta"]);
  });
});

describe("Communication-lane example: pure event vs. coordinator", () => {
  it("event lane: a published event reaches multiple subscribers without a workflow", async () => {
    // Use the event lane (NOT a workflow) when the producer doesn't need
    // a result. The event bus dedupes per consumer and surfaces failures
    // via dead-letter.
    let received: number[] = [];
    subscribeEvent("examples.fired", "subscriber-x", (env) => {
      received.push((env.payload as any).n);
    });
    subscribeEvent("examples.*", "subscriber-y", (env) => {
      received.push((env.payload as any).n * 10);
    });

    await publishEvent(
      makeEnvelope({
        eventType: "examples.fired",
        sourceModule: "alpha",
        payload: { n: 3 },
      }),
    );
    expect(received.sort()).toEqual([3, 30]);
  });
});
