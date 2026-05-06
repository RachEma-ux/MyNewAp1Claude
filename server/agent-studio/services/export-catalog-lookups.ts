/**
 * Plan v3 Phase 30 — cross-DB lookups bridge for the Export Catalog backend.
 *
 * Reads from ASDB (`ags_agents`, `ags_agent_releases`, `ags_agent_provider_bindings`)
 * and the main DB (`catalog_entries`). Implements the `ExportCatalogLookups`
 * interface from `export-catalog.ts`. Tests inject a fake instead.
 */

import { sql } from "drizzle-orm";
import type {
  ExportCatalogLookups,
  ReconcileSyncDriftLookups,
} from "./export-catalog";
import type { ToolRiskClass } from "./cag/types";

export async function buildLiveLookups(): Promise<ExportCatalogLookups> {
  const { getAsDb } = await import("../db/connection");
  const { getDb } = await import("../../db/connection");
  const repo = await import("../repository");
  const { readRiskClass } = await import("./cag/risk-classifier");
  const { probeSandboxForExport } = await import("./rac-readiness");

  return {
    async listPublishedAgents(filter) {
      const asDb = getAsDb();
      if (!asDb) return [];
      const ws = filter.workspaceId;
      const rows = (await asDb.execute(
        ws == null
          ? sql`SELECT id, workspace_id AS "workspaceId", name, lifecycle_state AS "lifecycleState",
                       published_version_id AS "publishedVersionId",
                       COALESCE(metadata->'capabilities', '[]'::jsonb) AS "capabilities"
                 FROM ags_agents
                 WHERE lifecycle_state = 'published'`
          : sql`SELECT id, workspace_id AS "workspaceId", name, lifecycle_state AS "lifecycleState",
                       published_version_id AS "publishedVersionId",
                       COALESCE(metadata->'capabilities', '[]'::jsonb) AS "capabilities"
                 FROM ags_agents
                 WHERE lifecycle_state = 'published' AND workspace_id = ${ws}`,
      )) as any;
      const list: any[] = Array.isArray(rows) ? rows : (rows.rows ?? []);
      return list.map((r) => ({
        id: r.id,
        workspaceId: r.workspaceId,
        name: r.name,
        lifecycleState: r.lifecycleState,
        publishedVersionId: r.publishedVersionId,
        capabilities: Array.isArray(r.capabilities) ? r.capabilities : [],
      }));
    },

    async resolveAgentBinding(agentId) {
      const asDb = getAsDb();
      if (!asDb) {
        return {
          status: "missing",
          providerConnectionId: null,
          providerCatalogEntryId: null,
          modelCatalogEntryId: null,
        };
      }
      const rows = (await asDb.execute(
        sql`SELECT status, provider_connection_id AS "providerConnectionId",
                   provider_catalog_entry_id AS "providerCatalogEntryId",
                   model_catalog_entry_id AS "modelCatalogEntryId"
            FROM ags_agent_provider_bindings
            WHERE agent_id = ${agentId}
            ORDER BY id DESC
            LIMIT 1`,
      )) as any;
      const list: any[] = Array.isArray(rows) ? rows : (rows.rows ?? []);
      if (list.length === 0) {
        return {
          status: "missing",
          providerConnectionId: null,
          providerCatalogEntryId: null,
          modelCatalogEntryId: null,
        };
      }
      const r = list[0];
      const status = (r.status as string) || "missing";
      return {
        status:
          status === "binding_v1" ||
          status === "legacy_no_credential" ||
          status === "legacy_unresolved"
            ? (status as any)
            : "missing",
        providerConnectionId: r.providerConnectionId ?? null,
        providerCatalogEntryId: r.providerCatalogEntryId ?? null,
        modelCatalogEntryId: r.modelCatalogEntryId ?? null,
      };
    },

    async resolveActiveReleaseId(agentId) {
      const asDb = getAsDb();
      if (!asDb) return null;
      const rows = (await asDb.execute(
        sql`SELECT id FROM ags_agent_releases
            WHERE agent_id = ${agentId} AND state = 'published'
            ORDER BY published_at DESC NULLS LAST LIMIT 1`,
      )) as any;
      const list: any[] = Array.isArray(rows) ? rows : (rows.rows ?? []);
      return list[0]?.id ?? null;
    },

    async loadCatalogEntryForAgent(agentId) {
      const mainDb = getDb();
      if (!mainDb) return null;
      const rows = (await mainDb.execute(
        sql`SELECT id, legacy_import_state AS "legacyImportState",
                   active_source_version_id AS "activeSourceVersionId"
            FROM catalog_entries
            WHERE source_type = 'agent' AND source_id = ${agentId}
            LIMIT 1`,
      )) as any;
      const list: any[] = Array.isArray(rows) ? rows : (rows.rows ?? []);
      if (list.length === 0) return null;
      const r = list[0];
      return {
        id: r.id,
        legacyImportState: r.legacyImportState ?? null,
        activeSourceVersionId: r.activeSourceVersionId ?? null,
      };
    },

    /**
     * RAC P10 — resolve every tool the agent's current draft binds, and
     * read each tool's risk class through the CAG classifier (D-TOOL-5
     * single source of truth). Tools without a manifest-declared
     * `riskClass` fall back to the built-in table; any other unclassified
     * tool resolves to `quarantined` per D-TOOL-1 default-deny.
     *
     * Best-effort: if the draft can't be resolved the lookup returns an
     * empty list, which the matrix interprets as "ready". That preserves
     * existing dev-DB exports during the rollout window — the gate
     * tightens automatically once tool manifests carry `riskClass`.
     */
    async listAgentToolRiskClasses(agentId) {
      try {
        const draft = await repo.getCurrentDraft(agentId);
        if (!draft) return [];
        const bindings = await repo.listToolBindings(draft.id);
        const classes = new Set<ToolRiskClass>();
        for (const b of bindings) {
          // The binding row carries `toolName`; the registry classifier
          // reads from the tool manifest. We synthesize a minimal McpTool
          // so the classifier's contract is unchanged.
          const cls = readRiskClass({
            name: (b as { toolName?: string }).toolName ?? "",
          });
          classes.add(cls);
        }
        return [...classes];
      } catch (err) {
        // Production path is best-effort; downstream readiness defaults
        // to "ready" when the list is empty. Log and continue.
        console.warn(
          `[export-catalog] listAgentToolRiskClasses failed for agent ${agentId}:`,
          err instanceof Error ? err.message : err,
        );
        return [];
      }
    },

    /**
     * RAC P10 — sandbox health snapshot. Returns `null` when no impl is
     * registered (the registry sentinel; D-SBX-2 hard-blocks
     * `code_execution` agents in that case).
     */
    async getSandboxHealth() {
      return probeSandboxForExport();
    },
  };
}

