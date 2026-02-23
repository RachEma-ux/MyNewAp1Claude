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

// Governance middleware — always runs requireGate() for every governed mutation.
// No bypass path: explicit lifecycle subjects use their own stage, all other
// mutations are checked as system subjects at the "mutate" stage.
const requireGovernance = t.middleware(async (opts) => {
  const { ctx, next, rawInput } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  // 1. Always check system-wide freeze
  if (isFrozen(0)) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "System-wide governance FREEZE active — all mutations blocked. Resolve drift violations first.",
    });
  }

  // 2. Derive subject from input OR create system subject
  const input = rawInput as Record<string, any> | undefined;
  let subject: { id: number; name: string; type: string; tags: string[]; description?: string; config?: any };
  let stage: string;

  if (input?.subjectId && input?.stage) {
    // Explicit subject — lifecycle mutation
    subject = {
      id: input.subjectId,
      name: input.subjectName || `Subject #${input.subjectId}`,
      type: input.subjectType || "unknown",
      tags: input.tags || [],
      description: input.description,
      config: input.config,
    };
    stage = input.stage;
  } else {
    // System subject — non-lifecycle mutation
    const procedureName = opts.path || "system-mutation";
    subject = {
      id: 0,
      name: procedureName,
      type: "system",
      tags: [],
    };
    stage = "mutate";
  }

  // 3. Always run requireGate
  const result = await requireGate(
    stage as any,
    subject,
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

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      gateResult: result,
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
