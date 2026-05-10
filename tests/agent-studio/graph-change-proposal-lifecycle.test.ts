/**
 * Phase 11.5 — GraphChangeProposalLifecycle unit tests.
 *
 * Drives the pure orchestration class against a stub adapter; verifies
 *   - validation failure → status="rejected", no createProposal call
 *   - validation pass + approvalRequired → status="in_review", queued audit
 *   - validation pass + auto-approve → status="approved", adapter.approve called
 *   - approve / reject / withdraw delegate to adapter and emit audit
 */

import { describe, it, expect } from "vitest";
import {
  GraphChangeProposalLifecycle,
  type GraphChangeProposalAdapter,
  type GraphChangeProposalGovernanceResult,
  type GraphChangeProposalRequest,
  type GraphChangeProposalValidationOutcome,
} from "../../server/agent-studio/services/graph-change-proposals/public-api.js";

interface Call {
  readonly method: string;
  readonly args: unknown[];
}

class StubAdapter implements GraphChangeProposalAdapter {
  calls: Call[] = [];
  validationOutcome: GraphChangeProposalValidationOutcome = {
    ok: true,
    errors: [],
  };
  governanceResult: GraphChangeProposalGovernanceResult = {
    approved: true,
    approvalRequired: false,
  };
  nextProposalId = 42;

  async validate(
    request: GraphChangeProposalRequest,
  ): Promise<GraphChangeProposalValidationOutcome> {
    this.calls.push({ method: "validate", args: [request] });
    return this.validationOutcome;
  }
  async evaluateGovernance(
    request: GraphChangeProposalRequest,
    validation: GraphChangeProposalValidationOutcome,
  ): Promise<GraphChangeProposalGovernanceResult> {
    this.calls.push({ method: "evaluateGovernance", args: [request, validation] });
    return this.governanceResult;
  }
  async createProposal(
    request: GraphChangeProposalRequest,
  ): Promise<{ proposalId: number }> {
    this.calls.push({ method: "createProposal", args: [request] });
    return { proposalId: this.nextProposalId };
  }
  async approve(
    proposalId: number,
    decidedByUserId: number,
    rationale?: string,
  ): Promise<void> {
    this.calls.push({ method: "approve", args: [proposalId, decidedByUserId, rationale] });
  }
  async reject(
    proposalId: number,
    decidedByUserId: number,
    rationale?: string,
  ): Promise<void> {
    this.calls.push({ method: "reject", args: [proposalId, decidedByUserId, rationale] });
  }
  async withdraw(proposalId: number, decidedByUserId: number): Promise<void> {
    this.calls.push({ method: "withdraw", args: [proposalId, decidedByUserId] });
  }
  async emitAuditEvent(
    proposalId: number,
    eventKind: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    this.calls.push({
      method: "emitAuditEvent",
      args: [proposalId, eventKind, metadata],
    });
  }
}

const baseRequest: GraphChangeProposalRequest = {
  proposalKind: "create_node",
  proposedByUserId: 7,
  summary: "Add Acme Corp as a Company entity",
  confidence: "high",
  items: [
    {
      itemKind: "node",
      itemPayload: { label: "Company", name: "Acme Corp" },
      sourceEvidence: { documentId: 42, confidence: 0.92 },
    },
  ],
};

describe("GraphChangeProposalLifecycle.submit", () => {
  it("returns status=rejected and skips createProposal when validation fails", async () => {
    const adapter = new StubAdapter();
    adapter.validationOutcome = {
      ok: false,
      errors: [{ field: "items", message: "empty items array" }],
    };
    const lifecycle = new GraphChangeProposalLifecycle(adapter);

    const r = await lifecycle.submit(baseRequest);
    expect(r).toEqual({ proposalId: -1, status: "rejected" });
    expect(adapter.calls.map((c) => c.method)).toEqual(["validate"]);
  });

  it("returns status=in_review when approvalRequired and not auto-approved", async () => {
    const adapter = new StubAdapter();
    adapter.governanceResult = {
      approved: false,
      approvalRequired: true,
      reviewers: [11, 22],
    };
    const lifecycle = new GraphChangeProposalLifecycle(adapter);

    const r = await lifecycle.submit(baseRequest);
    expect(r).toEqual({ proposalId: 42, status: "in_review" });
    expect(adapter.calls.map((c) => c.method)).toEqual([
      "validate",
      "evaluateGovernance",
      "createProposal",
      "emitAuditEvent",
    ]);
    const audit = adapter.calls.at(-1)!;
    expect(audit.args[1]).toBe("queued_for_review");
    expect((audit.args[2] as { reviewers: number[] }).reviewers).toEqual([11, 22]);
  });

  it("auto-approves when governance returns approvalRequired=false", async () => {
    const adapter = new StubAdapter();
    adapter.governanceResult = { approved: true, approvalRequired: false };
    const lifecycle = new GraphChangeProposalLifecycle(adapter);

    const r = await lifecycle.submit(baseRequest);
    expect(r).toEqual({ proposalId: 42, status: "approved" });

    const seq = adapter.calls.map((c) => c.method);
    expect(seq).toEqual([
      "validate",
      "evaluateGovernance",
      "createProposal",
      "approve",
      "emitAuditEvent",
    ]);
    const approveCall = adapter.calls.find((c) => c.method === "approve")!;
    expect(approveCall.args[1]).toBe(7); // proposedByUserId
    expect(approveCall.args[2]).toBe("auto_approve");
    expect(adapter.calls.at(-1)!.args[1]).toBe("auto_approved");
  });

  it("uses -1 as decidedBy when auto-approving without a proposedByUserId", async () => {
    const adapter = new StubAdapter();
    adapter.governanceResult = { approved: true, approvalRequired: false };
    const lifecycle = new GraphChangeProposalLifecycle(adapter);

    await lifecycle.submit({ ...baseRequest, proposedByUserId: undefined });
    const approveCall = adapter.calls.find((c) => c.method === "approve")!;
    expect(approveCall.args[1]).toBe(-1);
  });
});

describe("GraphChangeProposalLifecycle.approve / reject / withdraw", () => {
  it("approve delegates and emits audit event", async () => {
    const adapter = new StubAdapter();
    const lifecycle = new GraphChangeProposalLifecycle(adapter);
    const r = await lifecycle.approve(99, 5, "valid evidence");
    expect(r).toEqual({ status: "approved" });
    expect(adapter.calls[0]?.method).toBe("approve");
    expect(adapter.calls[0]?.args).toEqual([99, 5, "valid evidence"]);
    expect(adapter.calls[1]?.method).toBe("emitAuditEvent");
    expect(adapter.calls[1]?.args[1]).toBe("approved");
  });

  it("reject delegates and emits audit event", async () => {
    const adapter = new StubAdapter();
    const lifecycle = new GraphChangeProposalLifecycle(adapter);
    const r = await lifecycle.reject(99, 5, "duplicate of #42");
    expect(r).toEqual({ status: "rejected" });
    expect(adapter.calls[0]?.method).toBe("reject");
    expect(adapter.calls[1]?.args[1]).toBe("rejected");
  });

  it("withdraw delegates and emits audit event", async () => {
    const adapter = new StubAdapter();
    const lifecycle = new GraphChangeProposalLifecycle(adapter);
    const r = await lifecycle.withdraw(99, 7);
    expect(r).toEqual({ status: "withdrawn" });
    expect(adapter.calls[0]?.method).toBe("withdraw");
    expect(adapter.calls[1]?.args[1]).toBe("withdrawn");
  });
});
