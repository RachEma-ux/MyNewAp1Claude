import { describe, it, expect, beforeEach } from "vitest";
import { AdmissionInterceptor } from "../../../modules/agents/interceptors/AdmissionInterceptor";
import { InterceptorChain } from "../../../modules/agents/interceptors/InterceptorChain";
import type { InterceptorContext } from "../../../modules/agents/types";

/**
 * Admission Control Tests
 * Phase 2: Embedded Orchestrator Runtime
 * 
 * Tests all 7 validation checks in admission interceptor
 */

describe("Admission Control - Sandbox Agents", () => {
  let interceptor: AdmissionInterceptor;

  beforeEach(() => {
    interceptor = new AdmissionInterceptor();
  });

  it("should allow valid sandbox agent", async () => {
    const context: InterceptorContext = {
      agent: {
        mode: "sandbox",
        expiresAt: new Date(Date.now() + 86400000).toISOString(), // 24h from now
        sandboxConstraints: {
          externalCalls: false,
          persistentWrites: false,
        },
      },
      workspaceId: "test-workspace",
      policyHash: "test-hash",
      timestamp: new Date(),
    };

    const decision = await interceptor.execute(context);

    expect(decision.allow).toBe(true);
    expect(decision.deny).toBeFalsy();
    expect(decision.errorCodes).toEqual([]);
  });

  it("should deny expired sandbox agent", async () => {
    const context: InterceptorContext = {
      agent: {
        mode: "sandbox",
        expiresAt: new Date(Date.now() - 3600000).toISOString(), // 1h ago
        sandboxConstraints: {
          externalCalls: false,
          persistentWrites: false,
        },
      },
      workspaceId: "test-workspace",
      policyHash: "test-hash",
      timestamp: new Date(),
    };

    const decision = await interceptor.execute(context);

    expect(decision.allow).toBe(false);
    expect(decision.deny).toBe(true);
    expect(decision.errorCodes).toContain("SANDBOX_EXPIRED");
  });

  it("should deny sandbox agent with external calls", async () => {
    const context: InterceptorContext = {
      agent: {
        mode: "sandbox",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        sandboxConstraints: {
          externalCalls: true, // Violation
          persistentWrites: false,
        },
      },
      workspaceId: "test-workspace",
      policyHash: "test-hash",
      timestamp: new Date(),
    };

    const decision = await interceptor.execute(context);

    expect(decision.allow).toBe(false);
    expect(decision.deny).toBe(true);
    expect(decision.errorCodes).toContain("CONTAINMENT_VIOLATION");
    expect(decision.reasons).toContain("Sandbox agents cannot make external calls");
  });

  it("should deny sandbox agent with persistent writes", async () => {
    const context: InterceptorContext = {
      agent: {
        mode: "sandbox",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        sandboxConstraints: {
          externalCalls: false,
          persistentWrites: true, // Violation
        },
      },
      workspaceId: "test-workspace",
      policyHash: "test-hash",
      timestamp: new Date(),
    };

    const decision = await interceptor.execute(context);

    expect(decision.allow).toBe(false);
    expect(decision.deny).toBe(true);
    expect(decision.errorCodes).toContain("CONTAINMENT_VIOLATION");
    expect(decision.reasons).toContain("Sandbox agents cannot make persistent writes");
  });
});

