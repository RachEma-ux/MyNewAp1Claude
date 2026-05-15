/**
 * Approval event bus cross-process pubsub source-scan + payload
 * round-trip — D-RESUME-5 closure. PR-V1-165.
 *
 * Covers:
 *   - Channel name (`ags_approval_decided`).
 *   - Helper exports (`notifyApprovalDecided`,
 *     `subscribeApprovalDecidedEvents`,
 *     `unsubscribeApprovalDecidedEvents`,
 *     `maybeSubscribeApprovalBusPubsub`).
 *   - Payload round-trip: `eventToPayload` + `payloadToEvent`
 *     preserves approvalRequestId / status / expiresAt; rejects
 *     malformed JSON.
 *   - `approval-event-bus.ts` now wires `setApprovalEventEmitHook`
 *     + `fireEmitHook(event)` in `emit()`.
 *   - `install-approval-bus-pubsub.ts` wires both directions
 *     (emit hook → notify; LISTEN → bus.emit) with the relayed-emit
 *     guard.
 *   - `boot.ts` wires Step 3.34 with the standard log shape.
 *   - Hard-rule compliance.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { describe, expect, it } from "vitest";

import { __test } from "../../server/agent-studio/services/runtime/approval-event-bus-pubsub.js";

describe("D-RESUME-5 — approval event bus cross-process pubsub", () => {
  const pubsubFile = resolve(
    __dirname,
    "../../server/agent-studio/services/runtime/approval-event-bus-pubsub.ts",
  );
  const busFile = resolve(
    __dirname,
    "../../server/agent-studio/services/runtime/approval-event-bus.ts",
  );
  const installFile = resolve(
    __dirname,
    "../../server/agent-studio/services/runtime/install-approval-bus-pubsub.ts",
  );
  const bootFile = resolve(__dirname, "../../server/agent-studio/boot.ts");

  it("pubsub file declares the right channel + helpers", () => {
    const src = readFileSync(pubsubFile, "utf8");
    expect(src).toContain('CHANNEL = "ags_approval_decided"');
    expect(/export\s+async\s+function\s+notifyApprovalDecided/.test(src)).toBe(
      true,
    );
    expect(/export\s+function\s+subscribeApprovalDecidedEvents/.test(src)).toBe(
      true,
    );
    expect(/export\s+function\s+unsubscribeApprovalDecidedEvents/.test(src)).toBe(
      true,
    );
    expect(/export\s+function\s+maybeSubscribeApprovalBusPubsub/.test(src)).toBe(
      true,
    );
  });

  it("payload round-trip preserves the event", () => {
    const original = {
      approvalRequestId: 42,
      status: "allowed" as const,
      expiresAt: new Date("2026-05-15T12:00:00Z"),
    };
    const payload = __test.eventToPayload(original);
    const parsed = __test.payloadToEvent(payload);
    expect(parsed).not.toBeNull();
    expect(parsed?.approvalRequestId).toBe(42);
    expect(parsed?.status).toBe("allowed");
    expect(parsed?.expiresAt?.toISOString()).toBe("2026-05-15T12:00:00.000Z");
  });

  it("payload round-trip handles null expiresAt", () => {
    const original = {
      approvalRequestId: 7,
      status: "denied" as const,
      expiresAt: null,
    };
    const parsed = __test.payloadToEvent(__test.eventToPayload(original));
    expect(parsed?.expiresAt).toBeNull();
  });

  it("payloadToEvent rejects malformed inputs", () => {
    expect(__test.payloadToEvent("not json")).toBeNull();
    expect(__test.payloadToEvent("{}")).toBeNull();
    expect(__test.payloadToEvent('{"approvalRequestId":"not-a-number"}')).toBeNull();
  });

  it("approval-event-bus.ts exports emit hook + calls fireEmitHook in emit()", () => {
    const src = readFileSync(busFile, "utf8");
    expect(/export\s+function\s+setApprovalEventEmitHook/.test(src)).toBe(true);
    expect(/function\s+fireEmitHook/.test(src)).toBe(true);
    // emit() calls fireEmitHook after the local emit.
    expect(
      /emit\(event: ApprovalDecidedEvent\): void \{\s*\n\s*emitter\.emit[\s\S]{0,200}fireEmitHook\(event\)/.test(
        src,
      ),
    ).toBe(true);
  });

  it("install-approval-bus-pubsub.ts wires both directions with relayed-emit guard", () => {
    const src = readFileSync(installFile, "utf8");
    expect(/_inRelayedEmit\s*=\s*false/.test(src)).toBe(true);
    expect(/setApprovalEventEmitHook\(\s*\(event\)\s*=>/.test(src)).toBe(true);
    expect(/maybeSubscribeApprovalBusPubsub\(\s*\(event\)\s*=>/.test(src)).toBe(
      true,
    );
    // Outbound path checks the guard.
    expect(/if\s*\(\s*_inRelayedEmit\s*\)\s*return\s*;/.test(src)).toBe(true);
    // Inbound path toggles the guard around bus.emit.
    expect(/_inRelayedEmit\s*=\s*true;[\s\S]{0,200}bus\.emit\(event\)/.test(src)).toBe(
      true,
    );
  });

  it("boot.ts wires Step 3.34 with the standard log shape", () => {
    const src = readFileSync(bootFile, "utf8");
    expect(src).toContain("Step 3.34");
    expect(src).toContain("AGS_APPROVAL_BUS_PUBSUB");
    expect(src).toContain(
      'await import(\n      "./services/runtime/install-approval-bus-pubsub"',
    );
    expect(src).toContain("[ags-approval-bus-pubsub] installed");
    expect(src).toContain("[ags-approval-bus-pubsub] not installed");
  });

  it("hard-rule compliance on the pubsub file", () => {
    const src = readFileSync(pubsubFile, "utf8");
    expect(/process\.env\.[A-Z0-9_]+_API_KEY/.test(src)).toBe(false);
    expect(/credential-resolver/.test(src)).toBe(false);
    expect(/dispatchMcpToolCall/.test(src)).toBe(false);
    expect(/neo4j-driver/.test(src)).toBe(false);
  });
});
