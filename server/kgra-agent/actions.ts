/**
 * KGRA Actions — real executable functions the agent calls autonomously.
 * These turn raw user prompts into actual platform operations.
 */

import { sql } from "drizzle-orm";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname, relative } from "path";

const PROJECT_ROOT = process.cwd();

// ── Action Results ──────────────────────────────────────────────

export interface UICommand {
  op: "fill" | "click" | "tab" | "show" | "toast" | "render_html";
  target?: string;       // CSS selector or tab name
  value?: string;        // value to fill or HTML to render
  delay?: number;        // ms to wait before executing
}

export interface ActionResult {
  action: string;
  success: boolean;
  summary: string;
  data: Record<string, unknown>;
  ui?: UICommand[];
}

// ── Intent → Action Matching ────────────────────────────────────

const ACTION_PATTERNS: Array<{ pattern: RegExp; action: string }> = [
  { pattern: /create\s+(a\s+)?rag|build\s+(a\s+)?rag|ingest|index\s+(the\s+)?(project|folder|code)/i, action: "ingest_project" },
  { pattern: /visuali[sz]e|show\s+(the\s+)?graph|render\s+graph|graph\s+view|build.*knowledge\s*graph/i, action: "build_graph" },
  { pattern: /graph\s*stats|knowledge\s*graph\s*status|how\s+many\s+(entities|nodes|edges)/i, action: "graph_stats" },
  { pattern: /search\s+(for|the)|find\s+(in|the)|query\s+(the\s+)?(graph|rag|knowledge)/i, action: "query_graph" },
];

export function detectAction(query: string): string | null {
  for (const { pattern, action } of ACTION_PATTERNS) {
    if (pattern.test(query)) return action;
  }
  return null;
}

// ── Action: Ingest Project Code Files ───────────────────────────

const CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", ".next", ".cache", "coverage",
  ".turbo", ".vscode", ".idea", "__tests__", "tests",
]);
const MAX_FILE_SIZE = 60_000; // 60KB
const CHUNK_SIZE = 2000;

function scanCodeFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry) || entry.startsWith(".")) continue;
      const full = join(dir, entry);
      try {
        const stat = statSync(full);
        if (stat.isDirectory()) {
          results.push(...scanCodeFiles(full));
        } else if (stat.isFile() && stat.size <= MAX_FILE_SIZE && CODE_EXTENSIONS.has(extname(entry))) {
          results.push(full);
        }
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return results;
}

