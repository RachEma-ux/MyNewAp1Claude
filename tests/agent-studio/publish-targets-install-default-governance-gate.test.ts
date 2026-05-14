/**
 * Default governance-gate boot installer — V1+ AS-4 (PR-V1-35).
 *
 * Covers:
 *   - parsePublishRequestIdFromBody pure parsing rule
 *     (valid positive integer → id; missing / non-integer / non-
 *     positive → null)
 *   - resolvePublishRequestIdFromPayload pulls from payload.body
 *   - maybeInstallDefaultGovernanceGate env-flag matrix:
 *     - unset → mode "off", installed=false, install NOT called
 *     - empty string → mode "off", installed=false
 *     - unrelated value → mode "off", installed=false
 *     - exact "approval_steps_payload_resolver" → mode set,
 *       installed=true, install called once with the composed gate
 *     - wrong casing → mode "off" (strict equality)
 *   - Composed gate uses payload.body.publishRequestId resolver and
 *     AS-1 adapter (verified by invoking the installed gate against
 *     a fake step-lister test seam)
 *   - Public-api re-export shape
 *   - Source-scan boundary
 */

import { readFileSync } from "fs";
import { resolve } from "path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  APPROVAL_STEPS_PAYLOAD_RESOLVER_MODE,
  PUBLISH_GOVERNANCE_GATE_ENV_VAR,
  maybeInstallDefaultGovernanceGate,
} from "../../server/agent-studio/services/publish-targets/install-default-governance-gate.js";
import {
  parsePublishRequestIdFromBody,
  resolvePublishRequestIdFromPayload,
} from "../../server/agent-studio/services/publish-targets/payload-publish-request-id-resolver.js";
import { __resetDefaultGovernanceGateForTests } from "../../server/agent-studio/services/publish-targets/default-governance-gate.js";
import type {
  GovernanceGateFn,
  PublishPayload,
  PublishTargetRecord,
} from "../../server/agent-studio/services/publish-targets/types.js";

afterEach(() => {
  __resetDefaultGovernanceGateForTests();
});

const TARGET: PublishTargetRecord = {
  id: 1,
  targetKey: "t",
  targetType: "staging_env",
  endpoint: "https://staging.example.com",
  providerConnectionId: null,
  config: null,
  enabled: true,
};

describe("parsePublishRequestIdFromBody — pure parsing rule", () => {
  it("returns the id for a positive integer", () => {
    expect(parsePublishRequestIdFromBody({ publishRequestId: 42 })).toBe(42);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["non-object string", "42"],
    ["non-object number", 42],
    ["array", [42]],
  ])("returns null for non-object body: %s", (_label, body) => {
    expect(parsePublishRequestIdFromBody(body)).toBeNull();
  });

  it.each([
    ["missing publishRequestId", {} as Record<string, unknown>],
    ["string publishRequestId", { publishRequestId: "42" }],
    ["null publishRequestId", { publishRequestId: null }],
    ["NaN publishRequestId", { publishRequestId: Number.NaN }],
    ["Infinity publishRequestId", { publishRequestId: Number.POSITIVE_INFINITY }],
    ["float publishRequestId", { publishRequestId: 1.5 }],
    ["zero publishRequestId", { publishRequestId: 0 }],
    ["negative publishRequestId", { publishRequestId: -7 }],
  ])("returns null for invalid id shape: %s", (_label, body) => {
    expect(parsePublishRequestIdFromBody(body)).toBeNull();
  });
});

describe("resolvePublishRequestIdFromPayload — async wrapper", () => {
  it("delegates to parsePublishRequestIdFromBody(payload.body)", async () => {
    const payload: PublishPayload = {
      sourcePromotionId: 10,
      body: { publishRequestId: 99 },
    };
    expect(await resolvePublishRequestIdFromPayload({ target: TARGET, payload })).toBe(99);
  });

  it("returns null when payload.body is missing the id", async () => {
    const payload: PublishPayload = {
      sourcePromotionId: 10,
      body: {},
    };
    expect(await resolvePublishRequestIdFromPayload({ target: TARGET, payload })).toBeNull();
  });
});

describe("maybeInstallDefaultGovernanceGate — env-flag matrix", () => {
  it("env flag unset → mode='off', installed=false, install NOT called", () => {
    const install = vi.fn();
    const res = maybeInstallDefaultGovernanceGate({ env: {}, install });
    expect(res).toEqual({ mode: "off", installed: false });
    expect(install).not.toHaveBeenCalled();
  });

  it.each([
    ["empty string", ""],
    ["unrelated value", "yes"],
    ["wrong mode", "approval_steps_payload_resolver_strict"],
    ["wrong case", "APPROVAL_STEPS_PAYLOAD_RESOLVER"],
  ])("env flag = %s → mode='off' (strict equality)", (_label, value) => {
    const install = vi.fn();
    const res = maybeInstallDefaultGovernanceGate({
      env: { [PUBLISH_GOVERNANCE_GATE_ENV_VAR]: value },
      install,
    });
    expect(res).toEqual({ mode: "off", installed: false });
    expect(install).not.toHaveBeenCalled();
  });

  it("env flag = approval_steps_payload_resolver → installed=true, install called once", () => {
    const install = vi.fn();
    const fakeGate: GovernanceGateFn = async () => "approved";
    const makeGate = vi.fn(() => fakeGate);
    const res = maybeInstallDefaultGovernanceGate({
      env: {
        [PUBLISH_GOVERNANCE_GATE_ENV_VAR]: APPROVAL_STEPS_PAYLOAD_RESOLVER_MODE,
      },
      install,
      makeGate,
    });
    expect(res).toEqual({
      mode: APPROVAL_STEPS_PAYLOAD_RESOLVER_MODE,
      installed: true,
    });
    expect(makeGate).toHaveBeenCalledTimes(1);
    expect(install).toHaveBeenCalledTimes(1);
    expect(install).toHaveBeenCalledWith(fakeGate);
  });

  it("default install path (no override) wires the composed gate via AS-2", async () => {
    const { hasDefaultGovernanceGate, getDefaultGovernanceGate } = await import(
      "../../server/agent-studio/services/publish-targets/default-governance-gate.js"
    );
    expect(hasDefaultGovernanceGate()).toBe(false);
    maybeInstallDefaultGovernanceGate({
      env: {
        [PUBLISH_GOVERNANCE_GATE_ENV_VAR]: APPROVAL_STEPS_PAYLOAD_RESOLVER_MODE,
      },
      // No `install` override → uses AS-2's installDefaultGovernanceGate
      // No `makeGate` override → uses AS-1 composed with AS-4 resolver
    });
    expect(hasDefaultGovernanceGate()).toBe(true);
    expect(typeof getDefaultGovernanceGate()).toBe("function");
  });
});

