/**
 * Catalog Import Router — tRPC endpoints for import wizard
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import {
  createSession,
  getSession,
  updateSessionStatus,
  addPreviewRows,
  getPreviewRows,
} from "./session-service";
import { checkDuplicates, buildPreviewSummary } from "./dedup-service";
import { discoverFromApiUrl } from "./discovery-service";
import { createCatalogEntry, createCatalogAuditEvent, getDb } from "../db";
import { importAuditLogs } from "../../drizzle/schema";
import type { BulkCreateResult, BulkCreateResultEntry } from "@shared/catalog-import-types";

export const catalogImportRouter = router({
  /**
   * Discover models from a provider API endpoint
   */
  discoverFromApi: protectedProcedure
    .input(
      z.object({
        baseUrl: z.string().url(),
        apiKey: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Create session
      const session = await createSession(
        ctx.user?.id ?? 1,
        "api_discovery",
        input.baseUrl
      );

      try {
        // Update to discovering
        await updateSessionStatus(session.id, "discovering");

        // Fetch models from API
        const rawRows = await discoverFromApiUrl(input.baseUrl, input.apiKey);

        if (rawRows.length === 0) {
          await updateSessionStatus(session.id, "failed", null, "No models found at the given URL");
          return { sessionId: session.id, error: "No models found" };
        }

        // Run deduplication
        const dedupedRows = await checkDuplicates(rawRows);
        const summary = buildPreviewSummary(dedupedRows);

        // Store preview rows
        await addPreviewRows(session.id, dedupedRows);

        // Update session to previewing
        await updateSessionStatus(session.id, "previewing", summary);

        return { sessionId: session.id };
      } catch (e: any) {
        await updateSessionStatus(session.id, "failed", null, e.message);
        return { sessionId: session.id, error: e.message };
      }
    }),

  /**
   * Parse an uploaded file (stub for Phase 2)
   */
  parseFile: protectedProcedure
    .input(z.object({ fileId: z.string() }))
    .mutation(async () => {
      throw new Error("File import is not yet implemented (Phase 2)");
    }),

  /**
   * Get the current status of an import session
   */
  getSessionStatus: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      const session = await getSession(input.sessionId);
      if (!session) throw new Error("Import session not found");

      return {
        status: session.status,
        summary: session.summary,
        error: session.error,
      };
    }),

  /**
   * Get preview rows for a session
   */
  getPreview: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      const session = await getSession(input.sessionId);
      if (!session) throw new Error("Import session not found");

      const rows = await getPreviewRows(input.sessionId);
      const summary = buildPreviewSummary(rows);

      return { rows, summary };
    }),

  /**
   * Bulk-create catalog entries from selected preview rows
   */
  bulkCreate: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        selectedTempIds: z.array(z.string()),
        forceConflicts: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const session = await getSession(input.sessionId);
      if (!session) throw new Error("Import session not found");
      if (session.status !== "previewing") {
        throw new Error(`Session is not in previewing state (current: ${session.status})`);
      }

      await updateSessionStatus(input.sessionId, "importing");

      const allRows = await getPreviewRows(input.sessionId);
      const selectedRows = allRows.filter((r) =>
        input.selectedTempIds.includes(r.tempId)
      );

      const result: BulkCreateResult = {
        created: 0,
        skipped: 0,
        errors: 0,
        entries: [],
      };

      let conflictOverrides = 0;
      let highRiskCount = 0;

      for (const row of selectedRows) {
        const entry: BulkCreateResultEntry = {
          tempId: row.tempId,
          name: row.name,
          outcome: "created",
        };

        // Skip exact matches unless forced
        if (row.duplicateStatus === "exact_match") {
          entry.outcome = "skipped";
          entry.error = "Exact duplicate exists";
          result.skipped++;
          result.entries.push(entry);
          continue;
        }

        // Skip conflicts unless forced
        if (row.duplicateStatus === "conflict" && !input.forceConflicts) {
          entry.outcome = "skipped";
          entry.error = "Name conflict with different type";
          result.skipped++;
          result.entries.push(entry);
          continue;
        }

        if (row.duplicateStatus === "conflict") conflictOverrides++;
        if (row.riskLevel === "high") highRiskCount++;

        try {
          const catalogEntry = await createCatalogEntry({
            name: row.name,
            displayName: row.name,
            description: row.description,
            entryType: row.type,
            scope: "app",
            status: "draft",
            origin: "discovery",
            reviewState: "needs_review",
            providerId: null,
            config: row.metadata,
            tags: [row.source],
            category: null,
            subCategory: null,
            capabilities: null,
            createdBy: ctx.user?.id ?? 1,
          });

          entry.outcome = "created";
          entry.catalogEntryId = catalogEntry.id;
          result.created++;
        } catch (e: any) {
          entry.outcome = "error";
          entry.error = e.message;
          result.errors++;
        }

        result.entries.push(entry);
      }

      // Update session to completed
      const summary = buildPreviewSummary(allRows);
      await updateSessionStatus(input.sessionId, "completed", summary);

      // Write audit log
      try {
        const db = getDb();
        if (db) {
          await db.insert(importAuditLogs).values({
            sessionId: input.sessionId,
            userId: ctx.user?.id ?? 1,
            method: session.method,
            sourceRef: session.sourceRef,
            previewCount: allRows.length,
            selectedCount: selectedRows.length,
            createdCount: result.created,
            skippedCount: result.skipped,
            conflictOverrides,
            highRiskCount,
          });
        }
      } catch (e: any) {
        console.warn(`[ImportAudit] Failed to write audit log: ${e.message}`);
      }

      return result;
    }),
});
