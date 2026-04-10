/**
 * OpenRouter — Sync Service
 *
 * Pulls the current model catalog from OpenRouter and normalizes
 * it into openrouter_models for local browsing and selection.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db/connection";
import { openrouterModels, openrouterSyncRuns, openrouterConfig } from "./schema";
import { decrypt } from "../secrets/encryption";
import { logActivity } from "./service";

interface OpenRouterModelRaw {
  id: string;
  name: string;
  description?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string; image?: string };
  architecture?: { tokenizer?: string; instruct_type?: string; modality?: string };
  top_provider?: { max_completion_tokens?: number; is_moderated?: boolean; context_length?: number };
}

/**
 * Sync models from OpenRouter API into local cache.
 */
export async function syncModels(): Promise<{
  syncRunId: number;
  modelsFound: number;
  modelsAdded: number;
  modelsUpdated: number;
  error?: string;
}> {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  const config = await db.select().from(openrouterConfig).limit(1).then((r) => r[0]);
  if (!config?.apiKey) throw new Error("OpenRouter API key not configured");

  const key = decrypt(config.apiKey);
  const endpoint = config.endpoint ?? "https://openrouter.ai/api/v1";

  // Create sync run record
  const [syncRun] = await db
    .insert(openrouterSyncRuns)
    .values({ status: "running", startedAt: new Date() })
    .returning({ id: openrouterSyncRuns.id });

  const startMs = Date.now();

  try {
    const res = await fetch(`${endpoint}/models`, {
      headers: {
        "Authorization": `Bearer ${key}`,
        "HTTP-Referer": config.siteUrl ?? "http://localhost:3000",
        "X-Title": config.siteName ?? "MyNewAp1Claude",
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json() as { data: OpenRouterModelRaw[] };
    const models = data.data ?? [];

    let added = 0, updated = 0;

    for (const raw of models) {
      if (!raw.id) continue;
      const capabilities = inferCapabilities(raw);
      const providerSlug = raw.id.includes("/") ? raw.id.split("/")[0] : ((raw as any).owned_by ?? "unknown");
      const modelName = raw.name || raw.id;

      const existing = await db
        .select()
        .from(openrouterModels)
        .where(eq(openrouterModels.modelId, raw.id))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(openrouterModels)
          .set({
            name: modelName,
            description: raw.description ?? null,
            contextLength: raw.context_length ?? null,
            promptPricing: raw.pricing?.prompt ? parseFloat(raw.pricing.prompt) * 1_000_000 : null,
            completionPricing: raw.pricing?.completion ? parseFloat(raw.pricing.completion) * 1_000_000 : null,
            imagePricing: raw.pricing?.image ? parseFloat(raw.pricing.image) : null,
            architecture: raw.architecture ?? null,
            topProvider: raw.top_provider ?? null,
            capabilities,
            providerSlug,
            updatedAt: new Date(),
          })
          .where(eq(openrouterModels.id, existing[0].id));
        updated++;
      } else {
        await db.insert(openrouterModels).values({
          modelId: raw.id,
          name: modelName,
          description: raw.description ?? null,
          contextLength: raw.context_length ?? null,
          promptPricing: raw.pricing?.prompt ? parseFloat(raw.pricing.prompt) * 1_000_000 : null,
          completionPricing: raw.pricing?.completion ? parseFloat(raw.pricing.completion) * 1_000_000 : null,
          imagePricing: raw.pricing?.image ? parseFloat(raw.pricing.image) : null,
          architecture: raw.architecture ?? null,
          topProvider: raw.top_provider ?? null,
          capabilities,
          providerSlug,
        });
        added++;
      }
    }

    const durationMs = Date.now() - startMs;

    // Update sync run
    await db
      .update(openrouterSyncRuns)
      .set({ status: "completed", modelsFound: models.length, modelsAdded: added, modelsUpdated: updated, durationMs, completedAt: new Date() })
      .where(eq(openrouterSyncRuns.id, syncRun.id));

    // Update config last sync
    await db
      .update(openrouterConfig)
      .set({ lastSyncAt: new Date(), updatedAt: new Date() })
      .where(eq(openrouterConfig.id, config.id));

    await logActivity("sync.complete", undefined, `Synced ${models.length} models (${added} added, ${updated} updated) in ${durationMs}ms`);

    return { syncRunId: syncRun.id, modelsFound: models.length, modelsAdded: added, modelsUpdated: updated };
  } catch (err) {
    const durationMs = Date.now() - startMs;
    const errorMsg = (err as Error).message;

    await db
      .update(openrouterSyncRuns)
      .set({ status: "failed", errorMessage: errorMsg, durationMs, completedAt: new Date() })
      .where(eq(openrouterSyncRuns.id, syncRun.id));

    await logActivity("sync.failed", undefined, errorMsg);

    return { syncRunId: syncRun.id, modelsFound: 0, modelsAdded: 0, modelsUpdated: 0, error: errorMsg };
  }
}

/**
 * Infer capabilities from raw OpenRouter model data.
 */
function inferCapabilities(raw: OpenRouterModelRaw): {
  chat: boolean;
  completion: boolean;
  embedding: boolean;
  toolCalling: boolean;
  vision: boolean;
  structuredOutput: boolean;
  reasoning: boolean;
} {
  const modality = raw.architecture?.modality ?? "";
  const name = raw.name?.toLowerCase() ?? "";
  const id = raw.id?.toLowerCase() ?? "";

  return {
    chat: true, // All OpenRouter models support chat
    completion: true,
    embedding: id.includes("embed") || name.includes("embed"),
    toolCalling: !id.includes("embed") && !name.includes("image"),
    vision: modality.includes("image") || modality.includes("multimodal") || name.includes("vision") || id.includes("vision"),
    structuredOutput: !id.includes("embed"),
    reasoning: id.includes("o1") || id.includes("o3") || name.includes("reasoning") || id.includes("deepseek-r1") || id.includes("qwq"),
  };
}
