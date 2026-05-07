/**
 * Vector embedding service for document chunks.
 *
 * PMB Phase 29.4b — credential resolution moved off the OpenAI env-var
 * read onto the workspace-default-binding lookup. Public methods now
 * take a `workspaceId` argument; the service resolves the workspace's
 * `embedding` default binding via `resolveWorkspaceDefaultBinding`
 * (PMB Phase 29.1b) and dispatches to
 * `gatewayCall(openRouter.modelAccess.embed)` with `intent: "system-internal"`
 * (PMB Phase 29.4a — infrastructure-call lane exempt from the receipt
 * policy because document indexing / RAG retrieval have no
 * user-attributed receipt source).
 *
 * Per D-WDB-5, the previous singleton cache is gone — each call resolves
 * the binding for its workspace. Callers that need a long-lived handle
 * still get a service instance via `getEmbeddingService(...)`, but the
 * Qdrant client is the only mutable state held on the instance.
 *
 * `EmbeddingResolutionError` is thrown when the workspace has no
 * embedding default binding configured OR the linked Provider Connection
 * fails eligibility (D-WDB-3 reasons: `default_not_set`,
 * `provider_connection_missing`, `provider_connection_disabled`,
 * `provider_connection_unhealthy`). This replaces the previous
 * "OPENAI_API_KEY not configured" error with a typed reason.
 */

import { QdrantClient } from "@qdrant/js-client-rest";
import { gatewayCall } from "../platform/modules/module-gateway";
import { resolveWorkspaceDefaultBinding } from "../agent-studio/workspace-default-bindings";
import type {
  ModelAccessEmbedInput,
  ModelAccessEmbedResult,
} from "../openrouter/model-access/types";

const DEFAULT_COLLECTION = "documents";
const DEFAULT_EMBED_BATCH_SIZE = 100;

export class EmbeddingResolutionError extends Error {
  constructor(
    public readonly workspaceId: number,
    public readonly reason:
      | "default_not_set"
      | "provider_connection_missing"
      | "provider_connection_disabled"
      | "provider_connection_unhealthy",
  ) {
    super(
      `[Embeddings] Workspace ${workspaceId} has no usable embedding binding (reason=${reason}). ` +
        `Configure the default via ags_workspace_default_provider_bindings (role='embedding').`,
    );
    this.name = "EmbeddingResolutionError";
  }
}

interface ResolvedEmbeddingBinding {
  providerConnectionId: number;
  modelRef: string;
}

async function resolveBindingOrThrow(
  workspaceId: number,
): Promise<ResolvedEmbeddingBinding> {
  const result = await resolveWorkspaceDefaultBinding({
    workspaceId,
    role: "embedding",
  });
  if (!result) {
    throw new EmbeddingResolutionError(workspaceId, "default_not_set");
  }
  if (!result.ok) {
    throw new EmbeddingResolutionError(
      workspaceId,
      result.reason ?? "provider_connection_missing",
    );
  }
  return {
    providerConnectionId: result.providerConnectionId,
    modelRef: result.modelRef,
  };
}

export class EmbeddingService {
  private qdrant: QdrantClient | null = null;
  private collectionName: string;

  constructor(collectionName: string = DEFAULT_COLLECTION) {
    this.collectionName = collectionName;
  }

  /**
   * Initialize Qdrant client (in-memory mode for local development)
   */
  private async initQdrant() {
    if (this.qdrant) return this.qdrant;

    this.qdrant = new QdrantClient({ url: ":memory:" });

    try {
      await this.qdrant.getCollection(this.collectionName);
      console.log(`[Embeddings] Using existing collection: ${this.collectionName}`);
    } catch {
      await this.qdrant.createCollection(this.collectionName, {
        vectors: {
          size: 1536,
          distance: "Cosine",
        },
      });
      console.log(`[Embeddings] Created collection: ${this.collectionName}`);
    }

    return this.qdrant;
  }

  /**
   * Generate embedding for a single text.
   * Resolves the workspace's `embedding` default and routes through Model Access.
   */
  async generateEmbedding(text: string, workspaceId: number): Promise<number[]> {
    const binding = await resolveBindingOrThrow(workspaceId);

    const result = await gatewayCall<ModelAccessEmbedInput, ModelAccessEmbedResult>({
      ctx: {
        sourceModule: "embeddings",
        targetModule: "openRouter",
        actionKey: "openRouter.modelAccess.embed",
        workspaceId,
      },
      input: {
        providerConnectionId: binding.providerConnectionId,
        modelRef: binding.modelRef,
        inputs: text,
        intent: "system-internal",
        workspaceId,
        actorId: 0,
      },
    });

    if (result.status !== "ok" || result.embeddings.length === 0) {
      throw new Error(
        `[Embeddings] modelAccess.embed failed for workspace ${workspaceId}: ${result.error ?? "no embeddings returned"}`,
      );
    }
    return result.embeddings[0];
  }

