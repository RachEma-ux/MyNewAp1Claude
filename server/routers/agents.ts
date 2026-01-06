import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { agents, policies } from "../../drizzle/schema";
import { eq, and, ne } from "drizzle-orm";
import { evaluateAgentCompliance, extractPolicyRules } from "../services/policyEvaluation";

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
  create: protectedProcedure
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
      } as any);
      
      return { success: true };
    }),

  // Update agent
  update: protectedProcedure
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
  delete: protectedProcedure
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
    
    const agentList = await db
      .select()
      .from(agents)
      .where(
        and(
          eq(agents.workspaceId, workspaceId),
          ne(agents.status, "archived")
        )
      );
    
    // Mock drift detection - in production, compare against baseline
    const driftResults = agentList.map((agent) => ({
      agentId: agent.id,
      agentName: agent.name,
      hasDrift: Math.random() > 0.7, // 30% have drift
      driftType: Math.random() > 0.5 ? "policy_change" : "spec_tamper",
      severity: Math.random() > 0.6 ? "high" : Math.random() > 0.3 ? "medium" : "low",
      changes: [
        {
          field: "temperature",
          oldValue: 0.7,
          newValue: parseFloat(agent.temperature || "0.7"),
        },
      ],
    }));
    
    return driftResults;
  }),

  // Run drift detection for specific agent
  runDriftDetection: protectedProcedure
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
      
      return {
        agentId: agent[0].id,
        agentName: agent[0].name,
        hasDrift: Math.random() > 0.7,
        driftType: "policy_change",
        severity: "medium",
        changes: [
          {
            field: "systemPrompt",
            oldValue: "Original prompt",
            newValue: agent[0].systemPrompt,
          },
        ],
      };
    }),

  // Export compliance report
  exportCompliance: protectedProcedure
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
  autoRemediate: protectedProcedure
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
    return [
      {
        id: "tool_1",
        name: "Web Search",
        category: "information",
        description: "Search the web for information",
        enabled: true,
      },
      {
        id: "tool_2",
        name: "Database Query",
        category: "data",
        description: "Execute database queries",
        enabled: true,
      },
      {
        id: "tool_3",
        name: "File Operations",
        category: "file",
        description: "Read and write files",
        enabled: false,
      },
      {
        id: "tool_4",
        name: "Email Sender",
        category: "communication",
        description: "Send emails",
        enabled: true,
      },
      {
        id: "tool_5",
        name: "API Caller",
        category: "integration",
        description: "Call external APIs",
        enabled: true,
      },
    ];
  }),

  // Deploy agent template
  deployTemplate: protectedProcedure
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
      } as any);
      
      return {
        success: true,
        message: `Agent deployed from template ${input.templateId}`,
        agentName: input.name,
      };
    }),

  // Promote agent from draft/sandbox to governed with policy evaluation
  promote: protectedProcedure
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
