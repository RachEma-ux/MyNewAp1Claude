/**
 * Workflow readiness — contract-discovery test.
 *
 * Companion to docs/evidence/workflows/REAL_USER_WORKFLOW_REPORT.md.
 * The report classifies each cross-module workflow as
 * EXECUTABLE_NOW / PARTIAL / BLOCKED based on grep over the live
 * source tree. This test asserts that every symbol the report
 * cites still exists. If a cited path is renamed or removed,
 * this test fails — flagging that the report needs to be
 * regenerated rather than letting the doc silently rot.
 *
 * Crucially, this file does NOT invoke any cross-module workflow
 * with guessed inputs. It only asserts the public-API surface
 * cited in the report is intact. Real end-to-end execution of
 * PARTIAL/BLOCKED workflows is deferred to staging — that's the
 * Phase 9 commitment, not something this test pretends to
 * deliver.
 *
 * Excluded from local-unit mode by tests/integration/**.
 */

import { describe, it, expect } from "vitest";

// Platform primitives the report cites.
import {
  submitHandoff,
  registerHandoffAcceptor,
  __resetHandoffsForTests,
} from "../../../server/platform/handoff";
import {
  publishEvent,
  subscribeEvent,
  unsubscribeEvent,
  makeEnvelope,
} from "../../../server/platform/events";
import {
  getPortRegistry,
  __resetPortRegistryForTests,
} from "../../../server/platform/ports";
import {
  registerPublicApi,
  listRegisteredActions,
} from "../../../server/platform/modules/module-gateway";

// Cross-module bridge entry points the report cites by file.
import { pmCentralRouter } from "../../../server/pm-central/router";
import { psRouter } from "../../../server/ps/ps.router";
import { codeStudioRouter } from "../../../server/code-studio/api/router";
import { dataAnalysisRouter } from "../../../server/data-analysis/router";
import { kgraAgentRouter } from "../../../server/kgra-agent/router";

// Worker contracts the report cites.
import {
  graphRagWorkerContract,
  getGraphRagWorkerUrl,
  GRAPHRAG_WORKER_ENV,
  DATA_ANALYSIS_RUNTIME_ENDPOINTS,
} from "../../../server/data-analysis/ports";
import {
  dataAcquisitionWorkerContract,
  getDataAcquisitionWorkerUrl,
} from "../../../server/data-analysis/data-acquisition/dataAcquisition.worker";
import { DATA_ACQUISITION_WORKER_ENV } from "../../../server/data-analysis/data-acquisition/dataAcquisition.constants";

// Governance gate the report cites.
import { requireGate } from "../../../server/governance/requireGate";

describe("Workflow readiness — platform primitives are exported", () => {
  it("handoff manager: submitHandoff + registerHandoffAcceptor", () => {
    expect(typeof submitHandoff).toBe("function");
    expect(typeof registerHandoffAcceptor).toBe("function");
    expect(typeof __resetHandoffsForTests).toBe("function");
  });

  it("event bus: publishEvent + subscribeEvent + unsubscribeEvent + makeEnvelope", () => {
    expect(typeof publishEvent).toBe("function");
    expect(typeof subscribeEvent).toBe("function");
    expect(typeof unsubscribeEvent).toBe("function");
    expect(typeof makeEnvelope).toBe("function");
  });

  it("port registry: getPortRegistry + reservePort", () => {
    expect(typeof getPortRegistry).toBe("function");
    expect(typeof __resetPortRegistryForTests).toBe("function");
    const registry = getPortRegistry();
    expect(typeof registry.reservePort).toBe("function");
  });

  it("module gateway: registerPublicApi + listRegisteredActions", () => {
    expect(typeof registerPublicApi).toBe("function");
    expect(typeof listRegisteredActions).toBe("function");
    // Sanity: at least one action registered somewhere on boot.
    // We don't assert a count here — registration happens lazily
    // during module boot — but the symbol must be callable.
    expect(Array.isArray(listRegisteredActions())).toBe(true);
  });

  it("governance: requireGate", () => {
    expect(typeof requireGate).toBe("function");
  });
});

describe("Workflow readiness — cross-module router entry points exist", () => {
  it("PS → PM bridge surface (ps.router.ts:1115 + pm-central/router.ts:381)", () => {
    // Both routers are tRPC v11 router objects with a `_def` shape.
    // We don't drill into specific procedures (those are private to
    // the proxied caller), but the router exports themselves are
    // load-bearing — if either disappears, the bridge is broken.
    expect(psRouter).toBeDefined();
    expect(pmCentralRouter).toBeDefined();
  });

  it("Code Studio inbound handoff router (code-studio/api/router.ts:236)", () => {
    expect(codeStudioRouter).toBeDefined();
  });

  it("Data Analysis aggregate router (data-analysis/router.ts) wires graphRag, dataWarehouse, dataAcquisition", () => {
    expect(dataAnalysisRouter).toBeDefined();
  });

  it("KGRA Agent router (kgra-agent/router.ts:11)", () => {
    expect(kgraAgentRouter).toBeDefined();
  });
});

describe("Workflow readiness — worker contracts are intact", () => {
  it("GraphRAG worker contract declares /health and the env var name", () => {
    expect(graphRagWorkerContract.healthPath).toBe("/health");
    expect(GRAPHRAG_WORKER_ENV).toBe("GRAPHRAG_WORKER_URL");
    expect(typeof getGraphRagWorkerUrl).toBe("function");
  });

  it("Data Acquisition worker contract declares /health and the env var name", () => {
    expect(dataAcquisitionWorkerContract.healthPath).toBe("/health");
    expect(DATA_ACQUISITION_WORKER_ENV).toBe("DATA_ACQUISITION_WORKER_URL");
    expect(typeof getDataAcquisitionWorkerUrl).toBe("function");
  });

  it("Data Analysis runtime endpoints declare both workers", () => {
    const keys = DATA_ANALYSIS_RUNTIME_ENDPOINTS.map((e) => e.key);
    expect(keys).toContain("graphRagWorker");
    expect(keys).toContain("dataAcquisitionWorker");
  });
});

describe("Workflow readiness — handoff round-trip works (in-memory)", () => {
  it("registerHandoffAcceptor + submitHandoff completes synchronously", async () => {
    __resetHandoffsForTests();
    let acceptorCalled = false;
    registerHandoffAcceptor("phase9TestB", "phase9.test.kind", async () => {
      acceptorCalled = true;
      return { accepted: true };
    });
    const handoff = await submitHandoff({
      fromModule: "phase9TestA",
      toModule: "phase9TestB",
      type: "phase9.test.kind",
      payload: { hello: "world" },
      actorId: 0,
    });
    expect(handoff.handoffId).toBeDefined();
    expect(handoff.status).toBe("accepted");
    expect(acceptorCalled).toBe(true);
    __resetHandoffsForTests();
  });
});
