/**
 * Provider Connections — Database CRUD
 */
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "../db";
import {
  providerConnections,
  providerSecrets,
  providerAuditLog,
  type InsertProviderConnection,
  type ProviderConnection,
  type InsertProviderSecret,
  type ProviderSecret,
  type ProviderConnectionStatus,
  type ProviderAuditAction,
} from "../../drizzle/schema";

// ============================================================================
// Connections
// ============================================================================

export async function createConnection(
  data: InsertProviderConnection
): Promise<ProviderConnection> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const [row] = await db
    .insert(providerConnections)
    .values(data)
    .returning();
  return row;
}

export async function getConnectionById(
  id: number
): Promise<ProviderConnection | null> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const [row] = await db
    .select()
    .from(providerConnections)
    .where(eq(providerConnections.id, id));
  return row ?? null;
}

export async function getConnectionsByWorkspace(
  workspaceId: number
): Promise<ProviderConnection[]> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(providerConnections)
    .where(eq(providerConnections.workspaceId, workspaceId))
    .orderBy(desc(providerConnections.updatedAt));
}

export async function getActiveConnections(
  workspaceId: number
): Promise<ProviderConnection[]> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(providerConnections)
    .where(
      and(
        eq(providerConnections.workspaceId, workspaceId),
        eq(providerConnections.lifecycleStatus, "active")
      )
    )
    .orderBy(desc(providerConnections.updatedAt));
}

export async function updateConnectionStatus(
  id: number,
  status: ProviderConnectionStatus,
  extra?: Partial<InsertProviderConnection>
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(providerConnections)
    .set({
      lifecycleStatus: status,
      updatedAt: new Date(),
      ...extra,
    })
    .where(eq(providerConnections.id, id));
}

export async function deleteConnection(id: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  // Cascade deletes secrets automatically
  await db.delete(providerConnections).where(eq(providerConnections.id, id));
}

// ============================================================================
// Secrets (isolated — only called by service layer)
// ============================================================================

export async function insertSecret(
  data: InsertProviderSecret
): Promise<ProviderSecret> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const [row] = await db
    .insert(providerSecrets)
    .values(data)
    .returning();
  return row;
}

export async function getLatestSecret(
  connectionId: number
): Promise<ProviderSecret | null> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const [row] = await db
    .select()
    .from(providerSecrets)
    .where(eq(providerSecrets.connectionId, connectionId))
    .orderBy(desc(providerSecrets.id))
    .limit(1);
  return row ?? null;
}

// ============================================================================
// Audit Log (append-only — never update or delete)
// ============================================================================

export async function appendAuditLog(
  connectionId: number,
  action: ProviderAuditAction,
  actor: number,
  metadata?: Record<string, unknown>
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(providerAuditLog).values({
    connectionId,
    action,
    actor,
    metadata: metadata ?? null,
  });
}

export async function getAuditLog(
  connectionId: number
): Promise<Array<{
  id: number;
  action: string;
  actor: number;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}>> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(providerAuditLog)
    .where(eq(providerAuditLog.connectionId, connectionId))
    .orderBy(desc(providerAuditLog.createdAt));
}
