/**
 * Approval bus admin — force-reconnect + UI surface. PR-V1-184.
 *
 * Source-scan covering:
 *   - `forceReconnectApprovalBusSubscriber` exported with the
 *     not-subscribed + reconnected branches.
 *   - `agentStudio.approvalBus.forceReconnect` admin mutation.
 *   - New `ApprovalBusAdminPanel` + `ApprovalBusAdminPage` wired
 *     into the Shell + sidebar + manifest + routes.
 *   - Hard-rule compliance on the touched pubsub file.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-184 — approval bus force reconnect + admin panel", () => {
  const pubsub = resolve(
    __dirname,
    "../../server/agent-studio/services/runtime/approval-event-bus-pubsub.ts",
  );
  const router = resolve(
    __dirname,
    "../../server/agent-studio/services/runtime/approval-bus-admin-router.ts",
  );
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/ApprovalBusAdminPanel.tsx",
  );
  const page = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/pages/ApprovalBusAdminPage.tsx",
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

  it("pubsub module exports forceReconnectApprovalBusSubscriber with both branches", () => {
    const src = readFileSync(pubsub, "utf8");
    expect(
      /export\s+function\s+forceReconnectApprovalBusSubscriber/.test(src),
    ).toBe(true);
    expect(/export\s+interface\s+ForceReconnectApprovalBusResult/.test(src)).toBe(
      true,
    );
    const body = src.slice(
      src.indexOf("export function forceReconnectApprovalBusSubscriber"),
    );
    // not-subscribed branch.
    expect(/_subscriber\.handler\s*===\s*null/.test(body)).toBe(true);
    expect(/reason:\s*"not-subscribed"/.test(body)).toBe(true);
    // reconnected branch: clears timer + ends client + re-subscribes
    // with the preserved handler.
    expect(/clearTimeout\(_subscriber\.timer\)/.test(body)).toBe(true);
    expect(/_subscriber\.client\?\.end\(\)/.test(body)).toBe(true);
    expect(/subscribeApprovalDecidedEvents\(handler\)/.test(body)).toBe(true);
  });

  it("admin router exposes forceReconnect as adminProcedure.mutation", () => {
    const src = readFileSync(router, "utf8");
    expect(src).toContain("forceReconnect");
    expect(
      /forceReconnect:\s*adminProcedure[\s\S]{0,400}\.mutation\(/.test(src),
    ).toBe(true);
    expect(src).toContain("forceReconnectApprovalBusSubscriber()");
  });

  it("ApprovalBusAdminPanel renders status grid + force-reconnect button + invalidation", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(
      "trpc.agentStudio.approvalBus.getPubsubStatus.useQuery",
    );
    expect(src).toContain(
      "trpc.agentStudio.approvalBus.forceReconnect.useMutation",
    );
    expect(src).toContain('data-testid="approval-bus-status-grid"');
    expect(src).toContain('data-testid="approval-bus-force-reconnect"');
    expect(src).toContain(
      'data-testid="approval-bus-force-reconnect-feedback"',
    );
    // Stale-connection highlight: subscribed=true && connectedAt==null
    expect(
      /status\?\.subscribed\s*===\s*true\s*&&\s*status\?\.connectedAt\s*==\s*null/.test(
        src,
      ),
    ).toBe(true);
    // Mutation success invalidates status query.
    expect(
      /utils\.agentStudio\.approvalBus\.getPubsubStatus\.invalidate/.test(src),
    ).toBe(true);
  });

  it("Shell + sidebar + manifest + routes all advertise the new admin path", () => {
    const shellSrc = readFileSync(shell, "utf8");
    expect(shellSrc).toContain("/agent-studio/approval-bus-admin");
    expect(shellSrc).toContain("ApprovalBusAdminPage");
    expect(/case\s+"approval-bus-admin"\s+as\s+any/.test(shellSrc)).toBe(true);

    const sidebarSrc = readFileSync(sidebar, "utf8");
    expect(sidebarSrc).toContain('"approval-bus-admin"');
    expect(sidebarSrc).toContain('label: "Approval bus"');
    expect(sidebarSrc).toContain("icon: Radio");

    const manifestSrc = readFileSync(manifest, "utf8");
    expect(manifestSrc).toContain('"/agent-studio/approval-bus-admin"');

    const routesSrc = readFileSync(routes, "utf8");
    expect(routesSrc).toContain('"/agent-studio/approval-bus-admin"');

    const pageSrc = readFileSync(page, "utf8");
    expect(pageSrc).toContain("ApprovalBusAdminPanel");
  });

  it("hard-rule compliance on the touched pubsub file", () => {
    const src = readFileSync(pubsub, "utf8");
    expect(/process\.env\.[A-Z0-9_]+_API_KEY/.test(src)).toBe(false);
    expect(/credential-resolver/.test(src)).toBe(false);
    expect(/dispatchMcpToolCall/.test(src)).toBe(false);
    expect(/neo4j-driver/.test(src)).toBe(false);
  });
});
