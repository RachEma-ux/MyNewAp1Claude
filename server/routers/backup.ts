/**
 * Backup and Restore Router
 * 
 * Provides tRPC procedures for backup and restore operations.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getBackupRestoreService } from "../services/backupRestoreService";

export const backupRouter = router({
  /**
   * Create a backup
   */
  createBackup: protectedProcedure
    .input(z.object({
      workspaceId: z.number(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const backupService = getBackupRestoreService();

      if (!backupService) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Backup service not initialized",
        });
      }

      try {
        const metadata = await backupService.createBackup(input.workspaceId, input.description);
        return metadata;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create backup: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * List backups for a workspace
   */
  listBackups: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ input, ctx }) => {
      const backupService = getBackupRestoreService();

      if (!backupService) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Backup service not initialized",
        });
      }

      try {
        const backups = await backupService.listBackups(input.workspaceId);
        return { backups };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to list backups: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * Get backup metadata
   */
  getBackupMetadata: protectedProcedure
    .input(z.object({ backupId: z.string() }))
    .query(async ({ input, ctx }) => {
      const backupService = getBackupRestoreService();

      if (!backupService) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Backup service not initialized",
        });
      }

      try {
        const metadata = await backupService.getBackupMetadata(input.backupId);

        if (!metadata) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Backup not found",
          });
        }

        return metadata;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to get backup metadata: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * Restore from backup
   */
  restoreBackup: protectedProcedure
    .input(z.object({
      workspaceId: z.number(),
      backupId: z.string(),
      restoreAgents: z.boolean().optional().default(true),
      restorePolicies: z.boolean().optional().default(true),
      restoreConfigurations: z.boolean().optional().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const backupService = getBackupRestoreService();

      if (!backupService) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Backup service not initialized",
        });
      }

      try {
        const result = await backupService.restoreBackup(input.workspaceId, input.backupId, {
          restoreAgents: input.restoreAgents,
          restorePolicies: input.restorePolicies,
          restoreConfigurations: input.restoreConfigurations,
        });

        return result;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to restore backup: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * Delete a backup
   */
  deleteBackup: protectedProcedure
    .input(z.object({ backupId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const backupService = getBackupRestoreService();

      if (!backupService) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Backup service not initialized",
        });
      }

      try {
        const success = await backupService.deleteBackup(input.backupId);

        if (!success) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to delete backup",
          });
        }

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to delete backup: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * Verify backup integrity
   */
  verifyBackup: protectedProcedure
    .input(z.object({ backupId: z.string() }))
    .query(async ({ input, ctx }) => {
      const backupService = getBackupRestoreService();

      if (!backupService) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Backup service not initialized",
        });
      }

      try {
        const result = await backupService.verifyBackup(input.backupId);
        return result;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to verify backup: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * Schedule automatic backups
   */
  scheduleAutomaticBackups: protectedProcedure
    .input(z.object({
      workspaceId: z.number(),
      intervalHours: z.number().min(1).max(168),
      retentionDays: z.number().min(1).max(365),
    }))
    .mutation(async ({ input, ctx }) => {
      const backupService = getBackupRestoreService();

      if (!backupService) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Backup service not initialized",
        });
      }

      try {
        const result = await backupService.scheduleAutomaticBackups(
          input.workspaceId,
          input.intervalHours,
          input.retentionDays
        );

        return result;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to schedule backups: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * Get backup schedule
   */
  getBackupSchedule: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .query(async ({ input, ctx }) => {
      const backupService = getBackupRestoreService();

      if (!backupService) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Backup service not initialized",
        });
      }

      try {
        const schedule = await backupService.getBackupSchedule(input.workspaceId);
        return schedule;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to get backup schedule: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),

  /**
   * Cancel backup schedule
   */
  cancelBackupSchedule: protectedProcedure
    .input(z.object({ workspaceId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const backupService = getBackupRestoreService();

      if (!backupService) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Backup service not initialized",
        });
      }

      try {
        const success = await backupService.cancelBackupSchedule(input.workspaceId);

        if (!success) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to cancel backup schedule",
          });
        }

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to cancel backup schedule: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }),
});
