import { getDb } from "../db";
import { downloadAnalytics, type DownloadAnalytic, type InsertDownloadAnalytic } from "../../drizzle/schema";
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";

/**
 * Download Analytics Service
 * Tracks bandwidth metrics, download speeds, and usage patterns
 */

/**
 * Record a bandwidth measurement
 */
export async function recordBandwidthMetric(data: InsertDownloadAnalytic): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  await db.insert(downloadAnalytics).values(data);
}

/**
 * Get all analytics for a download
 */
export async function getDownloadAnalytics(downloadId: number): Promise<DownloadAnalytic[]> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  return db
    .select()
    .from(downloadAnalytics)
    .where(eq(downloadAnalytics.downloadId, downloadId))
    .orderBy(desc(downloadAnalytics.timestamp));
}

/**
 * Get analytics for a model
 */
export async function getModelAnalytics(modelId: number): Promise<DownloadAnalytic[]> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  return db
    .select()
    .from(downloadAnalytics)
    .where(eq(downloadAnalytics.modelId, modelId))
    .orderBy(desc(downloadAnalytics.timestamp));
}

/**
 * Get analytics for a user
 */
export async function getUserAnalytics(userId: number): Promise<DownloadAnalytic[]> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  return db
    .select()
    .from(downloadAnalytics)
    .where(eq(downloadAnalytics.userId, userId))
    .orderBy(desc(downloadAnalytics.timestamp));
}

/**
 * Get analytics within a time range
 */
export async function getAnalyticsByTimeRange(
  startDate: Date,
  endDate: Date
): Promise<DownloadAnalytic[]> {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  return db
    .select()
    .from(downloadAnalytics)
    .where(
      and(
        gte(downloadAnalytics.timestamp, startDate),
        lte(downloadAnalytics.timestamp, endDate)
      )
    )
    .orderBy(desc(downloadAnalytics.timestamp));
}

/**
 * Get aggregated statistics
 */
export async function getAggregatedStats(userId: number) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  const analytics = await db
    .select()
    .from(downloadAnalytics)
    .where(eq(downloadAnalytics.userId, userId));
  
  if (analytics.length === 0) {
    return {
      totalDownloads: 0,
      totalBytesDownloaded: "0",
      averageSpeed: "0",
      peakSpeed: "0",
      totalTimeSpent: 0,
    };
  }
  
  // Calculate aggregated metrics
  const speeds = analytics
    .map((a) => parseFloat(a.averageSpeed || "0"))
    .filter((s) => !isNaN(s));
  
  const bytes = analytics
    .map((a) => parseFloat(a.bytesDownloaded || "0"))
    .filter((b) => !isNaN(b));
  
  const times = analytics
    .map((a) => a.elapsedSeconds || 0)
    .filter((t) => t > 0);
  
  return {
    totalDownloads: new Set(analytics.map((a) => a.downloadId)).size,
    totalBytesDownloaded: bytes.reduce((sum, b) => sum + b, 0).toString(),
    averageSpeed: speeds.length > 0
      ? (speeds.reduce((sum, s) => sum + s, 0) / speeds.length).toFixed(2)
      : "0",
    peakSpeed: speeds.length > 0 ? Math.max(...speeds).toFixed(2) : "0",
    totalTimeSpent: times.reduce((sum, t) => sum + t, 0),
  };
}

/**
 * Get peak usage times (hourly aggregation)
 */
export async function getPeakUsageTimes(userId: number) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  const analytics = await db
    .select()
    .from(downloadAnalytics)
    .where(eq(downloadAnalytics.userId, userId));
  
  // Group by hour of day
  const hourlyStats: Record<number, { count: number; totalSpeed: number }> = {};
  
  analytics.forEach((a) => {
    const hour = new Date(a.timestamp).getHours();
    if (!hourlyStats[hour]) {
      hourlyStats[hour] = { count: 0, totalSpeed: 0 };
    }
    hourlyStats[hour].count++;
    hourlyStats[hour].totalSpeed += parseFloat(a.averageSpeed || "0");
  });
  
  // Convert to array and sort by count
  return Object.entries(hourlyStats)
    .map(([hour, stats]) => ({
      hour: parseInt(hour),
      downloadCount: stats.count,
      averageSpeed: (stats.totalSpeed / stats.count).toFixed(2),
    }))
    .sort((a, b) => b.downloadCount - a.downloadCount);
}

/**
 * Get bandwidth consumption per model
 */
export async function getBandwidthPerModel(userId: number) {
  const db = getDb();
  if (!db) throw new Error("Database not available");
  
  const analytics = await db
    .select()
    .from(downloadAnalytics)
    .where(eq(downloadAnalytics.userId, userId));
  
  // Group by model
  const modelStats: Record<number, { totalBytes: number; downloadCount: number; avgSpeed: number }> = {};
  
  analytics.forEach((a) => {
    const modelId = a.modelId;
    if (!modelStats[modelId]) {
      modelStats[modelId] = { totalBytes: 0, downloadCount: 0, avgSpeed: 0 };
    }
    modelStats[modelId].totalBytes += parseFloat(a.bytesDownloaded || "0");
    modelStats[modelId].downloadCount++;
    modelStats[modelId].avgSpeed += parseFloat(a.averageSpeed || "0");
  });
  
  // Convert to array
  return Object.entries(modelStats).map(([modelId, stats]) => ({
    modelId: parseInt(modelId),
    totalBytes: stats.totalBytes.toString(),
    downloadCount: stats.downloadCount,
    averageSpeed: (stats.avgSpeed / stats.downloadCount).toFixed(2),
  }));
}
