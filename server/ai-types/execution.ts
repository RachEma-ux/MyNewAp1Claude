import { z } from "zod";
import { AppBlockerError, createAppBlockerError } from "../_core/blockers";
import { getProviderPort, getAgentPort } from "./ports";
import {
  createExecutionRun,
  getActiveBundleForEntry,
  getCatalogEntryById,
  getExecutionRunById,
  updateExecutionRun,
} from "./db";
import {
  createConversation,
  createMessage,
  getConversationById,
  getUserWorkspaces,
} from "../db";
import {
  catalogAgentExecutionConfigSchema,
  hasPublishedCatalogTag,
  isCatalogEntryCallable,
  isExecutableEntryType,
  type CatalogAgentExecutionConfig,
} from "@shared/catalog-execution";
import {
  isServiceBasedAgent,
  resolveServiceAgent,
  type ServiceRuntimeTarget,
} from "./service-runtime";

/** Message type used by the execution pipeline */
type Message = { role: "system" | "user" | "assistant"; content: string };

export interface CatalogAgentExecutionTarget {
  entry: Awaited<ReturnType<typeof getCatalogEntryById>> extends infer T ? Exclude<T, null> : never;
  bundle: NonNullable<Awaited<ReturnType<typeof getActiveBundleForEntry>>>;
  executionConfig: CatalogAgentExecutionConfig;
  sourceAgent: { id: number; name: string; [key: string]: unknown };
}

/**
 * Execution target for service-backed agents.
 * These run directly via HTTP dispatch, not through LLM provider streaming.
 */
export interface ServiceAgentExecutionTarget {
  kind: "service";
  entry: Awaited<ReturnType<typeof getCatalogEntryById>> extends infer T ? Exclude<T, null> : never;
  serviceTarget: ServiceRuntimeTarget;
}

/**
 * Resolve a service-backed agent entry into an execution target.
 * Service agents bypass the bundle/sourceAgent/provider gates — they dispatch
 * directly to their HTTP service via config.runtime metadata.
 *
 * Gate sequence for service agents:
 *   1. Entry must exist and be type "agent"
 *   2. Entry must be active
 *   3. config.runtime.kind === "service" must be present
 *   4. Service runtime must resolve (URL, health endpoint, etc.)
 */
