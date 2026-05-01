/**
 * Graph Path Service — shortest path, workflow chain, dependency impact.
 */

import { sql } from "drizzle-orm";
import type { Express } from "express";
import { getRagDb } from "./connection";

export function registerPathRoutes(app: Express) {

  // Shortest path between two nodes (BFS)
  app.get("/api/kgra-proxy/graph/path", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) { res.json({ path: [], edges: [], length: 0 }); return; }
      const from = req.query.from as string;
      const to = req.query.to as string;
      if (!from || !to) { res.status(400).json({ error: "from and to required" }); return; }

      // Build adjacency list from all edges
      const rels = ((await ragDb.execute(sql`
        SELECT src.name as source, tgt.name as target, r.relationship_type as type, r.id as edge_id
        FROM kgra_relationships r
        JOIN kgra_entities src ON src.id = r.source_entity_id
        JOIN kgra_entities tgt ON tgt.id = r.target_entity_id
      `)) as any).rows || [];

      // Also include manual edges
      const manualRels = ((await ragDb.execute(sql`
        SELECT me.id as edge_id, me.name as type, me.source_node_id, me.target_node_id, me.source_is_auto, me.target_is_auto
        FROM kgra_manual_edges me WHERE me.status = 'active'
      `)) as any).rows || [];

      // Build adjacency map
      const adj = new Map<string, Array<{ neighbor: string; edgeId: string; type: string }>>();
      for (const r of rels) {
        if (!adj.has(r.source)) adj.set(r.source, []);
        if (!adj.has(r.target)) adj.set(r.target, []);
        adj.get(r.source)!.push({ neighbor: r.target, edgeId: `e${r.edge_id}`, type: r.type });
        adj.get(r.target)!.push({ neighbor: r.source, edgeId: `e${r.edge_id}`, type: r.type });
      }

      // BFS
      const visited = new Map<string, { parent: string | null; edge: string | null }>([[from, { parent: null, edge: null }]]);
      const queue = [from];
      let found = false;

      while (queue.length > 0 && !found) {
        const current = queue.shift()!;
        const neighbors = adj.get(current) || [];
        for (const { neighbor, edgeId } of neighbors) {
          if (!visited.has(neighbor)) {
            visited.set(neighbor, { parent: current, edge: edgeId });
            if (neighbor === to) { found = true; break; }
            queue.push(neighbor);
          }
        }
      }

      if (!found) { res.json({ path: [], edges: [], length: -1, error: "No path found" }); return; }

      // Reconstruct path
      const path: string[] = [];
      const edgePath: string[] = [];
      let current: string | null = to;
      while (current) {
        path.unshift(current);
        const info = visited.get(current);
        if (info?.edge) edgePath.unshift(info.edge);
        current = info?.parent || null;
      }

      res.json({ path, edges: edgePath, length: path.length - 1 });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // Workflow/event chain — follow edges of a specific type from a start node
  app.get("/api/kgra-proxy/graph/path/chain", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) { res.json({ chain: [], length: 0 }); return; }
      const start = req.query.start as string;
      const type = (req.query.type as string || 'CALLS').toUpperCase();
      const maxDepth = parseInt(req.query.depth as string) || 10;

      const rels = ((await ragDb.execute(sql`
        SELECT src.name as source, tgt.name as target, r.relationship_type as type
        FROM kgra_relationships r
        JOIN kgra_entities src ON src.id = r.source_entity_id
        JOIN kgra_entities tgt ON tgt.id = r.target_entity_id
        WHERE UPPER(r.relationship_type) = ${type}
      `)) as any).rows || [];

      const outgoing = new Map<string, string[]>();
      for (const r of rels) {
        if (!outgoing.has(r.source)) outgoing.set(r.source, []);
        outgoing.get(r.source)!.push(r.target);
      }

      // DFS chain from start
      const chain: string[] = [start];
      const visited = new Set([start]);
      let current = start;
      for (let d = 0; d < maxDepth; d++) {
        const next = (outgoing.get(current) || []).find(n => !visited.has(n));
        if (!next) break;
        chain.push(next);
        visited.add(next);
        current = next;
      }

      res.json({ chain, length: chain.length, type });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // Dependency impact — ripple from a node by depth
  app.get("/api/kgra-proxy/graph/impact", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) { res.json({ layers: [] }); return; }
      const nodeId = req.query.node_id as string;
      const maxDepth = parseInt(req.query.depth as string) || 3;

      const rels = ((await ragDb.execute(sql`
        SELECT src.name as source, tgt.name as target
        FROM kgra_relationships r
        JOIN kgra_entities src ON src.id = r.source_entity_id
        JOIN kgra_entities tgt ON tgt.id = r.target_entity_id
      `)) as any).rows || [];

      // Build bidirectional adjacency
      const adj = new Map<string, Set<string>>();
      for (const r of rels) {
        if (!adj.has(r.source)) adj.set(r.source, new Set());
        if (!adj.has(r.target)) adj.set(r.target, new Set());
        adj.get(r.source)!.add(r.target);
        adj.get(r.target)!.add(r.source);
      }

      // BFS layers
      const visited = new Set([nodeId]);
      let frontier = [nodeId];
      const layers: string[][] = [];

      for (let d = 0; d < maxDepth; d++) {
        const next: string[] = [];
        for (const current of frontier) {
          for (const neighbor of adj.get(current) || []) {
            if (!visited.has(neighbor)) {
              visited.add(neighbor);
              next.push(neighbor);
            }
          }
        }
        if (next.length === 0) break;
        layers.push(next);
        frontier = next;
      }

      res.json({ source: nodeId, layers, totalImpacted: visited.size - 1, depth: layers.length });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });
}
