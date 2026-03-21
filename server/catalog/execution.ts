import { z } from "zod";
import { AppBlockerError, createAppBlockerError } from "../_core/blockers";
import { getProviderRegistry } from "../providers/registry";
import type { ILLMProvider } from "../providers/base";
import type { Message } from "../providers/types";
import { getAgent } from "../agents/db";
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
import {
  catalogAgentExecutionConfigSchema,
  hasPublishedCatalogTag,
  isCatalogEntryCallable,
  type CatalogAgentExecutionConfig,
} from "@shared/catalog-execution";

export interface CatalogAgentExecutionTarget {
  entry: Awaited<ReturnType<typeof getCatalogEntryById>> extends infer T ? Exclude<T, null> : never;
  bundle: NonNullable<Awaited<ReturnType<typeof getActiveBundleForEntry>>>;
  executionConfig: CatalogAgentExecutionConfig;
  sourceAgent: NonNullable<Awaited<ReturnType<typeof getAgent>>>;
}

export async function resolveCatalogAgentExecutionTarget(catalogEntryId: number): Promise<CatalogAgentExecutionTarget> {
  const entry = await getCatalogEntryById(catalogEntryId);
  if (!entry) {
    throw createAppBlockerError({
      code: "catalog_entry_missing",
      category: "dependency_block",
      title: "Catalog entry not found",
      summary: "This run cannot start because the selected Catalog entry no longer exists.",
      recommendedActions: [
        "Refresh the Catalog and select an entry that still exists.",
      ],
      context: { catalogEntryId },
    }, "NOT_FOUND");
  }

  if (entry.entryType !== "agent") {
    throw createAppBlockerError({
      code: "catalog_entry_not_agent",
      category: "validation_error",
      title: "This Catalog item cannot be run here",
      summary: "Only Catalog agent entries can be launched from the agent runtime.",
      details: [
        `Entry type: ${entry.entryType}`,
      ],
      recommendedActions: [
        "Open an agent entry instead, or use the workflow intended for this Catalog type.",
      ],
      context: { catalogEntryId, entryType: entry.entryType },
    }, "BAD_REQUEST");
  }

  const tags = Array.isArray(entry.tags) ? entry.tags : [];

  if (!hasPublishedCatalogTag(tags) || entry.reviewState !== "approved") {
    throw createAppBlockerError({
      code: "catalog_entry_not_published",
      category: "lifecycle_rule",
      title: "This agent is not published yet",
      summary: "This Catalog entry cannot run until it completes the full publish flow.",
      missingRequirements: [
        "Published Catalog status",
        "Approved publish-stage review",
      ],
      details: [
        `Current review state: ${entry.reviewState}`,
        `Published tag present: ${hasPublishedCatalogTag(tags) ? "yes" : "no"}`,
      ],
      recommendedActions: [
        "Finish the remaining Catalog review and publication steps, then try again.",
      ],
      context: { catalogEntryId, reviewState: entry.reviewState, tags },
    }, "CONFLICT");
  }

  if (entry.status !== "active") {
    throw createAppBlockerError({
      code: "catalog_entry_inactive",
      category: "lifecycle_rule",
      title: "This agent is not active",
      summary: "This Catalog entry cannot run because it is not currently active.",
      details: [
        `Current status: ${entry.status}`,
      ],
      recommendedActions: [
        "Activate the published Catalog entry, then try again.",
      ],
      context: { catalogEntryId, status: entry.status },
    }, "CONFLICT");
  }

  const bundle = await getActiveBundleForEntry(catalogEntryId);
  if (!bundle) {
    throw createAppBlockerError({
      code: "catalog_bundle_missing",
      category: "dependency_block",
      title: "Published runtime bundle is missing",
      summary: "This Catalog entry cannot run because it does not have an active published bundle.",
      recommendedActions: [
        "Publish the entry again so the runtime has an active bundle to execute.",
      ],
      context: { catalogEntryId },
    }, "CONFLICT");
  }

  const snapshot = bundle.snapshot as Record<string, unknown> | null;
  const config = (snapshot?.config as Record<string, unknown> | null) ?? entry.config ?? null;

  if (!isCatalogEntryCallable(config)) {
    throw createAppBlockerError({
      code: "catalog_entry_not_callable",
      category: "lifecycle_rule",
      title: "This agent is not enabled for runtime calls",
      summary: "This Catalog entry is published, but runtime calling is turned off for it.",
      recommendedActions: [
        "Enable runtime calling in the published Catalog configuration, then publish the updated entry.",
      ],
      context: { catalogEntryId, callable: config?.callable ?? null },
    }, "CONFLICT");
  }

  const parsed = catalogAgentExecutionConfigSchema.safeParse(config ?? {});
  if (!parsed.success) {
    throw createAppBlockerError({
      code: "catalog_execution_config_invalid",
      category: "validation_error",
      title: "This agent is missing runtime configuration",
      summary: "This Catalog entry cannot run because its published runtime configuration is incomplete or invalid.",
      fieldIssues: parsed.error.issues.map((issue) => ({
        field: issue.path.join(".") || "config",
        issue: issue.code,
        message: issue.message,
      })),
      missingRequirements: parsed.error.issues.map((issue) => issue.path.join(".") || "config"),
      recommendedActions: [
        "Fix the Catalog execution settings, publish a new version, then try again.",
      ],
      context: { catalogEntryId, bundleId: bundle.id },
      technicalDetails: parsed.error.message,
    }, "BAD_REQUEST");
  }

  const sourceAgent = await getAgent(parsed.data.sourceAgentId);
  if (!sourceAgent) {
    throw createAppBlockerError({
      code: "catalog_source_agent_missing",
      category: "dependency_block",
      title: "Source agent definition is missing",
      summary: "This Catalog entry cannot run because its source agent definition is no longer available.",
      recommendedActions: [
        "Restore the source agent or republish the Catalog entry from a valid agent definition.",
      ],
      context: { catalogEntryId, sourceAgentId: parsed.data.sourceAgentId },
    }, "NOT_FOUND");
  }

  return {
    entry,
    bundle,
    executionConfig: parsed.data,
    sourceAgent,
  };
}

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

