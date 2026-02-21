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
