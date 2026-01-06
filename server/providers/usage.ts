import { getDb } from "../db";
import { providerUsage, type InsertProviderUsage } from "../../drizzle/schema";
import { eq, and, gte, sql } from "drizzle-orm";

/**
 * Track provider usage for cost and analytics
 */
export async function trackProviderUsage(data: {
  workspaceId: number;
  providerId: number;
  modelName: string;
  tokensUsed: number;
  cost?: number;
  latencyMs?: number;
}): Promise<void> {
  const db = getDb();
  if (!db) {
    console.warn("[Usage] Cannot track usage: database not available");
    return;
  }

  const record: InsertProviderUsage = {
    workspaceId: data.workspaceId,
    providerId: data.providerId,
    modelName: data.modelName,
    tokensUsed: data.tokensUsed,
    cost: data.cost?.toString(),
    latencyMs: data.latencyMs,
  };

  await db.insert(providerUsage).values(record);
}

/**
 * Get usage statistics for a provider
 */
export async function getProviderUsageStats(providerId: number, days: number = 30) {
  const db = getDb();
  if (!db) {
    return null;
  }

  const since = new Date();
  since.setDate(since.getDate() - days);

  const stats = await db
    .select({
      totalTokens: sql<number>`SUM(${providerUsage.tokensUsed})`,
      totalCost: sql<number>`SUM(CAST(${providerUsage.cost} AS DECIMAL(10,4)))`,
      requestCount: sql<number>`COUNT(*)`,
      avgLatency: sql<number>`AVG(${providerUsage.latencyMs})`,
    })
    .from(providerUsage)
    .where(
      and(
        eq(providerUsage.providerId, providerId),
        gte(providerUsage.createdAt, since)
      )
    );

  return stats[0] || null;
}

/**
 * Get usage by workspace
 */
export async function getWorkspaceUsageStats(workspaceId: number, days: number = 30) {
  const db = getDb();
  if (!db) {
    return [];
  }

  const since = new Date();
  since.setDate(since.getDate() - days);

  const stats = await db
    .select({
      providerId: providerUsage.providerId,
      totalTokens: sql<number>`SUM(${providerUsage.tokensUsed})`,
      totalCost: sql<number>`SUM(CAST(${providerUsage.cost} AS DECIMAL(10,4)))`,
      requestCount: sql<number>`COUNT(*)`,
    })
    .from(providerUsage)
    .where(
      and(
        eq(providerUsage.workspaceId, workspaceId),
        gte(providerUsage.createdAt, since)
      )
    )
    .groupBy(providerUsage.providerId);

  return stats;
}

/**
 * Get daily usage trend
 */
export async function getDailyUsageTrend(providerId: number, days: number = 30) {
  const db = getDb();
  if (!db) {
    return [];
  }

  const since = new Date();
  since.setDate(since.getDate() - days);

  const trend = await db
    .select({
      date: sql<string>`DATE(${providerUsage.createdAt})`,
      totalTokens: sql<number>`SUM(${providerUsage.tokensUsed})`,
      totalCost: sql<number>`SUM(CAST(${providerUsage.cost} AS DECIMAL(10,4)))`,
      requestCount: sql<number>`COUNT(*)`,
    })
    .from(providerUsage)
    .where(
      and(
        eq(providerUsage.providerId, providerId),
        gte(providerUsage.createdAt, since)
      )
    )
    .groupBy(sql`DATE(${providerUsage.createdAt})`)
    .orderBy(sql`DATE(${providerUsage.createdAt})`);

  return trend;
}