function extractProviderId(snapshot: Record<string, unknown>, entry: Record<string, unknown>): number | null {
  const config = isRecord(snapshot.config) ? snapshot.config : {};
  const raw = snapshot.providerId ?? config.providerId ?? entry.providerId;
  return typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : null;
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

function toExecutionRunBlocker(error: unknown, fallback: Blocker): Blocker {
  if (error instanceof AppBlockerError) {
    return {
      code: error.blocker.code,
      category: error.blocker.category,
      summary: error.blocker.summary,
    };
  }

  return fallback;
}

async function prepareCatalogExecution(input: {
  catalogEntryId: number;
  actorUserId: number;
  message: string;
  triggerSource: string;
  conversationId?: number;
}): Promise<CatalogExecutionContext> {
  const { catalogEntryId, actorUserId, message, triggerSource } = input;

  const run = await createExecutionRun({
    catalogEntryId,
    actorUserId,
    triggerSource,
    state: "created",
  });

  await updateExecutionRun(run.id, { state: "validating" });

  let target: CatalogAgentExecutionTarget;
  try {
    target = await resolveCatalogAgentExecutionTarget(catalogEntryId);
  } catch (error) {
    const blocker = toExecutionRunBlocker(error, {
      code: "catalog_execution_unavailable",
      category: "technical_error",
      summary: "Catalog execution could not be prepared.",
    });
    await failExecutionRun(run.id, blocker);
    throw { runId: run.id, summary: blocker.summary };
  }

  const entryRecord = target.entry as unknown as Record<string, unknown>;
  const snapshot = isRecord(target.bundle.snapshot) ? target.bundle.snapshot : {};
  const providerId = extractProviderId(snapshot, entryRecord);
  if (!providerId) {
    const blocker = {
      code: "provider_not_resolved",
      category: "dependency_block",
      summary: `Catalog entry "${target.entry.displayName || target.entry.name}" does not resolve to a provider.`,
    };
    await failExecutionRun(run.id, blocker, {
      publishBundleId: target.bundle.id,
      versionLabel: target.bundle.versionLabel,
      snapshotHash: target.bundle.snapshotHash,
    });
    throw { runId: run.id, summary: blocker.summary };
  }

  const provider = getProviderRegistry().getProvider(providerId);
  if (!provider) {
    const blocker = {
      code: "provider_unavailable",
      category: "dependency_block",
      summary: `Resolved provider #${providerId} is not available for execution.`,
    };
    await failExecutionRun(run.id, blocker, {
      publishBundleId: target.bundle.id,
      versionLabel: target.bundle.versionLabel,
      snapshotHash: target.bundle.snapshotHash,
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
      category: "permission_error",
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

  const modelId = target.executionConfig.modelId ?? extractModelId(snapshot, entryRecord);

  await updateExecutionRun(run.id, {
    conversationId,
    sourceAgentId: target.sourceAgent.id,
    provider: provider.name,
    modelId,
    state: "running",
    metadata: {
      publishBundleId: target.bundle.id,
      versionLabel: target.bundle.versionLabel,
      snapshotHash: target.bundle.snapshotHash,
      entryType: target.entry.entryType,
      entryStatus: target.entry.status,
      reviewState: target.entry.reviewState,
      publishedAt: target.bundle.publishedAt?.toISOString?.() ?? null,
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
      blockerCategory: "technical_error",
      blockerSummary: summary,
      completedAt: new Date(),
    });

    yield { type: "error", runId, conversationId, error: summary };
  }
}

export async function getExecutionRunForUi(runId: number) {
  return await getExecutionRunById(runId);
}
