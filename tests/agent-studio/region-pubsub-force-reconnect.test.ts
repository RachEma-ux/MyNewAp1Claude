/**
 * Region cache pubsub force-reconnect. PR-V1-185.
 *
 * Symmetric with PR-V1-184 on the approval bus. Source-scan only:
 *   - service-layer function + both branches
 *   - barrel re-export
 *   - admin tRPC mutation
 *   - UI button + feedback wiring on RegionAdminPanel
 *   - hard-rule on the touched pubsub file
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("PR-V1-185 — region cache pubsub force-reconnect", () => {
  const pubsub = resolve(
    __dirname,
    "../../server/agent-studio/services/region/region-cache-pubsub.ts",
  );
  const barrel = resolve(
    __dirname,
    "../../server/agent-studio/services/region/public-api.ts",
  );
  const router = resolve(
    __dirname,
    "../../server/agent-studio/services/region/region-admin-router.ts",
  );
  const panel = resolve(
    __dirname,
    "../../client/src/modules/agent-studio/components/RegionAdminPanel.tsx",
  );

  it("pubsub module exports forceReconnectRegionCachePubsubSubscriber with both branches", () => {
    const src = readFileSync(pubsub, "utf8");
    expect(
      /export\s+function\s+forceReconnectRegionCachePubsubSubscriber/.test(
        src,
      ),
    ).toBe(true);
    expect(
      /export\s+interface\s+ForceReconnectRegionCachePubsubResult/.test(src),
    ).toBe(true);
    const body = src.slice(
      src.indexOf("export function forceReconnectRegionCachePubsubSubscriber"),
    );
    expect(/_subscriber\.handler\s*===\s*null/.test(body)).toBe(true);
    expect(/reason:\s*"not-subscribed"/.test(body)).toBe(true);
    expect(/clearTimeout\(_subscriber\.timer\)/.test(body)).toBe(true);
    expect(/subscribeRegionCacheInvalidations\(handler\)/.test(body)).toBe(true);
  });

  it("barrel re-exports the new function + interface", () => {
    const src = readFileSync(barrel, "utf8");
    expect(src).toContain("forceReconnectRegionCachePubsubSubscriber");
    expect(src).toContain("ForceReconnectRegionCachePubsubResult");
  });

  it("admin router exposes forceReconnectPubsub as adminProcedure.mutation", () => {
    const src = readFileSync(router, "utf8");
    expect(src).toContain("forceReconnectPubsub");
    expect(
      /forceReconnectPubsub:\s*adminProcedure[\s\S]{0,400}\.mutation\(/.test(
        src,
      ),
    ).toBe(true);
    expect(src).toContain("forceReconnectRegionCachePubsubSubscriber()");
  });

  it("RegionAdminPanel renders the force-reconnect button + feedback line", () => {
    const src = readFileSync(panel, "utf8");
    expect(src).toContain(
      "trpc.agentStudio.region.forceReconnectPubsub.useMutation",
    );
    expect(src).toContain('data-testid="region-pubsub-force-reconnect-button"');
    expect(src).toContain(
      'data-testid="region-pubsub-force-reconnect-feedback"',
    );
    // Mutation success invalidates the pubsub status query.
    expect(
      /utils\.agentStudio\.region\.getPubsubStatus\.invalidate/.test(src),
    ).toBe(true);
    // Both no-op and reconnected branches surfaced in feedback.
    expect(/data\.reconnected\s*\?[\s\S]{0,100}attempts/.test(src)).toBe(true);
    expect(/No-op\s*—\s*\$\{data\.reason/.test(src)).toBe(true);
  });

  it("hard-rule compliance on the touched pubsub file", () => {
    const src = readFileSync(pubsub, "utf8");
    expect(/process\.env\.[A-Z0-9_]+_API_KEY/.test(src)).toBe(false);
    expect(/credential-resolver/.test(src)).toBe(false);
    expect(/dispatchMcpToolCall/.test(src)).toBe(false);
    expect(/neo4j-driver/.test(src)).toBe(false);
  });
});
