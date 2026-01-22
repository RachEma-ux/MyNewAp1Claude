// Provider Hub - Database Helper Functions

import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../db";
import { providers, workspaceProviders, providerUsage, type Provider, type InsertProvider, type WorkspaceProvider, type InsertWorkspaceProvider, type ProviderUsage, type InsertProviderUsage } from "../../drizzle/schema";

// ============================================================================
// Provider CRUD Operations
// ============================================================================

export async function createProvider(data: InsertProvider): Promise<Provider> {
  const db = getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const [created] = await db.insert(providers).values(data).returning();

  if (!created) {
    throw new Error("Failed to create provider");
  }

  return created;
}

export async function getProviderById(id: number): Promise<Provider | undefined> {
  const db = getDb();
  if (!db) {
    return undefined;
  }

  const result = await db.select().from(providers).where(eq(providers.id, id)).limit(1);
  return result[0];
}

export async function getAllProviders(): Promise<Provider[]> {
  const db = getDb();
  if (!db) {
    console.warn("[Providers DB] Database not available");
    return [];
  }

  try {
    const result = await db.select().from(providers).orderBy(desc(providers.priority));
    return result;
  } catch (error: any) {
    console.error("[Providers DB] Failed to fetch providers:", error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error("[Providers DB] Database connection refused. The database might not be ready yet.");
    }
    return [];
  }
}

export async function getProvidersByType(type: string): Promise<Provider[]> {
  const db = getDb();
  if (!db) {
    return [];
  }

  return await db.select().from(providers).where(eq(providers.type, type as any));
}

export async function getEnabledProviders(): Promise<Provider[]> {
  const db = getDb();
  if (!db) {
    return [];
  }

  return await db.select().from(providers).where(eq(providers.enabled, true)).orderBy(desc(providers.priority));
}

export async function updateProvider(id: number, data: Partial<InsertProvider>): Promise<void> {
  const db = getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db.update(providers).set(data).where(eq(providers.id, id));
}

export async function deleteProvider(id: number): Promise<void> {
  const db = getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db.delete(providers).where(eq(providers.id, id));
}

// ============================================================================
// Workspace Provider Assignments
// ============================================================================

export async function assignProviderToWorkspace(data: InsertWorkspaceProvider): Promise<WorkspaceProvider> {
  const db = getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  const result = await db.insert(workspaceProviders).values(data);
  const id = Number(result[0].insertId);
  
  const created = await getWorkspaceProviderById(id);
  if (!created) {
    throw new Error("Failed to assign provider to workspace");
  }
  
  return created;
}

export async function getWorkspaceProviderById(id: number): Promise<WorkspaceProvider | undefined> {
  const db = getDb();
  if (!db) {
    return undefined;
  }

  const result = await db.select().from(workspaceProviders).where(eq(workspaceProviders.id, id)).limit(1);
  return result[0];
}

export async function getWorkspaceProviders(workspaceId: number): Promise<WorkspaceProvider[]> {
  const db = getDb();
  if (!db) {
    return [];
  }

  return await db.select().from(workspaceProviders).where(eq(workspaceProviders.workspaceId, workspaceId)).orderBy(desc(workspaceProviders.priority));
}

export async function getEnabledWorkspaceProviders(workspaceId: number): Promise<WorkspaceProvider[]> {
  const db = getDb();
  if (!db) {
    return [];
  }

  return await db.select().from(workspaceProviders).where(
    and(
      eq(workspaceProviders.workspaceId, workspaceId),
      eq(workspaceProviders.enabled, true)
    )
  ).orderBy(desc(workspaceProviders.priority));
}

export async function updateWorkspaceProvider(id: number, data: Partial<InsertWorkspaceProvider>): Promise<void> {
  const db = getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db.update(workspaceProviders).set(data).where(eq(workspaceProviders.id, id));
}

export async function removeProviderFromWorkspace(id: number): Promise<void> {
  const db = getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db.delete(workspaceProviders).where(eq(workspaceProviders.id, id));
}

// ============================================================================
// Provider Usage Tracking
// ============================================================================

export async function recordProviderUsage(data: InsertProviderUsage): Promise<void> {
  const db = getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db.insert(providerUsage).values(data);
}

export async function getProviderUsage(workspaceId: number, providerId?: number): Promise<ProviderUsage[]> {
  const db = getDb();
  if (!db) {
    return [];
  }

  if (providerId) {
    return await db.select().from(providerUsage).where(
      and(
        eq(providerUsage.workspaceId, workspaceId),
        eq(providerUsage.providerId, providerId)
      )
    ).orderBy(desc(providerUsage.createdAt));
  }

  return await db.select().from(providerUsage).where(eq(providerUsage.workspaceId, workspaceId)).orderBy(desc(providerUsage.createdAt));
}

export async function getProviderUsageStats(workspaceId: number, providerId: number): Promise<{
  totalTokens: number;
  totalCost: number;
  averageLatency: number;
  requestCount: number;
}> {
  const db = getDb();
  if (!db) {
    return {
      totalTokens: 0,
      totalCost: 0,
      averageLatency: 0,
      requestCount: 0,
    };
  }

  const usage = await db.select().from(providerUsage).where(
    and(
      eq(providerUsage.workspaceId, workspaceId),
      eq(providerUsage.providerId, providerId)
    )
  );

  const totalTokens = usage.reduce((sum, record) => sum + record.tokensUsed, 0);
  const totalCost = usage.reduce((sum, record) => sum + (parseFloat(record.cost || "0")), 0);
  const averageLatency = usage.length > 0
    ? usage.reduce((sum, record) => sum + (record.latencyMs || 0), 0) / usage.length
    : 0;

  return {
    totalTokens,
    totalCost,
    averageLatency: Math.round(averageLatency),
    requestCount: usage.length,
  };
}
