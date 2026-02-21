import { eq, and, desc } from "drizzle-orm";
import { createHash } from "crypto";
import {
  llms,
  llmVersions,
  llmPromotions,
  llmAuditEvents,
  type LLM,
  type InsertLLM,
  type LLMVersion,
  type InsertLLMVersion,
  type LLMPromotion,
  type InsertLLMPromotion,
  type LLMAuditEvent,
  type InsertLLMAuditEvent,
} from "../../drizzle/schema";
import { getDb } from "./connection";

export async function createLLM(data: InsertLLM): Promise<LLM> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  try {
    const [created] = await db.insert(llms).values({
      name: data.name,
      description: data.description ?? null,
      role: data.role,
      ownerTeam: data.ownerTeam ?? null,
      archived: data.archived ?? false,
      createdBy: data.createdBy,
      createdAt: data.createdAt ?? new Date(),
      updatedAt: data.updatedAt ?? new Date(),
    }).returning();

    await emitLLMAuditEvent({
      eventType: "llm.created",
      llmId: created.id,
      actor: data.createdBy,
      actorType: "user",
      payload: { name: data.name, role: data.role },
    });

    return created;
  } catch (error: any) {
    console.error('[createLLM] Insert failed:', error.message);
    throw new Error(`Failed to create LLM: ${error.message}`);
  }
}

export async function updateLLM(
  id: number,
  data: Partial<Pick<InsertLLM, "name" | "description" | "role" | "ownerTeam">>,
  updatedBy: number
): Promise<LLM> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  console.log('[updateLLM] Updating LLM ID:', id, 'with data:', JSON.stringify(data));

  try {
    const updateData: Record<string, unknown> = {
      ...data,
      updatedAt: new Date(),
    };

    await db
      .update(llms)
      .set(updateData)
      .where(eq(llms.id, id));

    console.log('[updateLLM] Successfully updated LLM ID:', id);

    await emitLLMAuditEvent({
      eventType: "llm.updated",
      llmId: id,
      actor: updatedBy,
      actorType: "user",
      payload: { changes: data },
    });

    const updated = await db.select().from(llms).where(eq(llms.id, id)).limit(1);
    if (!updated || updated.length === 0) {
      throw new Error(`LLM with ID ${id} not found after update`);
    }
    return updated[0];
  } catch (error: any) {
    console.error('[updateLLM] Update failed:', error);
    console.error('[updateLLM] Error details:', {
      message: error.message,
      code: error.code,
    });
    throw new Error(`Failed to update LLM: ${error.message}`);
  }
}

export async function getLLMs(filter?: {
  role?: string;
  archived?: boolean;
}): Promise<LLM[]> {
  const db = getDb();
  if (!db) return [];

  let query = db.select().from(llms);

  const conditions = [];
  if (filter?.role) {
    conditions.push(eq(llms.role, filter.role as any));
  }
  if (filter?.archived !== undefined) {
    conditions.push(eq(llms.archived, filter.archived));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query;
}

export async function getLLMById(id: number): Promise<LLM | null> {
  const db = getDb();
  if (!db) return null;

  const results = await db.select().from(llms).where(eq(llms.id, id));
  return results[0] || null;
}

export async function archiveLLM(id: number, userId: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db.update(llms).set({ archived: true }).where(eq(llms.id, id));

  await emitLLMAuditEvent({
    eventType: "llm.archived",
    llmId: id,
    actor: userId,
    actorType: "user",
    payload: {},
  });
}

function computeConfigHash(config: any): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(config));
  return hash.digest("hex");
}

export async function createLLMVersion(data: Omit<InsertLLMVersion, "configHash" | "version">): Promise<LLMVersion> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const existingVersions = await db
    .select()
    .from(llmVersions)
    .where(eq(llmVersions.llmId, data.llmId))
    .orderBy(desc(llmVersions.version));

  const nextVersion = existingVersions.length > 0 ? existingVersions[0].version + 1 : 1;

  const configHash = computeConfigHash(data.config);

  const insertData: InsertLLMVersion = {
    ...data,
    version: nextVersion,
    configHash,
  };

  const [version] = await db.insert(llmVersions).values(insertData).returning({ id: llmVersions.id });

  await emitLLMAuditEvent({
    eventType: "llm.version.created",
    llmId: data.llmId,
    llmVersionId: version.id,
    actor: data.createdBy,
    actorType: "user",
    payload: { version: nextVersion, environment: data.environment },
    configHash,
    policyHash: data.policyHash,
    environment: data.environment,
  });

  return (await db.select().from(llmVersions).where(eq(llmVersions.id, version.id)))[0];
}

export async function getLLMVersions(llmId: number): Promise<LLMVersion[]> {
  const db = getDb();
  if (!db) return [];

  return await db
    .select()
    .from(llmVersions)
    .where(eq(llmVersions.llmId, llmId))
    .orderBy(desc(llmVersions.version));
}

export async function getLLMVersion(versionId: number): Promise<LLMVersion | null> {
  const db = getDb();
  if (!db) return null;

  const results = await db.select().from(llmVersions).where(eq(llmVersions.id, versionId));
  return results[0] || null;
}

