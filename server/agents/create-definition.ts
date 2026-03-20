import { eq } from "drizzle-orm";
import { agents } from "../../drizzle/schema";
import { getDb } from "../db";
import type { AgentCreateInput } from "@shared/schemas/agent-create";

// Agent definitions are AI Types platform-level assets.
// workspaceId is retained only for database compatibility and MUST NOT be used for ownership or filtering.
export const SYSTEM_WORKSPACE_ID = 0;

export function mapAgentCreateInputToInsert(input: AgentCreateInput, createdBy: number) {
  const tags = input.identity.tags.length > 0 ? input.identity.tags : null;
  const allowedTools = input.capabilities.hasToolAccess ? input.capabilities.allowedTools : [];

  return {
    workspaceId: SYSTEM_WORKSPACE_ID,
    createdBy,
    name: input.identity.name,
    description: input.identity.description || null,
    tags,
    roleClass: input.definition.roleClass,
    status: "draft" as const,
    systemPrompt: input.definition.systemPrompt,
    modelId: input.runtime.modelId,
    temperature: input.runtime.temperature.toFixed(2),
    hasDocumentAccess: input.capabilities.hasDocumentAccess,
    hasToolAccess: input.capabilities.hasToolAccess,
    allowedTools,
    capabilities: {
      tools: allowedTools,
      custom: input.capabilities.custom ?? {},
      anatomy: input.definition.anatomy ?? {},
    },
    limits: {
      maxTokens: input.limits.maxTokens,
      dailyBudget: input.limits.dailyBudget,
      sandboxConstraints: input.limits.sandboxConstraints ?? {},
      expiresAt: input.limits.expiresAt ?? null,
    },
    lifecycle: {
      state: "draft",
      version: input.identity.version,
      creationMode: input.definition.creationMode,
    },
  };
}

export async function createAgentDefinition(input: AgentCreateInput, createdBy: number) {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const [createdAgent] = await db
    .insert(agents)
    .values(mapAgentCreateInputToInsert(input, createdBy))
    .returning();

  return createdAgent;
}

export async function getAgentDefinitionByName(name: string) {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const rows = await db
    .select()
    .from(agents)
    .where(eq(agents.name, name))
    .limit(1);

  return rows[0] ?? null;
}
