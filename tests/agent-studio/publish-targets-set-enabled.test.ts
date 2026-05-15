/**
 * Publish-targets setEnabled mutation — PR-V1-187.
 *
 * Source-scan covering:
 *   - `setPublishTargetEnabled(targetId, enabled)` service-layer
 *     function + lookup-then-update split + not-found error.
 *   - `agentStudio.publishTargets.setEnabled` admin mutation.
 *   - UI toggle button per row with success invalidation.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-187 — publish-targets setEnabled mutation", () => {
  const queries = resolve(
    __dirname,
    "../../server/agent-studio/services/publish-targets/admin-queries.ts",
  );
  const router = resolve(
    __dirname,
    "../../server/agent-studio/services/publish-targets/admin-router.ts",
  );
  const barrel = resolve(
    __dirname,
    "../../server/agent-studio/services/publish-targets/index.ts",
  );
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/PublishTargetsAdminPanel.tsx",
  );

  it("service exports setPublishTargetEnabled with lookup-then-update", () => {
    const src = readFileSync(queries, "utf8");
    expect(
      /export\s+async\s+function\s+setPublishTargetEnabled/.test(src),
    ).toBe(true);
    expect(
      /export\s+class\s+PublishTargetNotFoundForToggleError/.test(src),
    ).toBe(true);
    const body = src.slice(
      src.indexOf("export async function setPublishTargetEnabled"),
    );
    // SELECT existing → UPDATE pattern (no UPDATE-without-lookup so
    // not-found surfaces a precise error).
    expect(/db\s*\n?\s*\.select/.test(body)).toBe(true);
    expect(/db\s*\n?\s*\.update\(agsPublishTargets\)/.test(body)).toBe(true);
    expect(
      /\.set\(\{\s*enabled,\s*updatedAt:\s*new Date\(\)\s*\}\)/.test(body),
    ).toBe(true);
    expect(/PublishTargetNotFoundForToggleError/.test(body)).toBe(true);
  });

  it("admin router exposes setEnabled as adminProcedure.mutation with boolean input", () => {
    const src = readFileSync(router, "utf8");
    expect(src).toContain("setEnabled");
    expect(
      /setEnabled:\s*adminProcedure[\s\S]{0,400}\.mutation\(/.test(src),
    ).toBe(true);
    expect(/enabled:\s*z\.boolean\(\)/.test(src)).toBe(true);
    expect(
      /setPublishTargetEnabled\(input\.targetId,\s*input\.enabled\)/.test(src),
    ).toBe(true);
  });

  it("barrel re-exports the function + error class", () => {
    const src = readFileSync(barrel, "utf8");
    expect(src).toContain("setPublishTargetEnabled");
    expect(src).toContain("PublishTargetNotFoundForToggleError");
  });

  it("UI renders per-row toggle button with mutation + invalidation", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(
      "trpc.agentStudio.publishTargets.setEnabled.useMutation",
    );
    expect(src).toContain("publish-target-toggle-");
    expect(
      /utils\.agentStudio\.publishTargets\.listTargets\.invalidate/.test(src),
    ).toBe(true);
    expect(src).toContain('data-testid="publish-targets-mutation-error"');
    // Button label flips by current enabled state.
    expect(/\{t\.enabled\s*\?\s*"disable"\s*:\s*"enable"\}/.test(src)).toBe(
      true,
    );
    // Click handler toggles by passing !t.enabled.
    expect(/enabled:\s*!t\.enabled/.test(src)).toBe(true);
  });

  it("hard-rule compliance on touched server-side paths", () => {
    for (const f of [queries, router]) {
      const src = readFileSync(f, "utf8");
      expect(/process\.env\.[A-Z0-9_]+_API_KEY/.test(src)).toBe(false);
      expect(/credential-resolver/.test(src)).toBe(false);
      expect(/dispatchMcpToolCall/.test(src)).toBe(false);
      expect(/neo4j-driver/.test(src)).toBe(false);
    }
  });
});
