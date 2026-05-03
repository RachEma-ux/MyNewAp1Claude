/**
 * PM Central — manifest shape tests.
 */
import { describe, it, expect } from "vitest";
import { pmCentralManifest } from "../../../server/pm-central/manifest";
import { PM_CENTRAL_HANDOFFS } from "../../../server/pm-central/handoffs";

describe("pmCentralManifest", () => {
  it("declares the expected identity", () => {
    expect(pmCentralManifest.key).toBe("pmCentral");
    expect(pmCentralManifest.routerKey).toBe("pmCentral");
    expect(pmCentralManifest.name).toBe("PM Central");
  });

  it("owns the pmdb database", () => {
    expect(pmCentralManifest.database.kind).toBe("owned");
    if (pmCentralManifest.database.kind === "owned") {
      expect(pmCentralManifest.database.key).toBe("pmdb");
      expect(pmCentralManifest.database.ownedTables).toEqual(
        expect.arrayContaining([
          "pm_projects",
          "pm_plans",
          "pm_milestones",
          "pm_tasks",
          "pm_risks",
          "pm_issues",
          "pm_decisions",
          "pm_handoffs",
          "pm_activity_log",
        ]),
      );
    }
  });

  it("is embedded runtime mode", () => {
    expect(pmCentralManifest.runtime.mode).toBe("embedded");
  });

  it("declares canonical RTLM /pm-central/rtlm/* routes", () => {
    const paths = (pmCentralManifest.routes ?? []).map((r) => r.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "/pm-central/rtlm",
        "/pm-central/rtlm/projects",
        "/pm-central/rtlm/projects/:id",
        "/pm-central/rtlm/tasks",
        "/pm-central/rtlm/handoffs",
      ]),
    );
  });

  it("declares governance actions for archive/approve/convert/status with receipts required", () => {
    const required = (pmCentralManifest.governanceActions ?? [])
      .filter((a) => a.receiptRequired)
      .map((a) => a.key)
      .sort();
    expect(required).toEqual(
      [
        "pmCentral.project.archive",
        "pmCentral.project.status.update",
        "pmCentral.plan.approve",
        "pmCentral.handoff.convert",
      ].sort(),
    );
  });

  it("accepts the two PS → PM handoff types", () => {
    const accepts = pmCentralManifest.handoffs?.accepts ?? [];
    expect(accepts.sort()).toEqual(Object.values(PM_CENTRAL_HANDOFFS).slice().sort());
  });

  it("does not produce handoffs (consumer-only module)", () => {
    expect(pmCentralManifest.handoffs?.produces ?? []).toEqual([]);
  });

  it("provides pmCentral.read + pmCentral.handoff ports", () => {
    expect((pmCentralManifest.ports?.provided ?? []).sort()).toEqual([
      "pmCentral.handoff",
      "pmCentral.read",
    ]);
  });

  it("supports gateway, handoff, and event communication modes", () => {
    expect((pmCentralManifest.communication?.modes ?? []).sort()).toEqual([
      "event",
      "gateway",
      "handoff",
    ]);
  });

  it("references its public API at the canonical path", () => {
    expect(pmCentralManifest.publicApi?.path).toBe(
      "server/pm-central/public-api.ts",
    );
  });
});
