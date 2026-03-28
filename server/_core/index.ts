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
import { executeCatalogChatStream, executeServiceAgentStream, resolveServiceAgentExecutionTarget, catalogExecutionQuerySchema } from "../catalog/execution";
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
import { sdk } from "./sdk";
import { initializeGovernance } from "../governance/governance-engine";
import { syncCapabilitiesOnBoot } from "../workspace/seed/syncCapabilitiesOnBoot";

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

  // Initialize providers from database
  await initializeProviders();

  // Auto-seed catalog entries from PROVIDERS constant
  await syncRegistryOnStartup();

  // Auto-detect live models from configured providers (Ollama, etc.)
  await autoDetectLiveModels();

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
        isDev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
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
  // File upload endpoint
  app.use("/api", uploadRouter);
  // Chat streaming endpoint
  app.post("/api/chat/stream", handleChatStream);
  // Agent chat streaming endpoint
  app.get("/api/agents/:agentId/chat/stream", handleAgentChatStream);
  // Catalog-authoritative agent chat streaming endpoint
  app.get("/api/catalog/agents/:catalogEntryId/chat/stream", handleCatalogAgentChatStream);
  // Catalog-first execution streaming endpoint
  app.get("/api/catalog/:catalogEntryId/chat/stream", async (req, res) => {
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

      // Branch: service-backed agents use HTTP dispatch, LLM agents use provider streaming
      const serviceTarget = await resolveServiceAgentExecutionTarget(catalogEntryId).catch(() => null);

      if (serviceTarget) {
        for await (const event of executeServiceAgentStream({
          catalogEntryId,
          actorUserId: user.id,
          message: parsed.data.message,
          triggerSource: parsed.data.triggerSource,
        })) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      } else {
        for await (const event of executeCatalogChatStream({
          catalogEntryId,
          actorUserId: user.id,
          message: parsed.data.message,
          conversationId: parsed.data.conversationId,
          triggerSource: parsed.data.triggerSource,
        })) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      }

      res.end();
    } catch (error) {
      console.error("[CatalogChatStream] Request error:", error);
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

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