  /**
   * Generate embeddings for multiple texts in a single batch call.
   */
  async generateEmbeddings(
    texts: string[],
    workspaceId: number,
  ): Promise<number[][]> {
    if (texts.length === 0) return [];
    const binding = await resolveBindingOrThrow(workspaceId);

    const result = await gatewayCall<ModelAccessEmbedInput, ModelAccessEmbedResult>({
      ctx: {
        sourceModule: "embeddings",
        targetModule: "openRouter",
        actionKey: "openRouter.modelAccess.embed",
        workspaceId,
      },
      input: {
        providerConnectionId: binding.providerConnectionId,
        modelRef: binding.modelRef,
        inputs: texts,
        intent: "system-internal",
        workspaceId,
        actorId: 0,
      },
    });

    if (result.status !== "ok") {
      throw new Error(
        `[Embeddings] modelAccess.embed batch failed for workspace ${workspaceId}: ${result.error ?? "unknown error"}`,
      );
    }
    return result.embeddings;
  }

  /**
   * Store document chunk embeddings in vector database.
   * Each batch resolves the binding once and routes through Model Access.
   */
  async storeChunkEmbeddings(
    chunks: Array<{
      id: number;
      content: string;
      documentId: number;
      chunkIndex: number;
    }>,
    workspaceId: number,
  ): Promise<void> {
    if (chunks.length === 0) return;

    const qdrant = await this.initQdrant();
    const allPoints = [];

    for (let i = 0; i < chunks.length; i += DEFAULT_EMBED_BATCH_SIZE) {
      const batch = chunks.slice(i, i + DEFAULT_EMBED_BATCH_SIZE);
      const texts = batch.map((chunk) => chunk.content);

      console.log(
        `[Embeddings] Generating embeddings for batch ${Math.floor(i / DEFAULT_EMBED_BATCH_SIZE) + 1}/${Math.ceil(chunks.length / DEFAULT_EMBED_BATCH_SIZE)}`,
      );
      const embeddings = await this.generateEmbeddings(texts, workspaceId);

      const points = batch.map((chunk, idx) => ({
        id: chunk.id,
        vector: embeddings[idx],
        payload: {
          documentId: chunk.documentId,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          workspaceId,
        },
      }));
      allPoints.push(...points);
    }

    await qdrant.upsert(this.collectionName, {
      wait: true,
      points: allPoints,
    });
    console.log(`[Embeddings] Stored ${allPoints.length} chunk embeddings`);
  }

  /**
   * Search for similar chunks using vector similarity.
   */
  async searchSimilarChunks(
    query: string,
    limit: number,
    workspaceId: number,
    documentIds?: number[],
  ): Promise<
    Array<{
      id: number;
      score: number;
      documentId: number;
      chunkIndex: number;
      content: string;
    }>
  > {
    const qdrant = await this.initQdrant();
    const queryEmbedding = await this.generateEmbedding(query, workspaceId);

    const filter = documentIds
      ? {
          must: [
            {
              key: "documentId",
              match: { any: documentIds },
            },
          ],
        }
      : undefined;

    const results = await qdrant.search(this.collectionName, {
      vector: queryEmbedding,
      limit,
      filter,
      with_payload: true,
    });

    return results.map((result) => ({
      id: result.id as number,
      score: result.score,
      documentId: (result.payload as Record<string, unknown>)?.documentId as number,
      chunkIndex: (result.payload as Record<string, unknown>)?.chunkIndex as number,
      content: (result.payload as Record<string, unknown>)?.content as string,
    }));
  }

  /**
   * Delete embeddings for a document.
   * Workspace-agnostic: relies on the documentId as the dedupe key.
   */
  async deleteDocumentEmbeddings(documentId: number): Promise<void> {
    const qdrant = await this.initQdrant();
    await qdrant.delete(this.collectionName, {
      wait: true,
      filter: {
        must: [{ key: "documentId", match: { value: documentId } }],
      },
    });
    console.log(`[Embeddings] Deleted embeddings for document ${documentId}`);
  }

  /**
   * Get collection statistics.
   */
  async getStats(): Promise<{ vectorCount: number; collectionName: string }> {
    const qdrant = await this.initQdrant();
    const info = await qdrant.getCollection(this.collectionName);
    return {
      vectorCount: info.points_count || 0,
      collectionName: this.collectionName,
    };
  }
}

let embeddingService: EmbeddingService | null = null;

/**
 * Get or create an embedding service handle. The handle is workspace-
 * agnostic — `workspaceId` is passed per call. The Qdrant client is
 * the only state held on the instance.
 *
 * Note: the previous (pre-29.4b) version held `embeddingModel` on the
 * instance. Model selection is now per-call via the workspace's
 * `embedding` default binding (`resolveWorkspaceDefaultBinding`).
 */
export function getEmbeddingService(
  collectionName?: string,
): EmbeddingService {
  if (!embeddingService) {
    embeddingService = new EmbeddingService(collectionName);
  }
  return embeddingService;
}
