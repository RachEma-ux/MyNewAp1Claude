/**
 * AI Types Validation Router
 *
 * Completeness and consistency checks for catalog entries.
 * Surfaces missing metadata, broken classifications, orphaned entries,
 * and governance readiness issues.
 *
 * Namespace: trpc.aiTypes.validation.*
 */

import { z } from "zod";
import { protectedProcedure, router } from "../../_core/trpc";
import { getCatalogEntries, getEntryClassifications, getActiveBundleForEntry } from "../db";

type Severity = "error" | "warning" | "info";

interface ValidationIssue {
  catalogEntryId: number;
  entryName: string;
  entryType: string;
  severity: Severity;
  code: string;
  message: string;
}

export const validationRouter = router({
  /**
   * Run all validation checks across the catalog.
   * Returns a list of issues sorted by severity.
   */
  scan: protectedProcedure
    .input(z.object({
      entryType: z.enum(["provider", "llm", "model", "agent", "bot"]).optional(),
    }).optional())
    .query(async ({ input }) => {
      const filter = input?.entryType ? { entryType: input.entryType } : undefined;
      const entries = await getCatalogEntries(filter);
      const issues: ValidationIssue[] = [];

      for (const entry of entries) {
        const config = entry.config as Record<string, unknown> | null;
        const name = entry.displayName || entry.name;

        // 1. Missing description
        if (!entry.description || entry.description.trim().length === 0) {
          issues.push({
            catalogEntryId: entry.id,
            entryName: name,
            entryType: entry.entryType,
            severity: "warning",
            code: "missing_description",
            message: "Entry has no description",
          });
        }

        // 2. No classifications
        const classifications = await getEntryClassifications(entry.id);
        if (classifications.length === 0) {
          issues.push({
            catalogEntryId: entry.id,
            entryName: name,
            entryType: entry.entryType,
            severity: "warning",
            code: "no_classifications",
            message: "Entry has no taxonomy classifications",
          });
        }

        // 3. Active but not approved
        if (entry.status === "active" && entry.reviewState !== "approved") {
          issues.push({
            catalogEntryId: entry.id,
            entryName: name,
            entryType: entry.entryType,
            severity: "error",
            code: "active_not_approved",
            message: `Entry is active but review state is "${entry.reviewState}"`,
          });
        }

        // 4. Approved but no published bundle (for agent/bot)
        if (
          (entry.entryType === "agent" || entry.entryType === "bot") &&
          entry.reviewState === "approved" &&
          entry.status === "active"
        ) {
          const bundle = await getActiveBundleForEntry(entry.id);
          if (!bundle) {
            issues.push({
              catalogEntryId: entry.id,
              entryName: name,
              entryType: entry.entryType,
              severity: "error",
              code: "no_published_bundle",
              message: "Approved agent/bot has no active published bundle",
            });
          }
        }

        // 5. Missing provider link (for model/llm)
        if ((entry.entryType === "model" || entry.entryType === "llm") && !entry.providerId) {
          issues.push({
            catalogEntryId: entry.id,
            entryName: name,
            entryType: entry.entryType,
            severity: "warning",
            code: "no_provider_link",
            message: "Model/LLM has no provider association",
          });
        }

        // 6. Empty config
        if (!config || Object.keys(config).length === 0) {
          issues.push({
            catalogEntryId: entry.id,
            entryName: name,
            entryType: entry.entryType,
            severity: "info",
            code: "empty_config",
            message: "Entry has no configuration data",
          });
        }

        // 7. Missing capabilities
        if (!entry.capabilities || (Array.isArray(entry.capabilities) && entry.capabilities.length === 0)) {
          issues.push({
            catalogEntryId: entry.id,
            entryName: name,
            entryType: entry.entryType,
            severity: "info",
            code: "no_capabilities",
            message: "Entry has no declared capabilities",
          });
        }
      }

      // Sort: errors first, then warnings, then info
      const severityOrder: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
      issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

      return {
        totalEntries: entries.length,
        totalIssues: issues.length,
        bySevertiy: {
          error: issues.filter((i) => i.severity === "error").length,
          warning: issues.filter((i) => i.severity === "warning").length,
          info: issues.filter((i) => i.severity === "info").length,
        },
        issues,
      };
    }),

  /**
   * Get validation summary counts without full issue details.
   */
  summary: protectedProcedure
    .query(async () => {
      const entries = await getCatalogEntries();
      let errors = 0;
      let warnings = 0;
      let healthy = 0;

      for (const entry of entries) {
        let hasError = false;
        let hasWarning = false;

        if (entry.status === "active" && entry.reviewState !== "approved") hasError = true;
        if (!entry.description || entry.description.trim().length === 0) hasWarning = true;

        const classifications = await getEntryClassifications(entry.id);
        if (classifications.length === 0) hasWarning = true;

        if (hasError) errors++;
        else if (hasWarning) warnings++;
        else healthy++;
      }

      return {
        total: entries.length,
        healthy,
        warnings,
        errors,
        healthPercent: entries.length > 0 ? Math.round((healthy / entries.length) * 100) : 0,
      };
    }),
});
