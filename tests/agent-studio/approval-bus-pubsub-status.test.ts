/**
 * Approval event bus pubsub status — symmetric with PR-V1-167.
 * PR-V1-168.
 *
 * Source-scan + behavioral test of:
 *   - `getApprovalBusPubsubStatus()` cold-state shape.
 *   - State-tracking paths in the pubsub file (counters incremented
 *     in the notification handler + reconnect path).
 *   - `approval-bus-admin-router.ts` exposes `getPubsubStatus`.
 *   - Mount at `agentStudio.approvalBus.*` in `api/router.ts`.
 *   - Hard-rule compliance.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  getApprovalBusPubsubStatus,
  unsubscribeApprovalDecidedEvents,
} from "../../server/agent-studio/services/runtime/approval-event-bus-pubsub.js";

describe("PR-V1-168 — approval bus pubsub status observability", () => {
  beforeEach(() => {
    unsubscribeApprovalDecidedEvents();
  });

  afterEach(() => {
    unsubscribeApprovalDecidedEvents();
  });

  it("cold state: subscribed=false, connectedAt=null", () => {
    const s = getApprovalBusPubsubStatus();
    expect(s.subscribed).toBe(false);
    expect(s.connectedAt).toBeNull();
    expect(typeof s.messagesReceived).toBe("number");
    expect(typeof s.malformedReceived).toBe("number");
    expect(typeof s.reconnectAttempts).toBe("number");
    expect(s.lastApprovalRequestId == null || typeof s.lastApprovalRequestId === "number").toBe(true);
  });

  it("status shape carries the full 7-field surface", () => {
    const s = getApprovalBusPubsubStatus();
    expect(s).toHaveProperty("subscribed");
    expect(s).toHaveProperty("connectedAt");
    expect(s).toHaveProperty("lastMessageAt");
    expect(s).toHaveProperty("lastApprovalRequestId");
    expect(s).toHaveProperty("messagesReceived");
    expect(s).toHaveProperty("malformedReceived");
    expect(s).toHaveProperty("reconnectAttempts");
  });

  it("source-scan: pubsub file tracks the 6 lifetime counters", () => {
    const file = resolve(
      __dirname,
      "../../server/agent-studio/services/runtime/approval-event-bus-pubsub.ts",
    );
    const src = readFileSync(file, "utf8");
    // Notification path: messagesReceived + lastApprovalRequestId.
    expect(/_subscriber\.messagesReceived\s*\+=\s*1/.test(src)).toBe(true);
    expect(/_subscriber\.lastApprovalRequestId\s*=\s*event\.approvalRequestId/.test(src)).toBe(true);
    expect(/_subscriber\.lastMessageAt\s*=\s*new Date\(\)/.test(src)).toBe(true);
    // Malformed counter on the bad-payload branch.
    expect(/_subscriber\.malformedReceived\s*\+=\s*1/.test(src)).toBe(true);
    // Connect/error tracking.
    expect(/_subscriber\.connectedAt\s*=\s*new Date\(\)/.test(src)).toBe(true);
    expect(/_subscriber\.connectedAt\s*=\s*null/.test(src)).toBe(true);
    // Reconnect counter.
    expect(/_subscriber\.reconnectAttempts\s*\+=\s*1/.test(src)).toBe(true);
  });

  it("admin router exposes getPubsubStatus as adminProcedure", () => {
    const file = resolve(
      __dirname,
      "../../server/agent-studio/services/runtime/approval-bus-admin-router.ts",
    );
    const src = readFileSync(file, "utf8");
    expect(src).toContain(
      'import { getApprovalBusPubsubStatus } from "./approval-event-bus-pubsub.js"',
    );
    expect(src).toContain("getPubsubStatus: adminProcedure");
    expect(/getPubsubStatus:\s*adminProcedure\.query\(/.test(src)).toBe(true);
  });

  it("agent-studio router mounts approvalBusAdminRouter at `approvalBus`", () => {
    const file = resolve(__dirname, "../../server/agent-studio/api/router.ts");
    const src = readFileSync(file, "utf8");
    expect(src).toContain(
      'import { approvalBusAdminRouter } from "../services/runtime/approval-bus-admin-router"',
    );
    expect(/approvalBus:\s*approvalBusAdminRouter\b/.test(src)).toBe(true);
  });

  it("hard-rule compliance on the modified pubsub file", () => {
    const file = resolve(
      __dirname,
      "../../server/agent-studio/services/runtime/approval-event-bus-pubsub.ts",
    );
    const src = readFileSync(file, "utf8");
    expect(/process\.env\.[A-Z0-9_]+_API_KEY/.test(src)).toBe(false);
    expect(/credential-resolver/.test(src)).toBe(false);
    expect(/dispatchMcpToolCall/.test(src)).toBe(false);
    expect(/neo4j-driver/.test(src)).toBe(false);
  });
});
