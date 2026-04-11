/**
 * KGRA Designer Routes — Manual nodes/edges CRUD + future templates/modes.
 *
 * All endpoints under /api/kgra-proxy/manual/*.
 * All data stored in ragdb via getRagDb().
 */

import { sql } from "drizzle-orm";
import type { Express } from "express";
import { getRagDb } from "./connection";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 200);
}

export function registerDesignerRoutes(app: Express) {
  // ── Manual Nodes ──────────────────────────────────────────────

  // List manual nodes
  app.get("/api/kgra-proxy/manual/nodes", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.json([]);
      const status = (req.query.status as string) || "active";
      const rows = ((await ragDb.execute(sql`
        SELECT * FROM kgra_manual_nodes WHERE status = ${status} ORDER BY created_at DESC
      `)) as any).rows || [];
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Create manual node
  app.post("/api/kgra-proxy/manual/nodes", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.status(500).json({ error: "RAGDB unavailable" });
      const { name, unique_id, family, kind, description, properties, short_name } = req.body || {};
      if (!name || !family || !kind) {
        return res.status(400).json({ error: "name, family, and kind are required" });
      }
      const uid = unique_id || slugify(name);

      // Check uniqueness
      const existing = ((await ragDb.execute(sql`
        SELECT id FROM kgra_manual_nodes WHERE unique_id = ${uid}
      `)) as any).rows;
      if (existing?.length > 0) {
        return res.status(409).json({ error: `Node with unique_id '${uid}' already exists` });
      }

      const result = ((await ragDb.execute(sql`
        INSERT INTO kgra_manual_nodes (unique_id, name, short_name, family, kind, description, properties)
        VALUES (${uid}, ${name}, ${short_name || name}, ${family}, ${kind}, ${description || null}, ${JSON.stringify(properties || {})}::jsonb)
        RETURNING *
      `)) as any).rows?.[0];
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Update manual node
  app.put("/api/kgra-proxy/manual/nodes/:id", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.status(500).json({ error: "RAGDB unavailable" });
      const id = parseInt(req.params.id);
      const { name, short_name, family, kind, description, properties, status } = req.body || {};

      const sets: string[] = [];
      const result = ((await ragDb.execute(sql`
        UPDATE kgra_manual_nodes SET
          name = COALESCE(${name || null}, name),
          short_name = COALESCE(${short_name || null}, short_name),
          family = COALESCE(${family || null}, family),
          kind = COALESCE(${kind || null}, kind),
          description = COALESCE(${description || null}, description),
          properties = COALESCE(${properties ? JSON.stringify(properties) : null}::jsonb, properties),
          status = COALESCE(${status || null}, status),
          updated_at = now()
        WHERE id = ${id}
        RETURNING *
      `)) as any).rows?.[0];
      if (!result) return res.status(404).json({ error: "Node not found" });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Delete manual node
  app.delete("/api/kgra-proxy/manual/nodes/:id", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.status(500).json({ error: "RAGDB unavailable" });
      const id = parseInt(req.params.id);
      // Also delete edges referencing this node
      await ragDb.execute(sql`DELETE FROM kgra_manual_edges WHERE (source_node_id = ${id} AND source_is_auto = 'false') OR (target_node_id = ${id} AND target_is_auto = 'false')`);
      await ragDb.execute(sql`DELETE FROM kgra_manual_nodes WHERE id = ${id}`);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Archive manual node
  app.post("/api/kgra-proxy/manual/nodes/:id/archive", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.status(500).json({ error: "RAGDB unavailable" });
      const id = parseInt(req.params.id);
      const result = ((await ragDb.execute(sql`
        UPDATE kgra_manual_nodes SET status = 'archived', updated_at = now() WHERE id = ${id} RETURNING *
      `)) as any).rows?.[0];
      if (!result) return res.status(404).json({ error: "Node not found" });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Restore manual node
  app.post("/api/kgra-proxy/manual/nodes/:id/restore", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.status(500).json({ error: "RAGDB unavailable" });
      const id = parseInt(req.params.id);
      const result = ((await ragDb.execute(sql`
        UPDATE kgra_manual_nodes SET status = 'active', updated_at = now() WHERE id = ${id} RETURNING *
      `)) as any).rows?.[0];
      if (!result) return res.status(404).json({ error: "Node not found" });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ── Manual Edges ──────────────────────────────────────────────

  // List manual edges
  app.get("/api/kgra-proxy/manual/edges", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.json([]);
      const status = (req.query.status as string) || "active";
      const rows = ((await ragDb.execute(sql`
        SELECT * FROM kgra_manual_edges WHERE status = ${status} ORDER BY created_at DESC
      `)) as any).rows || [];
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Create manual edge
  app.post("/api/kgra-proxy/manual/edges", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.status(500).json({ error: "RAGDB unavailable" });
      const {
        name, source_node_id, target_node_id, source_is_auto, target_is_auto,
        relationship_type, relationship_category, weight, confidence, provenance,
        link_strength, description, properties, rules,
      } = req.body || {};

      if (!name || source_node_id == null || target_node_id == null || !relationship_type) {
        return res.status(400).json({ error: "name, source_node_id, target_node_id, and relationship_type are required" });
      }

      const result = ((await ragDb.execute(sql`
        INSERT INTO kgra_manual_edges (
          name, source_node_id, target_node_id, source_is_auto, target_is_auto,
          relationship_type, relationship_category, weight, confidence, provenance,
          link_strength, description, properties, rules
        ) VALUES (
          ${name}, ${source_node_id}, ${target_node_id},
          ${source_is_auto ? "true" : "false"}, ${target_is_auto ? "true" : "false"},
          ${relationship_type}, ${relationship_category || null}, ${weight || 1},
          ${confidence || null}, ${provenance || null},
          ${link_strength || "hard"}, ${description || null},
          ${JSON.stringify(properties || {})}::jsonb, ${rules ? JSON.stringify(rules) : null}::jsonb
        )
        RETURNING *
      `)) as any).rows?.[0];
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Update manual edge
  app.put("/api/kgra-proxy/manual/edges/:id", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.status(500).json({ error: "RAGDB unavailable" });
      const id = parseInt(req.params.id);
      const { name, relationship_type, relationship_category, weight, confidence, provenance, link_strength, description, properties, rules, status } = req.body || {};

      const result = ((await ragDb.execute(sql`
        UPDATE kgra_manual_edges SET
          name = COALESCE(${name || null}, name),
          relationship_type = COALESCE(${relationship_type || null}, relationship_type),
          relationship_category = COALESCE(${relationship_category || null}, relationship_category),
          weight = COALESCE(${weight || null}, weight),
          confidence = COALESCE(${confidence || null}, confidence),
          provenance = COALESCE(${provenance || null}, provenance),
          link_strength = COALESCE(${link_strength || null}, link_strength),
          description = COALESCE(${description || null}, description),
          properties = COALESCE(${properties ? JSON.stringify(properties) : null}::jsonb, properties),
          rules = COALESCE(${rules ? JSON.stringify(rules) : null}::jsonb, rules),
          status = COALESCE(${status || null}, status),
          updated_at = now()
        WHERE id = ${id}
        RETURNING *
      `)) as any).rows?.[0];
      if (!result) return res.status(404).json({ error: "Edge not found" });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Delete manual edge
  app.delete("/api/kgra-proxy/manual/edges/:id", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.status(500).json({ error: "RAGDB unavailable" });
      const id = parseInt(req.params.id);
      await ragDb.execute(sql`DELETE FROM kgra_manual_edges WHERE id = ${id}`);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Archive manual edge
  app.post("/api/kgra-proxy/manual/edges/:id/archive", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.status(500).json({ error: "RAGDB unavailable" });
      const id = parseInt(req.params.id);
      const result = ((await ragDb.execute(sql`
        UPDATE kgra_manual_edges SET status = 'archived', updated_at = now() WHERE id = ${id} RETURNING *
      `)) as any).rows?.[0];
      if (!result) return res.status(404).json({ error: "Edge not found" });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });
}
