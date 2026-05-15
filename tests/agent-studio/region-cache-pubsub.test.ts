/**
 * Region cache pub-sub source-scan + boot-helper wiring — V2 Phase
 * MR-1 Phase-2 twelfth slice. PR-V1-160.
 *
 * Source-scan only — verifies wire-up. Behavioral test against a
 * real Postgres LISTEN/NOTIFY connection is downstream (Layer-11
 * cross-region routing test layer per the plan §4).
 *
 * Covers:
 *   - region-cache-pubsub.ts exports the 4 expected helpers + the
 *     boot opt-in (`maybeSubscribeRegionCachePubsub`).
 *   - Channel name is `ags_region_routing_invalidate`.
 *   - NOTIFY path quote-escapes single quotes + 200-char cap (PG cap is
 *     8000; we stay well under).
 *   - reloadCacheAfterChange in the bridge calls notifyRegionCacheInvalidation
 *     (cross-process fan-out wire-up).
 *   - install-region-routing.ts: subscribes when AGS_REGION_PUBSUB=on,
 *     and the subscriber's handler invalidates + re-warms.
 *   - Public-api barrel re-exports.
 *   - boot.ts log line includes pubsub=on|off.
 *   - Hard-rule compliance.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

describe("MR-1 Phase-2 — region cache pub-sub source-scan", () => {
  const pubsubFile = resolve(
    __dirname,
    "../../server/agent-studio/services/region/region-cache-pubsub.ts",
  );
  const bridgeFile = resolve(
    __dirname,
    "../../server/agent-studio/services/region/region-routing-bridge.ts",
  );
  const installFile = resolve(
    __dirname,
    "../../server/agent-studio/services/region/install-region-routing.ts",
  );
  const barrelFile = resolve(
    __dirname,
    "../../server/agent-studio/services/region/public-api.ts",
  );
  const bootFile = resolve(__dirname, "../../server/agent-studio/boot.ts");

  it("pubsub file declares the right channel + helpers", () => {
    const src = readFileSync(pubsubFile, "utf8");
    expect(src).toContain('CHANNEL = "ags_region_routing_invalidate"');
    expect(/export\s+async\s+function\s+notifyRegionCacheInvalidation/.test(src)).toBe(
      true,
    );
    expect(/export\s+function\s+subscribeRegionCacheInvalidations/.test(src)).toBe(
      true,
    );
    expect(/export\s+function\s+unsubscribeRegionCacheInvalidations/.test(src)).toBe(
      true,
    );
    expect(/export\s+function\s+maybeSubscribeRegionCachePubsub/.test(src)).toBe(
      true,
    );
  });

  it("NOTIFY path quote-escapes single quotes + 200-char cap", () => {
    const src = readFileSync(pubsubFile, "utf8");
    expect(/reason\.replace\(\/'/.test(src)).toBe(true);
    expect(/\.slice\(0,\s*200\)/.test(src)).toBe(true);
    // SQL is built via sql.raw with the channel + payload.
    expect(/NOTIFY\s+\$\{CHANNEL\},\s+'\$\{safe\}'/.test(src)).toBe(true);
  });

  it("subscriber implements reconnect backoff", () => {
    const src = readFileSync(pubsubFile, "utf8");
    expect(/scheduleReconnect/.test(src)).toBe(true);
    expect(/reconnectMs/.test(src)).toBe(true);
    expect(/setTimeout\(\(\)\s*=>/.test(src)).toBe(true);
    expect(/LISTEN\s+\$\{CHANNEL\}/.test(src)).toBe(true);
  });

  it("bridge's reloadCacheAfterChange fires notifyRegionCacheInvalidation", () => {
    const src = readFileSync(bridgeFile, "utf8");
    expect(src).toContain(
      'import { notifyRegionCacheInvalidation } from "./region-cache-pubsub.js"',
    );
    expect(/void\s+notifyRegionCacheInvalidation\s*\(\s*label\s*\)/.test(src)).toBe(
      true,
    );
  });

  it("install-region-routing.ts subscribes via maybeSubscribeRegionCachePubsub", () => {
    const src = readFileSync(installFile, "utf8");
    expect(src).toContain(
      'import { maybeSubscribeRegionCachePubsub } from "./region-cache-pubsub.js"',
    );
    expect(/maybeSubscribeRegionCachePubsub\s*\(/.test(src)).toBe(true);
    // Handler must invalidate + re-warm.
    expect(/invalidateRegionRoutingCache\s*\(/.test(src)).toBe(true);
    expect(/warmRegionRoutingCache\s*\(/.test(src)).toBe(true);
  });

  it("public-api barrel re-exports pub-sub helpers", () => {
    const src = readFileSync(barrelFile, "utf8");
    expect(src).toContain("./region-cache-pubsub.js");
    expect(src).toContain("notifyRegionCacheInvalidation");
    expect(src).toContain("subscribeRegionCacheInvalidations");
    expect(src).toContain("unsubscribeRegionCacheInvalidations");
    expect(src).toContain("maybeSubscribeRegionCachePubsub");
  });

  it("boot.ts log line includes pubsub=on|off", () => {
    const src = readFileSync(bootFile, "utf8");
    expect(/pubsub=\$\{result\.pubsubSubscribed\s*\?\s*"on"\s*:\s*"off"\}/.test(src)).toBe(
      true,
    );
  });

  it("hard-rule compliance on the pubsub file", () => {
    const src = readFileSync(pubsubFile, "utf8");
    // Only allowed env reads: DATABASE_URL (for the dedicated LISTEN
    // client) + DATABASE_URL_ASDB + AGS_REGION_PUBSUB (opt-in flag).
    // Generic *_API_KEY reads are disallowed.
    expect(/process\.env\.[A-Z0-9_]+_API_KEY/.test(src)).toBe(false);
    expect(/credential-resolver/.test(src)).toBe(false);
    expect(/dispatchMcpToolCall/.test(src)).toBe(false);
    expect(/neo4j-driver/.test(src)).toBe(false);
  });
});
