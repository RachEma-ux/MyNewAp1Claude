import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { requireGovernedAction, type GovernanceReceipt } from "../governance/requireGovernedAction";
import { resolveActionKey } from "../governance/action-key-map";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

// ============================================================================
// Unified Governance Middleware — Platform Governance v1
//
// Routes EVERY governed mutation through requireGovernedAction():
//   1. Resolves tRPC path → action key via action-key-map
//   2. Runs the full governance pipeline (RBAC, freeze, risk, approval, evidence)
//   3. R1/R2 actions pass through with lightweight check (no GovernanceCenter)
//   4. R3+ actions trigger GovernanceCenter.evaluate() + requireGate()
//   5. Attaches GovernanceReceipt to context for downstream use
//
// No bypass path. No per-engine custom governance logic.
// ============================================================================
const requireGovernance = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  const rawInput = await (opts as any).getRawInput?.() ?? (opts as any).rawInput;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  // Resolve tRPC path to registered action key
  const trpcPath = opts.path || "system-mutation";
  const actionKey = resolveActionKey(trpcPath);

  // Derive subject from input
  const input = rawInput as Record<string, any> | undefined;
  const subjectId = input?.subjectId || input?.id || input?.entryId || "0";
  const subjectType = input?.subjectType || input?.type || "system";
  const workspaceId = input?.workspaceId;

  // Build governance input
  let receipt: GovernanceReceipt;
  try {
    receipt = await requireGovernedAction({
      actionKey,
      actorPrincipalId: String(ctx.user.id),
      actorRole: ctx.user.role || "user",
      orgId: "default",
      workspaceId: workspaceId ? String(workspaceId) : undefined,
      subject: {
        subjectType: String(subjectType),
        subjectId: String(subjectId),
      },
      context: {
        trpcPath,
        inputKeys: input ? Object.keys(input) : [],
      },
      // Pass evidence if provided in input
      evidence: input?._evidence ? {
        types: input._evidence.types || [],
        refs: input._evidence.refs || [],
      } : undefined,
      // Pass approvals if provided in input
      approvals: input?._approvals || undefined,
    });
  } catch (err: any) {
    // Action key not found in registry → deny-by-default
    throw new TRPCError({
      code: "FORBIDDEN",
      message: err.message || `Governance denied: ${actionKey}`,
    });
  }

  if (!receipt.allowed) {
    throw new TRPCError({
      code: "CONFLICT",
      message: receipt.denialReason || `Governance denied action "${actionKey}"`,
      cause: receipt,
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      governanceReceipt: receipt,
      // Backward compatibility: keep gateResult if present
      gateResult: receipt.gateResult,
    },
  });
});

export const governedProcedure = t.procedure.use(requireUser).use(requireGovernance);

export const governedAdminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
).use(requireGovernance);
