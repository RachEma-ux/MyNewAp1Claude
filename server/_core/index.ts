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
import { handleAgentChatStream } from "../agents/stream";
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

  // Start import session cleanup interval
  startCleanupInterval();

  const app = express();
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
    const health = {
      status: "ok",
      timestamp: new Date().toISOString(),
      database: "unknown",
      env: {
        NODE_ENV: process.env.NODE_ENV,
        DATABASE_URL_SET: !!process.env.DATABASE_URL,
      }
    };

    try {
      const db = getDb();
      if (db) {
        // Test database connection
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
