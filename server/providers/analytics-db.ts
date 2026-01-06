import { getDb } from "../db";
import {
  providerHealthChecks,
  providerMetrics,
  providerUsage,
  providers,
  type InsertProviderHealthCheck,
  type InsertProviderMetric,
} from "../../drizzle/schema";
import { eq, and, gte, lte, desc, sql } from "drizzle-orm";

/**
 * Provider Analytics Database Operations
 * Handles health checks, metrics, and usage analytics
 */

// ============================================================================
// Health Checks
// ============================================================================

export async function recordHealthCheck(data: InsertProviderHealthCheck) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(providerHealthChecks).values(data);
}

export async function getLatestHealthCheck(providerId: number) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const results = await db
    .select()
    .from(providerHealthChecks)
    .where(eq(providerHealthChecks.providerId, providerId))
    .orderBy(desc(providerHealthChecks.checkedAt))
    .limit(1);
  
  return results[0] || null;
}

export async function getHealthCheckHistory(
  providerId: number,
  limit: number = 100
) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  return db
    .select()
    .from(providerHealthChecks)
    .where(eq(providerHealthChecks.providerId, providerId))
    .orderBy(desc(providerHealthChecks.checkedAt))
    .limit(limit);
}

// ============================================================================
// Provider Metrics
// ============================================================================

export async function recordProviderMetrics(data: InsertProviderMetric) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(providerMetrics).values(data);
}

export async function getLatestMetrics(providerId: number) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const results = await db
    .select()
    .from(providerMetrics)
    .where(eq(providerMetrics.providerId, providerId))
    .orderBy(desc(providerMetrics.createdAt))
    .limit(1);
  
  return results[0] || null;
}

export async function getMetricsHistory(
  providerId: number,
  startDate: Date,
  endDate: Date
) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  return db
    .select()
    .from(providerMetrics)
    .where(
      and(
        eq(providerMetrics.providerId, providerId),
        gte(providerMetrics.periodStart, startDate),
        lte(providerMetrics.periodEnd, endDate)
      )
    )
    .orderBy(desc(providerMetrics.createdAt));
}

// ============================================================================
// Usage Analytics
// ============================================================================

export async function getProviderUsageStats(
  providerId: number,
  startDate: Date,
  endDate: Date
) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  const results = await db
    .select({
      totalRequests: sql<number>`COUNT(*)`,
      totalTokens: sql<number>`SUM(${providerUsage.tokensUsed})`,
      totalCost: sql<string>`SUM(CAST(${providerUsage.cost} AS DECIMAL(10,4)))`,
      avgLatency: sql<number>`AVG(${providerUsage.latencyMs})`,
      p95Latency: sql<number>`PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ${providerUsage.latencyMs})`,
    })
    .from(providerUsage)
    .where(
      and(
        eq(providerUsage.providerId, providerId),
        gte(providerUsage.createdAt, startDate),
        lte(providerUsage.createdAt, endDate)
      )
    );
  
  return results[0] || {
    totalRequests: 0,
    totalTokens: 0,
    totalCost: "0",
    avgLatency: 0,
    p95Latency: 0,
  };
}

export async function getProviderUsageTrend(
  providerId: number,
  days: number = 7
) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return db
    .select({
      date: sql<string>`DATE(${providerUsage.createdAt})`,
      requests: sql<number>`COUNT(*)`,
      tokens: sql<number>`SUM(${providerUsage.tokensUsed})`,
      cost: sql<string>`SUM(CAST(${providerUsage.cost} AS DECIMAL(10,4)))`,
      avgLatency: sql<number>`AVG(${providerUsage.latencyMs})`,
    })
    .from(providerUsage)
    .where(
      and(
        eq(providerUsage.providerId, providerId),
        gte(providerUsage.createdAt, startDate)
      )
    )
    .groupBy(sql`DATE(${providerUsage.createdAt})`)
    .orderBy(sql`DATE(${providerUsage.createdAt})`);
}

// ============================================================================
// Provider Comparison
// ============================================================================

export async function getAllProvidersWithMetrics() {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  // Get all providers
  const allProviders = await db.select().from(providers);
  
  // Get latest metrics for each provider
  const providersWithMetrics = await Promise.all(
    allProviders.map(async (provider) => {
      const latestMetrics = await getLatestMetrics(provider.id);
      const latestHealth = await getLatestHealthCheck(provider.id);
      
      return {
        ...provider,
        metrics: latestMetrics,
        health: latestHealth,
      };
    })
  );
  
  return providersWithMetrics;
}

// ============================================================================
// Uptime Calculation
// ============================================================================

export async function calculateProviderUptime(
  providerId: number,
  days: number = 30
) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const checks = await db
    .select()
    .from(providerHealthChecks)
    .where(
      and(
        eq(providerHealthChecks.providerId, providerId),
        gte(providerHealthChecks.checkedAt, startDate)
      )
    );
  
  if (checks.length === 0) {
    return { uptime: 0, totalChecks: 0, healthyChecks: 0 };
  }
  
  const healthyChecks = checks.filter((c) => c.status === "healthy").length;
  const uptime = (healthyChecks / checks.length) * 100;
  
  return {
    uptime: Math.round(uptime * 100) / 100,
    totalChecks: checks.length,
    healthyChecks,
  };
}
