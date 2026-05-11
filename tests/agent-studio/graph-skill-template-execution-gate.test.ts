/**
 * Phase 12.5 §13 — Graph Skill template-execution gate service tests.
 *
 * Covers `createTemplateExecutionGate()` from
 * `services/graph-skill/template-execution-gate.ts`. Same "active-key"
 * side-channel fake-DB pattern as §5/§7/§11.
 */

import { describe, it, expect, vi } from "vitest";
import { createTemplateExecutionGate } from "../../server/agent-studio/services/graph-skill/template-execution-gate";

type SelectChain = {
  from: () => SelectChain;
  where: () => SelectChain;
  limit: (n: number) => Promise<Array<Record<string, unknown>>>;
};

interface FakeDb {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
}

interface FakeState {
  metaByKey: Record<
    string,
    { readOnly: boolean; allowedRoles: string[] | null; riskLevel: string }
  >;
  selectCalls: number;
  activeKey?: string;
}

function makeFakeDb(initial: Partial<FakeState> = {}) {
  const state: FakeState = {
    metaByKey: initial.metaByKey ?? {},
    selectCalls: 0,
  };
  const select = vi.fn(() => {
    state.selectCalls += 1;
    const chain: SelectChain = {
      from: () => chain,
      where: () => chain,
      limit: async () => {
        const meta = state.activeKey ? state.metaByKey[state.activeKey] : undefined;
        return meta ? [meta] : [];
      },
    };
    return chain;
  });
  return {
    db: { select, insert: vi.fn() } as FakeDb,
    state,
  };
}

const RT = (userRole?: string) => ({ userRole, workspaceId: 1 });

describe("createTemplateExecutionGate — Phase 12.5 §13", () => {
  it("fails open when ASDB is unavailable", async () => {
    const gate = createTemplateExecutionGate({ getDb: () => null as never });
    const decision = await gate({ templateKey: "any", runtime: RT() });
    expect(decision.allowed).toBe(true);
  });

  it("fails open when the templateKey is unknown (no row)", async () => {
    const { db, state } = makeFakeDb();
    state.activeKey = "ghost";
    const gate = createTemplateExecutionGate({ getDb: () => db as never });
    const decision = await gate({
      templateKey: "ghost",
      runtime: RT("operator"),
    });
    expect(decision.allowed).toBe(true);
  });

  it("DENIES mutation templates with reason=mutation_not_allowed", async () => {
    const { db, state } = makeFakeDb({
      metaByKey: {
        "tpl-mut": { readOnly: false, allowedRoles: null, riskLevel: "low" },
      },
    });
    state.activeKey = "tpl-mut";
    const gate = createTemplateExecutionGate({ getDb: () => db as never });
    const decision = await gate({
      templateKey: "tpl-mut",
      runtime: RT("admin"),
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toBe("mutation_not_allowed");
    }
  });

  it("ALLOWS read-only templates with no role restrictions", async () => {
    const { db, state } = makeFakeDb({
      metaByKey: {
        "tpl-ro": { readOnly: true, allowedRoles: null, riskLevel: "low" },
      },
    });
    state.activeKey = "tpl-ro";
    const gate = createTemplateExecutionGate({ getDb: () => db as never });
    const decision = await gate({
      templateKey: "tpl-ro",
      runtime: RT("operator"),
    });
    expect(decision.allowed).toBe(true);
  });

  it("DENIES with role_not_allowed when caller's role isn't in allowed_roles", async () => {
    const { db, state } = makeFakeDb({
      metaByKey: {
        "tpl-admin": {
          readOnly: true,
          allowedRoles: ["admin"],
          riskLevel: "low",
        },
      },
    });
    state.activeKey = "tpl-admin";
    const gate = createTemplateExecutionGate({ getDb: () => db as never });
    const decision = await gate({
      templateKey: "tpl-admin",
      runtime: RT("operator"),
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toBe("role_not_allowed");
    }
  });

  it("ALLOWS when caller's role is in allowed_roles", async () => {
    const { db, state } = makeFakeDb({
      metaByKey: {
        "tpl-admin": {
          readOnly: true,
          allowedRoles: ["admin", "operator"],
          riskLevel: "low",
        },
      },
    });
    state.activeKey = "tpl-admin";
    const gate = createTemplateExecutionGate({ getDb: () => db as never });
    const decision = await gate({
      templateKey: "tpl-admin",
      runtime: RT("operator"),
    });
    expect(decision.allowed).toBe(true);
  });

  it("DENIES high-risk templates for non-admins with high_risk_admin_only", async () => {
    const { db, state } = makeFakeDb({
      metaByKey: {
        "tpl-high": { readOnly: true, allowedRoles: null, riskLevel: "high" },
      },
    });
    state.activeKey = "tpl-high";
    const gate = createTemplateExecutionGate({ getDb: () => db as never });
    const decision = await gate({
      templateKey: "tpl-high",
      runtime: RT("operator"),
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toBe("high_risk_admin_only");
    }
  });

  it("ALLOWS high-risk templates for admins", async () => {
    const { db, state } = makeFakeDb({
      metaByKey: {
        "tpl-high": { readOnly: true, allowedRoles: null, riskLevel: "high" },
      },
    });
    state.activeKey = "tpl-high";
    const gate = createTemplateExecutionGate({ getDb: () => db as never });
    const decision = await gate({
      templateKey: "tpl-high",
      runtime: RT("admin"),
    });
    expect(decision.allowed).toBe(true);
  });

  it("caches metadata across calls (single SELECT for repeated key)", async () => {
    const { db, state } = makeFakeDb({
      metaByKey: {
        "tpl-ro": { readOnly: true, allowedRoles: null, riskLevel: "low" },
      },
    });
    state.activeKey = "tpl-ro";
    const gate = createTemplateExecutionGate({ getDb: () => db as never });
    for (let i = 0; i < 3; i++) {
      await gate({ templateKey: "tpl-ro", runtime: RT("operator") });
    }
    expect(state.selectCalls).toBe(1);
  });

  it("denial precedence: read-only check fires before role check", async () => {
    // A mutating template with the operator's role in allowed_roles
    // still denies via mutation_not_allowed — read-only is the
    // primary contract.
    const { db, state } = makeFakeDb({
      metaByKey: {
        "tpl-mut-w-role": {
          readOnly: false,
          allowedRoles: ["operator"],
          riskLevel: "low",
        },
      },
    });
    state.activeKey = "tpl-mut-w-role";
    const gate = createTemplateExecutionGate({ getDb: () => db as never });
    const decision = await gate({
      templateKey: "tpl-mut-w-role",
      runtime: RT("operator"),
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toBe("mutation_not_allowed");
    }
  });
});
