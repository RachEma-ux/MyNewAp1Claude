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
import { getDb } from "../db";
import { syncRegistryOnStartup } from "../routers/catalog-manage";
import { seedTaxonomy } from "../db";
import { providers as providersTable } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

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
        config: { apiKey },
      });
      console.log(`[AutoProvision] Created ${name} provider from ${envKey}`);
    }
  } catch (error: any) {
    console.warn(`[AutoProvision] Skipped — ${error.message}`);
  }
}

async function startServer() {
  // Run database migrations first
  await runMigrations();

  // Auto-provision providers from env vars (OPENAI_API_KEY, ANTHROPIC_API_KEY, etc.)
  await autoProvisionProviders();

  // Initialize providers from database
  await initializeProviders();

  // Auto-seed catalog entries from PROVIDERS constant
  await syncRegistryOnStartup();

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

  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

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