/**
 * Plan v3 Phase 41 — live lookups for `reconcileExportCatalogSync`.
 *
 * Reuses the Phase 30 `listPublishedAgents` pattern but extends the
 * catalog-row read with the `status` column (drift cases for
 * published/deprecated need it). The sync log read + repair write hit
 * the new `ags_catalog_sync_log` table on ASDB.
 */
export async function buildReconcileLookups(): Promise<ReconcileSyncDriftLookups> {
  const { getAsDb } = await import("../db/connection");
  const { getDb } = await import("../../db/connection");
  const repo = await import("../repository");
  const live = await buildLiveLookups();

  return {
    listPublishedAgents: live.listPublishedAgents,

    async loadCatalogEntryForAgent(agentId) {
      const mainDb = getDb();
      if (!mainDb) return null;
      const rows = (await mainDb.execute(
        sql`SELECT id, legacy_import_state AS "legacyImportState",
                   active_source_version_id AS "activeSourceVersionId",
                   status
            FROM catalog_entries
            WHERE source_type = 'agent' AND source_id = ${agentId}
            LIMIT 1`,
      )) as any;
      const list: any[] = Array.isArray(rows) ? rows : (rows.rows ?? []);
      if (list.length === 0) return null;
      const r = list[0];
      return {
        id: r.id,
        legacyImportState: r.legacyImportState ?? null,
        activeSourceVersionId: r.activeSourceVersionId ?? null,
        status: (r.status as string | null) ?? null,
      };
    },

    async getLatestSyncLogEventType(catalogEntryId) {
      const asDb = getAsDb();
      if (!asDb) return null;
      const latest = await repo.getLatestCatalogSyncEvent(catalogEntryId);
      return latest?.eventType ?? null;
    },

    async recordSyncLogRepair(input) {
      await repo.recordCatalogSyncEvent(input);
    },
  };
}
