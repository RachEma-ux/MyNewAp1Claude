/**
 * Graph Snapshot Service — temporal queries on ragdb.
 * Snapshot at time T, range queries, diff, history, activity metrics.
 */

import { sql } from "drizzle-orm";
import type { Express } from "express";
import { getRagDb } from "./connection";

export function registerSnapshotRoutes(app: Express) {

  // Graph snapshot at time T — returns entities/edges created before T
  app.get("/api/kgra-proxy/graph/snapshot", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.json({ nodes: [], edges: [] });
      const at = req.query.at as string;
      if (!at) return res.status(400).json({ error: "at parameter required (ISO timestamp)" });

      const autoNodes = ((await ragDb.execute(sql`
        SELECT id, name, short_name, entity_type, mentions, created_at FROM kgra_entities WHERE created_at <= ${at}
      `)) as any).rows || [];
      const manualNodes = ((await ragDb.execute(sql`
        SELECT id, name, short_name, family as entity_type, mentions, created_at FROM kgra_manual_nodes WHERE status = 'active' AND created_at <= ${at}
      `)) as any).rows || [];
      const nodes = [...autoNodes, ...manualNodes];

      const edges = ((await ragDb.execute(sql`
        SELECT r.id, src.name as source, tgt.name as target, r.relationship_type as type, r.created_at
        FROM kgra_relationships r
        JOIN kgra_entities src ON src.id = r.source_entity_id
        JOIN kgra_entities tgt ON tgt.id = r.target_entity_id
        WHERE r.created_at <= ${at}
      `)) as any).rows || [];

      res.json({ nodes, edges, at });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // Graph in time range
  app.get("/api/kgra-proxy/graph/snapshot/range", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.json({ nodes: [], edges: [] });
      const from = req.query.from as string;
      const to = req.query.to as string;
      if (!from || !to) return res.status(400).json({ error: "from and to required" });

      const autoNodes = ((await ragDb.execute(sql`
        SELECT id, name, short_name, entity_type, mentions, created_at FROM kgra_entities WHERE created_at >= ${from} AND created_at <= ${to}
      `)) as any).rows || [];
      const manualNodes = ((await ragDb.execute(sql`
        SELECT id, name, short_name, family as entity_type, mentions, created_at FROM kgra_manual_nodes WHERE status = 'active' AND created_at >= ${from} AND created_at <= ${to}
      `)) as any).rows || [];
      const nodes = [...autoNodes, ...manualNodes];

      const edges = ((await ragDb.execute(sql`
        SELECT r.id, src.name as source, tgt.name as target, r.relationship_type as type, r.created_at
        FROM kgra_relationships r
        JOIN kgra_entities src ON src.id = r.source_entity_id
        JOIN kgra_entities tgt ON tgt.id = r.target_entity_id
        WHERE r.created_at >= ${from} AND r.created_at <= ${to}
      `)) as any).rows || [];

      res.json({ nodes, edges, from, to });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // Diff between two timestamps
  app.get("/api/kgra-proxy/graph/diff", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.json({ added: { nodes: [], edges: [] }, removed: { nodes: [], edges: [] } });
      const a = req.query.a as string;
      const b = req.query.b as string;
      if (!a || !b) return res.status(400).json({ error: "a and b timestamps required" });

      // Nodes added between a and b
      const addedNodes = ((await ragDb.execute(sql`
        SELECT id, name, short_name, entity_type, created_at FROM kgra_entities
        WHERE created_at > ${a} AND created_at <= ${b}
      `)) as any).rows || [];

      // Edges added between a and b
      const addedEdges = ((await ragDb.execute(sql`
        SELECT r.id, src.name as source, tgt.name as target, r.relationship_type as type, r.created_at
        FROM kgra_relationships r
        JOIN kgra_entities src ON src.id = r.source_entity_id
        JOIN kgra_entities tgt ON tgt.id = r.target_entity_id
        WHERE r.created_at > ${a} AND r.created_at <= ${b}
      `)) as any).rows || [];

      // Manual nodes added/updated
      const addedManual = ((await ragDb.execute(sql`
        SELECT id, name, family, kind, created_at, updated_at FROM kgra_manual_nodes
        WHERE status = 'active' AND (created_at > ${a} AND created_at <= ${b})
      `)) as any).rows || [];

      const changedManual = ((await ragDb.execute(sql`
        SELECT id, name, family, kind, created_at, updated_at FROM kgra_manual_nodes
        WHERE status = 'active' AND created_at <= ${a} AND updated_at > ${a} AND updated_at <= ${b}
      `)) as any).rows || [];

      res.json({
        added: { nodes: [...addedNodes, ...addedManual], edges: addedEdges },
        removed: { nodes: [], edges: [] }, // No deletion tracking yet
        changed: { nodes: changedManual, edges: [] },
        from: a, to: b,
      });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // Event history for a node
  app.get("/api/kgra-proxy/graph/history", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.json([]);
      const nodeId = req.query.node_id as string;
      if (!nodeId) return res.status(400).json({ error: "node_id required" });

      // Check auto entities
      const autoNode = ((await ragDb.execute(sql`
        SELECT id, name, entity_type as type, created_at, 'auto' as source FROM kgra_entities WHERE name = ${nodeId}
      `)) as any).rows || [];

      // Check manual nodes
      const manualNode = ((await ragDb.execute(sql`
        SELECT id, name, family || '/' || kind as type, created_at, updated_at, status, 'manual' as source
        FROM kgra_manual_nodes WHERE name = ${nodeId} OR unique_id = ${nodeId} OR id::text = ${nodeId.replace('manual_', '')}
      `)) as any).rows || [];

      const events = [];
      for (const n of autoNode) {
        events.push({ event: 'created', at: n.created_at, type: n.type, source: 'auto' });
      }
      for (const n of manualNode) {
        events.push({ event: 'created', at: n.created_at, type: n.type, source: 'manual', status: n.status });
        if (n.updated_at && n.updated_at !== n.created_at) {
          events.push({ event: 'updated', at: n.updated_at, type: n.type, source: 'manual', status: n.status });
        }
      }

      // Build run events
      const builds = ((await ragDb.execute(sql`SELECT build_id, built_at, entity_count, relationship_count FROM kgra_build_runs ORDER BY built_at`)) as any).rows || [];
      for (const b of builds) {
        events.push({ event: 'graph_build', at: b.built_at, entities: b.entity_count, relationships: b.relationship_count });
      }

      events.sort((a: any, b: any) => new Date(a.at).getTime() - new Date(b.at).getTime());
      res.json(events);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // Activity metrics over time
  app.get("/api/kgra-proxy/graph/activity", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.json([]);
      const bucket = (req.query.bucket as string) || 'day';

      const trunc = bucket === 'hour' ? 'hour' : bucket === 'week' ? 'week' : 'day';

      const activity = ((await ragDb.execute(sql`
        SELECT date_trunc(${trunc}, created_at) as period, COUNT(*) as count
        FROM kgra_entities
        GROUP BY period
        ORDER BY period
      `)) as any).rows || [];

      const manualActivity = ((await ragDb.execute(sql`
        SELECT date_trunc(${trunc}, created_at) as period, COUNT(*) as count
        FROM kgra_manual_nodes WHERE status = 'active'
        GROUP BY period
        ORDER BY period
      `)) as any).rows || [];

      // Merge
      const merged = new Map<string, number>();
      for (const a of activity) { merged.set(a.period, (merged.get(a.period) || 0) + Number(a.count)); }
      for (const a of manualActivity) { merged.set(a.period, (merged.get(a.period) || 0) + Number(a.count)); }

      const result = [...merged.entries()].map(([time, count]) => ({ time, count })).sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
      res.json(result);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });
}
