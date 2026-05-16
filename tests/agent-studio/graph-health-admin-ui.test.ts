/**
 * Graph Health admin UI — PR-V1-190.
 *
 * Source-scan that the graphHealth router (J-1-β, #758) gets its
 * first UI consumer end-to-end: component + page + Shell + sidebar
 * + manifest + routes wiring.
 *
 * Read-only — alert resolution stays on the server-side helper.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-190 — graph-health admin UI (first consumer)", () => {
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/GraphHealthAdminPanel.tsx",
  );
  const page = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/pages/GraphHealthAdminPage.tsx",
  );
  const shell = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/AgentStudioShell.tsx",
  );
  const sidebar = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/AgentStudioSidebar.tsx",
  );
  const manifest = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/manifest.ts",
  );
  const routes = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/routes.tsx",
  );

  it("GraphHealthAdminPanel queries both graphHealth procedures with testids", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(
      "trpc.agentStudio.graphHealth.getAlertCronStatus.useQuery",
    );
    expect(src).toContain("trpc.agentStudio.graphHealth.listOpen.useQuery");
    expect(src).toContain('data-testid="graph-health-cron-grid"');
    expect(src).toContain('data-testid="graph-health-open-alerts-table"');
    // Severity color coding for critical/warning/info.
    expect(/case\s+"critical":[\s\S]{0,80}text-destructive/.test(src)).toBe(
      true,
    );
    expect(/case\s+"warning":[\s\S]{0,80}text-amber/.test(src)).toBe(true);
    // T-I.56 + T-I.57: the panel now exposes exactly two graphHealth
    // mutations (`resolveAlert` for per-row alert dismissal, and
    // `runAlertScan` for the operator-triggered scan). PR-V1-190 shipped
    // read-only; this invariant pins the exact set so a regression that
    // re-introduces broader writes still trips.
    const graphHealthMutationCalls =
      src.match(/trpc\.agentStudio\.graphHealth\.[a-zA-Z]+\.useMutation/g) ?? [];
    expect(graphHealthMutationCalls.sort()).toEqual(
      [
        "trpc.agentStudio.graphHealth.resolveAlert.useMutation",
        "trpc.agentStudio.graphHealth.runAlertScan.useMutation",
      ].sort(),
    );
  });

  it("GraphHealthAdminPage mounts the panel", () => {
    const src = readFileSync(page, "utf8");
    expect(src).toContain("GraphHealthAdminPanel");
  });

  it("Shell + sidebar + manifest + routes all advertise the new admin path", () => {
    const shellSrc = readFileSync(shell, "utf8");
    expect(shellSrc).toContain("/agent-studio/graph-health-admin");
    expect(shellSrc).toContain("GraphHealthAdminPage");
    expect(/case\s+"graph-health-admin"\s+as\s+any/.test(shellSrc)).toBe(true);

    const sidebarSrc = readFileSync(sidebar, "utf8");
    expect(sidebarSrc).toContain('"graph-health-admin"');
    expect(sidebarSrc).toContain('label: "Graph Health"');
    expect(sidebarSrc).toContain("icon: HeartPulse");

    const manifestSrc = readFileSync(manifest, "utf8");
    expect(manifestSrc).toContain('"/agent-studio/graph-health-admin"');

    const routesSrc = readFileSync(routes, "utf8");
    expect(routesSrc).toContain('"/agent-studio/graph-health-admin"');
  });
});
