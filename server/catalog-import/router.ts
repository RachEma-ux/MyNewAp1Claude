/**
 * Catalog Import Router — tRPC endpoints for import wizard
 */
import { z } from "zod";
import { protectedProcedure, governedProcedure, router } from "../_core/trpc";
import {
  createSession,
  getSession,
  updateSessionStatus,
  addPreviewRows,
  getPreviewRows,
} from "./session-service";
import { checkDuplicates, buildPreviewSummary } from "./dedup-service";
import { discoverFromApiUrl } from "./discovery-service";
import { parseFileContent, buildFileImportPreview } from "./file-parser";
import { createCatalogEntry, createCatalogAuditEvent, getDb, getCatalogEntryById, updateCatalogEntry } from "../db";
import { getProvidersByType, updateProvider } from "../providers/db";
import { importAuditLogs } from "../../drizzle/schema";
import type { BulkCreateResult, BulkCreateResultEntry } from "@shared/catalog-import-types";

export const catalogImportRouter = router({
  /**
   * Discover models from a provider API endpoint
   */
  discoverFromApi: governedProcedure
    .input(
      z.object({
        baseUrl: z.string().transform((v) => /^https?:\/\//i.test(v) ? v : `https://${v}`).pipe(z.string().url()),
        apiKey: z.string().optional(),
        providerId: z.number().int().optional(),
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

        // Save apiKey back for reuse in future auto-fill
        if (input.providerId && input.apiKey) {
          // Save to catalog entry config (primary source for auto-fill)
          try {
            const catalogEntry = await getCatalogEntryById(input.providerId);
            const entryConfig = (catalogEntry?.config as Record<string, any>) || {};
            if (entryConfig.apiKey !== input.apiKey) {
              await updateCatalogEntry(
                input.providerId,
                { config: { ...entryConfig, apiKey: input.apiKey } },
                ctx.user?.id ?? 1
              );
            }
          } catch (e: any) {
            console.warn(`[CatalogImport] Failed to save apiKey to catalog entry: ${e.message}`);
          }

          // Also save to provider registry if it exists
          try {
            const catalogEntry = await getCatalogEntryById(input.providerId);
            const entryConfig = (catalogEntry?.config as Record<string, any>) || {};
            const registryId = entryConfig.registryId as string | undefined;
            if (registryId) {
              const providers = await getProvidersByType(registryId);
              const provider = providers[0];
              if (provider) {
                const provConfig = (provider.config as Record<string, any>) || {};
                if (provConfig.apiKey !== input.apiKey) {
                  await updateProvider(provider.id, {
                    config: { ...provConfig, apiKey: input.apiKey },
                  });
                }
              }
            }
          } catch (e: any) {
            console.warn(`[CatalogImport] Failed to save apiKey to provider registry: ${e.message}`);
          }
        }

        return { sessionId: session.id };
      } catch (e: any) {
        await updateSessionStatus(session.id, "failed", null, e.message);
        return { sessionId: session.id, error: e.message };
      }
    }),

  /**
   * Parse an uploaded file (CSV / JSON / YAML) and create a preview session.
   * File content is sent as base64 to avoid multer/express middleware.
   * Max 2MB file size limit enforced by the parser.
   */
  parseFileUpload: governedProcedure
    .input(
      z.object({
        filename: z.string().min(1).max(255),
        contentBase64: z.string().min(1).max(4 * 1024 * 1024), // ~3MB base64 ≈ 2MB raw
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Decode base64 content
      let content: string;
      try {
        content = Buffer.from(input.contentBase64, "base64").toString("utf-8");
      } catch {
        return { sessionId: null, error: "Failed to decode file content" };
      }

      if (!content.trim()) {
        return { sessionId: null, error: "File is empty" };
      }

      // Parse file into PreviewEntry[] format
      const parseResult = parseFileContent(content, input.filename);
      const { entries, parseErrors, format, globalIssues } = parseResult;

      if (entries.length === 0) {
        const errorMsg = parseErrors.length > 0
          ? parseErrors.join("; ")
          : "No valid entries found in file";
        return { sessionId: null, error: errorMsg, parseErrors, format, globalIssues };
      }

      // Create import session
      const session = await createSession(
        ctx.user?.id ?? 1,
        "file_upload",
        `file:${input.filename}`
      );

      try {
        await updateSessionStatus(session.id, "discovering");

        // Run deduplication against existing catalog
        const dedupedRows = await checkDuplicates(entries);
        const summary = buildPreviewSummary(dedupedRows);

        // Store preview rows
        await addPreviewRows(session.id, dedupedRows);

        // Update session to previewing
        await updateSessionStatus(session.id, "previewing", summary);

        // Build enhanced preview response
        const preview = buildFileImportPreview(parseResult, dedupedRows);

        return {
          sessionId: session.id,
          format,
          parseErrors: parseErrors.length > 0 ? parseErrors : undefined,
          globalIssues: globalIssues.length > 0 ? globalIssues : undefined,
          preview,
        };
      } catch (e: any) {
        await updateSessionStatus(session.id, "failed", null, e.message);
        return { sessionId: session.id, error: e.message };
      }
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
  bulkCreate: governedProcedure
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
          // Extract enrichment from metadata (set by file parser or discovery)
          const meta = (row.metadata || {}) as Record<string, any>;
          const displayName = meta.displayName || row.name;
          const category = meta.category || null;
          const subCategory = meta.subCategory || null;
          const scope = meta.scope || "app";
          const capabilities = Array.isArray(meta.capabilities) ? meta.capabilities : null;
          const fileTags = Array.isArray(meta.tags) ? meta.tags : [];
          const origin = row.source === "file_import" ? "import" : "discovery";

          const catalogEntry = await createCatalogEntry({
            name: row.name,
            displayName,
            description: row.description,
            entryType: row.type,
            scope,
            status: "draft",
            origin,
            reviewState: "needs_review",
            providerId: null,
            config: row.metadata,
            tags: [row.source, ...fileTags],
            category,
            subCategory,
            capabilities,
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
