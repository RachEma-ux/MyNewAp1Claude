import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { requireGovernedAction, type GovernanceReceipt } from "../governance/requireGovernedAction";
import { resolveActionKey } from "../governance/action-key-map";
import { isFrozen } from "../governance/scorecard";
import { getAppBlockerFromTRPCError, toTRPCError } from "./blockers";
import { captureUnexpectedTrpcError } from "../agent-studio/services/workspace-observability/public-api";

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

/**
 * Auto-capture middleware: every tRPC procedure error flows through here
 * so the dashboard sees real backend failures even from procedures that
 * never opted into per-router throwTrpcAndCapture wrapping (#490–#512
 * covered the agent-studio side; this catches every other procedure
 * across the whole tRPC tree — chat, providers, automation, modules,
 * data-analysis, etc.).
 *
 * The classifier inside captureUnexpectedTrpcError filters out expected
 * operator-side codes (BAD_REQUEST, NOT_FOUND, CONFLICT, etc.); only
 * INTERNAL_SERVER_ERROR + raw Error instances are persisted. Fail-soft:
 * a recorder failure can never escalate the original error.
 *
 * Per-router throwTrpcAndCapture wrappers remain valuable because they
 * carry richer per-router context (sourceKind = "vault.router" vs the
 * generic "trpc.<path>" emitted here). The middleware is the safety
 * net; the per-router wrappers are the precision instruments.
 */
const autoCaptureErrors = t.middleware(async (opts) => {
  let result;
  try {
    result = await opts.next();
  } catch (err) {
    // Some middlewares throw rather than returning {ok:false}; cover both.
    const sourceKind = `trpc.${opts.path || "unknown"}`;
    const ctxAny = opts.ctx as unknown as { user?: { id?: number } };
    void captureUnexpectedTrpcError(sourceKind, err, {
      userId: ctxAny.user?.id ?? null,
      metadata: { trpcPath: opts.path, type: opts.type },
    });
    throw err;
  }
  if (!result.ok) {
    const sourceKind = `trpc.${opts.path || "unknown"}`;
    const ctxAny = opts.ctx as unknown as { user?: { id?: number } };
    void captureUnexpectedTrpcError(sourceKind, (result as { error: unknown }).error, {
      userId: ctxAny.user?.id ?? null,
      metadata: { trpcPath: opts.path, type: opts.type },
    });
  }
  return result;
});

export const router = t.router;
export const publicProcedure = t.procedure.use(autoCaptureErrors);

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

export const protectedProcedure = t.procedure.use(autoCaptureErrors).use(requireUser);

export const adminProcedure = t.procedure.use(autoCaptureErrors).use(
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

  // ── Freeze check (BEFORE governance evaluation) ──────────────────────
  // System-wide freeze blocks ALL governed mutations immediately.
  if (isFrozen(0)) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "System-wide governance FREEZE active — all mutations blocked",
    });
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

export const governedProcedure = t.procedure.use(autoCaptureErrors).use(requireUser).use(requireGovernance);

export const governedAdminProcedure = t.procedure.use(autoCaptureErrors).use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
).use(requireGovernance);