describe("composed gate end-to-end (AS-4 resolver + AS-1 adapter)", () => {
  it("returns 'pending' when payload has no publishRequestId (resolver → null)", async () => {
    const { createApprovalStepsGovernanceGate } = await import(
      "../../server/agent-studio/services/publish-targets/governance-gate-approval-steps.js"
    );
    const gate = createApprovalStepsGovernanceGate({
      resolvePublishRequestId: resolvePublishRequestIdFromPayload,
      // Test seam: should never be called when resolver returns null.
      listApprovalSteps: async () => {
        throw new Error("should not be called");
      },
    });
    const decision = await gate({
      target: TARGET,
      payload: { sourcePromotionId: 10, body: {} },
    });
    expect(decision).toBe("pending");
  });

  it("calls listApprovalSteps with the resolved id when payload carries publishRequestId", async () => {
    const { createApprovalStepsGovernanceGate } = await import(
      "../../server/agent-studio/services/publish-targets/governance-gate-approval-steps.js"
    );
    const lister = vi.fn(async (_id: number) => [
      { state: "approved" } as const,
      { state: "approved" } as const,
    ]);
    const gate = createApprovalStepsGovernanceGate({
      resolvePublishRequestId: resolvePublishRequestIdFromPayload,
      listApprovalSteps: lister,
    });
    const decision = await gate({
      target: TARGET,
      payload: {
        sourcePromotionId: 10,
        body: { publishRequestId: 555 },
      },
    });
    expect(lister).toHaveBeenCalledWith(555);
    expect(decision).toBe("approved");
  });
});

describe("public-api re-exports", () => {
  it("the publish-targets barrel re-exports the AS-4 surface", async () => {
    const barrel = await import(
      "../../server/agent-studio/services/publish-targets/index.js"
    );
    expect(typeof barrel.parsePublishRequestIdFromBody).toBe("function");
    expect(typeof barrel.resolvePublishRequestIdFromPayload).toBe("function");
    expect(typeof barrel.maybeInstallDefaultGovernanceGate).toBe("function");
    expect(barrel.PUBLISH_GOVERNANCE_GATE_ENV_VAR).toBe(
      "AGS_PUBLISH_GOVERNANCE_GATE",
    );
    expect(barrel.APPROVAL_STEPS_PAYLOAD_RESOLVER_MODE).toBe(
      "approval_steps_payload_resolver",
    );
  });
});

describe("source-scan boundary", () => {
  const resolverFile = resolve(
    __dirname,
    "../../server/agent-studio/services/publish-targets/payload-publish-request-id-resolver.ts",
  );
  const installerFile = resolve(
    __dirname,
    "../../server/agent-studio/services/publish-targets/install-default-governance-gate.ts",
  );
  const resolverSrc = readFileSync(resolverFile, "utf8");
  const installerSrc = readFileSync(installerFile, "utf8");

  it.each([
    ["resolver", "credential-resolver", () => resolverSrc],
    ["installer", "credential-resolver", () => installerSrc],
  ])("%s does not import credential-resolver", (_label, _pattern, getSrc) => {
    expect(/from\s+["'][^"']*credential-resolver/.test(getSrc())).toBe(false);
  });

  it.each([
    ["resolver", () => resolverSrc],
    ["installer", () => installerSrc],
  ])("%s does not import dispatchMcpToolCall", (_label, getSrc) => {
    expect(
      /import[^;]*dispatchMcpToolCall[^;]*from\s+["'][^"']*mcp\/dispatcher/.test(
        getSrc(),
      ),
    ).toBe(false);
  });

  it.each([
    ["resolver", () => resolverSrc],
    ["installer", () => installerSrc],
  ])("%s does not read process.env.*_API_KEY", (_label, getSrc) => {
    expect(/process\.env\.[A-Z_]*_API_KEY/.test(getSrc())).toBe(false);
  });

  it.each([
    ["resolver", () => resolverSrc],
    ["installer", () => installerSrc],
  ])("%s does not import neo4j-driver", (_label, getSrc) => {
    expect(/from\s+["']neo4j-driver["']/.test(getSrc())).toBe(false);
  });

  it("resolver does not import drizzle-orm (pure parsing, no DB)", () => {
    expect(/from\s+["']drizzle-orm/.test(resolverSrc)).toBe(false);
  });
});
