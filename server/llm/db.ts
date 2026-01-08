import { eq, desc, and } from "drizzle-orm";
import { getDb } from "../db";
import { llms, llmVersions, type Llm, type InsertLlm, type LlmVersion, type InsertLlmVersion } from "../../drizzle/schema";

const db = getDb();

// ============================================================================
// LLM Management
// ============================================================================

export async function createLlm(data: InsertLlm): Promise<Llm> {
  const [llm] = await db!.insert(llms).values(data).returning();
  return llm;
}

export async function getLlmById(id: number): Promise<Llm | undefined> {
  const [llm] = await db!.select().from(llms).where(eq(llms.id, id));
  return llm;
}

export async function listLlms(includeArchived: boolean = false): Promise<Llm[]> {
  if (includeArchived) {
    return await db!.select().from(llms).orderBy(desc(llms.createdAt));
  }
  return await db!.select().from(llms).where(eq(llms.archived, false)).orderBy(desc(llms.createdAt));
}

export async function updateLlm(id: number, data: Partial<InsertLlm>): Promise<void> {
  await db!.update(llms).set(data).where(eq(llms.id, id));
}

export async function archiveLlm(id: number): Promise<void> {
  await db!.update(llms).set({ archived: true }).where(eq(llms.id, id));
}

export async function deleteLlm(id: number): Promise<void> {
  // Delete all versions first
  await db!.delete(llmVersions).where(eq(llmVersions.llmId, id));
  // Then delete the LLM
  await db!.delete(llms).where(eq(llms.id, id));
}

// ============================================================================
// LLM Version Management
// ============================================================================

export async function createLlmVersion(data: InsertLlmVersion): Promise<LlmVersion> {
  const [version] = await db!.insert(llmVersions).values(data).returning();
  return version;
}

export async function getLlmVersionById(id: number): Promise<LlmVersion | undefined> {
  const [version] = await db!.select().from(llmVersions).where(eq(llmVersions.id, id));
  return version;
}

export async function listLlmVersions(llmId: number): Promise<LlmVersion[]> {
  return await db!.select().from(llmVersions).where(eq(llmVersions.llmId, llmId)).orderBy(desc(llmVersions.version));
}

export async function getLatestLlmVersion(llmId: number): Promise<LlmVersion | undefined> {
  const [version] = await db!
    .select()
    .from(llmVersions)
    .where(eq(llmVersions.llmId, llmId))
    .orderBy(desc(llmVersions.version))
    .limit(1);
  return version;
}

export async function getNextVersionNumber(llmId: number): Promise<number> {
  const latestVersion = await getLatestLlmVersion(llmId);
  return latestVersion ? latestVersion.version + 1 : 1;
}

// ============================================================================
// Combined Operations
// ============================================================================

/**
 * Get an LLM with its latest version
 */
export async function getLlmWithLatestVersion(llmId: number): Promise<{ llm: Llm; version: LlmVersion } | undefined> {
  const llm = await getLlmById(llmId);
  if (!llm) return undefined;

  const version = await getLatestLlmVersion(llmId);
  if (!version) return undefined;

  return { llm, version };
}

/**
 * Get all LLMs with their latest versions
 * Optimized with a single query using LEFT JOIN to avoid N+1 problem
 */
export async function listLlmsWithLatestVersions(includeArchived: boolean = false): Promise<Array<{ llm: Llm; version: LlmVersion | undefined }>> {
  // Subquery to get the latest version ID for each LLM
  const latestVersionSubquery = db!
    .select({
      llmId: llmVersions.llmId,
      maxVersion: desc(llmVersions.version),
    })
    .from(llmVersions)
    .groupBy(llmVersions.llmId)
    .as('latest_versions');

  // Main query with LEFT JOIN to get LLMs with their latest versions
  const query = db!
    .select({
      llm: llms,
      version: llmVersions,
    })
    .from(llms)
    .leftJoin(llmVersions, eq(llms.id, llmVersions.llmId))
    .orderBy(desc(llms.createdAt));

  // Apply archived filter if needed
  const results = includeArchived
    ? await query
    : await query.where(eq(llms.archived, false));

  // Group results by LLM and get the latest version for each
  const llmMap = new Map<number, { llm: Llm; version: LlmVersion | undefined }>();

  for (const row of results) {
    if (!llmMap.has(row.llm.id)) {
      llmMap.set(row.llm.id, { llm: row.llm, version: row.version || undefined });
    } else {
      // If we already have this LLM, check if current version is newer
      const existing = llmMap.get(row.llm.id)!;
      if (row.version && (!existing.version || row.version.version > existing.version.version)) {
        existing.version = row.version;
      }
    }
  }

  return Array.from(llmMap.values());
}
