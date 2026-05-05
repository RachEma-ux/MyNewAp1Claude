/**
 * Plan v3 Phase 30 — cross-DB lookups bridge for the Export Catalog backend.
 *
 * Reads from ASDB (`ags_agents`, `ags_agent_releases`, `ags_agent_provider_bindings`)
 * and the main DB (`catalog_entries`). Implements the `ExportCatalogLookups`
 * interface from `export-catalog.ts`. Tests inject a fake instead.
 */

import { sql } from "drizzle-orm";
import type { ExportCatalogLookups } from "./export-catalog";

export async function buildLiveLookups(): Promise<ExportCatalogLookups> {
  const { getAsDb } = await import("../db/connection");
  const { getDb } = await import("../../db/connection");

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
  };
}
