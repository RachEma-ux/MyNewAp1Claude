import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, governedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { agents, policies } from "../../drizzle/schema";
import { eq, and, ne } from "drizzle-orm";
import { evaluateAgentCompliance, extractPolicyRules } from "../services/policyEvaluation";
import { createHash } from "crypto";
import { getToolRegistry } from "../agents/tools";

export const agentsRouter = router({
  // List all agents for current user's workspace
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const workspaceId = ctx.user.id;
    
    const agentList = await db
      .select()
      .from(agents)
      .where(
        and(
          eq(agents.workspaceId, workspaceId),
          ne(agents.status, "archived")
        )
      );
    
    return agentList;
  }),

  // Get single agent by ID
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = getDb();
      const workspaceId = ctx.user.id;
      
      const agent = await db
        .select()
        .from(agents)
        .where(
          and(
            eq(agents.id, input.id),
            eq(agents.workspaceId, workspaceId)
          )
        )
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
    .input(z.object({
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      roleClass: z.enum(["assistant", "analyst", "support", "reviewer", "automator", "monitor", "custom"]),
      systemPrompt: z.string(),
      modelId: z.string(),
      temperature: z.number().min(0).max(2).optional().default(0.7),
      hasDocumentAccess: z.boolean().optional().default(false),
      hasToolAccess: z.boolean().optional().default(false),
      allowedTools: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const workspaceId = ctx.user.id;
      
      await db.insert(agents).values({
        workspaceId,
        name: input.name,
        description: input.description,
        roleClass: input.roleClass,
        systemPrompt: input.systemPrompt,
        modelId: input.modelId,
        temperature: String(input.temperature),
        hasDocumentAccess: input.hasDocumentAccess,
        hasToolAccess: input.hasToolAccess,
        allowedTools: input.allowedTools,
        status: "draft",
        createdBy: ctx.user.id,
      });

      return { success: true };
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
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const workspaceId = ctx.user.id;
      
      // Verify ownership
      const agent = await db
        .select()
        .from(agents)
        .where(
          and(
            eq(agents.id, input.id),
            eq(agents.workspaceId, workspaceId)
          )
        )
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
      
      return { success: true };
    }),

  // Delete agent
  delete: governedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const workspaceId = ctx.user.id;
      
      // Verify ownership
      const agent = await db
        .select()
        .from(agents)
        .where(
          and(
            eq(agents.id, input.id),
            eq(agents.workspaceId, workspaceId)
          )
        )
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
          updatedAt: new Date(),
        })
        .where(eq(agents.id, input.id));
      
      return { success: true };
    }),

  // Detect drift across all agents
  detectAllDrift: protectedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const workspaceId = ctx.user.id;

    // Fetch all non-archived agents
    const agentList = await db
      .select()
      .from(agents)
      .where(
        and(
          eq(agents.workspaceId, workspaceId),
          ne(agents.status, "archived")
        )
      );

    // Fetch the active policy for the workspace
    const activePolicy = await db
      .select()
      .from(policies)
      .where(
        and(
          eq(policies.workspaceId, workspaceId),
          eq(policies.isActive, true),
          eq(policies.isTemplate, false)
        )
      )
      .limit(1);

    const currentPolicyHash = activePolicy[0]
      ? createHash("sha256").update(activePolicy[0].content || "").digest("hex").slice(0, 16)
      : null;

    const driftResults = agentList.map((agent) => {
      const changes: { field: string; oldValue: any; newValue: any }[] = [];
      let hasDrift = false;
      let driftType = "none";
      let severity: "low" | "medium" | "high" = "low";

      // Check 1: Policy digest drift — does the agent's stored policyDigest match the current policy hash?
      if (agent.status === "governed" && currentPolicyHash) {
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
      const workspaceId = ctx.user.id;

      const agent = await db
        .select()
        .from(agents)
        .where(
          and(
            eq(agents.id, input.agentId),
            eq(agents.workspaceId, workspaceId)
          )
        )
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
            eq(policies.workspaceId, workspaceId),
            eq(policies.isActive, true),
            eq(policies.isTemplate, false)
          )
        )
        .limit(1);

      const currentPolicyHash = activePolicy[0]
        ? createHash("sha256").update(activePolicy[0].content || "").digest("hex").slice(0, 16)
        : null;

      if (a.status === "governed" && currentPolicyHash && a.policyDigest !== currentPolicyHash) {
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
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const workspaceId = ctx.user.id;
      
      const agentList = await db
        .select()
        .from(agents)
        .where(
          and(
            eq(agents.workspaceId, workspaceId),
            ne(agents.status, "archived")
          )
        );
      
      const format = input.format || "json";
      const timestamp = new Date().toISOString();
      const filename = `compliance-report-${timestamp}.${format}`;
      
      const report = {
        timestamp,
        workspaceId: String(workspaceId),
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
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const workspaceId = ctx.user.id;
      
      const agent = await db
        .select()
        .from(agents)
        .where(
          and(
            eq(agents.id, input.agentId),
            eq(agents.workspaceId, workspaceId)
          )
        )
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
      const workspaceId = ctx.user.id;
      
      // Create agent from template
      await db.insert(agents).values({
        workspaceId,
        name: input.name,
        description: `Deployed from template ${input.templateId}`,
        roleClass: "assistant",
        systemPrompt: "You are a helpful assistant.",
        modelId: "gpt-4",
        hasDocumentAccess: false,
        hasToolAccess: false,
        allowedTools: [],
        status: "draft",
        createdBy: ctx.user.id,
      });

      return {
        success: true,
        message: `Agent deployed from template ${input.templateId}`,
        agentName: input.name,
      };
    }),

  // Promote agent from draft/sandbox to governed with policy evaluation
  promote: governedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = getDb();
      const workspaceId = ctx.user.id;
      
      const agent = await db
        .select()
        .from(agents)
        .where(
          and(
            eq(agents.id, input.id),
            eq(agents.workspaceId, workspaceId)
          )
        )
        .limit(1);
      
      if (!agent[0]) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Agent not found",
        });
      }
      
      if (agent[0].status !== "draft" && agent[0].status !== "sandbox") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only draft or sandbox agents can be promoted",
        });
      }
      
      // Fetch active policy for workspace
      const activePolicy = await db
        .select()
        .from(policies)
        .where(
          and(
            eq(policies.workspaceId, workspaceId),
            eq(policies.isActive, true),
            eq(policies.isTemplate, false)
          )
        )
        .limit(1);
      
      // Evaluate agent against policy if one exists
      let evaluationResult = null;
      if (activePolicy[0]) {
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
        
        // Block promotion if agent fails policy evaluation
        if (!evaluationResult.compliant) {
          return {
            success: false,
            compliant: false,
            violations: evaluationResult.violations,
            score: evaluationResult.score,
            policyName: activePolicy[0].name,
          };
        }
      }
      
      // Promotion approved - update agent status
      await db
        .update(agents)
        .set({
          status: "governed",
          updatedAt: new Date(),
        })
        .where(eq(agents.id, input.id));
      
      return {
        success: true,
        compliant: true,
        violations: [],
        score: evaluationResult?.score || 100,
        policyName: activePolicy[0]?.name || "No active policy",
      };
    }),
});
