import { eq, and, desc, isNull } from "drizzle-orm";
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

const VALID_LLM_ENVIRONMENTS = new Set(["sandbox", "governed", "production"]);

// Accepts both the full db instance and transaction objects (both share the same
// insert/select/update interface via PgDatabase base class in drizzle-orm)
type AuditExecutor = Pick<NonNullable<ReturnType<typeof getDb>>, "insert" | "select" | "update">;
type AuditActorType = "user" | "system";

function assertValidEnvironment(environment: string, label: string): void {
  if (!VALID_LLM_ENVIRONMENTS.has(environment)) {
    throw new Error(`Invalid ${label}: ${environment}`);
  }
}

async function insertLLMAuditEvent(
  executor: AuditExecutor,
  data: Omit<InsertLLMAuditEvent, "timestamp" | "createdAt">
): Promise<void> {
  await executor.insert(llmAuditEvents).values({
    ...data,
    timestamp: new Date(),
  });
}

async function requiredLLMAuditEvent(
  executor: AuditExecutor,
  data: Omit<InsertLLMAuditEvent, "timestamp" | "createdAt">
): Promise<void> {
  await insertLLMAuditEvent(executor, data);
}

export async function createLLM(data: InsertLLM): Promise<LLM> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  return await db.transaction(async (tx) => {
    const [created] = await tx.insert(llms).values({
      name: data.name,
      description: data.description ?? null,
      role: data.role,
      ownerTeam: data.ownerTeam ?? null,
      archived: data.archived ?? false,
      createdBy: data.createdBy,
      createdAt: data.createdAt ?? new Date(),
      updatedAt: data.updatedAt ?? new Date(),
    }).returning();

    await requiredLLMAuditEvent(tx, {
      eventType: "llm.created",
      llmId: created.id,
      actor: data.createdBy,
      actorType: "user",
      payload: { name: data.name, role: data.role },
    });

    return created;
  });
}

export async function updateLLM(
  id: number,
  data: Partial<Pick<InsertLLM, "name" | "description" | "role" | "ownerTeam">>,
  updatedBy: number
): Promise<LLM> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  return await db.transaction(async (tx) => {
    const updateData: Record<string, unknown> = {
      ...data,
      updatedAt: new Date(),
    };

    await tx
      .update(llms)
      .set(updateData)
      .where(eq(llms.id, id));

    await requiredLLMAuditEvent(tx, {
      eventType: "llm.updated",
      llmId: id,
      actor: updatedBy,
      actorType: "user",
      payload: { changes: data },
    });

    const updated = await tx.select().from(llms).where(eq(llms.id, id)).limit(1);
    if (!updated || updated.length === 0) {
      throw new Error(`LLM with ID ${id} not found after update`);
    }
    return updated[0];
  });
}

export async function getLLMs(filter?: {
  role?: string;
  archived?: boolean;
}): Promise<LLM[]> {
  const db = getDb();
  if (!db) return [];

  let query = db.select().from(llms);

  const conditions: any[] = [];
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

  await db.transaction(async (tx) => {
    await tx.update(llms).set({ archived: true }).where(eq(llms.id, id));

    await requiredLLMAuditEvent(tx, {
      eventType: "llm.archived",
      llmId: id,
      actor: userId,
      actorType: "user",
      payload: {},
    });
  });
}

function computeConfigHash(config: any): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(config));
  return hash.digest("hex");
}

export async function createLLMVersionWithExecutor(
  executor: AuditExecutor,
  data: Omit<InsertLLMVersion, "configHash" | "version">
): Promise<LLMVersion> {
  assertValidEnvironment(data.environment, "LLM version environment");

  const existingVersions = await executor
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

  const [version] = await executor.insert(llmVersions).values(insertData).returning();

  await requiredLLMAuditEvent(executor, {
    eventType: "llm.version.created",
    llmId: data.llmId,
    llmVersionId: version.id,
    actor: data.createdBy,
    actorType: "user",
    payload: {
      version: nextVersion,
      environment: data.environment,
      callableMeaning: "internal_catalog_eligibility_only",
    },
    configHash,
    policyHash: data.policyHash ?? undefined,
    environment: data.environment,
  });

  return version;
}

export async function createLLMVersion(data: Omit<InsertLLMVersion, "configHash" | "version">): Promise<LLMVersion> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  return await db.transaction(async (tx) => createLLMVersionWithExecutor(tx, data));
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
  return getLatestCatalogEligibleVersion(llmId, environment);
}