describe("Admission Control - Governed Agents", () => {
  let interceptor: AdmissionInterceptor;

  beforeEach(() => {
    interceptor = new AdmissionInterceptor();
  });

  it("should deny governed agent without proof", async () => {
    const context: InterceptorContext = {
      agent: {
        mode: "governed",
        // Missing governance.proofBundle
      },
      workspaceId: "test-workspace",
      policyHash: "test-hash",
      timestamp: new Date(),
    };

    const decision = await interceptor.execute(context);

    expect(decision.allow).toBe(false);
    expect(decision.deny).toBe(true);
    expect(decision.errorCodes).toContain("PROOF_MISSING");
  });

  it("should deny governed agent with tampered spec", async () => {
    const agent = {
      mode: "governed",
      name: "Test Agent",
      version: "1.0.0",
      governance: {
        proofBundle: {
          specHash: "original-hash-123",
          policyHash: "test-hash",
          authority: "system",
          signedAt: new Date().toISOString(),
          signature: "valid-signature",
        },
      },
    };

    const context: InterceptorContext = {
      agent,
      workspaceId: "test-workspace",
      policyHash: "test-hash",
      timestamp: new Date(),
    };

    const decision = await interceptor.execute(context);

    // Spec hash will not match because agent was modified
    expect(decision.allow).toBe(false);
    expect(decision.deny).toBe(true);
    expect(decision.errorCodes).toContain("SPEC_HASH_MISMATCH");
  });

  it("should deny governed agent with policy hash mismatch", async () => {
    const agent = {
      mode: "governed",
      name: "Test Agent",
      version: "1.0.0",
      governance: {
        proofBundle: {
          specHash: "spec-hash",
          policyHash: "old-policy-hash", // Different from current
          authority: "system",
          signedAt: new Date().toISOString(),
          signature: "valid-signature",
        },
      },
    };

    const context: InterceptorContext = {
      agent,
      workspaceId: "test-workspace",
      policyHash: "new-policy-hash", // Current policy hash
      timestamp: new Date(),
    };

    const decision = await interceptor.execute(context);

    expect(decision.allow).toBe(false);
    expect(decision.deny).toBe(true);
    expect(decision.errorCodes).toContain("POLICY_HASH_MISMATCH");
  });

  it("should deny governed agent with revoked signer", async () => {
    interceptor.addRevokedSigner("revoked-authority");

    const agent = {
      mode: "governed",
      name: "Test Agent",
      version: "1.0.0",
      governance: {
        proofBundle: {
          specHash: "spec-hash",
          policyHash: "test-hash",
          authority: "revoked-authority", // Revoked
          signedAt: new Date().toISOString(),
          signature: "valid-signature",
        },
      },
    };

    const context: InterceptorContext = {
      agent,
      workspaceId: "test-workspace",
      policyHash: "test-hash",
      timestamp: new Date(),
    };

    const decision = await interceptor.execute(context);

    expect(decision.allow).toBe(false);
    expect(decision.deny).toBe(true);
    expect(decision.errorCodes).toContain("SIGNER_REVOKED");
  });
});

describe("Interceptor Chain - Fail-Closed Behavior", () => {
  it("should deny if any interceptor denies", async () => {
    const chain = new InterceptorChain();

    // Add interceptor that allows
    chain.register({
      name: "AllowInterceptor",
      execute: async () => ({ allow: true, deny: false }),
    });

    // Add interceptor that denies
    chain.register({
      name: "DenyInterceptor",
      execute: async () => ({
        allow: false,
        deny: true,
        reasons: ["Denied by test"],
        errorCodes: ["TEST_DENY"],
      }),
    });

    const context: InterceptorContext = {
      agent: { mode: "sandbox" },
      workspaceId: "test",
      policyHash: "test",
      timestamp: new Date(),
    };

    const decision = await chain.execute(context);

    expect(decision.allow).toBe(false);
    expect(decision.deny).toBe(true);
    expect(decision.errorCodes).toContain("TEST_DENY");
  });

  it("should deny if interceptor throws error", async () => {
    const chain = new InterceptorChain();

    chain.register({
      name: "ErrorInterceptor",
      execute: async () => {
        throw new Error("Interceptor failed");
      },
    });

    const context: InterceptorContext = {
      agent: { mode: "sandbox" },
      workspaceId: "test",
      policyHash: "test",
      timestamp: new Date(),
    };

    const decision = await chain.execute(context);

    expect(decision.allow).toBe(false);
    expect(decision.deny).toBe(true);
    expect(decision.errorCodes).toContain("INTERCEPTOR_ERROR");
  });

  it("should allow if all interceptors allow", async () => {
    const chain = new InterceptorChain();

    chain.register({
      name: "Allow1",
      execute: async () => ({ allow: true, deny: false }),
    });

    chain.register({
      name: "Allow2",
      execute: async () => ({ allow: true, deny: false }),
    });

    const context: InterceptorContext = {
      agent: { mode: "sandbox" },
      workspaceId: "test",
      policyHash: "test",
      timestamp: new Date(),
    };

    const decision = await chain.execute(context);

    expect(decision.allow).toBe(true);
    expect(decision.deny).toBe(false);
  });
});
