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

  // ── Reference Endpoints ───────────────────────────────────────

  app.get("/api/kgra-proxy/reference/families", async (_req, res) => {
    try {
      const { readFileSync } = await import("fs");
      const { join } = await import("path");
      const ontology = JSON.parse(readFileSync(join(process.cwd(), "server/rag/default-ontology.json"), "utf-8"));
      res.json(ontology.node_families || {});
    } catch { res.json({}); }
  });

  app.get("/api/kgra-proxy/reference/relationships", async (_req, res) => {
    try {
      const { readFileSync } = await import("fs");
      const { join } = await import("path");
      const ontology = JSON.parse(readFileSync(join(process.cwd(), "server/rag/default-ontology.json"), "utf-8"));
      res.json(ontology.relationship_types || {});
    } catch { res.json({}); }
  });

  app.get("/api/kgra-proxy/reference/overlays", async (_req, res) => {
    try {
      const { readFileSync } = await import("fs");
      const { join } = await import("path");
      const ontology = JSON.parse(readFileSync(join(process.cwd(), "server/rag/default-ontology.json"), "utf-8"));
      res.json(ontology.overlays || []);
    } catch { res.json([]); }
  });

  // ── Templates CRUD ────────────────────────────────────────────

  app.get("/api/kgra-proxy/templates", async (_req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.json([]);
      const rows = ((await ragDb.execute(sql`SELECT * FROM kgra_templates WHERE status = 'active' ORDER BY is_default DESC, created_at DESC`)) as any).rows || [];
      res.json(rows);
    } catch { res.json([]); }
  });

  app.post("/api/kgra-proxy/templates", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.status(500).json({ error: "RAGDB unavailable" });
      const { name, description, purpose } = req.body || {};
      if (!name) return res.status(400).json({ error: "name is required" });
      const result = ((await ragDb.execute(sql`
        INSERT INTO kgra_templates (name, description, purpose) VALUES (${name}, ${description || null}, ${purpose || null}) RETURNING *
      `)) as any).rows?.[0];
      res.json(result);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.get("/api/kgra-proxy/templates/:id", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.status(500).json({ error: "RAGDB unavailable" });
      const id = parseInt(req.params.id);
      const template = ((await ragDb.execute(sql`SELECT * FROM kgra_templates WHERE id = ${id}`)) as any).rows?.[0];
      if (!template) return res.status(404).json({ error: "Template not found" });
      const nodes = ((await ragDb.execute(sql`SELECT * FROM kgra_template_nodes WHERE template_id = ${id}`)) as any).rows || [];
      const edges = ((await ragDb.execute(sql`SELECT * FROM kgra_template_edges WHERE template_id = ${id}`)) as any).rows || [];
      const modes = ((await ragDb.execute(sql`SELECT * FROM kgra_modes WHERE template_id = ${id} ORDER BY sort_order`)) as any).rows || [];
      res.json({ ...template, nodes, edges, modes });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.put("/api/kgra-proxy/templates/:id", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.status(500).json({ error: "RAGDB unavailable" });
      const id = parseInt(req.params.id);
      const { name, description, purpose, status } = req.body || {};
      const result = ((await ragDb.execute(sql`
        UPDATE kgra_templates SET
          name = COALESCE(${name || null}, name), description = COALESCE(${description || null}, description),
          purpose = COALESCE(${purpose || null}, purpose), status = COALESCE(${status || null}, status), updated_at = now()
        WHERE id = ${id} RETURNING *
      `)) as any).rows?.[0];
      res.json(result || { error: "Not found" });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.delete("/api/kgra-proxy/templates/:id", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.status(500).json({ error: "RAGDB unavailable" });
      const id = parseInt(req.params.id);
      // Block deletion of default template
      const tmpl = ((await ragDb.execute(sql`SELECT is_default FROM kgra_templates WHERE id = ${id}`)) as any).rows?.[0];
      if (tmpl?.is_default === "true") return res.status(403).json({ error: "Cannot delete default template" });
      await ragDb.execute(sql`DELETE FROM kgra_template_edges WHERE template_id = ${id}`);
      await ragDb.execute(sql`DELETE FROM kgra_template_nodes WHERE template_id = ${id}`);
      await ragDb.execute(sql`DELETE FROM kgra_modes WHERE template_id = ${id}`);
      await ragDb.execute(sql`DELETE FROM kgra_templates WHERE id = ${id}`);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // Template nodes
  app.get("/api/kgra-proxy/templates/:id/nodes", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.json([]);
      const rows = ((await ragDb.execute(sql`SELECT * FROM kgra_template_nodes WHERE template_id = ${parseInt(req.params.id)}`)) as any).rows || [];
      res.json(rows);
    } catch { res.json([]); }
  });

  app.post("/api/kgra-proxy/templates/:id/nodes", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.status(500).json({ error: "RAGDB unavailable" });
      const templateId = parseInt(req.params.id);
      const { name, unique_id, family, kind, description, properties, short_name } = req.body || {};
      if (!name || !family || !kind) return res.status(400).json({ error: "name, family, kind required" });
      const result = ((await ragDb.execute(sql`
        INSERT INTO kgra_template_nodes (template_id, unique_id, name, short_name, family, kind, description, properties)
        VALUES (${templateId}, ${unique_id || slugify(name)}, ${name}, ${short_name || name}, ${family}, ${kind}, ${description || null}, ${JSON.stringify(properties || {})}::jsonb) RETURNING *
      `)) as any).rows?.[0];
      res.json(result);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.delete("/api/kgra-proxy/templates/:id/nodes/:nid", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.status(500).json({ error: "RAGDB unavailable" });
      await ragDb.execute(sql`DELETE FROM kgra_template_nodes WHERE id = ${parseInt(req.params.nid)} AND template_id = ${parseInt(req.params.id)}`);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // Template edges
  app.get("/api/kgra-proxy/templates/:id/edges", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.json([]);
      const rows = ((await ragDb.execute(sql`SELECT * FROM kgra_template_edges WHERE template_id = ${parseInt(req.params.id)}`)) as any).rows || [];
      res.json(rows);
    } catch { res.json([]); }
  });

  app.post("/api/kgra-proxy/templates/:id/edges", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.status(500).json({ error: "RAGDB unavailable" });
      const templateId = parseInt(req.params.id);
      const { name, source_node_id, target_node_id, relationship_type, relationship_category, link_strength, description, properties, rules } = req.body || {};
      if (!name || !source_node_id || !target_node_id || !relationship_type) return res.status(400).json({ error: "name, source, target, type required" });
      const result = ((await ragDb.execute(sql`
        INSERT INTO kgra_template_edges (template_id, name, source_node_id, target_node_id, relationship_type, relationship_category, link_strength, description, properties, rules)
        VALUES (${templateId}, ${name}, ${source_node_id}, ${target_node_id}, ${relationship_type}, ${relationship_category || null}, ${link_strength || "hard"}, ${description || null}, ${JSON.stringify(properties || {})}::jsonb, ${rules ? JSON.stringify(rules) : null}::jsonb) RETURNING *
      `)) as any).rows?.[0];
      res.json(result);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.delete("/api/kgra-proxy/templates/:id/edges/:eid", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.status(500).json({ error: "RAGDB unavailable" });
      await ragDb.execute(sql`DELETE FROM kgra_template_edges WHERE id = ${parseInt(req.params.eid)} AND template_id = ${parseInt(req.params.id)}`);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // Apply template: copy its nodes/edges into manual tables
  app.post("/api/kgra-proxy/templates/:id/apply", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.status(500).json({ error: "RAGDB unavailable" });
      const templateId = parseInt(req.params.id);

      // Record application
      const applied = ((await ragDb.execute(sql`
        INSERT INTO kgra_applied_templates (template_id) VALUES (${templateId}) RETURNING id
      `)) as any).rows?.[0];
      const appliedId = applied?.id;

      // Copy template nodes → manual nodes
      const tNodes = ((await ragDb.execute(sql`SELECT * FROM kgra_template_nodes WHERE template_id = ${templateId}`)) as any).rows || [];
      const nodeIdMap = new Map<number, number>();
      for (const tn of tNodes) {
        const uid = `tmpl_${templateId}_${tn.unique_id || tn.id}`;
        const inserted = ((await ragDb.execute(sql`
          INSERT INTO kgra_manual_nodes (unique_id, name, short_name, family, kind, description, properties, applied_template_id)
          VALUES (${uid}, ${tn.name}, ${tn.short_name || tn.name}, ${tn.family}, ${tn.kind}, ${tn.description || null}, ${JSON.stringify(tn.properties || {})}::jsonb, ${appliedId})
          ON CONFLICT (unique_id) DO NOTHING RETURNING id
        `)) as any).rows?.[0];
        if (inserted) nodeIdMap.set(tn.id, inserted.id);
      }

      // Copy template edges → manual edges (remap node IDs)
      const tEdges = ((await ragDb.execute(sql`SELECT * FROM kgra_template_edges WHERE template_id = ${templateId}`)) as any).rows || [];
      let edgeCount = 0;
      for (const te of tEdges) {
        const srcId = nodeIdMap.get(te.source_node_id);
        const tgtId = nodeIdMap.get(te.target_node_id);
        if (!srcId || !tgtId) continue;
        await ragDb.execute(sql`
          INSERT INTO kgra_manual_edges (name, source_node_id, target_node_id, source_is_auto, target_is_auto, relationship_type, relationship_category, link_strength, description, properties, rules, applied_template_id)
          VALUES (${te.name}, ${srcId}, ${tgtId}, 'false', 'false', ${te.relationship_type}, ${te.relationship_category || null}, ${te.link_strength || "hard"}, ${te.description || null}, ${JSON.stringify(te.properties || {})}::jsonb, ${te.rules ? JSON.stringify(te.rules) : null}::jsonb, ${appliedId})
        `);
        edgeCount++;
      }

      res.json({ success: true, applied_id: appliedId, nodes_copied: nodeIdMap.size, edges_copied: edgeCount });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // Unapply template: remove manual entries from this application
  app.post("/api/kgra-proxy/templates/:id/unapply", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.status(500).json({ error: "RAGDB unavailable" });
      const templateId = parseInt(req.params.id);
      // Find applied_template entries
      const applied = ((await ragDb.execute(sql`SELECT id FROM kgra_applied_templates WHERE template_id = ${templateId} AND status = 'active'`)) as any).rows || [];
      for (const a of applied) {
        await ragDb.execute(sql`DELETE FROM kgra_manual_edges WHERE applied_template_id = ${a.id}`);
        await ragDb.execute(sql`DELETE FROM kgra_manual_nodes WHERE applied_template_id = ${a.id}`);
        await ragDb.execute(sql`UPDATE kgra_applied_templates SET status = 'removed' WHERE id = ${a.id}`);
      }
      res.json({ success: true, removed: applied.length });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // Save manual entries as new template
  app.post("/api/kgra-proxy/templates/from-manual", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.status(500).json({ error: "RAGDB unavailable" });
      const { name, description } = req.body || {};
      if (!name) return res.status(400).json({ error: "name required" });

      // Create template
      const tmpl = ((await ragDb.execute(sql`
        INSERT INTO kgra_templates (name, description) VALUES (${name}, ${description || null}) RETURNING id
      `)) as any).rows?.[0];
      if (!tmpl) return res.status(500).json({ error: "Failed to create template" });

      // Copy all active manual nodes into template
      const manualNodes = ((await ragDb.execute(sql`SELECT * FROM kgra_manual_nodes WHERE status = 'active' AND applied_template_id IS NULL`)) as any).rows || [];
      const nodeMap = new Map<number, number>();
      for (const mn of manualNodes) {
        const tn = ((await ragDb.execute(sql`
          INSERT INTO kgra_template_nodes (template_id, unique_id, name, short_name, family, kind, description, properties)
          VALUES (${tmpl.id}, ${mn.unique_id}, ${mn.name}, ${mn.short_name}, ${mn.family}, ${mn.kind}, ${mn.description}, ${JSON.stringify(mn.properties || {})}::jsonb) RETURNING id
        `)) as any).rows?.[0];
        if (tn) nodeMap.set(mn.id, tn.id);
      }

      // Copy manual edges
      const manualEdges = ((await ragDb.execute(sql`SELECT * FROM kgra_manual_edges WHERE status = 'active' AND applied_template_id IS NULL AND source_is_auto = 'false' AND target_is_auto = 'false'`)) as any).rows || [];
      let ec = 0;
      for (const me of manualEdges) {
        const srcId = nodeMap.get(me.source_node_id);
        const tgtId = nodeMap.get(me.target_node_id);
        if (!srcId || !tgtId) continue;
        await ragDb.execute(sql`
          INSERT INTO kgra_template_edges (template_id, name, source_node_id, target_node_id, relationship_type, relationship_category, link_strength, description, properties, rules)
          VALUES (${tmpl.id}, ${me.name}, ${srcId}, ${tgtId}, ${me.relationship_type}, ${me.relationship_category}, ${me.link_strength}, ${me.description}, ${JSON.stringify(me.properties || {})}::jsonb, ${me.rules ? JSON.stringify(me.rules) : null}::jsonb)
        `);
        ec++;
      }

      res.json({ success: true, template_id: tmpl.id, nodes: nodeMap.size, edges: ec });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // Duplicate template
  app.post("/api/kgra-proxy/templates/:id/duplicate", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.status(500).json({ error: "RAGDB unavailable" });
      const srcId = parseInt(req.params.id);
      const src = ((await ragDb.execute(sql`SELECT * FROM kgra_templates WHERE id = ${srcId}`)) as any).rows?.[0];
      if (!src) return res.status(404).json({ error: "Template not found" });

      const newTmpl = ((await ragDb.execute(sql`
        INSERT INTO kgra_templates (name, version, description, purpose, design_principles, overlays, visualization_rules, quality_guards, portability_profiles, maturity_levels, example_queries)
        VALUES (${src.name + " (copy)"}, ${src.version}, ${src.description}, ${src.purpose},
          ${JSON.stringify(src.design_principles || [])}::jsonb, ${JSON.stringify(src.overlays || [])}::jsonb,
          ${JSON.stringify(src.visualization_rules || [])}::jsonb, ${JSON.stringify(src.quality_guards || [])}::jsonb,
          ${JSON.stringify(src.portability_profiles || [])}::jsonb, ${JSON.stringify(src.maturity_levels || {})}::jsonb,
          ${JSON.stringify(src.example_queries || [])}::jsonb) RETURNING id
      `)) as any).rows?.[0];
      if (!newTmpl) return res.status(500).json({ error: "Failed to duplicate" });

      // Copy nodes
      const srcNodes = ((await ragDb.execute(sql`SELECT * FROM kgra_template_nodes WHERE template_id = ${srcId}`)) as any).rows || [];
      const nMap = new Map<number, number>();
      for (const n of srcNodes) {
        const ins = ((await ragDb.execute(sql`
          INSERT INTO kgra_template_nodes (template_id, unique_id, name, short_name, family, kind, description, properties)
          VALUES (${newTmpl.id}, ${n.unique_id}, ${n.name}, ${n.short_name}, ${n.family}, ${n.kind}, ${n.description}, ${JSON.stringify(n.properties || {})}::jsonb) RETURNING id
        `)) as any).rows?.[0];
        if (ins) nMap.set(n.id, ins.id);
      }
      // Copy edges
      const srcEdges = ((await ragDb.execute(sql`SELECT * FROM kgra_template_edges WHERE template_id = ${srcId}`)) as any).rows || [];
      for (const e of srcEdges) {
        const s = nMap.get(e.source_node_id); const t = nMap.get(e.target_node_id);
        if (!s || !t) continue;
        await ragDb.execute(sql`
          INSERT INTO kgra_template_edges (template_id, name, source_node_id, target_node_id, relationship_type, relationship_category, link_strength, description, properties, rules)
          VALUES (${newTmpl.id}, ${e.name}, ${s}, ${t}, ${e.relationship_type}, ${e.relationship_category}, ${e.link_strength}, ${e.description}, ${JSON.stringify(e.properties || {})}::jsonb, ${e.rules ? JSON.stringify(e.rules) : null}::jsonb)
        `);
      }
      // Copy modes
      const srcModes = ((await ragDb.execute(sql`SELECT * FROM kgra_modes WHERE template_id = ${srcId}`)) as any).rows || [];
      for (const m of srcModes) {
        await ragDb.execute(sql`
          INSERT INTO kgra_modes (template_id, mode_id, name, persona, primary_question, includes, emphasis_rules, default_view_layout, example_use_case, sort_order)
          VALUES (${newTmpl.id}, ${m.mode_id}, ${m.name}, ${m.persona}, ${m.primary_question}, ${JSON.stringify(m.includes)}::jsonb, ${JSON.stringify(m.emphasis_rules || [])}::jsonb, ${m.default_view_layout}, ${m.example_use_case}, ${m.sort_order || 0})
        `);
      }

      res.json({ success: true, new_template_id: newTmpl.id });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  // ── Modes CRUD ────────────────────────────────────────────────

  app.get("/api/kgra-proxy/modes", async (_req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.json([]);
      const rows = ((await ragDb.execute(sql`SELECT * FROM kgra_modes ORDER BY sort_order, created_at`)) as any).rows || [];
      res.json(rows);
    } catch { res.json([]); }
  });

  app.post("/api/kgra-proxy/modes", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.status(500).json({ error: "RAGDB unavailable" });
      const { mode_id, name, persona, primary_question, includes, emphasis_rules, default_view_layout, example_use_case } = req.body || {};
      if (!mode_id || !name || !includes) return res.status(400).json({ error: "mode_id, name, includes required" });
      const result = ((await ragDb.execute(sql`
        INSERT INTO kgra_modes (mode_id, name, persona, primary_question, includes, emphasis_rules, default_view_layout, example_use_case)
        VALUES (${mode_id}, ${name}, ${persona || null}, ${primary_question || null}, ${JSON.stringify(includes)}::jsonb, ${JSON.stringify(emphasis_rules || [])}::jsonb, ${default_view_layout || "force"}, ${example_use_case || null}) RETURNING *
      `)) as any).rows?.[0];
      res.json(result);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.put("/api/kgra-proxy/modes/:id", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.status(500).json({ error: "RAGDB unavailable" });
      const id = parseInt(req.params.id);
      const { name, persona, primary_question, includes, emphasis_rules, default_view_layout, example_use_case } = req.body || {};
      const result = ((await ragDb.execute(sql`
        UPDATE kgra_modes SET
          name = COALESCE(${name || null}, name), persona = COALESCE(${persona || null}, persona),
          primary_question = COALESCE(${primary_question || null}, primary_question),
          includes = COALESCE(${includes ? JSON.stringify(includes) : null}::jsonb, includes),
          emphasis_rules = COALESCE(${emphasis_rules ? JSON.stringify(emphasis_rules) : null}::jsonb, emphasis_rules),
          default_view_layout = COALESCE(${default_view_layout || null}, default_view_layout),
          example_use_case = COALESCE(${example_use_case || null}, example_use_case), updated_at = now()
        WHERE id = ${id} RETURNING *
      `)) as any).rows?.[0];
      res.json(result || { error: "Not found" });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.delete("/api/kgra-proxy/modes/:id", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.status(500).json({ error: "RAGDB unavailable" });
      const id = parseInt(req.params.id);
      const mode = ((await ragDb.execute(sql`SELECT is_default FROM kgra_modes WHERE id = ${id}`)) as any).rows?.[0];
      if (mode?.is_default === "true") return res.status(403).json({ error: "Cannot delete default mode" });
      await ragDb.execute(sql`DELETE FROM kgra_modes WHERE id = ${id}`);
      res.json({ success: true });
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });

  app.get("/api/kgra-proxy/modes/compositions", async (_req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.json([]);
      const rows = ((await ragDb.execute(sql`SELECT * FROM kgra_mode_compositions ORDER BY created_at`)) as any).rows || [];
      res.json(rows);
    } catch { res.json([]); }
  });

  app.post("/api/kgra-proxy/modes/compose", async (req, res) => {
    try {
      const ragDb = getRagDb();
      if (!ragDb) return res.status(500).json({ error: "RAGDB unavailable" });
      const { name, mode_ids, merge_strategy, conflict_resolution, zoom_level } = req.body || {};
      if (!name || !mode_ids) return res.status(400).json({ error: "name, mode_ids required" });
      const result = ((await ragDb.execute(sql`
        INSERT INTO kgra_mode_compositions (name, mode_ids, merge_strategy, conflict_resolution, zoom_level)
        VALUES (${name}, ${JSON.stringify(mode_ids)}::jsonb, ${merge_strategy || "union"}, ${conflict_resolution || null}, ${zoom_level || null}) RETURNING *
      `)) as any).rows?.[0];
      res.json(result);
    } catch (err) { res.status(500).json({ error: (err as Error).message }); }
  });
}
