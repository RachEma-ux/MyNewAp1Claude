import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { requireGovernedAction, type GovernanceReceipt } from "../governance/requireGovernedAction";
import { resolveActionKey } from "../governance/action-key-map";
import { getAppBlockerFromTRPCError, toTRPCError } from "./blockers";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    const trpcError = toTRPCError(error);
    const appBlocker = getAppBlockerFromTRPCError(trpcError);

    return {
      ...shape,
      message: appBlocker.summary,
      data: {
        ...shape.data,
        appBlocker,
      },
    };
  },
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

const requireGovernance = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  const rawInput = await (opts as any).getRawInput?.() ?? (opts as any).rawInput;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  const trpcPath = opts.path || "system-mutation";
  const actionKey = resolveActionKey(trpcPath);

  const input = rawInput as Record<string, any> | undefined;
  const subjectId = input?.subjectId || input?.id || input?.entryId || "0";
  const subjectType = input?.subjectType || input?.type || "system";
  const workspaceId = input?.workspaceId;

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
      evidence: input?._evidence ? {
        types: input._evidence.types || [],
        refs: input._evidence.refs || [],
      } : undefined,
      approvals: input?._approvals || undefined,
    });
  } catch (err: any) {
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