export async function resolveServiceAgentExecutionTarget(
  catalogEntryId: number,
): Promise<ServiceAgentExecutionTarget | null> {
  const entry = await getCatalogEntryById(catalogEntryId);
  if (!entry) return null;
  if (!isExecutableEntryType(entry.entryType)) return null;

  const config = entry.config as Record<string, unknown> | null;
  if (!isServiceBasedAgent(config)) return null;

  // Service agents must be active
  if (entry.status !== "active") {
    const tags = Array.isArray(entry.tags) ? entry.tags : [];
    const hasPublishedTag = tags.includes("published");
    const details = [`Current status: ${entry.status}`];
    const actions: string[] = [];
    if (hasPublishedTag && entry.status === "draft") {
      details.push("Entry has the \"published\" tag but status is still \"draft\" — activation was never completed.");
      actions.push("Complete the activation step in the Catalog lifecycle (Register Review → Activate), then try again.");
    } else {
      actions.push("Activate the Catalog entry, then try again.");
    }
    throw createAppBlockerError({
      code: "catalog_entry_inactive",
      category: "lifecycle_rule",
      title: "This service agent is not active",
      summary: hasPublishedTag
        ? `This entry has publish approval but is not active (status: ${entry.status}). Activation is required before execution.`
        : "This service-backed Catalog entry cannot run because it is not currently active.",
      details,
      recommendedActions: actions,
      context: { catalogEntryId, status: entry.status, tags },
    }, "CONFLICT");
  }

  // Resolve service runtime target
  const serviceTarget = await resolveServiceAgent(catalogEntryId);
  if (!serviceTarget) {
    throw createAppBlockerError({
      code: "service_runtime_not_resolved",
      category: "dependency_block",
      title: "Service runtime could not be resolved",
      summary: "This service-backed agent has runtime metadata but could not resolve to a concrete service target.",
      recommendedActions: [
        "Verify the config.runtime block has valid serviceUrlEnv, serviceUrlDefault, and endpoints.",
      ],
      context: { catalogEntryId },
    }, "CONFLICT");
  }

  return { kind: "service", entry: entry as any, serviceTarget };
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

  if (!isExecutableEntryType(entry.entryType)) {
    throw createAppBlockerError({
      code: "catalog_entry_not_executable",
      category: "validation_error",
      title: "This Catalog item cannot be run here",
      summary: "Only executable Catalog entries (agent, bot) can be launched from the runtime.",
      details: [
        `Entry type: ${entry.entryType}`,
      ],
      recommendedActions: [
        "Open an agent or bot entry instead, or use the workflow intended for this Catalog type.",
      ],
      context: { catalogEntryId, entryType: entry.entryType },
    }, "BAD_REQUEST");
  }

  // Service-backed agents have their own execution path — they should not
  // reach this LLM-chat resolver. If they do, give a clear error.
  const entryConfig = entry.config as Record<string, unknown> | null;
  if (isServiceBasedAgent(entryConfig)) {
    throw createAppBlockerError({
      code: "service_agent_wrong_path",
      category: "validation_error",
      title: "Service agent cannot use LLM execution path",
      summary: "This is a service-backed agent. Use the service execution path instead of the LLM-chat path.",
      recommendedActions: [
        "This agent runs via its dedicated HTTP service, not through LLM streaming.",
      ],
      context: { catalogEntryId },
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
      summary: hasPublishedCatalogTag(tags)
        ? `This entry has publish approval but is not active (status: ${entry.status}). Activation is required before execution.`
        : "This Catalog entry cannot run because it is not currently active.",
      details: [
        `Current status: ${entry.status}`,
        ...(hasPublishedCatalogTag(tags) && entry.status === "draft"
          ? ["Entry has the \"published\" tag but status is still \"draft\" — activation was never completed."]
          : []),
      ],
      recommendedActions: [
        hasPublishedCatalogTag(tags) && entry.status === "draft"
          ? "Complete the activation step in the Catalog lifecycle (Register Review → Activate), then try again."
          : "Activate the published Catalog entry, then try again.",
      ],
      context: { catalogEntryId, status: entry.status, tags },
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

  // Use agent port instead of direct import
  const agentPort = getAgentPort();
  const sourceAgent = await agentPort.getAgent(parsed.data.sourceAgentId);
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
  provider: any;
  modelId: string | null;
  temperature: number | null;
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

  // Use provider port instead of direct import
  const providerRegistry = getProviderPort().getRegistry();
  const provider = providerRegistry.getProvider(String(providerId));
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

  const systemPrompt = target.executionConfig.systemPrompt;
  const providerMessages: Message[] = [
    ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
    { role: "user" as const, content: message },
  ];

  return {
    runId: run.id,
    conversationId,
    provider,
    modelId,
    temperature: target.executionConfig.temperature ?? null,
    providerMessages,
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

  const { runId, conversationId, provider, providerMessages, modelId, temperature } = context;
  yield { type: "run_started", runId, conversationId };

  let fullContent = "";
  let firstTokenRecorded = false;

  try {
    for await (const token of provider.generateStream({
      messages: providerMessages,
      model: modelId ?? undefined,
      temperature: temperature ?? undefined,
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

/**
 * Resolved reasoning LLM context from the agent's config.agent.defaultReasoningLlmRef.
 * Passed to service adapters so they can use the admin-selected LLM.
 */
export interface ReasoningLlmContext {
  catalogEntryId: number;
  catalogEntryName: string;
  provider?: string;
  model?: string;
  apiBaseUrl?: string;
}

/**
 * Execute a service-backed agent via HTTP dispatch.
 * This bypasses the LLM-chat pipeline entirely — dispatches the user message
 * to the service's translate endpoint and streams back the result.
 */
export async function* executeServiceAgentStream(input: {
  catalogEntryId: number;
  actorUserId: number;
  message: string;
  triggerSource?: string;
  reasoningLlm?: ReasoningLlmContext;
}): AsyncGenerator<CatalogExecutionEvent> {
  const triggerSource = input.triggerSource ?? "catalog_service";

  // Create execution run for observability
  const run = await createExecutionRun({
    catalogEntryId: input.catalogEntryId,
    actorUserId: input.actorUserId,
    triggerSource,
    state: "created",
  });

  await updateExecutionRun(run.id, { state: "validating" });

  // Resolve service target
  let serviceTarget: ServiceAgentExecutionTarget;
  try {
    const result = await resolveServiceAgentExecutionTarget(input.catalogEntryId);
    if (!result) {
      throw new Error("Entry is not a service-backed agent");
    }
    serviceTarget = result;
  } catch (error) {
    const blocker = toExecutionRunBlocker(error, {
      code: "service_resolution_failed",
      category: "dependency_block",
      summary: "Service agent runtime could not be resolved.",
    });
    await failExecutionRun(run.id, blocker);
    yield { type: "error", runId: run.id, error: blocker.summary };
    return;
  }

  await updateExecutionRun(run.id, {
    state: "running",
    provider: serviceTarget.serviceTarget.serviceName,
    modelId: null,
    metadata: {
      executionKind: "service",
      serviceName: serviceTarget.serviceTarget.serviceName,
      serviceKind: serviceTarget.serviceTarget.serviceKind,
      serviceUrl: serviceTarget.serviceTarget.serviceUrl,
      entryType: serviceTarget.entry.entryType,
      entryStatus: serviceTarget.entry.status,
    },
  });

  yield { type: "run_started", runId: run.id };

  // Dispatch to the service's translate endpoint
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const requestBody: Record<string, unknown> = { rawText: input.message };
    if (input.reasoningLlm) {
      requestBody.llmOverride = {
        provider: input.reasoningLlm.provider,
        model: input.reasoningLlm.model,
        apiBaseUrl: input.reasoningLlm.apiBaseUrl,
        catalogRef: input.reasoningLlm.catalogEntryName,
      };
    }

    const resp = await fetch(serviceTarget.serviceTarget.translateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      throw new Error(`Service returned ${resp.status}: ${body.slice(0, 200)}`);
    }

    const result = await resp.json();
    const content = typeof result.renderedMarkdown === "string"
      ? result.renderedMarkdown
      : JSON.stringify(result, null, 2);

    await updateExecutionRun(run.id, { firstTokenAt: new Date() });
    yield { type: "token", content };

    await updateExecutionRun(run.id, {
      state: "completed",
      success: true,
      completedAt: new Date(),
    });

    yield { type: "complete", runId: run.id, conversationId: 0, content };
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : "Service agent execution failed.";
    const isOffline = rawMessage.includes("ECONNREFUSED") || rawMessage.includes("fetch failed") || rawMessage.includes("AbortError") || rawMessage.includes("timed out");
    const summary = isOffline
      ? `Service offline at ${serviceTarget.serviceTarget.serviceUrl} — ${rawMessage}`
      : rawMessage;

    await updateExecutionRun(run.id, {
      state: "failed",
      success: false,
      blockerCode: "service_execution_error",
      blockerCategory: "technical_error",
      blockerSummary: summary,
      completedAt: new Date(),
    });

    yield { type: "error", runId: run.id, error: summary };
  }
}
