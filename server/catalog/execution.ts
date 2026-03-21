import { z } from "zod";
import { getProviderRegistry } from "../providers/registry";
import type { ILLMProvider } from "../providers/base";
import type { Message } from "../providers/types";
import {
  createConversation,
  createExecutionRun,
  createMessage,
  getActiveBundleForEntry,
  getCatalogEntryById,
  getConversationById,
  getExecutionRunById,
  getUserWorkspaces,
  updateExecutionRun,
} from "../db";

export const catalogExecutionQuerySchema = z.object({
  message: z.string().trim().min(1).max(20000),
  conversationId: z.coerce.number().int().positive().optional(),
  triggerSource: z.string().trim().min(1).max(50).default("catalog_chat"),
});

type Blocker = {
  code: string;
  category: string;
  summary: string;
};

type CatalogExecutionContext = {
  runId: number;
  conversationId: number;
  provider: ILLMProvider;
  modelId: string | null;
  providerMessages: Message[];
};

export type CatalogExecutionEvent =
  | { type: "run_started"; runId: number; conversationId?: number }
  | { type: "token"; content: string }
  | { type: "complete"; runId: number; conversationId: number; content: string }
  | { type: "error"; runId: number; conversationId?: number; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function extractModelId(snapshot: Record<string, unknown>, entry: Record<string, unknown>): string | null {
  const config = isRecord(snapshot.config) ? snapshot.config : {};
  return (
    asOptionalString(config.modelId) ??
    asOptionalString(config.model) ??
    asOptionalString(entry.modelId) ??
    asOptionalString(snapshot.name) ??
    null
  );
}

function extractSourceAgentId(snapshot: Record<string, unknown>, entry: Record<string, unknown>): number | null {
  const config = isRecord(snapshot.config) ? snapshot.config : {};
  const raw = config.sourceAgentId ?? config.agentId ?? entry.sourceAgentId;
  return typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : null;
}

function extractProviderId(snapshot: Record<string, unknown>, entry: Record<string, unknown>): number | null {
  const config = isRecord(snapshot.config) ? snapshot.config : {};
  const raw = snapshot.providerId ?? config.providerId ?? entry.providerId;
  return typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : null;
}

function resolveCallable(snapshot: Record<string, unknown>): boolean {
  const config = isRecord(snapshot.config) ? snapshot.config : {};
  if (typeof config.callable === "boolean") return config.callable;
  return true;
}

async function failExecutionRun(runId: number, blocker: Blocker, extras?: Record<string, unknown>) {
  await updateExecutionRun(runId, {
    state: "failed",
    success: false,
    blockerCode: blocker.code,
    blockerCategory: blocker.category,
    blockerSummary: blocker.summary,
    completedAt: new Date(),
    metadata: extras,
  });
}

async function createBlockedRun(
  catalogEntryId: number,
  actorUserId: number,
  triggerSource: string,
  blocker: Blocker,
  metadata?: Record<string, unknown>
) {
  return await createExecutionRun({
    catalogEntryId,
    actorUserId,
    triggerSource,
    state: "failed",
    success: false,
    blockerCode: blocker.code,
    blockerCategory: blocker.category,
    blockerSummary: blocker.summary,
    completedAt: new Date(),
    metadata,
  });
}

async function prepareCatalogExecution(input: {
  catalogEntryId: number;
  actorUserId: number;
  message: string;
  triggerSource: string;
  conversationId?: number;
}): Promise<CatalogExecutionContext> {
  const { catalogEntryId, actorUserId, message, triggerSource } = input;

  const entry = await getCatalogEntryById(catalogEntryId);
  if (!entry) {
    const run = await createBlockedRun(catalogEntryId, actorUserId, triggerSource, {
      code: "catalog_entry_not_found",
      category: "eligibility",
      summary: `Catalog entry #${catalogEntryId} does not exist.`,
    });
    throw { runId: run.id, summary: "Catalog entry not found." };
  }

  const entryRecord = entry as unknown as Record<string, unknown>;
  const run = await createExecutionRun({
    catalogEntryId,
    actorUserId,
    triggerSource,
    state: "created",
    metadata: {
      entryType: entry.entryType,
      entryStatus: entry.status,
      reviewState: entry.reviewState,
    },
  });

  await updateExecutionRun(run.id, { state: "validating" });

  if (entry.status !== "active") {
    const blocker = {
      code: "catalog_entry_inactive",
      category: "eligibility",
      summary: `Catalog entry "${entry.displayName || entry.name}" is not active.`,
    };
    await failExecutionRun(run.id, blocker);
    throw { runId: run.id, summary: blocker.summary };
  }

  if (entry.reviewState !== "approved") {
    const blocker = {
      code: "catalog_entry_not_approved",
      category: "eligibility",
      summary: `Catalog entry "${entry.displayName || entry.name}" is not approved for execution.`,
    };
    await failExecutionRun(run.id, blocker);
    throw { runId: run.id, summary: blocker.summary };
  }

  const bundle = await getActiveBundleForEntry(catalogEntryId);
  if (!bundle) {
    const blocker = {
      code: "catalog_entry_not_published",
      category: "eligibility",
      summary: `Catalog entry "${entry.displayName || entry.name}" has no active published bundle.`,
    };
    await failExecutionRun(run.id, blocker);
    throw { runId: run.id, summary: blocker.summary };
  }

  const snapshot = isRecord(bundle.snapshot) ? bundle.snapshot : null;
  if (!snapshot || !isRecord(snapshot.config)) {
    const blocker = {
      code: "catalog_bundle_malformed",
      category: "configuration",
      summary: `Catalog entry "${entry.displayName || entry.name}" has a malformed published configuration.`,
    };
    await failExecutionRun(run.id, blocker, {
      publishBundleId: bundle.id,
      versionLabel: bundle.versionLabel,
      snapshotHash: bundle.snapshotHash,
    });
    throw { runId: run.id, summary: blocker.summary };
  }

  if (!resolveCallable(snapshot)) {
    const blocker = {
      code: "catalog_entry_not_callable",
      category: "eligibility",
      summary: `Catalog entry "${entry.displayName || entry.name}" is published but not callable.`,
    };
    await failExecutionRun(run.id, blocker, {
      publishBundleId: bundle.id,
      versionLabel: bundle.versionLabel,
      snapshotHash: bundle.snapshotHash,
    });
    throw { runId: run.id, summary: blocker.summary };
  }

  const providerId = extractProviderId(snapshot, entryRecord);
  if (!providerId) {
    const blocker = {
      code: "provider_not_resolved",
      category: "runtime_resolution",
      summary: `Catalog entry "${entry.displayName || entry.name}" does not resolve to a provider.`,
    };
    await failExecutionRun(run.id, blocker, {
      publishBundleId: bundle.id,
      versionLabel: bundle.versionLabel,
      snapshotHash: bundle.snapshotHash,
    });
    throw { runId: run.id, summary: blocker.summary };
  }

  const provider = getProviderRegistry().getProvider(providerId);
  if (!provider) {
    const blocker = {
      code: "provider_unavailable",
      category: "runtime_resolution",
      summary: `Resolved provider #${providerId} is not available for execution.`,
    };
    await failExecutionRun(run.id, blocker, {
      publishBundleId: bundle.id,
      versionLabel: bundle.versionLabel,
      snapshotHash: bundle.snapshotHash,
      providerId,
    });
    throw { runId: run.id, summary: blocker.summary };
  }

  const existingConversation = input.conversationId
    ? await getConversationById(input.conversationId)
    : undefined;
  if (input.conversationId && (!existingConversation || existingConversation.userId !== actorUserId)) {
    const blocker = {
      code: "conversation_not_accessible",
      category: "conversation",
      summary: "The requested conversation is not available to the current user.",
    };
    await failExecutionRun(run.id, blocker);
    throw { runId: run.id, summary: blocker.summary };
  }

  let conversationId = existingConversation?.id;
  if (!conversationId) {
    const workspaces = await getUserWorkspaces(actorUserId);
    const workspaceId = workspaces[0]?.id ?? 1;
    const conversation = await createConversation({
      workspaceId,
      userId: actorUserId,
      title: message.slice(0, 80),
    });
    conversationId = conversation.id;
  }

  await createMessage({
    conversationId,
    role: "user",
    content: message,
  });

  const modelId = extractModelId(snapshot, entryRecord);
  const sourceAgentId = extractSourceAgentId(snapshot, entryRecord);

  await updateExecutionRun(run.id, {
    conversationId,
    sourceAgentId,
    provider: provider.name,
    modelId,
    state: "running",
    metadata: {
      publishBundleId: bundle.id,
      versionLabel: bundle.versionLabel,
      snapshotHash: bundle.snapshotHash,
      entryType: entry.entryType,
      publishedAt: bundle.publishedAt?.toISOString?.() ?? null,
    },
  });

  return {
    runId: run.id,
    conversationId,
    provider,
    modelId,
    providerMessages: [{ role: "user", content: message }],
  };
}

export async function* executeCatalogChatStream(input: {
  catalogEntryId: number;
  actorUserId: number;
  message: string;
  triggerSource?: string;
  conversationId?: number;
}): AsyncGenerator<CatalogExecutionEvent> {
  const triggerSource = input.triggerSource ?? "catalog_chat";

  let context: CatalogExecutionContext;
  try {
    context = await prepareCatalogExecution({
      ...input,
      triggerSource,
    });
  } catch (error) {
    const runId = typeof error === "object" && error && "runId" in error ? Number((error as any).runId) : 0;
    const summary = typeof error === "object" && error && "summary" in error
      ? String((error as any).summary)
      : "Catalog execution failed before runtime started.";
    yield { type: "error", runId, error: summary };
    return;
  }

  const { runId, conversationId, provider, providerMessages, modelId } = context;
  yield { type: "run_started", runId, conversationId };

  let fullContent = "";
  let firstTokenRecorded = false;

  try {
    for await (const token of provider.generateStream({
      messages: providerMessages,
      model: modelId ?? undefined,
    })) {
      if (token.isComplete) continue;

      if (!firstTokenRecorded) {
        firstTokenRecorded = true;
        await updateExecutionRun(runId, { firstTokenAt: new Date() });
      }

      fullContent += token.content;
      yield { type: "token", content: token.content };
    }

    await createMessage({
      conversationId,
      role: "assistant",
      content: fullContent,
    });

    await updateExecutionRun(runId, {
      state: "completed",
      success: true,
      completedAt: new Date(),
    });

    yield { type: "complete", runId, conversationId, content: fullContent };
  } catch (error) {
    const summary = error instanceof Error ? error.message : "Catalog execution failed during runtime.";

    await updateExecutionRun(runId, {
      state: "failed",
      success: false,
      blockerCode: "runtime_execution_error",
      blockerCategory: "runtime",
      blockerSummary: summary,
      completedAt: new Date(),
    });

    yield { type: "error", runId, conversationId, error: summary };
  }
}

export async function getExecutionRunForUi(runId: number) {
  return await getExecutionRunById(runId);
}
