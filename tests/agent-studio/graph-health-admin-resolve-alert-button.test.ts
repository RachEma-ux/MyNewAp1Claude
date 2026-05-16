/**
 * T-I.56 — Resolve-alert button on the open-alerts table.
 *
 * Closes the read-only restriction on `GraphHealthAdminPanel`. The
 * server-side `resolveHealthAlertById` helper + admin tRPC
 * `agentStudio.graphHealth.resolveAlert` mutation + per-row button.
 * Distinct from the auto-resolution path in
 * `persistHealthAlertDecisions` (which resolves alerts when the next
 * scan no longer observes the breach key); this lets operators
 * dismiss a specific alert id without waiting for the next scan.
 *
 * Source-scan asserts:
 *
 *   Server:
 *     1. `health-alert.ts` exports `resolveHealthAlertById`.
 *     2. The function gates on `eq(id) && eq(scope) && isNull(resolvedAt)`
 *        so already-resolved rows return `{ resolved: false }`.
 *     3. `health-router.ts` mounts `resolveAlert` as an
 *        `adminProcedure.mutation`.
 *     4. The Zod input is `{ alertId: positive int }`.
 *
 *   Client:
 *     5. Panel binds `resolveAlertMutation` with onSuccess invalidating
 *        `listOpen`.
 *     6. Per-row "Resolve" button with stable testid (parameterized by
 *        alert id).
 *     7. Mutation is gated to a specific in-flight `resolvingAlertId`
 *        (per-row pending state — sibling rows stay clickable).
 *     8. Feedback line surfaces both the `resolved=true` and
 *        `resolved=false` outcomes.
 *     9. The open-alerts table gained an "Action" column.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

const helperPath = resolve(
  __dirname,
  "../../server/agent-studio/services/graph/health-alert.ts",
);
const routerPath = resolve(
  __dirname,
  "../../server/agent-studio/services/graph/health-router.ts",
);
const panelPath = resolve(
  __dirname,
  "../../client/src/modules/agent-studio/components/GraphHealthAdminPanel.tsx",
);

describe("T-I.56 server-side: resolveHealthAlertById + tRPC mutation", () => {
  const helper = readFileSync(helperPath, "utf8");
  const router = readFileSync(routerPath, "utf8");

  it("health-alert.ts exports resolveHealthAlertById(id, scope)", () => {
    expect(/export\s+async\s+function\s+resolveHealthAlertById/.test(helper)).toBe(
      true,
    );
  });

  it("gates UPDATE on id + scope + resolvedAt IS NULL (idempotent semantics)", () => {
    expect(
      /resolveHealthAlertById[\s\S]{0,1500}eq\(\s*agsRuntimeAlerts\.id,\s*id\s*\)[\s\S]{0,400}eq\(\s*agsRuntimeAlerts\.scope,\s*scope\s*\)[\s\S]{0,400}isNull\(\s*agsRuntimeAlerts\.resolvedAt\s*\)/.test(
        helper,
      ),
    ).toBe(true);
  });

  it("returns { resolved: boolean } based on row-count discrimination", () => {
    expect(
      /resolveHealthAlertById[\s\S]{0,1500}return\s*\{\s*resolved:\s*cnt\s*>\s*0\s*\}/.test(
        helper,
      ),
    ).toBe(true);
  });

  it("graphHealthRouter exposes resolveAlert as an adminProcedure.mutation", () => {
    expect(
      /resolveAlert:\s*adminProcedure[\s\S]{0,300}\.mutation/.test(router),
    ).toBe(true);
  });

  it("router input schema requires positive-int alertId", () => {
    expect(router).toContain(
      "alertId: z.number().int().positive()",
    );
  });

  it("router pins scope='default' (single-global-scope assumption matches listOpen)", () => {
    expect(
      /resolveHealthAlertById\(\s*input\.alertId,\s*["']default["']\s*\)/.test(
        router,
      ),
    ).toBe(true);
  });
});

describe("T-I.56 client-side: resolve button on GraphHealthAdminPanel", () => {
  const src = readFileSync(panelPath, "utf8");

  it("panel binds resolveAlertMutation to graphHealth.resolveAlert", () => {
    expect(src).toContain(
      "trpc.agentStudio.graphHealth.resolveAlert.useMutation",
    );
  });

  it("onSuccess invalidates listOpen so the resolved row disappears", () => {
    expect(
      /onSuccess[\s\S]{0,800}graphHealth\.listOpen\.invalidate/.test(src),
    ).toBe(true);
  });

  it("renders per-row Resolve button with parameterized testid", () => {
    expect(src).toContain(
      "data-testid={`graph-health-alert-resolve-button-${a.id}`}",
    );
  });

  it("button is per-row gated to the in-flight resolvingAlertId", () => {
    expect(/disabled=\{resolvingAlertId\s*===\s*a\.id\}/.test(src)).toBe(true);
  });

  it("button label flips between Resolve / Resolving…", () => {
    expect(src).toContain("Resolving…");
    expect(src).toContain('"Resolve"');
  });

  it("feedback line surfaces both resolved=true and resolved=false outcomes", () => {
    expect(src).toContain("Resolved alert");
    expect(src).toContain("already resolved or not found");
  });

  it("feedback line uses a stable testid", () => {
    expect(src).toContain(
      'data-testid="graph-health-alert-resolve-feedback"',
    );
  });

  it("open-alerts table gained an Action column header", () => {
    expect(
      /graph-health-open-alerts-table[\s\S]{0,3000}<th\b[^>]*>Action<\/th>/.test(
        src,
      ),
    ).toBe(true);
  });

  it("error path surfaces the error in the feedback line", () => {
    expect(
      /onError[\s\S]{0,400}setResolveAlertFeedback[\s\S]{0,200}Resolve failed/.test(
        src,
      ),
    ).toBe(true);
  });

  it("error path also clears resolvingAlertId so the button is re-clickable", () => {
    expect(
      /onError[\s\S]{0,400}setResolvingAlertId\(null\)/.test(src),
    ).toBe(true);
  });
});