export async function getLatestCatalogEligibleVersion(
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
  reason: string,
  actor: { actorId: number; actorType: AuditActorType }
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db.transaction(async (tx) => {
    await tx
      .update(llmVersions)
      .set({ callable })
      .where(eq(llmVersions.id, versionId));

    const [version] = await tx.select().from(llmVersions).where(eq(llmVersions.id, versionId));
    if (!version) {
      throw new Error(`LLM version ${versionId} not found`);
    }

    await requiredLLMAuditEvent(tx, {
      eventType: callable ? "llm.version.catalog_eligibility_enabled" : "llm.version.catalog_eligibility_disabled",
      llmId: version.llmId,
      llmVersionId: versionId,
      actor: actor.actorId,
      actorType: actor.actorType,
      payload: {
        reason,
        callableMeaning: "internal_catalog_eligibility_only",
        catalogRuntimeAuthority: "catalog_entry",
      },
      environment: version.environment,
      configHash: version.configHash,
      policyHash: version.policyHash ?? undefined,
    });
  });
}

export async function createPromotion(data: Omit<InsertLLMPromotion, "requestedAt">): Promise<LLMPromotion> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  assertValidEnvironment(data.fromEnvironment, "promotion source environment");
  assertValidEnvironment(data.toEnvironment, "promotion target environment");

  return await db.transaction(async (tx) => {
    const [version] = await tx.select().from(llmVersions).where(eq(llmVersions.id, data.llmVersionId));
    if (!version) {
      throw new Error(`LLM version ${data.llmVersionId} not found`);
    }

    const [promotion] = await tx.insert(llmPromotions).values({
      ...data,
      requestedAt: new Date(),
    }).returning();

    await requiredLLMAuditEvent(tx, {
      eventType: "llm.promotion.requested",
      llmId: version.llmId,
      llmVersionId: data.llmVersionId,
      promotionId: promotion.id,
      actor: data.requestedBy,
      actorType: "user",
      payload: {
        from: data.fromEnvironment,
        to: data.toEnvironment,
      },
      environment: data.toEnvironment,
      configHash: version.configHash,
      policyHash: version.policyHash ?? undefined,
    });

    return promotion;
  });
}

