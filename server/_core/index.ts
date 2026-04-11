import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import uploadRouter from "../upload";
import { serveStatic, setupVite } from "./vite";
import { initializeProviders } from "../providers/init";
import { handleChatStream } from "../chat/stream";
import { handleAgentChatStream, handleCatalogAgentChatStream } from "../agents/stream";
import { handleAgentStudioChatStream } from "../agent-studio/chat-stream";
import { catalogExecutionQuerySchema } from "../ai-types/execution";
import { invokeCatalogEntry } from "../ai-types/invoke";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { getDb, ensureDefaultWorkspace } from "../db";
import { syncRegistryOnStartup, autoDetectLiveModels } from "../routers/catalog-manage";
import { seedTaxonomy } from "../db";
import { startCleanupInterval } from "../catalog-import/session-service";
import { getSession } from "../catalog-import/session-service";
import { providers as providersTable } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { encrypt } from "./encryption";
import { ideProxyRouter } from "../code-studio/opencode/ide-proxy";
import { sdk } from "./sdk";
import { initializeGovernance } from "../governance/governance-engine";
import { syncCapabilitiesOnBoot } from "../workspace/seed/syncCapabilitiesOnBoot";
import { bootAiTypesModule } from "../ai-types/boot";

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runMigrations(maxRetries = 3) {
  console.log("🔄 Running database migrations...");

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const db = getDb();
      if (!db) {
        console.warn("⚠️  Database not available, skipping migrations");
        return;
      }

      await migrate(db, { migrationsFolder: "./drizzle" });
      console.log("✅ Database migrations completed successfully");
      return;
    } catch (error: any) {
      // Check if it's just "no new migrations"
      if (error.message?.includes("no new migrations") || error.message?.includes("No new migrations")) {
        console.log("✅ All migrations already applied");
        return;
      }

      // Log full error details
      console.error(`❌ Migration attempt ${attempt}/${maxRetries} failed`);
      console.error('   Error message:', error.message || 'No message');
      console.error('   Error code:', error.code || 'No code');
      console.error('   Error errno:', error.errno || 'No errno');
      console.error('   SQL State:', error.sqlState || 'No SQL state');
      console.error('   SQL Message:', error.sqlMessage || 'No SQL message');

      if (error.sql) {
        console.error('   Failed SQL:', error.sql);
      }

      if (error.cause) {
        console.error('   Cause:', JSON.stringify(error.cause, null, 2));
      }

      // Check for connection errors
      if (error.code === 'ECONNREFUSED' || error.errno === 'ECONNREFUSED') {
        console.error(`   → Database connection refused`);

        if (attempt < maxRetries) {
          const delay = 2000 * attempt;
          console.log(`   Retrying in ${delay}ms...`);
          await sleep(delay);
          continue;
        }
      }

      // If it's the last attempt, log but don't crash
      if (attempt >= maxRetries) {
        console.error("❌ Max migration retries reached");
        console.error("   App will continue starting - migrations may already be applied");
        return;
      }

      // Otherwise retry
      await sleep(2000);
    }
  }
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

const ENV_PROVIDER_MAP = [
  { envKey: "OPENAI_API_KEY", name: "OpenAI", type: "openai" },
  { envKey: "ANTHROPIC_API_KEY", name: "Anthropic", type: "anthropic" },
  { envKey: "GOOGLE_API_KEY", name: "Google", type: "google" },
  { envKey: "GROQ_API_KEY", name: "Groq", type: "groq" },
] as const;

async function autoProvisionProviders() {
  try {
    const db = getDb();
    if (!db) return;

    for (const { envKey, name, type } of ENV_PROVIDER_MAP) {
      const apiKey = process.env[envKey];
      if (!apiKey) continue;

      // Check if provider already exists
      const existing = await db.select().from(providersTable).where(eq(providersTable.type, type)).limit(1);
      if (existing.length > 0) continue;

      await db.insert(providersTable).values({
        name,
        type,
        enabled: true,
        priority: 50,
        config: { apiKey: encrypt(apiKey) },
      });
      console.log(`[AutoProvision] Created ${name} provider from ${envKey}`);
    }
  } catch (error: any) {
    console.warn(`[AutoProvision] Skipped — ${error.message}`);
  }
}

