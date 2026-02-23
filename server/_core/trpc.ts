import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { requireGate } from "../governance/requireGate";
import { isFrozen } from "../governance/scorecard";

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

// Governance middleware — checks system freeze + requireGate() for lifecycle mutations
const requireGovernance = t.middleware(async (opts) => {
  const { ctx, next, rawInput } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  // Check system-wide freeze
  if (isFrozen(0)) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "System-wide governance FREEZE active — all mutations blocked. Resolve drift violations first.",
    });
  }

  // If input includes governance metadata, run gate check
  let gateResult = null;
  const input = rawInput as Record<string, any> | undefined;
  if (input?.subjectId && input?.stage) {
    const result = requireGate(
      input.stage,
      {
        id: input.subjectId,
        name: input.subjectName || `Subject #${input.subjectId}`,
        type: input.subjectType || "unknown",
        tags: input.tags || [],
        description: input.description,
        config: input.config,
      },
      {
        id: String(ctx.user.id),
        role: ctx.user.role || "user",
      }
    );

    if (result.denied) {
      throw new TRPCError({
        code: "CONFLICT",
        message: result.reason,
        cause: result,
      });
    }
    gateResult = result;
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      gateResult,
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
