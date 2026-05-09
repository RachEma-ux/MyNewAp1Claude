/**
 * C2-c6 (cycle-6 audit `/sdcard/Download/RUNTIME_GATE_AUDIT_2026-05-09.md`
 * §C2-c6) — per-row authorization on `toolApprovals.decide` lockstep.
 *
 * Pre-cycle-6: `toolApprovals.decide` ran `decideApprovalRequest(...)`
 * directly. `governedProcedure` only checks action-key-level RBAC
 * (cycle-3 R7 COARSE_CAPABILITY_ROLES); it does NOT check that the
 * caller has access to the specific approval row. An authenticated
 * user with API access could decide approvals on drafts they didn't
 * own by guessing or brute-forcing `approvalRequestId` —
 * cross-workspace privilege escalation.
 *
 * Post-cycle-6: the `decide` mutation resolves the approval row →
 * draft → agent chain and asserts `agent.ownerId === ctx.user.id` OR
 * `ctx.user.role === "admin"`. Throws FORBIDDEN otherwise; throws
 * NOT_FOUND when the chain doesn't resolve.
 *
 * This test locks the source — a future PR that removes the
 * authorization check, swaps the predicate, or short-circuits with a
 * test-only flag fails the lockstep. Behavioral integration coverage
 * is deferred to a B-coverage follow-up (mirrors cycle-4 L2-c4
 * pattern of source-scan-now + integration-test-later).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROUTER_PATH = join(
  process.cwd(),
  "server/agent-studio/api/tool-approvals-router.ts",
);

function strippedSource(): string {
  return readFileSync(ROUTER_PATH, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
}

describe("C2-c6 — toolApprovals.decide enforces per-row owner/admin authorization", () => {
  it("router carries the C2-c6 closure marker (file header + decide mutation)", () => {
    const raw = readFileSync(ROUTER_PATH, "utf8");
    expect(
      raw,
      "C2-c6 violated: tool-approvals-router.ts must carry the " +
        "`C2-c6` closure marker so a future audit (cycle-7+) can " +
        "trace the authz check back to its origin audit item.",
    ).toMatch(/C2-c6\b/);
  });

  it("router resolves the approval row → draft → agent chain", () => {
    // The chain must traverse:
    //   agsPendingPermissionRequests → agsAgentDrafts → agsAgents
    // so the agent's ownerId can be checked against ctx.user.id.
    const src = strippedSource();
    expect(
      src,
      "C2-c6 violated: decide must join through agsAgentDrafts " +
        "to resolve the owning agent's ownerId. Without the join, " +
        "the authz check has nothing to compare against.",
    ).toMatch(/innerJoin\s*\(\s*agsAgentDrafts/);
    expect(
      src,
      "C2-c6 violated: decide must join through agsAgents to " +
        "resolve ownerId. The agentDraft alone does not carry the " +
        "owner relationship (drafts can be re-owned).",
    ).toMatch(/innerJoin\s*\(\s*agsAgents/);
  });

  it("router enforces `ownerId === ctx.user.id` OR `role === \"admin\"`", () => {
    const src = strippedSource();
    // The authz predicate. Pin both clauses; flipping either one
    // silently widens the authz surface.
    expect(
      src,
      "C2-c6 violated: decide must check `owner.ownerId === ctx.user.id` " +
        "(the owner-equality clause). Removing this clause makes the " +
        "decide mutation accept any logged-in user.",
    ).toMatch(/owner\.ownerId\s*===\s*ctx\.user\.id/);
    expect(
      src,
      "C2-c6 violated: decide must allow admin override via " +
        "`ctx.user.role === \"admin\"`. Without the admin escape " +
        "hatch, ops cannot manage approvals on agents they don't own.",
    ).toMatch(/ctx\.user\.role\s*===\s*["']admin["']/);
  });

  it("router throws FORBIDDEN when neither owner nor admin", () => {
    const src = strippedSource();
    expect(
      src,
      "C2-c6 violated: decide must throw a FORBIDDEN tRPC error when " +
        "the caller is neither the owner nor an admin. Falling through " +
        "to decideApprovalRequest with a non-matching caller would " +
        "execute the mutation while logging the wrong actor.",
    ).toMatch(/code:\s*["']FORBIDDEN["']/);
  });

  it("router throws NOT_FOUND when the approval chain does not resolve", () => {
    const src = strippedSource();
    expect(
      src,
      "C2-c6 violated: decide must throw NOT_FOUND when the " +
        "approval row (or its draft / agent chain) doesn't resolve. " +
        "Returning a generic error leaks information about row " +
        "existence; throwing FORBIDDEN would conflate authz failure " +
        "with row absence.",
    ).toMatch(/code:\s*["']NOT_FOUND["']/);
  });

  it("router calls resolveApprovalOwner BEFORE decideApprovalRequest", () => {
    // Critical ordering: the owner check must happen before the
    // mutation. Inverting these would mean decideApprovalRequest
    // executes (writing audit + flipping status) before the authz
    // check fires.
    const src = strippedSource();
    const decideHandlerStart = src.indexOf(".mutation(async ({ ctx, input })");
    expect(
      decideHandlerStart,
      "C2-c6 violated: could not locate decide mutation handler",
    ).toBeGreaterThan(-1);
    const handlerBody = src.slice(decideHandlerStart);
    const resolveIdx = handlerBody.indexOf("resolveApprovalOwner");
    const decideIdx = handlerBody.indexOf("decideApprovalRequest");
    expect(
      resolveIdx,
      "C2-c6 violated: decide handler must call resolveApprovalOwner",
    ).toBeGreaterThan(-1);
    expect(
      decideIdx,
      "C2-c6 violated: decide handler must call decideApprovalRequest",
    ).toBeGreaterThan(-1);
    expect(
      resolveIdx < decideIdx,
      "C2-c6 violated: resolveApprovalOwner must run BEFORE " +
        "decideApprovalRequest. Inverting them means the mutation " +
        "fires (writes audit, flips status) before the authz check " +
        "runs — pointless authz, real escalation.",
    ).toBe(true);
  });
});
