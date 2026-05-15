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
  "#1040",
  "#1041",
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

  it("states the 12/25 live coverage outcome (post #1030 sibling-emit)", () => {
    expect(summary).toContain("12 of 25");
    expect(summary).toContain("48%");
  });

  it("§3 closing line tallies 12 LIVE / 2 ⚠️ / 4 🟡 / 6 ❌ / 1 🔒 (sums to 25)", () => {
    expect(summary).toContain("12 LIVE");
    expect(summary).toContain("2 ⚠️ partial");
    expect(summary).toContain("4 🟡 detection-only");
    expect(summary).toContain("6 ❌ phase-gated");
    expect(summary).toContain("1 🔒 T-D.3");
  });

  it("references each of the 9 forward lessons (14-22)", () => {
    expect(summary).toContain("Lessons 14-22");
  });

  it("references the count-pin blocker for kind #25", () => {
    expect(summary).toContain("count-pin");
    expect(summary).toContain("#1034");
  });

  it("references the final closure SHA `1acafbc0` (post acceptance flip #1041)", () => {
    expect(summary).toContain("1acafbc0");
  });

  it("notes Phase 28 acceptance #30 substantially-closed at #1039", () => {
    expect(summary).toContain("acceptance #30");
    expect(summary).toContain("#1039");
  });

  it("acknowledges the 4-step self-update history (#1037 → #1038 → #1040 → #1041)", () => {
    expect(summary).toContain("4 self-update slices");
  });

  it("notes Phase 22 roadmap acceptance checkbox flip @ #1041", () => {
    expect(summary).toContain("roadmap acceptance checkbox");
    expect(summary).toContain("#1041");
  });

  it("references the 31-PR continuation total", () => {
    expect(summary).toContain("31-PR");
    expect(summary).toContain("31 PRs");
  });
});
