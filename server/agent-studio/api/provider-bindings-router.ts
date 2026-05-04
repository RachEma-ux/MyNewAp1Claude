/**
 * Agent Studio — provider bindings tRPC sub-router.
 *
 * Plan v3 Phase 14. Wraps the Phase 12 gateway actions for the
 * frontend binding picker. Cross-module fetches (AI Types catalog,
 * Provider Connections active set) go through the platform gateway;
 * in-module operations call `bindings.ts` directly.
 *
 * No procedure returns credential material. Every output is the
 * no-secret projection enforced by `FORBIDDEN_BINDING_KEYS`.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../../_core/trpc";
import {
  upsertAgentProviderBinding,
  getAgentProviderBinding,
  listBindingsForAgent,
  removeAgentProviderBinding,
  validateBindingPolicy,
  refreshBindingValidation,
  resolveForRun,
} from "../bindings";
import { runTestWithBinding } from "../services/test-run-binding";
import { gatewayCall } from "../../platform/modules/module-gateway";
import { getCurrentDraft } from "../repository";

const upsertSchema = z.object({
  workspaceId: z.number().int().positive(),
  agentId: z.number().int().positive(),
  draftId: z.number().int().positive(),
  role: z.string().min(1).max(32).optional(),
  providerCatalogEntryId: z.number().int().positive().nullable(),
  modelCatalogEntryId: z.number().int().positive().nullable(),
  providerConnectionId: z.number().int().positive().nullable(),
  modelRef: z.string().min(1),
  status: z.enum(["binding_v1", "legacy_unresolved", "disabled", "archived"]),
  statusReason: z
    .enum([
      "legacy_raw_api_key",
      "legacy_env_var",
      "legacy_no_credential",
      "provider_slug_unknown",
      "migration_skipped",
    ])
    .optional()
    .nullable(),
  legacyEnvVarHint: z.string().optional().nullable(),
  createdBy: z.number().int().positive(),
});

export const providerBindingsRouter = router({
  /**
   * Resolve `(agentId)` → `(draftId)` so the binding picker page can
   * fetch its other queries without depending on the runtime config
   * endpoint's shape. `ags_agents` / `ags_agent_drafts` are not
   * workspace-scoped at the table level — workspace is supplied by
   * the caller (route param / current-workspace store).
   */
  pickerContext: protectedProcedure
    .input(z.object({ agentId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const draft = await getCurrentDraft(input.agentId);
      if (!draft) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No current draft for agentId=${input.agentId}`,
        });
      }
      return {
        agentId: input.agentId,
        draftId: draft.id,
      };
    }),

  /**
   * List bindings for an agent. Returns the public no-secret projection.
   */
  listForAgent: protectedProcedure
    .input(z.object({ agentId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return listBindingsForAgent(input.agentId);
    }),

  /**
   * Read a single binding by `(draftId, role)`.
   */
  getForDraft: protectedProcedure
    .input(
      z.object({
        draftId: z.number().int().positive(),
        role: z.string().min(1).max(32).optional(),
      }),
    )
    .query(async ({ input }) => {
      return getAgentProviderBinding(input.draftId, input.role);
    }),

  /**
   * Save (insert or update) a binding. Calls Phase 8's eligibility
   * gate before persisting `binding_v1` with a non-null
   * `providerConnectionId`.
   */
  upsert: protectedProcedure
    .input(upsertSchema)
    .mutation(async ({ input }) => {
      try {
        return await upsertAgentProviderBinding({
          workspaceId: input.workspaceId,
          agentId: input.agentId,
          draftId: input.draftId,
          role: input.role,
          providerCatalogEntryId: input.providerCatalogEntryId ?? null,
          modelCatalogEntryId: input.modelCatalogEntryId ?? null,
          providerConnectionId: input.providerConnectionId ?? null,
          modelRef: input.modelRef,
          status: input.status,
          statusReason: input.statusReason ?? null,
          legacyEnvVarHint: input.legacyEnvVarHint ?? null,
          createdBy: input.createdBy,
        });
      } catch (err) {
        if (err && typeof err === "object" && "code" in err) {
          const e = err as { code?: unknown; message?: unknown };
          if (e.code === "binding_not_eligible") {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: typeof e.message === "string" ? e.message : "binding_not_eligible",
            });
          }
        }
        throw err;
      }
    }),

  /**
   * Delete a binding by `(draftId, role)`. Idempotent.
   */
  remove: protectedProcedure
    .input(
      z.object({
        draftId: z.number().int().positive(),
        role: z.string().min(1).max(32).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const removed = await removeAgentProviderBinding(input.draftId, input.role);
      return { draftId: input.draftId, role: input.role ?? "primary", removed };
    }),

  /**
   * Reference/policy validation. Cheap, no upstream HTTP — see
   * docs/architecture/provider-model-binding/VALIDATOR_SPLIT.md.
   *
   * Plan v3 Phase 15 — does NOT refresh `lastValidatedAt`; the UI
   * uses this query to render the binding's stored status (including
   * staleAtCallTime). Use the `refreshValidation` mutation to do an
   * operator-triggered re-check that writes the timestamp.
   */
  validate: protectedProcedure
    .input(
      z.object({
        draftId: z.number().int().positive(),
        role: z.string().min(1).max(32).optional(),
      }),
    )
    .query(async ({ input }) => {
      return validateBindingPolicy(input.draftId, input.role, {
        refreshTimestamp: false,
        staleAsDegraded: false,
      });
    }),

  /**
   * Plan v3 Phase 15 — operator-triggered refresh. Re-runs the policy
   * validator and, on success, writes `lastValidatedAt = now` to the
   * binding row. Returns the same shape as `validate`.
   */
  refreshValidation: protectedProcedure
    .input(
      z.object({
        draftId: z.number().int().positive(),
        role: z.string().min(1).max(32).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      return refreshBindingValidation(input.draftId, input.role);
    }),

  /**
   * Resolve a binding for runtime use. Returns refs only, no credentials.
   * The runtime adapter (Phase 16+) calls this then passes
   * `providerConnectionId` to `openRouter.modelAccess.execute`.
   */
  resolveForRun: protectedProcedure
    .input(
      z.object({
        draftId: z.number().int().positive(),
        role: z.string().min(1).max(32).optional(),
      }),
    )
    .query(async ({ input }) => {
      return resolveForRun(input);
    }),

  /**
   * Plan v3 Phase 16 — binding-driven test run. Resolves the binding,
   * gates on Phase 15 staleness, then calls
   * `openRouter.modelAccess.execute` via the platform gateway.
   * Returns either the model output + usage + refs, or a structured
   * failure with the policy/Model-Access reason. No credentials.
   */
  testRunWithBinding: protectedProcedure
    .input(
      z.object({
        draftId: z.number().int().positive(),
        role: z.string().min(1).max(32).optional(),
        workspaceId: z.number().int().positive(),
        prompt: z.string().min(1),
        systemPrompt: z.string().optional(),
        intent: z
          .enum(["agent-test", "agent-run", "evaluation", "chat"])
          .optional(),
        temperature: z.number().min(0).max(2).optional(),
        tokenBudget: z.number().int().positive().optional(),
        correlationId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return runTestWithBinding({
        draftId: input.draftId,
        role: input.role,
        workspaceId: input.workspaceId,
        actorId: ctx.user.id,
        prompt: input.prompt,
        systemPrompt: input.systemPrompt,
        intent: input.intent,
        temperature: input.temperature,
        tokenBudget: input.tokenBudget,
        correlationId: input.correlationId,
      });
    }),

  // ─── Picker option providers ─────────────────────────────────────
  // The frontend picker needs two lists to populate dropdowns:
  //   1. Available provider/model pairs (AI Types catalog availability)
  //   2. Active Provider Connections for the chosen provider
  //
  // Both are read-only no-secret cross-module calls; both go through
  // the gateway so the regular cross-module audit path applies.

  /**
   * Available provider/model pairs from AI Types — cross-module call to
   * `aiTypes.providerModels.listAvailable` (Phase 7).
   */
  pickerAvailableModels: protectedProcedure
    .input(
      z
        .object({
          providerSlug: z.string().optional(),
          capability: z.string().optional(),
          workspaceId: z.number().int().positive().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      try {
        return await gatewayCall<unknown, unknown[]>({
          ctx: {
            sourceModule: "agentStudio",
            targetModule: "aiTypes",
            actionKey: "aiTypes.providerModels.listAvailable",
            actorId: ctx.user.id,
            workspaceId: input?.workspaceId,
          },
          input: input ?? {},
        });
      } catch (err) {
        // Non-fatal: surface as empty list so the picker can render
        // even when AI Types is degraded.
        return [];
      }
    }),

  /**
   * Active Provider Connections for the chosen provider — cross-module
   * call to `providerConnections.listActiveForProvider` (Phase 2/8).
   */
  pickerActiveConnections: protectedProcedure
    .input(
      z.object({
        workspaceId: z.number().int().positive(),
        providerCatalogEntryId: z.number().int().positive(),
      }),
    )
    .query(async ({ ctx, input }) => {
      try {
        return await gatewayCall<unknown, unknown[]>({
          ctx: {
            sourceModule: "agentStudio",
            targetModule: "providerConnections",
            actionKey: "providerConnections.listActiveForProvider",
            actorId: ctx.user.id,
            workspaceId: input.workspaceId,
          },
          input,
        });
      } catch (err) {
        return [];
      }
    }),
});