function chunkText(text: string, chunkSize: number): string[] {
  const chunks: string[] = [];
  const lines = text.split("\n");
  let current = "";
  for (const line of lines) {
    if (current.length + line.length + 1 > chunkSize && current.length > 0) {
      chunks.push(current);
      current = line;
    } else {
      current += (current ? "\n" : "") + line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export async function ingestProject(folderPath?: string): Promise<ActionResult> {
  const targetDir = folderPath || PROJECT_ROOT;

  try {
    const { getDb } = await import("../db/connection");
    const db = getDb();
    if (!db) return { action: "ingest_project", success: false, summary: "Database unavailable", data: {} };

    // Clear previous ingest to avoid duplicates
    await db.execute(sql`DELETE FROM document_chunks WHERE "documentId" IN (SELECT id FROM documents WHERE "workspaceId" = 1 AND status = 'processed')`);
    await db.execute(sql`DELETE FROM documents WHERE "workspaceId" = 1 AND status = 'processed'`);

    // Scan ALL code files — no cap (GitHub Actions has enough RAM)
    const files = scanCodeFiles(targetDir);
    if (files.length === 0) {
      return { action: "ingest_project", success: false, summary: "No code files found", data: { dir: targetDir } };
    }

    let docsIngested = 0;
    let chunksCreated = 0;
    let totalBytes = 0;
    const fileTypes: Record<string, number> = {};
    const dirs: Record<string, number> = {};

    for (const filePath of files) {
      try {
        const content = readFileSync(filePath, "utf-8");
        const relPath = relative(targetDir, filePath);
        const ext = extname(filePath);
        const size = Buffer.byteLength(content, "utf-8");
        const dir = relPath.split("/").slice(0, 2).join("/");

        fileTypes[ext] = (fileTypes[ext] || 0) + 1;
        dirs[dir] = (dirs[dir] || 0) + 1;
        totalBytes += size;

        const docResult = await db.execute(sql`
          INSERT INTO documents (
            "workspaceId", filename, "fileType", "fileSize", "fileUrl", "fileKey",
            status, title, "wordCount", "uploadedBy", "createdAt", "updatedAt"
          ) VALUES (
            1, ${relPath}, ${ext.slice(1)}, ${size}, ${"file://" + relPath}, ${relPath},
            'processed', ${relPath}, ${content.split(/\s+/).length}, 1, NOW(), NOW()
          ) RETURNING id
        `);
        const docId = (docResult as any).rows?.[0]?.id;
        if (!docId) continue;
        docsIngested++;

        // Chunk — keep first 5 per file (enough to extract structure)
        const chunks = chunkText(content, CHUNK_SIZE).slice(0, 5);
        for (let i = 0; i < chunks.length; i++) {
          await db.execute(sql`
            INSERT INTO document_chunks ("documentId", content, "chunkIndex", heading, "createdAt")
            VALUES (${docId}, ${chunks[i]}, ${i}, ${relPath}, NOW())
          `);
          chunksCreated++;
        }

        await db.execute(sql`UPDATE documents SET "chunkCount" = ${chunks.length} WHERE id = ${docId}`);
      } catch { /* skip file */ }
    }

    return {
      action: "ingest_project",
      success: true,
      summary: `Ingested ${docsIngested} code files (${chunksCreated} chunks, ${Math.round(totalBytes / 1024)}KB) from ${relative(process.env.HOME || "/", targetDir)}`,
      data: { docsIngested, chunksCreated, totalBytes, fileTypes, dirs, totalFilesScanned: files.length },
    };
  } catch (err) {
    return { action: "ingest_project", success: false, summary: `Ingest failed: ${(err as Error).message}`, data: {} };
  }
}

// ── Action: Build Knowledge Graph ───────────────────────────────

export async function buildKnowledgeGraph(): Promise<ActionResult> {
  try {
    const { getDb } = await import("../db/connection");
    const db = getDb();
    if (!db) return { action: "build_graph", success: false, summary: "Database unavailable", data: {} };

    const chunkRows = (await db.execute(sql`
      SELECT dc.id, dc.content, dc.heading, d.filename
      FROM document_chunks dc
      JOIN documents d ON d.id = dc."documentId"
      ORDER BY dc.id
      LIMIT 10000
    `) as any).rows || [];

    if (chunkRows.length === 0) {
      return { action: "build_graph", success: false, summary: "No document chunks found. Ingest documents first.", data: {} };
    }

    const entities = new Map<string, { type: string; mentions: number; dir?: string }>();
    const relationships: Array<{ from: string; to: string; type: string }> = [];

    const addEntity = (name: string, type: string, dir?: string) => {
      const e = entities.get(name);
      if (e) { e.mentions++; } else { entities.set(name, { type, mentions: 1, dir }); }
    };

    for (const chunk of chunkRows) {
      const content: string = chunk.content || "";
      const filename: string = chunk.filename || chunk.heading || "";
      if (!filename) continue;

      // Classify the file as entity
      const isPage = filename.includes("/pages/");
      const isComponent = filename.includes("/components/");
      const isHook = filename.includes("/hooks/") || filename.match(/use[A-Z]/);
      const isLib = filename.includes("/lib/");
      const isRouter = filename.includes("router") || filename.includes("routers");
      const isServer = filename.startsWith("server/");
      const isSchema = filename.includes("drizzle/") || filename.includes("schema");

      const fileType = isPage ? "page" : isComponent ? "component" : isHook ? "hook"
        : isLib ? "lib" : isRouter ? "router" : isSchema ? "schema" : isServer ? "server" : "file";
      const dir = filename.split("/").slice(0, 2).join("/");
      addEntity(filename, fileType, dir);

      // Extract imports → resolve to real paths
      const importMatches = content.matchAll(/import\s+(?:\{([^}]+)\}|(\w+))\s+from\s+["']([^"']+)["']/g);
      for (const m of importMatches) {
        const namedImports = m[1] || "";
        const defaultImport = m[2] || "";
        const importPath = m[3];

        // Skip node_modules imports
        if (!importPath.startsWith(".") && !importPath.startsWith("@/") && !importPath.startsWith("@shared/")) continue;

        addEntity(importPath, "module");
        relationships.push({ from: filename, to: importPath, type: "imports" });

        // Extract individual named imports as component/hook references
        if (namedImports) {
          for (const name of namedImports.split(",").map(s => s.trim().split(" as ")[0].trim()).filter(Boolean)) {
            if (/^[A-Z]/.test(name)) {
              addEntity(name, "component");
              relationships.push({ from: filename, to: name, type: "uses_component" });
            } else if (name.startsWith("use")) {
              addEntity(name, "hook");
              relationships.push({ from: filename, to: name, type: "uses_hook" });
            }
          }
        }
        if (defaultImport && /^[A-Z]/.test(defaultImport)) {
          addEntity(defaultImport, "component");
          relationships.push({ from: filename, to: defaultImport, type: "uses_component" });
        }
      }

      // Extract React component definitions (function/const ComponentName)
      const componentDefs = content.matchAll(/(?:export\s+(?:default\s+)?)?(?:function|const)\s+([A-Z]\w+)\s*(?:[:=(<])/g);
      for (const m of componentDefs) {
        addEntity(m[1], isPage ? "page" : "component");
        relationships.push({ from: filename, to: m[1], type: "defines" });
      }

      // Extract hook definitions
      const hookDefs = content.matchAll(/(?:export\s+)?(?:function|const)\s+(use[A-Z]\w+)/g);
      for (const m of hookDefs) {
        addEntity(m[1], "hook");
        relationships.push({ from: filename, to: m[1], type: "defines" });
      }

      // Extract JSX component usage: <ComponentName
      const jsxUsage = content.matchAll(/<([A-Z]\w+)[\s/>]/g);
      for (const m of jsxUsage) {
        addEntity(m[1], "component");
        relationships.push({ from: filename, to: m[1], type: "renders" });
      }

      // Extract route definitions: path="/something" or <Route path="..."
      const routeMatches = content.matchAll(/path[=:]\s*["']([^"']+)["']/g);
      for (const m of routeMatches) {
        addEntity(m[1], "route");
        relationships.push({ from: filename, to: m[1], type: "routes_to" });
      }

      // Extract tRPC router references
      const trpcMatches = content.matchAll(/trpc\.(\w+)\.\w+/g);
      for (const m of trpcMatches) {
        addEntity(m[1], "trpc_router");
        relationships.push({ from: filename, to: m[1], type: "calls_api" });
      }

      // Extract pgTable definitions
      const tableMatches = content.matchAll(/pgTable\(["'](\w+)["']/g);
      for (const m of tableMatches) {
        addEntity(m[1], "db_table");
        relationships.push({ from: filename, to: m[1], type: "defines_table" });
      }

      // Extract exported function/class names
      const exportedFns = content.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g);
      for (const m of exportedFns) {
        if (!/^[A-Z]/.test(m[1]) && !m[1].startsWith("use")) {
          addEntity(m[1], "function");
          relationships.push({ from: filename, to: m[1], type: "exports" });
        }
      }
    }

    // Deduplicate relationships
    const relSet = new Set(relationships.map(r => `${r.from}|${r.to}|${r.type}`));
    const uniqueRels = Array.from(relSet).map(s => {
      const [from, to, type] = s.split("|");
      return { from, to, type };
    });

    const graphData = {
      entities: Array.from(entities.entries()).map(([name, info]) => ({ name, ...info })),
      relationships: uniqueRels,
      builtAt: new Date().toISOString(),
      chunkCount: chunkRows.length,
    };

    await db.execute(sql`
      INSERT INTO system_settings ("settingKey", "settingValue", "settingType", "updatedAt")
      VALUES ('kgra_graph_data', ${JSON.stringify(graphData)}, 'json', NOW())
      ON CONFLICT ("settingKey") DO UPDATE SET "settingValue" = ${JSON.stringify(graphData)}, "updatedAt" = NOW()
    `);

    const typeCounts: Record<string, number> = {};
    for (const [, info] of entities) {
      typeCounts[info.type] = (typeCounts[info.type] || 0) + 1;
    }

    return {
      action: "build_graph",
      success: true,
      summary: `Built knowledge graph: ${entities.size} entities (${typeCounts.page || 0} pages, ${typeCounts.component || 0} components, ${typeCounts.hook || 0} hooks, ${typeCounts.route || 0} routes, ${typeCounts.db_table || 0} tables), ${uniqueRels.length} relationships from ${chunkRows.length} chunks`,
      data: { entityCount: entities.size, relationshipCount: uniqueRels.length, typeCounts, chunkCount: chunkRows.length },
    };
  } catch (err) {
    return { action: "build_graph", success: false, summary: `Graph build failed: ${(err as Error).message}`, data: {} };
  }
}

// ── Action: Get Graph Stats ─────────────────────────────────────

export async function getGraphStats(): Promise<ActionResult> {
  try {
    const { getDb } = await import("../db/connection");
    const db = getDb();
    if (!db) return { action: "graph_stats", success: false, summary: "Database unavailable", data: {} };

    const row = (await db.execute(sql`
      SELECT "settingValue" FROM system_settings WHERE "settingKey" = 'kgra_graph_data'
    `) as any).rows?.[0];

    if (!row?.settingValue) {
      return { action: "graph_stats", success: false, summary: "No knowledge graph built yet. Ask me to create a RAG first.", data: {} };
    }

    const graph = typeof row.settingValue === "string" ? JSON.parse(row.settingValue) : row.settingValue;
    const typeCounts: Record<string, number> = {};
    for (const e of graph.entities || []) {
      typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
    }

    return {
      action: "graph_stats",
      success: true,
      summary: `Knowledge graph: ${graph.entities?.length || 0} entities, ${graph.relationships?.length || 0} relationships`,
      data: {
        entityCount: graph.entities?.length || 0,
        relationshipCount: graph.relationships?.length || 0,
        typeCounts,
        builtAt: graph.builtAt,
        chunkCount: graph.chunkCount,
      },
    };
  } catch (err) {
    return { action: "graph_stats", success: false, summary: `Stats failed: ${(err as Error).message}`, data: {} };
  }
}

// ── Action: Execute All ─────────────────────────────────────────

export async function executeAction(actionName: string, query: string): Promise<ActionResult> {
  switch (actionName) {
    case "ingest_project":
      return ingestProject();
    case "build_graph": {
      // If no documents yet, ingest first
      const { getDb } = await import("../db/connection");
      const db = getDb();
      if (db) {
        const docCount = ((await db.execute(sql`SELECT count(*) as cnt FROM documents`)) as any).rows?.[0]?.cnt || 0;
        if (Number(docCount) === 0) {
          await ingestProject();
        }
      }
      return buildKnowledgeGraph();
    }
    case "graph_stats":
      return getGraphStats();
    case "query_graph":
      return getGraphStats(); // For now, return stats — future: actual graph query
    default:
      return { action: actionName, success: false, summary: `Unknown action: ${actionName}`, data: {} };
  }
}
