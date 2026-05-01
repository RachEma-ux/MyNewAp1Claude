/**
 * Graph Cluster Service — community detection and cluster metadata.
 */

import { sql } from "drizzle-orm";
import type { Express } from "express";
import { getRagDb } from "./connection";

export function registerClusterRoutes(app: Express) {

  // List clusters (grouped by entity_type / family)
  app.get("/api/kgra-proxy/graph/clusters", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) { res.json([]); return; }

      // Group by entity_type as community
      const clusters = ((await ragDb.execute(sql`
        SELECT entity_type as community, COUNT(*) as node_count,
               array_agg(name ORDER BY mentions DESC) as members
        FROM kgra_entities
        GROUP BY entity_type
        ORDER BY node_count DESC
      `)) as any).rows || [];

      // Also group manual nodes by family
      const manualClusters = ((await ragDb.execute(sql`
        SELECT family as community, COUNT(*) as node_count,
               array_agg(name ORDER BY created_at DESC) as members
        FROM kgra_manual_nodes WHERE status = 'active'
        GROUP BY family
        ORDER BY node_count DESC
      `)) as any).rows || [];

      const result = clusters.map((c: any, i: number) => ({
        id: i + 1,
        name: c.community,
        type: 'auto',
        nodeCount: Number(c.node_count),
        members: (c.members || []).slice(0, 50), // cap for response size
      }));

      for (const mc of manualClusters) {
        result.push({
          id: result.length + 1,
          name: `manual:${mc.community}`,
          type: 'manual',
          nodeCount: Number(mc.node_count),
          members: (mc.members || []).slice(0, 50),
        });
      }

      res.json(result);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // Single cluster detail
  app.get("/api/kgra-proxy/graph/clusters/:id", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) { res.status(500).json({ error: "RAGDB unavailable" }); return; }

      // Get all clusters then filter by id
      const clusters = ((await ragDb.execute(sql`
        SELECT entity_type as community, COUNT(*) as node_count,
               array_agg(name) as members
        FROM kgra_entities GROUP BY entity_type ORDER BY node_count DESC
      `)) as any).rows || [];

      const idx = parseInt(req.params.id) - 1;
      if (idx < 0 || idx >= clusters.length) { res.status(404).json({ error: "Cluster not found" }); return; }

      const c = clusters[idx];
      const memberNames = c.members || [];

      // Get internal edges (both endpoints in this cluster)
      const internalEdges = ((await ragDb.execute(sql`
        SELECT src.name as source, tgt.name as target, r.relationship_type as type
        FROM kgra_relationships r
        JOIN kgra_entities src ON src.id = r.source_entity_id
        JOIN kgra_entities tgt ON tgt.id = r.target_entity_id
        WHERE src.entity_type = ${c.community} AND tgt.entity_type = ${c.community}
      `)) as any).rows || [];

      // External edges (one endpoint in, one out)
      const externalEdges = ((await ragDb.execute(sql`
        SELECT src.name as source, tgt.name as target, r.relationship_type as type,
               src.entity_type as source_type, tgt.entity_type as target_type
        FROM kgra_relationships r
        JOIN kgra_entities src ON src.id = r.source_entity_id
        JOIN kgra_entities tgt ON tgt.id = r.target_entity_id
        WHERE (src.entity_type = ${c.community} AND tgt.entity_type != ${c.community})
           OR (src.entity_type != ${c.community} AND tgt.entity_type = ${c.community})
        LIMIT 100
      `)) as any).rows || [];

      res.json({
        id: idx + 1,
        name: c.community,
        nodeCount: Number(c.node_count),
        members: memberNames,
        internalEdges,
        externalEdges,
      });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });
}
