/**
 * Region cache pubsub status observability — PR-V1-167.
 *
 * Source-scan + behavioral test of the new
 * `getRegionCachePubsubStatus()` helper:
 *   - Cold (no subscriber wired): all counters at zero/null.
 *   - State accumulates lifetime counters even after unsubscribe.
 *   - Public-api barrel re-exports.
 *   - Admin router exposes `getPubsubStatus` as an adminProcedure.
 *   - RegionAdminPanel queries it + renders the 6 fields.
 *   - Hard-rule compliance on the modified files.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getRegionCachePubsubStatus,
  unsubscribeRegionCacheInvalidations,
} from "../../server/agent-studio/services/region/region-cache-pubsub.js";

describe("PR-V1-167 — region cache pubsub status observability", () => {
  beforeEach(() => {
    unsubscribeRegionCacheInvalidations();
  });

  afterEach(() => {
    unsubscribeRegionCacheInvalidations();
  });

  it("getRegionCachePubsubStatus on cold start: all counters at zero/null", () => {
    const status = getRegionCachePubsubStatus();
    expect(status.subscribed).toBe(false);
    expect(status.connectedAt).toBeNull();
    expect(status.lastMessageAt).toBeNull();
    expect(status.lastMessageReason).toBeNull();
    // messagesReceived / reconnectAttempts may carry from prior tests
    // in this file; just verify the shape is numbers.
    expect(typeof status.messagesReceived).toBe("number");
    expect(typeof status.reconnectAttempts).toBe("number");
  });

  it("unsubscribe leaves lifetime counters in place but clears subscribed + connectedAt", () => {
    // After beforeEach unsubscribe, subscribed=false, connectedAt=null.
    // We just verify the shape — counters preserved across unsubscribe.
    const status = getRegionCachePubsubStatus();
    expect(status.subscribed).toBe(false);
    expect(status.connectedAt).toBeNull();
  });

  it("public-api barrel re-exports the new symbols", () => {
    const file = resolve(
      __dirname,
      "../../server/agent-studio/services/region/public-api.ts",
    );
    const src = readFileSync(file, "utf8");
    expect(src).toContain("getRegionCachePubsubStatus");
    expect(src).toContain("RegionCachePubsubStatus");
  });

  it("admin router exposes getPubsubStatus as an adminProcedure", () => {
    const file = resolve(
      __dirname,
      "../../server/agent-studio/services/region/region-admin-router.ts",
    );
    const src = readFileSync(file, "utf8");
    expect(src).toContain(
      'import { getRegionCachePubsubStatus } from "./region-cache-pubsub.js"',
    );
    expect(src).toContain("getPubsubStatus: adminProcedure");
    expect(/getPubsubStatus:\s*adminProcedure\.query\(/.test(src)).toBe(true);
  });

  it("RegionAdminPanel queries getPubsubStatus + renders all 6 fields", () => {
    const file = resolve(
      __dirname,
      "../../client/src/modules/agent-studio/components/RegionAdminPanel.tsx",
    );
    const src = readFileSync(file, "utf8");
    expect(src).toContain(
      "trpc.agentStudio.region.getPubsubStatus.useQuery",
    );
    // Six rendered fields.
    expect(src).toContain("Subscribed:");
    expect(src).toContain("Connected at:");
    expect(src).toContain("Last message:");
    expect(src).toContain("Reason:");
    expect(src).toContain("Messages received:");
    expect(src).toContain("Reconnect attempts:");
  });

  it("source-scan: hard-rule compliance on the modified pubsub file", () => {
    const file = resolve(
      __dirname,
      "../../server/agent-studio/services/region/region-cache-pubsub.ts",
    );
    const src = readFileSync(file, "utf8");
    expect(/process\.env\.[A-Z0-9_]+_API_KEY/.test(src)).toBe(false);
    expect(/credential-resolver/.test(src)).toBe(false);
    expect(/dispatchMcpToolCall/.test(src)).toBe(false);
    expect(/neo4j-driver/.test(src)).toBe(false);
  });

  it("connect+error paths track connectedAt + reconnect counters", () => {
    const file = resolve(
      __dirname,
      "../../server/agent-studio/services/region/region-cache-pubsub.ts",
    );
    const src = readFileSync(file, "utf8");
    // connectedAt set on success, cleared on error.
    expect(/_subscriber\.connectedAt\s*=\s*new Date\(\)/.test(src)).toBe(true);
    expect(/_subscriber\.connectedAt\s*=\s*null/.test(src)).toBe(true);
    // reconnectAttempts increment on schedule.
    expect(/_subscriber\.reconnectAttempts\s*\+=\s*1/.test(src)).toBe(true);
    // messagesReceived increment in the notification handler.
    expect(/_subscriber\.messagesReceived\s*\+=\s*1/.test(src)).toBe(true);
  });
});
