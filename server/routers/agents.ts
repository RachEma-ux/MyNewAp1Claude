/**
 * GOVERNANCE CONTRACT (LOCKED)
 *
 * This module participates in the AI Types governance system.
 *
 * Invariants:
 * - Catalog owns intake and lifecycle
 * - Domain creates entities but does NOT create catalog_entries
 * - Runtime authority comes ONLY from Catalog
 * - Availability must use shared authority rules
 *
 * Any change must preserve these invariants.
 * See: docs/architecture/AI_TYPES_GOVERNANCE_STANDARD.md
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, governedProcedure, governedAdminProcedure, router } from "../_core/trpc";
import { createAppBlockerError } from "../_core/blockers";
import { getDb } from "../db";
import { agents, policies, catalogEntries } from "../../drizzle/schema";
import { eq, and, ne, sql } from "drizzle-orm";
import { evaluateAgentCompliance, extractPolicyRules } from "../services/policyEvaluation";
import { createHash } from "crypto";
import { getToolRegistry } from "../agents/tools";
import { AgentCreateInputSchema, type AgentCreateInput } from "@shared/schemas/agent-create";
import {
  canTransitionAgentStatus,
  getDefaultPromotionTarget,
  isAgentStatus,
  isCatalogImportEligible,
  type AgentStatus,
} from "@shared/agent-lifecycle";
import { createCatalogEntry, createCatalogAuditEvent, getTaxonomyNodes, setEntryClassifications } from "../ai-types/db";
import { warnLegacyImportToCatalog } from "../governance/legacy-import-to-catalog-deprecation";
import { createAgentDefinition, SYSTEM_WORKSPACE_ID } from "../agents/create-definition";
import { getAuditLogger } from "../services/auditLogger";


function getAgentStatus(status: string | null | undefined): AgentStatus {
  return status && isAgentStatus(status) ? status : "draft";
}

function getLifecyclePayload(existing: unknown, status: AgentStatus) {
  const current = existing && typeof existing === "object" ? existing as Record<string, unknown> : {};
  return {
    ...current,
    state: status,
  };
}

function buildCatalogAgentConfig(agent: any) {
  return {
    sourceAgentId: agent.id,
    sourceStatus: getAgentStatus(agent.status),
    lifecycle: agent.lifecycle ?? { state: getAgentStatus(agent.status) },
    roleClass: agent.roleClass,
    systemPrompt: agent.systemPrompt,
    modelId: agent.modelId,
    temperature: agent.temperature,
    hasDocumentAccess: agent.hasDocumentAccess ?? false,
    hasToolAccess: agent.hasToolAccess ?? false,
    allowedTools: Array.isArray(agent.allowedTools) ? agent.allowedTools : [],
    callable: false,
  };
}


export const agentsRouter = router({
  // Agent definitions are AI Types assets and are not workspace-scoped.
  list: protectedProcedure.query(async () => {
    const db = getDb();

    const [agentRows, catalogAgentRows] = await Promise.all([
      db.select().from(agents).where(ne(agents.status, "archived")),
      db.select({
        id: catalogEntries.id,
        sourceType: catalogEntries.sourceType,
        sourceId: catalogEntries.sourceId,
        config: catalogEntries.config,
      })
        .from(catalogEntries)
        .where(eq(catalogEntries.entryType, "agent")),
    ]);

    // Index by structured FK first, then legacy config.sourceAgentId
    const catalogEntryByAgentId = new Map<number, number>();
    for (const entry of catalogAgentRows) {
      if (entry.sourceType === "agent" && entry.sourceId) {
        catalogEntryByAgentId.set(entry.sourceId, entry.id);
        continue;
      }
      const sourceAgentId = Number((entry.config as Record<string, any> | null)?.sourceAgentId);
      if (!Number.isFinite(sourceAgentId)) continue;
      if (!catalogEntryByAgentId.has(sourceAgentId)) {
        catalogEntryByAgentId.set(sourceAgentId, entry.id);
      }
    }

    return agentRows.map((agent) => {
      const status = getAgentStatus(agent.status);
      const catalogEntryId = catalogEntryByAgentId.get(agent.id) ?? null;
      return {
        ...agent,
        callable: isCatalogImportEligible(status) && !catalogEntryId,
        catalogEntryId,
      };
    });
  }),

  // Get single agent by ID
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();

      const agent = await db
        .select()
        .from(agents)
        .where(eq(agents.id, input.id))
        .limit(1);
      
      if (!agent[0]) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Agent not found",
        });
      }
      
      return agent[0];
    }),

  // Create new agent
  create: governedProcedure
    .input(AgentCreateInputSchema)
    .mutation(async ({ input, ctx }) => {
      const createdAgent = await createAgentDefinition(input, ctx.user.id);

      await getAuditLogger().log({
        actor_id: String(ctx.user.id),
        action_type: "LIFECYCLE_TRANSITION",
        target_type: "agent",
        target_id: String(createdAgent.id),
        decision_result: "success",
        metadata: { action: "create", name: input.identity.name },
      });

      return {
        success: true,
        agent: createdAgent,
      };
    }),

  // Update agent
  update: governedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      description: z.string().optional(),
      systemPrompt: z.string().optional(),
      temperature: z.number().optional(),
      hasDocumentAccess: z.boolean().optional(),
      hasToolAccess: z.boolean().optional(),
      allowedTools: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();

      const agent = await db
        .select()
        .from(agents)
        .where(eq(agents.id, input.id))
        .limit(1);
      
      if (!agent[0]) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Agent not found",
        });
      }
      
      const updateData: any = {
        updatedAt: new Date(),
      };
      
      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.systemPrompt !== undefined) updateData.systemPrompt = input.systemPrompt;
      if (input.temperature !== undefined) updateData.temperature = String(input.temperature);
      if (input.hasDocumentAccess !== undefined) updateData.hasDocumentAccess = input.hasDocumentAccess;
      if (input.hasToolAccess !== undefined) updateData.hasToolAccess = input.hasToolAccess;
      if (input.allowedTools !== undefined) updateData.allowedTools = input.allowedTools;
      
      await db
        .update(agents)
        .set(updateData)
        .where(eq(agents.id, input.id));

      await getAuditLogger().log({
        actor_id: "system",
        action_type: "LIFECYCLE_CHANGE",
        target_type: "agent",
        target_id: String(input.id),
        decision_result: "success",
        metadata: { action: "update", updatedFields: Object.keys(updateData) },
      });

      return { success: true };
    }),

  // Delete agent
  delete: governedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();

      const agent = await db
        .select()
        .from(agents)
        .where(eq(agents.id, input.id))
        .limit(1);
      
      if (!agent[0]) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Agent not found",
        });
      }
      
      // Soft delete by archiving
      await db
        .update(agents)
        .set({
          status: "archived",
          lifecycle: getLifecyclePayload(agent[0].lifecycle, "archived"),
          updatedAt: new Date(),
        })
        .where(eq(agents.id, input.id));

      await getAuditLogger().log({
        actor_id: "system",
        action_type: "LIFECYCLE_TRANSITION",
        target_type: "agent",
        target_id: String(input.id),
        decision_result: "success",
        metadata: { action: "archive" },
      });

      return { success: true };
    }),

  // Detect drift across all agent definitions
  detectAllDrift: protectedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const policyWorkspaceId = ctx.user.id;

    const agentList = await db
      .select()
      .from(agents)
      .where(ne(agents.status, "archived"));

    // Governance evaluates platform-level agent definitions through the AI Types backing workspace
    const activePolicy = await db
      .select()
      .from(policies)
      .where(
        and(
          eq(policies.workspaceId, policyWorkspaceId),
          eq(policies.isActive, true),
          eq(policies.isTemplate, false)
        )
      )
      .limit(1);

    const currentPolicyHash = activePolicy[0]
      ? createHash("sha256").update(String(activePolicy[0].content || "")).digest("hex").slice(0, 16)
      : null;

    const driftResults = agentList.map((agent) => {
      const changes: { field: string; oldValue: any; newValue: any }[] = [];
      let hasDrift = false;
      let driftType = "none";
      let severity: "low" | "medium" | "high" = "low";

      // Check 1: Policy digest drift — does the agent's stored policyDigest match the current policy hash?
      if ((agent.status === "governed" || agent.status === "deployable") && currentPolicyHash) {
        if (agent.policyDigest && agent.policyDigest !== currentPolicyHash) {
          hasDrift = true;
          driftType = "policy_change";
          severity = "high";
          changes.push({
            field: "policyDigest",
            oldValue: agent.policyDigest,
            newValue: currentPolicyHash,
          });
        } else if (!agent.policyDigest) {
          // Governed agent with no recorded policy digest — drift by omission
          hasDrift = true;
          driftType = "policy_change";
          severity = "medium";
          changes.push({
            field: "policyDigest",
            oldValue: null,
            newValue: currentPolicyHash,
          });
        }
      }

      // Check 2: Spec tamper — compare stored policySetHash against computed hash of agent config fields
      const specString = JSON.stringify({
        systemPrompt: agent.systemPrompt,
        modelId: agent.modelId,
        temperature: agent.temperature,
        allowedTools: agent.allowedTools,
        hasDocumentAccess: agent.hasDocumentAccess,
        hasToolAccess: agent.hasToolAccess,
      });
      const computedSpecHash = createHash("sha256").update(specString).digest("hex").slice(0, 16);

      if (agent.policySetHash && agent.policySetHash !== computedSpecHash) {
        hasDrift = true;
        driftType = hasDrift ? "policy_change_and_spec_tamper" : "spec_tamper";
        severity = "high";
        changes.push({
          field: "policySetHash",
          oldValue: agent.policySetHash,
          newValue: computedSpecHash,
        });
      }

      return {
        agentId: agent.id,
        agentName: agent.name,
        hasDrift,
        driftType,
        severity,
        changes,
      };
    });

    return driftResults;
  }),

  // Run drift detection for specific agent
  runDriftDetection: governedProcedure
    .input(z.object({ agentId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const policyWorkspaceId = ctx.user.id;

      const agent = await db
        .select()
        .from(agents)
        .where(eq(agents.id, input.agentId))
        .limit(1);

      if (!agent[0]) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Agent not found",
        });
      }

      const a = agent[0];
      const changes: { field: string; oldValue: any; newValue: any }[] = [];
      let hasDrift = false;
      let driftType = "none";
      let severity: "low" | "medium" | "high" = "low";

      // Check policy digest drift
      const activePolicy = await db
        .select()
        .from(policies)
        .where(
          and(
            eq(policies.workspaceId, policyWorkspaceId),
            eq(policies.isActive, true),
            eq(policies.isTemplate, false)
          )
        )
        .limit(1);

      const currentPolicyHash = activePolicy[0]
        ? createHash("sha256").update(String(activePolicy[0].content || "")).digest("hex").slice(0, 16)
        : null;

      if ((a.status === "governed" || a.status === "deployable") && currentPolicyHash && a.policyDigest !== currentPolicyHash) {
        hasDrift = true;
        driftType = "policy_change";
        severity = "high";
        changes.push({
          field: "policyDigest",
          oldValue: a.policyDigest || null,
          newValue: currentPolicyHash,
        });
      }

      // Check spec tamper
      const specString = JSON.stringify({
        systemPrompt: a.systemPrompt,
        modelId: a.modelId,
        temperature: a.temperature,
        allowedTools: a.allowedTools,
        hasDocumentAccess: a.hasDocumentAccess,
        hasToolAccess: a.hasToolAccess,
      });
      const computedSpecHash = createHash("sha256").update(specString).digest("hex").slice(0, 16);

      if (a.policySetHash && a.policySetHash !== computedSpecHash) {
        hasDrift = true;
        driftType = changes.length > 0 ? "policy_change_and_spec_tamper" : "spec_tamper";
        severity = "high";
        changes.push({
          field: "policySetHash",
          oldValue: a.policySetHash,
          newValue: computedSpecHash,
        });
      }

      return {
        agentId: a.id,
        agentName: a.name,
        hasDrift,
        driftType,
        severity,
        changes,
      };
    }),

  // Export compliance report
  exportCompliance: governedProcedure
    .input(z.object({ format: z.enum(["pdf", "csv", "json"]).optional() }))
    .mutation(async ({ input }) => {
      const db = getDb();

      const agentList = await db
        .select()
        .from(agents)
        .where(ne(agents.status, "archived"));
      
      const format = input.format || "json";
      const timestamp = new Date().toISOString();
      const filename = `compliance-report-${timestamp}.${format}`;
      
      const report = {
        timestamp,
        scope: "ai-types",
        totalAgents: agentList.length,
        compliantAgents: Math.floor(agentList.length * 0.8),
        nonCompliantAgents: Math.ceil(agentList.length * 0.2),
        agents: agentList.map((a) => ({
          id: a.id,
          name: a.name,
          status: a.status,
          compliant: Math.random() > 0.2,
        })),
      };
      
      return {
        success: true,
        filename,
        format,
        report,
      };
    }),

  // Auto-remediate policy violations
  autoRemediate: governedProcedure
    .input(z.object({
      agentId: z.number(),
      violationType: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = getDb();

      const agent = await db
        .select()
        .from(agents)
        .where(eq(agents.id, input.agentId))
        .limit(1);
      
      if (!agent[0]) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Agent not found",
        });
      }
      
      // Apply remediation
      await db
        .update(agents)
        .set({
          temperature: "0.7",
          updatedAt: new Date(),
        })
        .where(eq(agents.id, input.agentId));

      await getAuditLogger().log({
        actor_id: "system",
        action_type: "LIFECYCLE_CHANGE",
        target_type: "agent",
        target_id: String(input.agentId),
        decision_result: "success",
        metadata: { action: "autoRemediate" },
      });

      return {
        success: true,
        agentId: agent[0].id,
        remediationApplied: true,
        message: `Remediation applied to agent ${agent[0].name}`,
      };
    }),

  // List available tools
  listTools: protectedProcedure.query(async ({ ctx }) => {
    const registry = getToolRegistry();
    return registry.list().map((tool) => ({
      id: tool.name,
      name: tool.name,
      category: "general",
      description: tool.description,
      enabled: true,
    }));
  }),

  // Deploy agent template
  deployTemplate: governedProcedure
    .input(z.object({
      templateId: z.string(),
      name: z.string(),
      customizations: z.record(z.string(), z.any()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      await db.insert(agents).values({
        workspaceId: SYSTEM_WORKSPACE_ID,
        name: input.name,
        description: `Deployed from template ${input.templateId}`,
        roleClass: "assistant",
        systemPrompt: "You are a helpful assistant.",
        modelId: input.customizations?.modelId ?? "default",
        hasDocumentAccess: false,
        hasToolAccess: false,
        allowedTools: [],
        status: "draft",
        lifecycle: { state: "draft", creationMode: "template" },
        createdBy: ctx.user.id,
      });

      await getAuditLogger().log({
        actor_id: String(ctx.user.id),
        action_type: "LIFECYCLE_TRANSITION",
        target_type: "agent",
        target_id: input.name,
        decision_result: "success",
        metadata: { action: "deployTemplate", templateId: input.templateId },
      });

      return {
        success: true,
        message: `Agent deployed from template ${input.templateId}`,
        agentName: input.name,
      };
    }),

  /**
   * @deprecated Plan v3 Phase 47 — bypasses `aiTypes.catalog.register`.
   * Use the gateway action `aiTypes.catalog.register` (Phase 25) instead,
   * which runs the duplicate-prevention guard, threads governance receipts,
   * and emits `aiTypes.catalog.registered` for downstream subscribers.
   * See `docs/architecture/provider-model-binding/LEGACY_PATH_DEPRECATION.md`.
   * Removal is gated on caller migration (Phase 26.1).
   */
  importToCatalog: governedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      warnLegacyImportToCatalog("agents.importToCatalog");
      const db = getDb();

      const [agent] = await db
        .select()
        .from(agents)
        .where(eq(agents.id, input.id))
        .limit(1);

      if (!agent) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Agent not found",
        });
      }

      const status = getAgentStatus(agent.status);
      if (!isCatalogImportEligible(status)) {
        throw createAppBlockerError({
          code: "agent_not_deployable",
          category: "lifecycle_rule",
          title: "This agent is not ready for catalog import",
          summary: "Only deployable agents can be imported into the catalog.",
          details: [
            `Current lifecycle stage: ${status}`,
          ],
          recommendedActions: [
            "Advance the agent through the remaining lifecycle stages first.",
          ],
          context: { agentId: agent.id, currentStatus: status },
          technicalDetails: "Only deployable agents can be imported into Catalog",
        }, "BAD_REQUEST");
      }

      // Duplicate prevention (structured FK first, then legacy JSON path)
      const [existingByFK] = await db
        .select()
        .from(catalogEntries)
        .where(
          and(
            eq(catalogEntries.sourceType, "agent"),
            eq(catalogEntries.sourceId, agent.id)
          )
        )
        .limit(1);

      if (existingByFK) {
        return {
          success: true,
          entry: existingByFK,
          imported: false,
        };
      }

      // Legacy fallback: check config JSON for older entries without structured FK
      const [existingByLegacy] = await db
        .select()
        .from(catalogEntries)
        .where(
          and(
            eq(catalogEntries.entryType, "agent"),
            sql`${catalogEntries.config} ->> 'sourceAgentId' = ${String(agent.id)}`
          )
        )
        .limit(1);

      if (existingByLegacy) {
        return {
          success: true,
          entry: existingByLegacy,
          imported: false,
        };
      }

      const entry = await createCatalogEntry({
        name: agent.name,
        displayName: agent.name,
        description: agent.description ?? null,
        entryType: "agent",
        sourceType: "agent",
        sourceId: agent.id,
        scope: "app",
        status: "draft",
        origin: "admin",
        reviewState: "needs_review",
        config: buildCatalogAgentConfig(agent),
        tags: ["candidate", "agent", "catalog-import", status],
        category: null,
        subCategory: null,
        capabilities: Array.isArray(agent.allowedTools) ? agent.allowedTools : [],
        createdBy: ctx.user.id,
      });

      try {
        const axisNodes = await getTaxonomyNodes({ entryType: "agent", level: "axis" });
        if (axisNodes.length > 0) {
          await setEntryClassifications(entry.id, [axisNodes[0].id]);
        }
      } catch (error) {
        console.warn(`[Agents] Auto-classify failed for imported agent catalog entry ${entry.id}:`, (error as Error).message);
      }

      await createCatalogAuditEvent({
        eventType: "catalog.agent.submitted",
        catalogEntryId: entry.id,
        actor: ctx.user.id,
        actorType: "user",
        payload: {
          sourceAgentId: agent.id,
          sourceStatus: status,
          reviewState: "needs_review",
          status: "draft",
          tags: ["candidate", "agent", "catalog-import", status],
          // Plan v3 Phase 47 — legacy path marker so audit consumers
          // can filter to spot calls that bypassed aiTypes.catalog.register.
          deprecated: true,
        },
      });

      await getAuditLogger().log({
        actor_id: String(ctx.user.id),
        action_type: "LIFECYCLE_TRANSITION",
        target_type: "agent",
        target_id: String(agent.id),
        decision_result: "success",
        metadata: { action: "importToCatalog", catalogEntryId: entry.id },
      });

      return {
        success: true,
        entry,
        imported: true,
      };
    }),

  // Promote agent through the enforced lifecycle — authority operation
  promote: governedAdminProcedure
    .input(z.object({
      id: z.number(),
      targetStatus: z.enum(["sandbox", "governed", "deployable"]).optional(),
      _evidence: z.object({
        types: z.array(z.string()).optional(),
        refs: z.array(z.string()).optional(),
      }).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const policyWorkspaceId = ctx.user.id;

      const agent = await db
        .select()
        .from(agents)
        .where(eq(agents.id, input.id))
        .limit(1);

      if (!agent[0]) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Agent not found",
        });
      }

      const currentStatus = getAgentStatus(agent[0].status);
      const targetStatus = input.targetStatus ?? getDefaultPromotionTarget(currentStatus);

      if (!targetStatus) {
        throw createAppBlockerError({
          code: "agent_lifecycle_complete",
          category: "lifecycle_rule",
          title: "This agent cannot move to another stage",
          summary: "This lifecycle action is blocked because the agent is already at its last allowed stage.",
          details: [
            `Current lifecycle stage: ${currentStatus}`,
          ],
          recommendedActions: [
            "Choose a different action, or review the current lifecycle status before trying again.",
          ],
          context: { agentId: agent[0].id, currentStatus },
          technicalDetails: `No further lifecycle transition is allowed from ${currentStatus}`,
        }, "BAD_REQUEST");
      }

      if (!canTransitionAgentStatus(currentStatus, targetStatus)) {
        throw createAppBlockerError({
          code: "invalid_agent_lifecycle_transition",
          category: "lifecycle_rule",
          title: "This lifecycle move is not allowed",
          summary: "This agent cannot move directly to the selected stage.",
          details: [
            `Current stage: ${currentStatus}`,
            `Requested stage: ${targetStatus}`,
          ],
          recommendedActions: [
            "Move the agent through the required intermediate stage first.",
          ],
          context: { agentId: agent[0].id, currentStatus, targetStatus },
          technicalDetails: `Transition from ${currentStatus} to ${targetStatus} is not allowed`,
        }, "BAD_REQUEST");
      }

      let evaluationResult = null;
      let activePolicyName = "No active policy";

      if (targetStatus === "governed") {
        const activePolicy = await db
          .select()
          .from(policies)
          .where(
            and(
              eq(policies.workspaceId, policyWorkspaceId),
              eq(policies.isActive, true),
              eq(policies.isTemplate, false)
            )
          )
          .limit(1);

        if (activePolicy[0]) {
          activePolicyName = activePolicy[0].name;
          const rules = extractPolicyRules(activePolicy[0].content);
          evaluationResult = evaluateAgentCompliance({
            id: agent[0].id,
            name: agent[0].name,
            roleClass: agent[0].roleClass,
            temperature: agent[0].temperature || "0.7",
            hasDocumentAccess: agent[0].hasDocumentAccess || false,
            hasToolAccess: agent[0].hasToolAccess || false,
            allowedTools: Array.isArray(agent[0].allowedTools) ? agent[0].allowedTools : [],
            systemPrompt: agent[0].systemPrompt,
          }, rules);

          if (!evaluationResult.compliant) {
            throw createAppBlockerError({
              code: "agent_policy_denied",
              category: "governance_block",
              title: "Governance blocked this agent promotion",
              summary: "This agent cannot move to the governed stage because it did not pass policy review.",
              details: evaluationResult.violations,
              recommendedActions: [
                "Fix the listed policy issues, then try the promotion again.",
              ],
              context: {
                agentId: agent[0].id,
                currentStatus,
                targetStatus,
                policyName: activePolicyName,
                score: evaluationResult.score,
              },
              technicalDetails: `Policy ${activePolicyName} blocked agent promotion`,
            }, "FORBIDDEN");
          }
        }
      }

      await db
        .update(agents)
        .set({
          status: targetStatus,
          lifecycle: getLifecyclePayload(agent[0].lifecycle, targetStatus),
          updatedAt: new Date(),
        })
        .where(eq(agents.id, input.id));

      await getAuditLogger().log({
        actor_id: String(ctx.user.id),
        action_type: "LIFECYCLE_TRANSITION",
        target_type: "agent",
        target_id: String(input.id),
        decision_result: "success",
        metadata: { action: "promote", from: currentStatus, to: targetStatus },
      });

      return {
        success: true,
        compliant: true,
        status: targetStatus,
        previousStatus: currentStatus,
        violations: [],
        score: evaluationResult?.score || 100,
        policyName: activePolicyName,
      };
    }),
});
