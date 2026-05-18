/**
 * Bases tRPC router — Phase 24 MVP (T-F.1).
 *
 * Mounted at `agentStudio.bases.*`. Exposes the bases-service CRUD
 * surface so the React UI + operator tools can build out the Bases
 * panel.
 *
 * Closed taxonomies are Zod-enforced at the boundary:
 *   - `AGS_BASE_COLUMN_DATA_TYPES` (7-value text/number/date/checkbox/
 *     select/multiselect/note_link).
 *
 * Hard-rule compliance (CLAUDE.md):
 *   - All mutations route through bases-service (no direct
 *     agsBases / agsBaseColumns / agsBaseRows writes from the
 *     router).
 *   - No `process.env.*_API_KEY` reads.
 *   - No `credential-resolver` / `dispatchMcpToolCall` /
 *     `neo4j-driver` imports.
 *   - Reads: `protectedProcedure`.
 *   - Writes: `protectedProcedure` for the MVP — Bases inherit
 *     vault-level visibility; if cross-Base operations need
 *     workspace-admin gates in tier 2, the writes can tighten.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { protectedProcedure, router } from "../../../_core/trpc.js";
import {
  AGS_BASE_COLUMN_DATA_TYPES,
  BaseColumnDataTypeError,
  BaseNotFoundError,
  BaseRowNotFoundError,
  BaseRowUnknownColumnsError,
  createBase,
  createBaseColumn,
  createBaseRow,
  getBaseSnapshot,
  listBaseColumns,
  listBaseRows,
  listBases,
  updateBase,
  updateBaseRow,
} from "./public-api.js";

const ColumnDataTypeSchema = z.enum(AGS_BASE_COLUMN_DATA_TYPES);

const CreateBaseInputSchema = z.object({
  workspaceId: z.number().int().positive().nullable().optional(),
  vaultId: z.number().int().positive().nullable().optional(),
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9][a-z0-9-]*$/i, "slug must be URL-safe"),
  description: z.string().max(2000).optional(),
  icon: z.string().min(1).max(64).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "color must be #RRGGBB")
    .optional(),
  sortKey: z.number().int().optional(),
});

const UpdateBaseInputSchema = z.object({
  baseId: z.number().int().positive(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  icon: z.string().min(1).max(64).nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  sortKey: z.number().int().nullable().optional(),
  archived: z.boolean().optional(),
});

const CreateBaseColumnInputSchema = z.object({
  baseId: z.number().int().positive(),
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z_][a-z0-9_]*$/i, "column key must be a valid identifier"),
  name: z.string().min(1).max(255),
  dataType: ColumnDataTypeSchema,
  config: z.record(z.string(), z.unknown()).optional(),
  sortKey: z.number().int().optional(),
});

const CreateBaseRowInputSchema = z.object({
  baseId: z.number().int().positive(),
  cells: z.record(z.string(), z.unknown()),
  slug: z.string().min(1).max(255).optional(),
  noteId: z.number().int().positive().nullable().optional(),
  sortKey: z.number().int().optional(),
});

const UpdateBaseRowInputSchema = z.object({
  rowId: z.number().int().positive(),
  cells: z.record(z.string(), z.unknown()).optional(),
  noteId: z.number().int().positive().nullable().optional(),
  sortKey: z.number().int().nullable().optional(),
});

const ListBasesInputSchema = z
  .object({
    workspaceId: z.number().int().positive().nullable().optional(),
    vaultId: z.number().int().positive().nullable().optional(),
    includeArchived: z.boolean().optional(),
  })
  .optional();

export const basesRouter = router({
  // ----- bases ----------------------------------------------------------

  create: protectedProcedure
    .input(CreateBaseInputSchema)
    .mutation(async ({ input, ctx }) => {
      const ctxAny = ctx as unknown as { user?: { id?: number } };
      const createdByUserId = ctxAny.user?.id ?? null;
      return await createBase({ ...input, createdByUserId });
    }),

  list: protectedProcedure
    .input(ListBasesInputSchema)
    .query(async ({ input }) => {
      return await listBases(input ?? {});
    }),

  getSnapshot: protectedProcedure
    .input(z.object({ baseId: z.number().int().positive() }))
    .query(async ({ input }) => {
      try {
        return await getBaseSnapshot(input.baseId);
      } catch (e) {
        if (e instanceof BaseNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: e.message });
        }
        throw e;
      }
    }),

  update: protectedProcedure
    .input(UpdateBaseInputSchema)
    .mutation(async ({ input }) => {
      const { baseId, archived, ...rest } = input;
      const patch = {
        ...rest,
        ...(archived !== undefined
          ? { archivedAt: archived ? new Date() : null }
          : {}),
      };
      try {
        return await updateBase(baseId, patch);
      } catch (e) {
        if (e instanceof BaseNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: e.message });
        }
        throw e;
      }
    }),

  // ----- columns --------------------------------------------------------

  createColumn: protectedProcedure
    .input(CreateBaseColumnInputSchema)
    .mutation(async ({ input }) => {
      try {
        return await createBaseColumn(input);
      } catch (e) {
        if (e instanceof BaseNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: e.message });
        }
        if (e instanceof BaseColumnDataTypeError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
        }
        throw e;
      }
    }),

  listColumns: protectedProcedure
    .input(z.object({ baseId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return await listBaseColumns(input.baseId);
    }),

  // ----- rows -----------------------------------------------------------

  createRow: protectedProcedure
    .input(CreateBaseRowInputSchema)
    .mutation(async ({ input }) => {
      try {
        return await createBaseRow(input);
      } catch (e) {
        if (e instanceof BaseNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: e.message });
        }
        if (e instanceof BaseRowUnknownColumnsError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
        }
        throw e;
      }
    }),

  updateRow: protectedProcedure
    .input(UpdateBaseRowInputSchema)
    .mutation(async ({ input }) => {
      const { rowId, ...patch } = input;
      try {
        return await updateBaseRow(rowId, patch);
      } catch (e) {
        if (e instanceof BaseRowNotFoundError) {
          throw new TRPCError({ code: "NOT_FOUND", message: e.message });
        }
        if (e instanceof BaseRowUnknownColumnsError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: e.message });
        }
        throw e;
      }
    }),

  listRows: protectedProcedure
    .input(z.object({ baseId: z.number().int().positive() }))
    .query(async ({ input }) => {
      return await listBaseRows(input.baseId);
    }),
});

export type BasesRouter = typeof basesRouter;
