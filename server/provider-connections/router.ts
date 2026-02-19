/**
 * Provider Connections — tRPC Router
 *
 * API contract for the "Connect Provider" flow:
 *   - test: validate PAT without persistence
 *   - create: create DRAFT connection
 *   - validateAndStore: test → encrypt → store → VALIDATED
 *   - activate: VALIDATED → ACTIVE
 *   - disable: ACTIVE/FAILED → DISABLED
 *   - rotate: rotate PAT with re-validation
 *   - list: all connections for a workspace
 *   - getById: single connection detail
 *   - auditLog: immutable event trail
 *   - healthCheck: probe active connection
 *   - delete: remove connection + cascade secrets
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  testConnection,
  createProviderConnection,
  validateAndStoreSecret,
  activateConnection,
  disableConnection,
  healthCheck,
  rotateSecret,
  getConnectionById,
  getConnectionsByWorkspace,
  getAuditLog,
  deleteConnection,
} from "./service";

export const providerConnectionsRouter = router({
  /**
   * Test a provider endpoint without storing anything.
   * PAT is used in-memory only and discarded.
   */
  test: protectedProcedure
    .input(
      z.object({
        baseUrl: z.string().url(),
        pat: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      return testConnection(input.baseUrl, input.pat);
    }),

  /**
   * Create a new connection in DRAFT state (no PAT stored).
   */
  create: protectedProcedure
    .input(
      z.object({
        providerId: z.number().int(),
        workspaceId: z.number().int().default(1),
        baseUrl: z.string().url(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conn = await createProviderConnection({
        providerId: input.providerId,
        workspaceId: input.workspaceId,
        baseUrl: input.baseUrl,
        createdBy: ctx.user?.id ?? 1,
      });
      return { id: conn.id, lifecycleStatus: conn.lifecycleStatus };
    }),

  /**
   * Test PAT → encrypt → store secret → transition to VALIDATED.
   * PAT is never stored before successful validation.
   */
  validateAndStore: protectedProcedure
    .input(
      z.object({
        connectionId: z.number().int(),
        pat: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return validateAndStoreSecret({
        connectionId: input.connectionId,
        pat: input.pat,
        actor: ctx.user?.id ?? 1,
      });
    }),

  /**
   * Activate a VALIDATED connection → ACTIVE.
   */
  activate: protectedProcedure
    .input(z.object({ connectionId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await activateConnection(input.connectionId, ctx.user?.id ?? 1);
      return { ok: true };
    }),

  /**
   * Disable an ACTIVE or FAILED connection.
   */
  disable: protectedProcedure
    .input(z.object({ connectionId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await disableConnection(input.connectionId, ctx.user?.id ?? 1);
      return { ok: true };
    }),

  /**
   * Run a health check against an active connection.
   */
  healthCheck: protectedProcedure
    .input(z.object({ connectionId: z.number().int() }))
    .mutation(async ({ input }) => {
      return healthCheck(input.connectionId);
    }),

  /**
   * Rotate PAT: test new PAT → encrypt → store → re-activate.
   */
  rotate: protectedProcedure
    .input(
      z.object({
        connectionId: z.number().int(),
        newPat: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return rotateSecret({
        connectionId: input.connectionId,
        newPat: input.newPat,
        actor: ctx.user?.id ?? 1,
      });
    }),

  /**
   * List all connections for a workspace.
   */
  list: protectedProcedure
    .input(
      z.object({
        workspaceId: z.number().int().default(1),
      })
    )
    .query(async ({ input }) => {
      const rows = await getConnectionsByWorkspace(input.workspaceId);
      // Never return secret data
      return rows.map((r) => ({
        id: r.id,
        providerId: r.providerId,
        workspaceId: r.workspaceId,
        baseUrl: r.baseUrl,
        lifecycleStatus: r.lifecycleStatus,
        healthStatus: r.healthStatus,
        lastHealthCheck: r.lastHealthCheck,
        secretVersion: r.secretVersion,
        capabilities: r.capabilities,
        modelCount: r.modelCount,
        createdBy: r.createdBy,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
    }),

  /**
   * Get a single connection by ID.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input }) => {
      const conn = await getConnectionById(input.id);
      if (!conn) throw new Error("Connection not found");
      // Never return secret data
      return {
        id: conn.id,
        providerId: conn.providerId,
        workspaceId: conn.workspaceId,
        baseUrl: conn.baseUrl,
        lifecycleStatus: conn.lifecycleStatus,
        healthStatus: conn.healthStatus,
        lastHealthCheck: conn.lastHealthCheck,
        secretVersion: conn.secretVersion,
        capabilities: conn.capabilities,
        modelCount: conn.modelCount,
        createdBy: conn.createdBy,
        createdAt: conn.createdAt,
        updatedAt: conn.updatedAt,
      };
    }),

  /**
   * Get immutable audit trail for a connection.
   */
  auditLog: protectedProcedure
    .input(z.object({ connectionId: z.number().int() }))
    .query(async ({ input }) => {
      return getAuditLog(input.connectionId);
    }),

  /**
   * Delete a connection and cascade-delete its secrets.
   */
  delete: protectedProcedure
    .input(z.object({ connectionId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await deleteConnection(input.connectionId);
      return { ok: true };
    }),
});
