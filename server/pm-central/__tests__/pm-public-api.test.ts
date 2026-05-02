/**
 * PM Central — public API surface test.
 */
import { describe, it, expect } from "vitest";
import * as publicApi from "../public-api";

describe("server/pm-central/public-api", () => {
  it("re-exports the module manifest", () => {
    expect(publicApi.pmCentralManifest).toBeDefined();
    expect(publicApi.pmCentralManifest.key).toBe("pmCentral");
    expect(publicApi.pmCentralManifest.routerKey).toBe("pmCentral");
  });

  it("re-exports event constants", () => {
    expect(publicApi.PM_CENTRAL_EVENTS).toBeDefined();
    expect(publicApi.PM_CENTRAL_EVENTS.projectCreated).toBe("pm.project.created");
  });

  it("re-exports handoff constants", () => {
    expect(publicApi.PM_CENTRAL_HANDOFFS).toBeDefined();
    expect(publicApi.PM_CENTRAL_HANDOFFS.receiveFromPs).toBe(
      "pmCentral.project.receiveFromPS",
    );
  });

  it("re-exports zod input schemas", () => {
    expect(publicApi.CreatePmProjectInputSchema).toBeDefined();
    expect(publicApi.CreatePmTaskInputSchema).toBeDefined();
    expect(publicApi.ReceivePsHandoffInputSchema).toBeDefined();
  });
});
