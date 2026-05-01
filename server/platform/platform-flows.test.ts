/**
 * Platform Flows — integration tests for handoff, events, coordinator.
 *
 * Verifies the cross-module communication lanes work end-to-end without
 * importing any module-private code.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  __resetHandoffsForTests,
  registerHandoffAcceptor,
  submitHandoff,
  getHandoff,
} from "./handoff";
import {
  __resetEventBusForTests,
  publishEvent,
  subscribeEvent,
  makeEnvelope,
  getEventStats,
} from "./events";
import {
  __resetCoordinatorForTests,
  submitWorkflow,
  getWorkflow,
} from "./coordinator";
import {
  __resetGatewayForTests,
  registerPublicApi,
} from "./modules/module-gateway";
import {
  __resetModuleRegistryForTests,
  getModuleRegistry,
} from "./modules/registry";

beforeEach(() => {
  __resetHandoffsForTests();
  __resetEventBusForTests();
  __resetCoordinatorForTests();
  __resetGatewayForTests();
  __resetModuleRegistryForTests();
});

describe("Handoff Manager", () => {
  it("submits a handoff and dispatches to the registered acceptor", async () => {
    let received: any = null;
    registerHandoffAcceptor("pmCentral", "ps.pmCentral", async (h) => {
      received = h;
      return { accepted: true };
    });
    const h = await submitHandoff({
      fromModule: "ps",
      toModule: "pmCentral",
      type: "ps.pmCentral",
      payload: { projectId: 42 },
      actorId: 1,
      workspaceId: 1,
      governanceReceipt: "rec-1",
    });
    expect(h.status).toBe("accepted");
    expect(received.payload.projectId).toBe(42);
    const fetched = await getHandoff(h.handoffId);
    expect(fetched?.status).toBe("accepted");
  });

  it("rejects when the acceptor refuses", async () => {
    registerHandoffAcceptor("pmCentral", "ps.pmCentral", async () => ({
      accepted: false,
      reason: "policy",
    }));
    const h = await submitHandoff({
      fromModule: "ps",
      toModule: "pmCentral",
      type: "ps.pmCentral",
      payload: {},
      actorId: 1,
      workspaceId: 1,
    });
    expect(h.status).toBe("rejected");
    expect(h.failureReason).toBe("policy");
  });
});

describe("Event Bus", () => {
  it("delivers events to matching subscribers exactly once", async () => {
    let count = 0;
    subscribeEvent("prm.method.published", "consumer-a", () => {
      count++;
    });
    const env = makeEnvelope({
      eventType: "prm.method.published",
      sourceModule: "prm",
      priority: "normal",
      payload: { id: 1 },
    });
    await publishEvent(env);
    await publishEvent(env); // dedupe via inbox
    expect(count).toBe(1);
  });

  it("supports wildcard patterns", async () => {
    let count = 0;
    subscribeEvent("prm.*", "consumer-b", () => {
      count++;
    });
    await publishEvent(
      makeEnvelope({ eventType: "prm.method.published", sourceModule: "prm", payload: {} }),
    );
    await publishEvent(
      makeEnvelope({ eventType: "prm.method.deprecated", sourceModule: "prm", payload: {} }),
    );
    expect(count).toBe(2);
  });

  it("tracks stats for outbox/dead-letter", async () => {
    subscribeEvent("foo.boom", "bad-consumer", () => {
      throw new Error("boom");
    });
    await publishEvent(
      makeEnvelope({ eventType: "foo.boom", sourceModule: "x", payload: {} }),
    );
    const stats = getEventStats();
    expect(stats.outboxSize).toBe(1);
    expect(stats.failed).toBe(1);
    expect(stats.deadLetter).toBe(1);
  });
});

describe("Coordinator", () => {
  it("runs a multi-step workflow via gateway-call", async () => {
    getModuleRegistry().register({
      key: "alpha",
      name: "Alpha",
      version: "1.0.0",
      runtime: { mode: "shared" },
      database: { kind: "none" },
    } as any);
    let calls = 0;
    registerPublicApi({
      module: "alpha",
      action: "doIt",
      handler: () => {
        calls++;
        return { ok: true };
      },
    });
    const wf = await submitWorkflow({
      workflowType: "test.workflow",
      workspaceId: 1,
      actorId: 1,
      steps: [
        { stepId: "s1", kind: "gateway-call", module: "alpha", action: "doIt" },
        { stepId: "s2", kind: "gateway-call", module: "alpha", action: "doIt" },
      ],
    });
    // Drive runs synchronously by waiting for the workflow store update.
    await new Promise((r) => setTimeout(r, 50));
    const fetched = await getWorkflow(wf.workflowId);
    expect(fetched?.status).toBe("completed");
    expect(calls).toBe(2);
  });

  it("marks workflow failed if a step fails", async () => {
    getModuleRegistry().register({
      key: "alpha",
      name: "Alpha",
      version: "1.0.0",
      runtime: { mode: "shared" },
      database: { kind: "none" },
    } as any);
    registerPublicApi({
      module: "alpha",
      action: "boom",
      handler: () => {
        throw new Error("nope");
      },
    });
    const wf = await submitWorkflow({
      workflowType: "test.fail",
      workspaceId: 1,
      actorId: 1,
      steps: [{ stepId: "s1", kind: "gateway-call", module: "alpha", action: "boom" }],
    });
    await new Promise((r) => setTimeout(r, 50));
    const fetched = await getWorkflow(wf.workflowId);
    expect(fetched?.status).toBe("failed");
  });
});
