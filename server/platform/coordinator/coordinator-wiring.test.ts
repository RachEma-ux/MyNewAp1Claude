/**
 * Coordinator Wiring — round-trip tests
 *
 * Proves the coordinator round-trip:
 *   - workflow with gateway-call step → completes
 *   - workflow with handoff step → completes
 *   - workflow with event-publish step → emits event
 *   - workflow with wait-for-event step → resolves on matching publish
 *   - workflow failure surfaces via getWorkflow
 *   - coordinator does NOT directly own module data (no private imports)
 *
 * Digital HQ snapshot integration is verified via the resulting
 * snapshot reflecting the workflow counts.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  __resetCoordinatorForTests,
  getWorkflow,
  listWorkflows,
  submitWorkflow,
} from ".";
import {
  __resetGatewayForTests,
  registerPublicApi,
} from "../modules/module-gateway";
import {
  __resetModuleRegistryForTests,
  getModuleRegistry,
} from "../modules/registry";
import {
  __resetHandoffsForTests,
  registerHandoffAcceptor,
} from "../handoff";
import {
  __resetEventBusForTests,
  makeEnvelope,
  publishEvent,
  subscribeEvent,
} from "../events";
import { snapshotDigitalHq } from "../observability/digital-hq";
import type { ModuleManifest } from "../modules/types";

const baseDb: ModuleManifest["database"] = { kind: "none" };

function makeManifest(key: string): ModuleManifest {
  return {
    key,
    name: key,
    version: "1.0.0",
    runtime: { mode: "shared" },
    database: baseDb,
    health: () => ({ state: "ok", checkedAt: new Date().toISOString() }),
  };
}

beforeEach(() => {
  __resetCoordinatorForTests();
  __resetGatewayForTests();
  __resetHandoffsForTests();
  __resetEventBusForTests();
  __resetModuleRegistryForTests();
  getModuleRegistry().register(makeManifest("alpha"));
  getModuleRegistry().register(makeManifest("beta"));
});

async function settleWorkflow(workflowId: string, attempts = 50): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    const wf = await getWorkflow(workflowId);
    if (wf?.status === "completed" || wf?.status === "failed" || wf?.status === "cancelled") {
      return;
    }
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("Coordinator — round-trip", () => {
  it("runs a workflow with a single gateway-call step", async () => {
    registerPublicApi({
      module: "alpha",
      action: "alpha.run",
      handler: async (input) => ({ result: input }),
    });
    const wf = await submitWorkflow({
      workflowType: "demo",
      workspaceId: 1,
      actorId: 42,
      steps: [
        {
          stepId: "s1",
          kind: "gateway-call",
          module: "alpha",
          action: "alpha.run",
          payload: { x: 1 },
        },
      ],
    });
    await settleWorkflow(wf.workflowId);
    const fresh = await getWorkflow(wf.workflowId);
    expect(fresh?.status).toBe("completed");
    expect(fresh?.steps[0].status).toBe("completed");
  });

  it("runs a workflow with a handoff step", async () => {
    registerHandoffAcceptor("beta", "beta.work", async () => ({ accepted: true }));
    const wf = await submitWorkflow({
      workflowType: "demo",
      workspaceId: 1,
      actorId: 42,
      steps: [
        {
          stepId: "s1",
          kind: "handoff",
          module: "beta",
          action: "beta.work",
          payload: {},
        },
      ],
    });
    await settleWorkflow(wf.workflowId);
    const fresh = await getWorkflow(wf.workflowId);
    expect(fresh?.status).toBe("completed");
  });

  it("runs an event-publish step", async () => {
    let received: string | null = null;
    subscribeEvent("alpha.demo", "test-consumer", (env) => {
      received = env.eventType;
    });
    const wf = await submitWorkflow({
      workflowType: "demo",
      workspaceId: 1,
      actorId: 42,
      steps: [
        {
          stepId: "s1",
          kind: "event-publish",
          eventType: "alpha.demo",
          payload: { msg: "hi" },
        },
      ],
    });
    await settleWorkflow(wf.workflowId);
    expect(received).toBe("alpha.demo");
  });

  it("resolves a wait-for-event step when a matching event arrives", async () => {
    const wf = await submitWorkflow({
      workflowType: "demo",
      workspaceId: 1,
      actorId: 42,
      steps: [
        {
          stepId: "s1",
          kind: "wait-for-event",
          eventType: "alpha.signal",
        },
      ],
    });
    // Give the workflow a tick to subscribe, then publish.
    await new Promise((r) => setTimeout(r, 20));
    await publishEvent(
      makeEnvelope({
        eventType: "alpha.signal",
        sourceModule: "alpha",
        payload: { ok: true },
      }),
    );
    await settleWorkflow(wf.workflowId);
    const fresh = await getWorkflow(wf.workflowId);
    expect(fresh?.status).toBe("completed");
  });

  it("marks the workflow failed when a step errors", async () => {
    registerPublicApi({
      module: "alpha",
      action: "alpha.boom",
      handler: async () => {
        throw new Error("simulated");
      },
    });
    const wf = await submitWorkflow({
      workflowType: "demo",
      workspaceId: 1,
      actorId: 42,
      steps: [
        {
          stepId: "s1",
          kind: "gateway-call",
          module: "alpha",
          action: "alpha.boom",
          payload: {},
        },
      ],
    });
    await settleWorkflow(wf.workflowId);
    const fresh = await getWorkflow(wf.workflowId);
    expect(fresh?.status).toBe("failed");
    expect(fresh?.steps[0].error).toContain("simulated");
  });

  it("Digital HQ snapshot reflects coordinator counts", async () => {
    registerPublicApi({
      module: "alpha",
      action: "alpha.run",
      handler: async () => ({}),
    });
    const wf = await submitWorkflow({
      workflowType: "demo",
      workspaceId: 1,
      actorId: 42,
      steps: [
        { stepId: "s1", kind: "gateway-call", module: "alpha", action: "alpha.run", payload: {} },
      ],
    });
    await settleWorkflow(wf.workflowId);
    const snap = await snapshotDigitalHq();
    expect(snap.workflows.total).toBeGreaterThan(0);
    expect(snap.workflows.completed).toBeGreaterThan(0);
    expect(snap.modules.total).toBeGreaterThan(0);
  });

  it("coordinator runtime imports only platform-allowed paths", async () => {
    // Static check: read the runtime source and confirm no private imports.
    const src = await import("fs").then((m) =>
      m.readFileSync("server/platform/coordinator/runtime.ts", "utf8"),
    );
    expect(src).not.toMatch(/from\s+["'`][^"'`]*\/repository/);
    expect(src).not.toMatch(/from\s+["'`][^"'`]*\/connection/);
    expect(src).not.toMatch(/from\s+["'`][^"'`]*\/services\//);
  });

  it("listWorkflows supports filtering", async () => {
    registerPublicApi({
      module: "alpha",
      action: "alpha.run",
      handler: async () => ({}),
    });
    const w1 = await submitWorkflow({
      workflowType: "demo",
      workspaceId: 1,
      actorId: 42,
      steps: [{ stepId: "s1", kind: "gateway-call", module: "alpha", action: "alpha.run", payload: {} }],
    });
    await settleWorkflow(w1.workflowId);
    const all = await listWorkflows();
    expect(all.length).toBe(1);
    const ws2 = await listWorkflows({ workspaceId: 2 });
    expect(ws2.length).toBe(0);
  });
});