async function startServer() {
  // Production safety warnings
  if (process.env.NODE_ENV === "production" && !process.env.REDIS_URL) {
    console.warn("[RateLimit] WARNING: REDIS_URL not set. Rate limiting uses in-memory storage (single-instance only).");
    console.warn("[RateLimit] For multi-instance deployments, set REDIS_URL for distributed rate limiting.");
  }

  // Run database migrations first
  await runMigrations();

  // Ensure dev user exists in DB when DEV_MODE is active (FK safety)
  if (process.env.DEV_MODE === "true") {
    try {
      const db = getDb();
      if (db) {
        const { users } = await import("../../drizzle/schema");
        const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, 1)).limit(1);
        if (existing.length === 0) {
          await db.insert(users).values({
            openId: "dev-user-001",
            name: "Dev User",
            email: "dev@example.com",
            loginMethod: "dev-mode",
            role: "admin",
          });
          console.log("[DevMode] Created dev user (id=1)");
        }
      }
    } catch (e: any) {
      console.warn(`[DevMode] Dev user seed skipped — ${e.message}`);
    }
  }

  // Ensure at least one workspace exists (idempotent)
  await ensureDefaultWorkspace();

  // Auto-provision providers from env vars (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.)
  await autoProvisionProviders();

  // Wire AI Types module ports (provider, agent, governance adapters)
  bootAiTypesModule();

  // Catalog-first: seed catalog entries BEFORE provider init so the catalog gate has data
  await syncRegistryOnStartup();

  // Auto-detect live models from configured providers (Ollama, etc.)
  await autoDetectLiveModels();

  // Initialize providers from database — filtered through catalog (only active+approved entries load)
  await initializeProviders();

  // Auto-seed taxonomy nodes from multi-axis definitions
  try {
    const result = await seedTaxonomy();
    if (result.created > 0) {
      console.log(`[TaxonomySeed] Seeded ${result.created} new taxonomy nodes (${result.skipped} existing)`);
    } else {
      console.log(`[TaxonomySeed] Taxonomy already populated (${result.skipped} nodes)`);
    }
  } catch (error: any) {
    console.warn(`[TaxonomySeed] Skipped — ${error.message}`);
  }

  // Sync workspace capabilities from YAML config
  await syncCapabilitiesOnBoot();

  // Start import session cleanup interval
  startCleanupInterval();

  // Register PM Idea Builder Agent in AI Types Catalog
  try {
    const { ensureAgentRegistered } = await import("../modules/pmt/idea-builder-agent");
    const agentId = await ensureAgentRegistered();
    if (agentId) {
      console.log(`[AgentSeed] PM Idea Builder Agent registered in catalog (id=${agentId})`);
    }
  } catch (error: any) {
    console.warn(`[AgentSeed] Skipped — ${error.message}`);
  }

  // Register Project Context Translator Agent in AI Types Catalog
  try {
    const { ensureContextTranslatorRegistered } = await import("../modules/pmt/context-translator-agent");
    const ctAgentId = await ensureContextTranslatorRegistered();
    if (ctAgentId) {
      console.log(`[AgentSeed] Project Context Translator Agent registered in catalog (id=${ctAgentId})`);
    }
  } catch (error: any) {
    console.warn(`[AgentSeed] Context Translator skipped — ${error.message}`);
  }

  // Seed OM organization templates (5 structure models)
  try {
    const { seedOmTemplates } = await import("../organization-management/seed-templates");
    const omResult = await seedOmTemplates();
    if (omResult.created > 0) {
      console.log(`[OMTemplateSeed] Seeded ${omResult.created} new templates (${omResult.skipped} existing)`);
    } else {
      console.log(`[OMTemplateSeed] All ${omResult.skipped} templates already present`);
    }
  } catch (error: any) {
    console.warn(`[OMTemplateSeed] Skipped — ${error.message}`);
  }

  // Initialize GraphRAG pilot adapters (registers Documents source in DB)
  try {
    const { initializeAdapters } = await import("../data-analysis/graphrag/service");
    await initializeAdapters();
  } catch (error: any) {
    console.warn(`[GraphRAG] Adapter init skipped — ${error.message}`);
  }

  // Seed WfDB (dedicated workflow database — idempotent)
  try {
    const { ensureWfDbSeeded } = await import("../sandbox-wf/seed");
    const wfResult = await ensureWfDbSeeded();
    if (wfResult.seeded) {
      console.log(`[WfDB] Seeded ${wfResult.workflows} workflows, ${wfResult.triggers} triggers, ${wfResult.steps} steps`);
    } else {
      console.log(`[WfDB] Already populated (${wfResult.workflows} workflows)`);
    }
  } catch (error: any) {
    console.warn(`[WfDB] Seed skipped — ${error.message}`);
  }

  // Seed PRMDB (dedicated Problem Resolution Methods database — idempotent)
  try {
    const { seedPrmDb } = await import("../prm/seed");
    await seedPrmDb();
  } catch (error: any) {
    console.warn(`[PRMDB] Seed skipped — ${error.message}`);
  }

  // Seed PSMDB (dedicated Problem Solving Methods database — idempotent)
  try {
    const { seedPsmDb } = await import("../psm/seed");
    await seedPsmDb();
  } catch (error: any) {
    console.warn(`[PSMDB] Seed skipped — ${error.message}`);
  }

  // Seed CODEDB (dedicated Code Studio database — idempotent)
  try {
    const { seedCodeDb } = await import("../code-studio/seed");
    await seedCodeDb();
  } catch (error: any) {
    console.warn(`[CODEDB] Seed skipped — ${error.message}`);
  }

  // Seed RAGDB (dedicated RAG Knowledge Graph database — idempotent)
  try {
    const { seedRagDb, migrateJsonBlobToRagDb } = await import("../rag/seed");
    await seedRagDb();
    await migrateJsonBlobToRagDb();
  } catch (error: any) {
    console.warn(`[RAGDB] Seed skipped — ${error.message}`);
  }

  // Boot Agent Studio (ASDB seed + scheduler — self-contained, idempotent)
  await (await import("../agent-studio/boot")).bootAgentStudio();

  // Initialize Governance Engine (CGT v2)
  initializeGovernance();

  const app = express();

  // Phase 10 — Production Hardening: disable x-powered-by header
  app.disable("x-powered-by");

  const server = createServer(app);

  // CORS — restrict origins in production, allow localhost in dev
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map(o => o.trim())
    : process.env.NODE_ENV === "production"
      ? [] // same-origin only in production when not explicitly set
      : ["http://localhost:3000", "http://localhost:5173"];

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
      res.setHeader("Access-Control-Max-Age", "86400");
    }

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  // Security headers (including CSP)
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    // Content-Security-Policy — allow self, inline styles (for Radix/shadcn), and data: URIs for images
    // In development, Vite injects inline scripts for HMR — allow 'unsafe-inline' for script-src
    const isDev = process.env.NODE_ENV === "development";
    res.setHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self' data:",
        "connect-src 'self' https://api.openai.com https://api.anthropic.com https://generativelanguage.googleapis.com https://api.groq.com http://localhost:11434 http://localhost:8080 http://localhost:8181" + (isDev ? " ws://localhost:*" : ""),
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; ")
    );
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Global rate limiting for all API endpoints — mounted BEFORE route handlers
  const globalRateMap = new Map<string, number[]>();
  const GLOBAL_RATE_LIMIT = 100; // max requests per minute per IP
  const RATE_LIMIT_WINDOW_MS = 60 * 1000;

  // Periodic cleanup of stale rate limit entries to prevent memory leaks
  setInterval(() => {
    const now = Date.now();
    globalRateMap.forEach((timestamps, key) => {
      const active = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
      if (active.length === 0) {
        globalRateMap.delete(key);
      } else {
        globalRateMap.set(key, active);
      }
    });
  }, 5 * 60 * 1000); // Clean up every 5 minutes

  app.use("/api", (req, res, next) => {
    const key = req.ip || "unknown";
    const now = Date.now();

    let timestamps = globalRateMap.get(key) || [];
    timestamps = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

    if (timestamps.length >= GLOBAL_RATE_LIMIT) {
      res.status(429).json({ error: "Too many requests. Try again later." });
      return;
    }

    timestamps.push(now);
    globalRateMap.set(key, timestamps);
    next();
  });

  // Stricter rate limiting for import endpoints
  const importRateMap = new Map<string, number[]>();
  const IMPORT_RATE_LIMIT = 10; // max requests per minute
  app.use("/api/trpc/catalogImport", (req, res, next) => {
    const key = req.ip || "unknown";
    const now = Date.now();

    let timestamps = importRateMap.get(key) || [];
    timestamps = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

    if (timestamps.length >= IMPORT_RATE_LIMIT) {
      res.status(429).json({ error: "Too many import requests. Try again later." });
      return;
    }

    timestamps.push(now);
    importRateMap.set(key, timestamps);
    next();
  });

  // Stricter rate limiting for governance endpoints (Phase 10 hardening)
  const governanceRateMap = new Map<string, number[]>();
  const GOVERNANCE_RATE_LIMIT = 30; // max requests per minute per IP
  app.use("/api/trpc/governance", (req, res, next) => {
    const key = req.ip || "unknown";
    const now = Date.now();

    let timestamps = governanceRateMap.get(key) || [];
    timestamps = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

    if (timestamps.length >= GOVERNANCE_RATE_LIMIT) {
      res.status(429).json({ error: "Governance rate limit exceeded. Try again later." });
      return;
    }

    timestamps.push(now);
    governanceRateMap.set(key, timestamps);
    next();
  });

  // CSRF protection — validate Origin header for state-changing requests
  app.use("/api", (req, res, next) => {
    // Skip safe (read-only) methods
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      return next();
    }

    // Skip OAuth callback (redirect flow sends no Origin)
    if (req.path === "/oauth/callback") {
      return next();
    }

    const origin = req.headers.origin;

    // Allow requests with no Origin header (same-origin browser requests, non-browser clients)
    if (!origin) {
      return next();
    }

    // Validate Origin against allowed origins
    if (allowedOrigins.length > 0 && allowedOrigins.includes(origin)) {
      return next();
    }

    // In development with no CORS_ORIGINS set, also check Host header match
    const host = req.headers.host;
    if (host) {
      try {
        const originUrl = new URL(origin);
        if (originUrl.host === host) {
          return next();
        }
      } catch {
        // Invalid origin URL — reject
      }
    }

    // If allowedOrigins is empty (production same-origin only), the origin must match the host
    if (allowedOrigins.length === 0) {
      // Already checked host match above — if we got here, it doesn't match
      res.status(403).json({ error: "CSRF validation failed: origin mismatch" });
      return;
    }

    res.status(403).json({ error: "CSRF validation failed: origin not allowed" });
    return;
  });

  // Health check endpoint
  app.get("/api/health", async (req, res) => {
    const health: any = {
      status: "ok",
      timestamp: new Date().toISOString(),
      database: "unknown",
      governance: "unknown",
      env: {
        NODE_ENV: process.env.NODE_ENV,
        DATABASE_URL_SET: !!process.env.DATABASE_URL,
      }
    };

    try {
      const db = getDb();
      if (db) {
        await db.execute(sql`SELECT 1 as test`);
        health.database = "connected";
      } else {
        health.database = "not_initialized";
        health.status = "degraded";
      }
    } catch (error: any) {
      health.database = `error: ${error.message}`;
      health.status = "degraded";
    }

    // Governance self-check (lightweight)
    try {
      const { getGovernanceEngine } = require("../governance/governance-engine");
      const engine = getGovernanceEngine();
      const engineStatus = engine.getStatus();
      health.governance = engineStatus.initialized ? "active" : "not_initialized";
      health.governanceMode = engineStatus.strictMode ? "strict" : "permissive";
    } catch {
      health.governance = "unavailable";
    }

    res.json(health);
  });

  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Code Studio IDE proxy (OpenCode Web instances)
  // Must be mounted BEFORE body-parsing middleware interferes with proxied streams
  app.use("/api/code-studio/ide", ideProxyRouter);

  // KGRA Agent UI — moved to early mount (see below, before Vite)

  // KGRA Agent API — native TypeScript engine (12-node pipeline)
  app.get("/api/kgra-proxy/health", (_req, res) => {
    res.json({ status: "healthy", version: "2.0.0-native", engine: "typescript" });
  });

  app.post("/api/kgra-proxy/run", async (req, res) => {
    const { query, mode, workspace_id, session_id } = req.body || {};
    if (!query) return res.status(400).json({ error: "query is required" });

    try {
      const { executeKGRARun } = await import("../kgra-agent/engine");
      const answer = await executeKGRARun({ query, mode, workspace_id, session_id });
      res.json(answer);
    } catch (err) {
      res.status(500).json({
        answer: "KGRA engine error.",
        mode: mode || "direct_query",
        confidence: 0,
        error: { code: "ENGINE_ERROR", message: (err as Error).message, failedSteps: [], fallbackUsed: "none" },
        run_id: `kgra-err-${Date.now()}`,
        request_id: `req-err-${Date.now()}`,
      });
    }
  });

  // GraphRAG stats — serves real knowledge graph data to OmniGraph + Visualization tabs
  app.get("/api/kgra-proxy/graphrag/stats", async (_req, res) => {
    try {
      const { getGraphStats } = await import("../kgra-agent/actions");
      const result = await getGraphStats();
      const d = result.data as any;
      res.json({
        graph: {
          entities: d.entityCount || 0,
          relationships: d.relationshipCount || 0,
          communities: Object.keys(d.typeCounts || {}).length,
          reports: 0,
        },
        cache: { hits: 0 },
        stale_communities: 0,
        typeCounts: d.typeCounts || {},
        builtAt: d.builtAt,
      });
    } catch {
      res.json({ graph: { entities: 0, relationships: 0, communities: 0, reports: 0 }, cache: { hits: 0 }, stale_communities: 0 });
    }
  });

  // GraphRAG query — runs through the KGRA engine
  app.post("/api/kgra-proxy/graphrag/query/:mode", async (req, res) => {
    const mode = req.params.mode;
    const { query } = req.body || {};
    try {
      const { executeKGRARun } = await import("../kgra-agent/engine");
      const answer = await executeKGRARun({ query: query || "graph stats", mode: `graphrag_${mode}` });
      res.json({ answer: answer.answer, mode, latency_ms: 0, cache_hit: false, citations: [] });
    } catch (err) {
      res.status(500).json({ answer: "Query failed", mode, error: (err as Error).message });
    }
  });

  // Graph data for visualization tab — reads from ragdb
  app.get("/api/kgra-proxy/graph/data", async (_req, res) => {
    try {
      const { getRagDb } = await import("../rag/connection");
      const ragDb = getRagDb();
      if (!ragDb) return res.json({ nodes: [], edges: [] });
      const entities = ((await ragDb.execute(sql`SELECT id, name, short_name, entity_type, mentions FROM kgra_entities`)) as any).rows || [];
      const rels = ((await ragDb.execute(sql`
        SELECT src.name as source, tgt.name as target, r.relationship_type as type
        FROM kgra_relationships r
        JOIN kgra_entities src ON src.id = r.source_entity_id
        JOIN kgra_entities tgt ON tgt.id = r.target_entity_id
      `)) as any).rows || [];
      res.json({
        nodes: entities.map((e: any) => ({ id: e.name, label: e.short_name || e.name.split("/").pop() || e.name, type: e.entity_type, mentions: e.mentions, x: 0, y: 0 })),
        edges: rels.map((r: any, i: number) => ({ id: `e${i}`, source: r.source, target: r.target, type: r.type, weight: 1 })),
      });
    } catch {
      res.json({ nodes: [], edges: [] });
    }
  });

  // Pipelines — for the RAG tab home page
  app.get("/api/kgra-proxy/pipelines/", async (_req, res) => {
    try {
      const { getDb } = await import("../db/connection");
      const db = getDb();
      if (!db) return res.json([]);
      const docCount = ((await db.execute(sql`SELECT count(*) as cnt FROM documents`)) as any).rows?.[0]?.cnt || 0;
      const chunkCount = ((await db.execute(sql`SELECT count(*) as cnt FROM document_chunks`)) as any).rows?.[0]?.cnt || 0;
      if (Number(docCount) === 0) return res.json([]);
      res.json([{
        name: "MyNewAp1Claude-RAG",
        strategy: "recursive_split",
        stage_count: 4,
        version: "1.0",
        stages: ["file_loader", "recursive_splitter", "embedder", "vector_store"],
        stats: { documents: Number(docCount), chunks: Number(chunkCount) },
      }]);
    } catch { res.json([]); }
  });

  // Intake — ingest endpoint for the RAG tab
  app.post("/api/kgra-proxy/intake", async (req, res) => {
    try {
      const { ingestProject } = await import("../kgra-agent/actions");
      const result = await ingestProject();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Analytics entities — for the Visualization tab (reads from ragdb, server-side hub+neighbor filtering)
  app.get("/api/kgra-proxy/v1/analytics/entities", async (req, res) => {
    try {
      const { getRagDb } = await import("../rag/connection");
      const ragDb = getRagDb();
      if (!ragDb) return res.json([]);

      const hubCount = Math.min(50, Math.max(5, parseInt(req.query.hub_count as string) || 10));
      const maxNodes = 300;

      // Get all entities with connection degree (in+out)
      const allEntities = ((await ragDb.execute(sql`
        SELECT e.id, e.name, e.short_name, e.entity_type, e.mentions,
          (SELECT COUNT(*) FROM kgra_relationships r WHERE r.source_entity_id = e.id OR r.target_entity_id = e.id) as connections
        FROM kgra_entities e
        ORDER BY connections DESC
      `)) as any).rows || [];

      if (allEntities.length === 0) return res.json([]);

      // If small graph, return all
      if (allEntities.length <= maxNodes) {
        return res.json(allEntities.map((e: any) => ({
          id: e.name, name: e.short_name || e.name.split("/").pop() || e.name,
          type: (e.entity_type || "entity").toUpperCase(), connections: Number(e.connections) || e.mentions || 1,
          community: e.entity_type || "default",
        })));
      }

      // Hub+neighbor strategy
      const hubIds = new Set(allEntities.slice(0, hubCount).map((e: any) => e.id));
      const hubIdList = sql.join([...hubIds].map(id => sql`${id}`), sql`, `);

      const neighborRows = ((await ragDb.execute(sql`
        SELECT DISTINCT
          CASE WHEN r.source_entity_id IN (${hubIdList}) THEN r.target_entity_id ELSE r.source_entity_id END as neighbor_id
        FROM kgra_relationships r
        WHERE r.source_entity_id IN (${hubIdList}) OR r.target_entity_id IN (${hubIdList})
      `)) as any).rows || [];

      const visibleIds = new Set([...hubIds, ...neighborRows.map((r: any) => r.neighbor_id)]);

      // Cap if too many neighbors
      let finalIds: Set<number>;
      if (visibleIds.size > maxNodes) {
        const ranked = allEntities.filter((e: any) => visibleIds.has(e.id));
        ranked.sort((a: any, b: any) => Number(b.connections) - Number(a.connections));
        finalIds = new Set(ranked.slice(0, maxNodes).map((e: any) => e.id));
        for (const h of hubIds) finalIds.add(h);
      } else {
        finalIds = visibleIds;
      }

      const result = allEntities
        .filter((e: any) => finalIds.has(e.id))
        .map((e: any) => ({
          id: e.name, name: e.short_name || e.name.split("/").pop() || e.name,
          type: (e.entity_type || "entity").toUpperCase(), connections: Number(e.connections) || e.mentions || 1,
          community: e.entity_type || "default", source: "auto",
        }));

      // UNION: add active manual nodes
      const manualNodes = ((await ragDb.execute(sql`
        SELECT * FROM kgra_manual_nodes WHERE status = 'active'
      `)) as any).rows || [];
      for (const mn of manualNodes) {
        result.push({
          id: `manual_${mn.id}`,
          name: mn.short_name || mn.name,
          type: (mn.kind || mn.family || "entity").toUpperCase(),
          connections: 0,
          community: mn.family || "default",
          source: mn.applied_template_id ? "template" : "manual",
          _manualId: mn.id,
        });
      }

      res.json(result);
    } catch (err) { console.error("analytics/entities:", err); res.json([]); }
  });

  // Analytics relationships — for the Visualization tab (reads from ragdb)
  app.get("/api/kgra-proxy/v1/analytics/relationships", async (_req, res) => {
    try {
      const { getRagDb } = await import("../rag/connection");
      const ragDb = getRagDb();
      if (!ragDb) return res.json([]);
      const rels = ((await ragDb.execute(sql`
        SELECT src.name as source_name, tgt.name as target_name,
               src.short_name as source_short, tgt.short_name as target_short,
               r.relationship_type, r.weight
        FROM kgra_relationships r
        JOIN kgra_entities src ON src.id = r.source_entity_id
        JOIN kgra_entities tgt ON tgt.id = r.target_entity_id
      `)) as any).rows || [];
      const result = rels.map((r: any) => ({
        source_id: r.source_name,
        target_id: r.target_name,
        source_name: r.source_short || (r.source_name || "").split("/").pop() || r.source_name,
        target_name: r.target_short || (r.target_name || "").split("/").pop() || r.target_name,
        type: (r.relationship_type || "RELATED_TO").toUpperCase(),
        weight: r.weight || 1,
        source: "auto",
      }));

      // UNION: add active manual edges
      const manualEdges = ((await ragDb.execute(sql`
        SELECT * FROM kgra_manual_edges WHERE status = 'active'
      `)) as any).rows || [];
      for (const me of manualEdges) {
        // Resolve source/target names based on is_auto flag
        let srcName = `manual_${me.source_node_id}`;
        let tgtName = `manual_${me.target_node_id}`;
        if (me.source_is_auto === "true") {
          const src = ((await ragDb.execute(sql`SELECT name, short_name FROM kgra_entities WHERE id = ${me.source_node_id}`)) as any).rows?.[0];
          if (src) srcName = src.name;
        } else {
          const src = ((await ragDb.execute(sql`SELECT name, short_name FROM kgra_manual_nodes WHERE id = ${me.source_node_id}`)) as any).rows?.[0];
          if (src) srcName = `manual_${me.source_node_id}`;
        }
        if (me.target_is_auto === "true") {
          const tgt = ((await ragDb.execute(sql`SELECT name, short_name FROM kgra_entities WHERE id = ${me.target_node_id}`)) as any).rows?.[0];
          if (tgt) tgtName = tgt.name;
        } else {
          const tgt = ((await ragDb.execute(sql`SELECT name, short_name FROM kgra_manual_nodes WHERE id = ${me.target_node_id}`)) as any).rows?.[0];
          if (tgt) tgtName = `manual_${me.target_node_id}`;
        }
        result.push({
          source_id: srcName,
          target_id: tgtName,
          source_name: me.name,
          target_name: me.name,
          type: (me.relationship_type || "RELATED_TO").toUpperCase(),
          weight: me.weight || 1,
          source: me.applied_template_id ? "template" : "manual",
          link_strength: me.link_strength || "hard",
          confidence: me.confidence,
        });
      }

      res.json(result);
    } catch { res.json([]); }
  });

  // Analytics summary — for the OmniGraph services panel
  app.get("/api/kgra-proxy/v1/analytics/summary", async (_req, res) => {
    try {
      const { getGraphStats } = await import("../kgra-agent/actions");
      const result = await getGraphStats();
      const d = result.data as any;
      res.json({
        entities: d.entityCount || 0,
        relationships: d.relationshipCount || 0,
        communities: Object.keys(d.typeCounts || {}).length,
        reports: 0,
        traces: 0,
      });
    } catch { res.json({ entities: 0, relationships: 0, communities: 0, reports: 0, traces: 0 }); }
  });

  // Lineage/traces — for the OmniGraph traces panel
  app.get("/api/kgra-proxy/lineage", (_req, res) => {
    res.json({ counts: { events: 0, tombstones: 0 }, events: [] });
  });

  // MCP tools list
  app.get("/api/kgra-proxy/v1/mcp/tools", (_req, res) => {
    res.json([
      { name: "query_kgra", description: "Ask KGRA a natural language question — returns structured answer with evidence" },
      { name: "get_reasoning_path", description: "Retrieve a stored reasoning path by ID" },
      { name: "get_learning_graph_slice", description: "Get subgraph from the permanent learning graph" },
      { name: "evaluate_knowledge_bundle", description: "Evaluate a document bundle for coherence and readiness" },
      { name: "ingest_project", description: "Scan and ingest a project folder into the RAG knowledge base" },
    ]);
  });

  // Workflows list
  app.get("/api/kgra-proxy/v1/workflows", (_req, res) => {
    res.json({ available: ["ingest_and_graph", "query_pipeline", "bundle_evaluation"], runs: [] });
  });

  // KGRA Designer routes (manual nodes/edges CRUD)
  try {
    const { registerDesignerRoutes } = await import("../rag/designer-routes");
    registerDesignerRoutes(app);
  } catch (err) {
    console.warn("[KGRA Designer] Routes not loaded:", (err as Error).message);
  }

  app.use("/api/kgra-proxy", (_req, res) => {
    res.status(404).json({ error: "KGRA endpoint not found" });
  });

  // File upload endpoint
  app.use("/api", uploadRouter);
  // Chat streaming endpoint
  app.post("/api/chat/stream", handleChatStream);
  // Phase 19 follow-up: Studio-as-MCP-server. Exposes the platform's
  // own catalog tools, skill prompts, and runtime traces via JSON-RPC
  // 2.0 so any MCP client (including our own http transport) can
  // attach to it. Mounted on the existing Express app — no new
  // process, no new port. Lazy-imported to keep startup time
  // unaffected when the endpoint isn't used.
  app.post("/api/mcp", async (req, res) => {
    try {
      const { handleStudioMcpRequest } = await import(
        "../agent-studio/services/mcp/studio-mcp-server"
      );
      await handleStudioMcpRequest(req, res);
    } catch (e) {
      res.status(500).json({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32603,
          message: e instanceof Error ? e.message : String(e),
        },
      });
    }
  });
  // Agent chat streaming endpoint
  app.get("/api/agents/:agentId/chat/stream", handleAgentChatStream);
  // Catalog-authoritative agent chat streaming endpoint
  app.get("/api/catalog/agents/:catalogEntryId/chat/stream", handleCatalogAgentChatStream);
  // Agent Studio chat streaming endpoint (Phase 19 follow-up, Task #4)
  app.get("/api/agent-studio/chat/stream", handleAgentStudioChatStream);
  // Universal catalog invoke streaming endpoint
  // All catalog agent execution goes through invokeCatalogEntry() which
  // resolves the runtime kind and dispatches to the correct adapter.
  app.get("/api/catalog/:catalogEntryId/invoke/stream", async (req, res) => {
    try {
      let user;
      if (process.env.DEV_MODE === "true") {
        user = {
          id: 1,
          openId: "dev-user-001",
          name: "Dev User",
          email: "dev@example.com",
          loginMethod: "dev-mode",
          role: "user" as const,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSignedIn: new Date(),
        };
      } else {
        user = await sdk.authenticateRequest(req);
        if (!user) {
          res.status(401).json({ error: "Unauthorized" });
          return;
        }
      }

      const catalogEntryId = Number.parseInt(String(req.params.catalogEntryId), 10);
      if (!Number.isInteger(catalogEntryId) || catalogEntryId <= 0) {
        res.status(400).json({ error: "Invalid catalogEntryId" });
        return;
      }

      const parsed = catalogExecutionQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({
          error: "Invalid request query",
          details: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
        });
        return;
      }

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      for await (const event of invokeCatalogEntry({
        catalogEntryId,
        actorUserId: user.id,
        message: parsed.data.message,
        conversationId: parsed.data.conversationId,
        triggerSource: parsed.data.triggerSource,
      })) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }

      res.end();
    } catch (error) {
      console.error("[CatalogInvokeStream] Request error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
        return;
      }
      res.write(`data: ${JSON.stringify({
        type: "error",
        runId: 0,
        error: error instanceof Error ? error.message : "Internal server error",
      })}\n\n`);
      res.end();
    }
  });

  // Legacy endpoint — redirects to the universal invoke path
  app.get("/api/catalog/:catalogEntryId/chat/stream", (req, res) => {
    const catalogEntryId = req.params.catalogEntryId;
    const qs = new URLSearchParams(req.query as Record<string, string>).toString();
    res.redirect(307, `/api/catalog/${catalogEntryId}/invoke/stream?${qs}`);
  });

  // Governance audit artifact download
  app.get("/api/governance/audit/:runId/artifacts/:kind", async (req, res) => {
    // Auth check
    if (process.env.DEV_MODE !== "true") {
      try {
        const user = await sdk.authenticateRequest(req);
        if (!user || user.role !== "admin") {
          res.status(user ? 403 : 401).json({ error: user ? "Admin access required" : "Authentication required" });
          return;
        }
      } catch {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
    }

    const { runId, kind } = req.params;
    if (kind !== "json" && kind !== "txt") {
      res.status(400).json({ error: "Invalid artifact kind. Use 'json' or 'txt'." });
      return;
    }

    try {
      const { governanceAuditRuns } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = getDb();
      if (!db) { res.status(500).json({ error: "Database not available" }); return; }

      const [run] = await db.select().from(governanceAuditRuns).where(eq(governanceAuditRuns.id, Number(runId))).limit(1);
      if (!run) { res.status(404).json({ error: "Audit run not found" }); return; }

      const ref = kind === "json" ? run.jsonRef : run.txtRef;
      if (!ref) { res.status(404).json({ error: `No ${kind} artifact for this run` }); return; }

      const { getArtifactStore } = await import("../governance/artifact-store");
      const store = getArtifactStore();
      const buf = await store.retrieve(ref);
      if (!buf) { res.status(404).json({ error: "Artifact not found in store" }); return; }

      const contentType = kind === "json" ? "application/json" : "text/plain";
      const filename = `platform-audit-${runId}.${kind === "json" ? "json" : "txt"}`;
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buf);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Internal server error" });
    }
  });

  // Import session SSE stream
  app.get("/api/import/stream", async (req, res) => {
    // Authentication check
    if (process.env.DEV_MODE !== "true") {
      try {
        const user = await sdk.authenticateRequest(req);
        if (!user) {
          res.status(401).json({ error: "Authentication required" });
          return;
        }
      } catch {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
    }

    const sessionId = req.query.sessionId as string;
    if (!sessionId) {
      res.status(400).json({ error: "sessionId required" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const sendEvent = (data: any) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Poll session status every 2 seconds
    const interval = setInterval(async () => {
      try {
        const session = await getSession(sessionId);
        if (!session) {
          sendEvent({ type: "error", sessionId, message: "Session not found" });
          clearInterval(interval);
          res.end();
          return;
        }

        sendEvent({
          type: "status",
          sessionId,
          status: session.status,
          summary: session.summary,
        });

        // Terminal states
        if (["completed", "failed", "expired"].includes(session.status)) {
          sendEvent({
            type: session.status === "completed" ? "complete" : "error",
            sessionId,
            status: session.status,
            summary: session.summary,
            message: session.error,
          });
          clearInterval(interval);
          res.end();
        }
      } catch (e: any) {
        sendEvent({ type: "error", sessionId, message: e.message });
        clearInterval(interval);
        res.end();
      }
    }, 2000);

    req.on("close", () => {
      clearInterval(interval);
    });
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  // KGRA Agent UI — must be mounted BEFORE Vite to avoid SPA catch-all
  app.get("/kgra-ui", (req, res) => {
    res.sendFile("kgra-ui/index.html", { root: process.cwd() + "/client/public" });
  });
  app.use("/kgra-ui", express.static(process.cwd() + "/client/public/kgra-ui"));

  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, async () => {
    console.log(`Server running on http://localhost:${port}/`);

    // Sync provider API keys to OpenCode auth.json
    try {
      const { syncProviderKeysToOpenCode } = await import("../code-studio/opencode/provider-sync");
      const result = await syncProviderKeysToOpenCode();
      if (result.synced.length > 0) {
        console.log(`[OpenCode] Synced provider keys: ${result.synced.join(", ")}`);
      }
      if (result.errors.length > 0) {
        console.log(`[OpenCode] Sync errors: ${result.errors.join(", ")}`);
      }
    } catch { /* non-fatal */ }

    // Agent Studio post-listen boot: MCP server auto-reconnect.
    // Must run AFTER server.listen resolves so studio-self (http
    // transport targeting /api/mcp on this very process) can
    // successfully connect.
    try {
      const { bootAgentStudioPostListen } = await import("../agent-studio/boot");
      await bootAgentStudioPostListen();
    } catch { /* non-fatal */ }
  });
}

startServer().catch(console.error);
