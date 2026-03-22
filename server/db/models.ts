import { eq, desc } from "drizzle-orm";
import { models, InsertModel, Model } from "../../drizzle/schema";
import { getDb } from "./connection";

export async function createModel(model: InsertModel): Promise<Model> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const [created] = await db.insert(models).values(model).returning();
  return created;
}

export async function getAllModels(): Promise<Model[]> {
  const db = getDb();
  if (!db) return [];

  return await db.select().from(models).orderBy(desc(models.createdAt));
}

export async function getModelById(modelId: number): Promise<Model | undefined> {
  const db = getDb();
  if (!db) return undefined;

  const result = await db.select().from(models).where(eq(models.id, modelId)).limit(1);
  return result[0];
}

export async function getModelsByType(modelType: "llm" | "embedding" | "reranker"): Promise<Model[]> {
  const db = getDb();
  if (!db) return [];

  return await db.select().from(models).where(eq(models.modelType, modelType)).orderBy(desc(models.createdAt));
}

export async function updateModel(modelId: number, updates: Partial<Model>): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db.update(models).set(updates).where(eq(models.id, modelId));
}

export async function deleteModel(modelId: number): Promise<void> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  await db.delete(models).where(eq(models.id, modelId));
}

// ── Deployability checks ──────────────────────────────────────────────

/** A model is deployable if its status is "ready" or "active" */
export function isDeployable(model: Model): boolean {
  return model.status === "ready" || model.status === "active";
}

/** Returns blocking reasons preventing a model from being catalog-importable */
export function getBlockingReasons(model: Model): string[] {
  const reasons: string[] = [];
  if (!model.name) reasons.push("Model name is required");
  if (!model.displayName) reasons.push("Display name is required");
  if (!model.modelType) reasons.push("Model type is required");
  if (model.status === "draft") reasons.push("Model is still in draft — set to ready or active");
  if (model.status === "deprecated") reasons.push("Model is deprecated");
  if (model.status === "disabled") reasons.push("Model is disabled");
  return reasons;
}