export async function getLatestCallableVersion(
  llmId: number,
  environment: "sandbox" | "governed" | "production"
): Promise<LLMVersion | null> {
  const db = getDb();
  if (!db) return null;

  const results = await db
    .select()
    .from(llmVersions)
    .where(
      and(
        eq(llmVersions.llmId, llmId),
        eq(llmVersions.environment, environment),
        eq(llmVersions.callable, true)
      )
    )
    .orderBy(desc(llmVersions.version))
    .limit(1);

  return results[0] || null;
}

export async function updateLLMVersionCallable(
  versionId: number,
  callable: boolean,
  reason: string
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(llmVersions)
    .set({ callable })
    .where(eq(llmVersions.id, versionId));

  const version = await getLLMVersion(versionId);
  if (version) {
    await emitLLMAuditEvent({
      eventType: callable ? "llm.version.enabled" : "llm.version.disabled",
      llmId: version.llmId,
      llmVersionId: versionId,
      actorType: "system",
      payload: { reason },
    });
  }
}

export async function createPromotion(data: Omit<InsertLLMPromotion, "requestedAt">): Promise<LLMPromotion> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const [promotion] = await db.insert(llmPromotions).values({
    ...data,
    requestedAt: new Date(),
  }).returning({ id: llmPromotions.id });

  const version = await getLLMVersion(data.llmVersionId);

  await emitLLMAuditEvent({
    eventType: "llm.promotion.requested",
    llmId: version?.llmId,
    llmVersionId: data.llmVersionId,
    promotionId: promotion.id,
    actor: data.requestedBy,
    actorType: "user",
    payload: {
      from: data.fromEnvironment,
      to: data.toEnvironment,
    },
  });

  return (await db.select().from(llmPromotions).where(eq(llmPromotions.id, promotion.id)))[0];
}

export async function getPromotions(filter?: {
  status?: string;
  llmVersionId?: number;
}): Promise<LLMPromotion[]> {
  const db = getDb();
  if (!db) return [];

  let query = db.select().from(llmPromotions);

  const conditions = [];
  if (filter?.status) {
    conditions.push(eq(llmPromotions.status, filter.status as any));
  }
  if (filter?.llmVersionId) {
    conditions.push(eq(llmPromotions.llmVersionId, filter.llmVersionId));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions)) as any;
  }

  return await query.orderBy(desc(llmPromotions.createdAt));
}

export async function approvePromotion(
  promotionId: number,
  approverId: number,
  comment?: string
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(llmPromotions)
    .set({
      status: "approved",
      approvedBy: approverId,
      approvedAt: new Date(),
      approvalComment: comment,
    })
    .where(eq(llmPromotions.id, promotionId));

  const promotion = (await db.select().from(llmPromotions).where(eq(llmPromotions.id, promotionId)))[0];

  if (promotion) {
    const version = await getLLMVersion(promotion.llmVersionId);
    await emitLLMAuditEvent({
      eventType: "llm.promotion.approved",
      llmId: version?.llmId,
      llmVersionId: promotion.llmVersionId,
      promotionId,
      actor: approverId,
      actorType: "user",
      payload: { comment },
    });
  }
}

export async function rejectPromotion(
  promotionId: number,
  rejecterId: number,
  reason: string
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(llmPromotions)
    .set({
      status: "rejected",
      rejectedBy: rejecterId,
      rejectedAt: new Date(),
      rejectionReason: reason,
    })
    .where(eq(llmPromotions.id, promotionId));

  const promotion = (await db.select().from(llmPromotions).where(eq(llmPromotions.id, promotionId)))[0];

  if (promotion) {
    const version = await getLLMVersion(promotion.llmVersionId);
    await emitLLMAuditEvent({
      eventType: "llm.promotion.rejected",
      llmId: version?.llmId,
      llmVersionId: promotion.llmVersionId,
      promotionId,
      actor: rejecterId,
      actorType: "user",
      payload: { reason },
    });
  }
}

async function emitLLMAuditEvent(data: Omit<InsertLLMAuditEvent, "timestamp" | "createdAt">): Promise<void> {
  const db = getDb();
  if (!db) return;

  try {
    await db.insert(llmAuditEvents).values({
      ...data,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error("[LLM Audit] Failed to emit event:", error);
  }
}

export async function getLLMAuditEvents(filter: {
  llmId?: number;
  llmVersionId?: number;
  eventType?: string;
  limit?: number;
}): Promise<LLMAuditEvent[]> {
  const db = getDb();
  if (!db) return [];

  const conditions = [];
  if (filter.llmId) {
    conditions.push(eq(llmAuditEvents.llmId, filter.llmId));
  }
  if (filter.llmVersionId) {
    conditions.push(eq(llmAuditEvents.llmVersionId, filter.llmVersionId));
  }
  if (filter.eventType) {
    conditions.push(eq(llmAuditEvents.eventType, filter.eventType));
  }

  const baseQuery = db.select().from(llmAuditEvents);
  const filteredQuery = conditions.length > 0
    ? baseQuery.where(and(...conditions))
    : baseQuery;
  const orderedQuery = filteredQuery.orderBy(desc(llmAuditEvents.timestamp));
  const limitedQuery = filter.limit
    ? orderedQuery.limit(filter.limit)
    : orderedQuery;

  return await limitedQuery;
}
