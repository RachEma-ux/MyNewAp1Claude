import { getDb } from "../db";
import { agents, type Agent, type InsertAgent } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

/**
 * Agent Service
 * Handles sandbox agent creation, updates, and listing with governance validation
 */

export interface SandboxConstraints {
  externalCalls: boolean;
  persistentWrites: boolean;
  maxTokens: number;
  dailyBudget: number;
}

export interface CreateSandboxInput {
  workspaceId: number;
  name: string;
  version: string;
  description?: string;
  roleClass: "compliance" | "analysis" | "ideation";
  anatomy: Record<string, any>;
  localConstraints: Record<string, any>;
  createdBy: number;
}

export interface UpdateSandboxInput {
  anatomy: Record<string, any>;
}

export interface ListAgentsFilters {
  mode?: "sandbox" | "governed";
  governanceStatus?: "SANDBOX" | "GOVERNED_VALID" | "GOVERNED_RESTRICTED" | "GOVERNED_INVALIDATED";
  roleClass?: "compliance" | "analysis" | "ideation";
}

/**
 * Create a new sandbox agent with auto-expiry and containment validation
 */
export async function createSandbox(input: CreateSandboxInput): Promise<Agent> {
  // Validate sandbox constraints - must be contained
  const sandboxConstraints: SandboxConstraints = {
    externalCalls: false, // MUST be false for sandbox
    persistentWrites: false, // MUST be false for sandbox
    maxTokens: input.localConstraints.maxTokens || 2000,
    dailyBudget: input.localConstraints.dailyBudget || 100,
  };

  // Ensure no external calls or persistent writes
  if (input.localConstraints.externalCalls === true) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "CONTAINMENT_VIOLATION: Sandbox agents cannot make external calls",
    });
  }

  if (input.localConstraints.persistentWrites === true) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "CONTAINMENT_VIOLATION: Sandbox agents cannot make persistent writes",
    });
  }

  // Set auto-expiry timestamp (30 days from now)
  const autoExpiryHours = 30 * 24; // 30 days
  const expiresAt = new Date(Date.now() + autoExpiryHours * 60 * 60 * 1000);

  // Create sandbox agent
  const agentData: InsertAgent = {
    workspaceId: input.workspaceId,
    name: input.name,
    description: input.description,
    systemPrompt: input.anatomy.systemPrompt || "You are a helpful AI assistant.",
    roleClass: input.roleClass,
    createdBy: input.createdBy,
    mode: "sandbox",
    governanceStatus: "SANDBOX",
    anatomy: input.anatomy,
    localConstraints: {
      ...input.localConstraints,
      ...sandboxConstraints,
    },
    sandboxConstraints: sandboxConstraints,
    expiresAt,
  };

  const db = getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  const [agent] = await db.insert(agents).values(agentData).returning();

  return agent;
}

/**
 * Update sandbox agent anatomy
 * Only allows updates to anatomy fields, not governance fields
 */
export async function updateSandbox(
  agentId: number,
  updates: UpdateSandboxInput
): Promise<Agent> {
  // Fetch existing agent
  const db = getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  const [existingAgent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!existingAgent) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Agent not found",
    });
  }

  // Verify agent is in sandbox mode
  if (existingAgent.mode !== "sandbox") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Cannot update governed agents through sandbox update endpoint",
    });
  }

  // Check if sandbox has expired
  if (existingAgent.expiresAt && new Date(existingAgent.expiresAt) < new Date()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "SANDBOX_EXPIRED: Cannot update expired sandbox agent",
    });
  }

  // Update anatomy only
  await db
    .update(agents)
    .set({
      anatomy: updates.anatomy,
      updatedAt: new Date(),
    })
    .where(eq(agents.id, agentId));

  const [updatedAgent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  return updatedAgent;
}

/**
 * List agents with optional filters
 * Returns agents with governance status badges
 */
export async function listAgents(
  workspaceId: number,
  filters?: ListAgentsFilters
): Promise<Agent[]> {
  const db = getDb();
  if (!db) return [];

  // Build filter conditions
  const conditions = [eq(agents.workspaceId, workspaceId)];

  if (filters?.mode) {
    conditions.push(eq(agents.mode, filters.mode));
  }

  if (filters?.governanceStatus) {
    conditions.push(eq(agents.governanceStatus, filters.governanceStatus));
  }

  if (filters?.roleClass) {
    conditions.push(eq(agents.roleClass, filters.roleClass));
  }

  const agentList = await db
    .select()
    .from(agents)
    .where(and(...conditions));

  return agentList;
}

/**
 * Get single agent by ID
 */
export async function getAgent(agentId: number): Promise<Agent | null> {
  const db = getDb();
  if (!db) return null;

  const [agent] = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);

  return agent || null;
}

/**
 * Delete agent
 */
export async function deleteAgent(agentId: number): Promise<void> {
  const db = getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

  await db.delete(agents).where(eq(agents.id, agentId));
}

/**
 * Check if sandbox has expired
 */
export function isSandboxExpired(agent: Agent): boolean {
  if (!agent.expiresAt) return false;
  return new Date(agent.expiresAt) < new Date();
}

/**
 * Validate sandbox containment
 */
export function validateSandboxContainment(agent: Agent): {
  valid: boolean;
  violations: string[];
} {
  const violations: string[] = [];

  const constraints = agent.sandboxConstraints as SandboxConstraints | null;

  if (!constraints) {
    violations.push("Missing sandbox constraints");
    return { valid: false, violations };
  }

  if (constraints.externalCalls === true) {
    violations.push("CONTAINMENT_VIOLATION: External calls not allowed in sandbox");
  }

  if (constraints.persistentWrites === true) {
    violations.push("CONTAINMENT_VIOLATION: Persistent writes not allowed in sandbox");
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
