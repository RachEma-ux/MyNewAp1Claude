/**
 * Phase 22 emission burst — closure summary doc lockstep.
 *
 * Asserts the 2026-05-15 burst summary references each PR + each
 * closed-taxonomy kind that landed live. If a future PR ships a new
 * wiring without updating the burst summary, this test trips.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { FAILURE_STATES } from "../../server/agent-studio/services/failure-states/contracts";

const summaryPath = resolve(
  __dirname,
  "../../docs/implementation/agent-studio-failure-state-emission-burst-2026-05-15.md",
);

const SHIPPED_PRS = [
  "#1011",
  "#1012",
  "#1013",
  "#1014",
  "#1015",
  "#1016",
  "#1017",
  "#1018",
  "#1019",
  "#1020",
  "#1021",
  "#1022",
  "#1023",
  "#1024",
  "#1025",
  "#1026",
  "#1027",
  "#1028",
  "#1029",
  "#1030",
  "#1031",
  "#1032",
  "#1033",
  "#1034",
  "#1035",
  "#1036",
  "#1037",
  "#1038",
  "#1039",
];

describe("Phase 22 emission burst summary lockstep", () => {
  const summary = readFileSync(summaryPath, "utf8");

  it.each(SHIPPED_PRS)("references PR %s", (pr) => {
    expect(summary).toContain(pr);
  });

  it.each([...FAILURE_STATES])(
    "enumerates closed kind `%s` in §3 coverage table",
    (kind) => {
      // §3 lists every closed-taxonomy kind in a status table.
      expect(summary).toContain(`\`${kind}\``);
    },
  );

  it("states the 11/25 live coverage outcome", () => {
    expect(summary).toContain("11 of 25");
  });

  it("references each of the 9 forward lessons (14-22)", () => {
    expect(summary).toContain("Lessons 14-22");
  });

  it("references the count-pin blocker for kind #25", () => {
    expect(summary).toContain("count-pin");
    expect(summary).toContain("#1034");
  });

  it("references the final closure SHA `089ef2e` (post acceptance #30 closure)", () => {
    expect(summary).toContain("089ef2e");
  });

  it("notes Phase 28 acceptance #30 substantially-closed at #1039", () => {
    expect(summary).toContain("acceptance #30");
    expect(summary).toContain("#1039");
  });

  it("acknowledges the 3-step self-update history (#1037 / #1038 / #1040)", () => {
    expect(summary).toContain("3 self-update slices");
  });
});