export async function getPromotions(filter?: {
  status?: string;
  llmVersionId?: number;
}): Promise<LLMPromotion[]> {
  const db = getDb();
  if (!db) return [];

  let query = db.select().from(llmPromotions);

  const conditions: any[] = [];
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

export async function getPromotionById(promotionId: number): Promise<LLMPromotion | null> {
  const db = getDb();
  if (!db) return null;

  const [promotion] = await db.select().from(llmPromotions).where(eq(llmPromotions.id, promotionId));
  return promotion ?? null;
}

export async function approvePromotion(
  promotionId: number,
  approverId: number,
  comment?: string
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db.transaction(async (tx) => {
    await tx
      .update(llmPromotions)
      .set({
        status: "approved",
        approvedBy: approverId,
        approvedAt: new Date(),
        approvalComment: comment,
        updatedAt: new Date(),
      })
      .where(eq(llmPromotions.id, promotionId));

    const [promotion] = await tx.select().from(llmPromotions).where(eq(llmPromotions.id, promotionId));
    if (!promotion) {
      throw new Error(`Promotion ${promotionId} not found`);
    }

    const [version] = await tx.select().from(llmVersions).where(eq(llmVersions.id, promotion.llmVersionId));
    if (!version) {
      throw new Error(`LLM version ${promotion.llmVersionId} not found`);
    }

    await requiredLLMAuditEvent(tx, {
      eventType: "llm.promotion.approved",
      llmId: version.llmId,
      llmVersionId: promotion.llmVersionId,
      promotionId,
      actor: approverId,
      actorType: "user",
      payload: { comment },
      environment: promotion.toEnvironment,
      configHash: version.configHash,
      policyHash: version.policyHash ?? undefined,
    });
  });
}

export async function rejectPromotion(
  promotionId: number,
  rejecterId: number,
  reason: string
): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db.transaction(async (tx) => {
    await tx
      .update(llmPromotions)
      .set({
        status: "rejected",
        rejectedBy: rejecterId,
        rejectedAt: new Date(),
        rejectionReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(llmPromotions.id, promotionId));

    const [promotion] = await tx.select().from(llmPromotions).where(eq(llmPromotions.id, promotionId));
    if (!promotion) {
      throw new Error(`Promotion ${promotionId} not found`);
    }

    const [version] = await tx.select().from(llmVersions).where(eq(llmVersions.id, promotion.llmVersionId));
    if (!version) {
      throw new Error(`LLM version ${promotion.llmVersionId} not found`);
    }

    await requiredLLMAuditEvent(tx, {
      eventType: "llm.promotion.rejected",
      llmId: version.llmId,
      llmVersionId: promotion.llmVersionId,
      promotionId,
      actor: rejecterId,
      actorType: "user",
      payload: { reason },
      environment: promotion.toEnvironment,
      configHash: version.configHash,
      policyHash: version.policyHash ?? undefined,
    });
  });
}

export async function executePromotion(
  promotionId: number,
  actorId: number
): Promise<LLMVersion> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const promotionRecord = await getPromotionById(promotionId);
  if (!promotionRecord) {
    throw new Error("Promotion not found");
  }

  return await db.transaction(async (tx) => {
    const lockedPromotions = await tx
      .update(llmPromotions)
      .set({
        status: "executing",
        updatedAt: new Date(),
      })
      .where(and(
        eq(llmPromotions.id, promotionRecord.id),
        eq(llmPromotions.status, "approved"),
        isNull(llmPromotions.executedAt),
        isNull(llmPromotions.newVersionId),
      ))
      .returning();

    if (lockedPromotions.length === 0) {
      const [currentPromotion] = await tx.select().from(llmPromotions).where(eq(llmPromotions.id, promotionRecord.id));
      if (!currentPromotion) {
        throw new Error("Promotion not found");
      }
      if (currentPromotion.executedAt || currentPromotion.newVersionId || currentPromotion.status === "executed") {
        throw new Error("Promotion has already been executed");
      }
      throw new Error("Promotion must be approved before execution");
    }

    const promotion = lockedPromotions[0];

    assertValidEnvironment(promotion.toEnvironment, "promotion target environment");

    const [sourceVersion] = await tx.select().from(llmVersions).where(eq(llmVersions.id, promotion.llmVersionId));
    if (!sourceVersion) {
      throw new Error("Source version not found");
    }

    const existingVersions = await tx
      .select()
      .from(llmVersions)
      .where(eq(llmVersions.llmId, sourceVersion.llmId))
      .orderBy(desc(llmVersions.version));

    const nextVersion = existingVersions.length > 0 ? existingVersions[0].version + 1 : 1;

    const [newVersion] = await tx.insert(llmVersions).values({
      llmId: sourceVersion.llmId,
      version: nextVersion,
      environment: promotion.toEnvironment,
      config: sourceVersion.config,
      configHash: sourceVersion.configHash,
      policyBundleRef: sourceVersion.policyBundleRef,
      policyHash: sourceVersion.policyHash,
      policyDecision: sourceVersion.policyDecision,
      policyViolations: sourceVersion.policyViolations,
      attestationContract: sourceVersion.attestationContract,
      attestationStatus: "pending",
      driftStatus: "none",
      callable: false,
      createdBy: actorId,
      changeNotes: `Promoted from ${promotion.fromEnvironment} via promotion #${promotion.id}`,
      promotionRequestId: promotion.id,
    }).returning();

    await tx
      .update(llmPromotions)
      .set({
        status: "executed",
        executedAt: new Date(),
        executionError: null,
        newVersionId: newVersion.id,
        updatedAt: new Date(),
      })
      .where(eq(llmPromotions.id, promotion.id));

    await requiredLLMAuditEvent(tx, {
      eventType: "llm.promotion.executed",
      llmId: sourceVersion.llmId,
      llmVersionId: newVersion.id,
      promotionId: promotion.id,
      actor: actorId,
      actorType: "user",
      payload: {
        sourceVersionId: sourceVersion.id,
        targetEnvironment: promotion.toEnvironment,
        newVersionId: newVersion.id,
        callableMeaning: "internal_catalog_eligibility_only",
      },
      environment: promotion.toEnvironment,
      configHash: newVersion.configHash,
      policyHash: newVersion.policyHash ?? undefined,
    });

    return newVersion;
  });
}

export async function getLLMAuditEvents(filter: {
  llmId?: number;
  llmVersionId?: number;
  eventType?: string;
  limit?: number;
}): Promise<LLMAuditEvent[]> {
  const db = getDb();
  if (!db) return [];

  const conditions: any[] = [];
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
