import { z } from 'zod';
import { protectedProcedure, router } from '../_core/trpc';
import {
  createAgent,
  getAgent,
  listAgents,
  updateAgent,
  deleteAgent,
  createConversation,
  getConversation,
  listConversations,
  updateConversation,
  deleteConversation,
  getConversationWithMessages,
} from './db';
import { executeAgent } from './executor';
import { getToolRegistry } from './tools';

export const agentsRouter = router({
  // Agent management
  deployTemplate: protectedProcedure
    .input(z.object({
      templateId: z.string(),
      name: z.string(),
      workspaceId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Template definitions
      const templates: Record<string, any> = {
        "data-analyst": {
          name: "Data Analyst",
          description: "Analyzes datasets, generates insights, and creates visualizations",
          systemPrompt: "You are a data analyst AI. Analyze data, generate insights, and create visualizations.",
          tools: ["database_query", "data_visualization", "statistical_analysis", "report_generator"],
        },
        "code-reviewer": {
          name: "Code Reviewer",
          description: "Reviews code for bugs, security issues, and best practices",
          systemPrompt: "You are a code reviewer AI. Review code for bugs, security issues, and best practices.",
          tools: ["code_analyzer", "security_scanner", "style_checker", "documentation_generator"],
        },
        "content-writer": {
          name: "Content Writer",
          description: "Creates high-quality content for blogs, social media, and marketing",
          systemPrompt: "You are a content writer AI. Create high-quality content for various platforms.",
          tools: ["web_search", "seo_analyzer", "grammar_checker", "plagiarism_detector"],
        },
        "research-assistant": {
          name: "Research Assistant",
          description: "Conducts research, summarizes findings, and cites sources",
          systemPrompt: "You are a research assistant AI. Conduct research and summarize findings with citations.",
          tools: ["web_search", "academic_search", "document_reader", "citation_generator"],
        },
        "database-admin": {
          name: "Database Administrator",
          description: "Manages databases, optimizes queries, and monitors performance",
          systemPrompt: "You are a database administrator AI. Manage databases and optimize performance.",
          tools: ["database_query", "query_optimizer", "backup_manager", "performance_monitor"],
        },
        "email-assistant": {
          name: "Email Assistant",
          description: "Drafts professional emails, manages responses, and schedules follow-ups",
          systemPrompt: "You are an email assistant AI. Draft professional emails and manage communications.",
          tools: ["email_sender", "calendar_manager", "contact_lookup", "template_generator"],
        },
      };

      const template = templates[input.templateId];
      if (!template) {
        throw new Error(`Template not found: ${input.templateId}`);
      }

      // Create agent instance using existing createAgent function
      const agentId = await createAgent({
        workspaceId: input.workspaceId || 1,
        name: input.name || template.name,
        description: template.description,
        systemPrompt: template.systemPrompt,
        hasToolAccess: true,
        hasDocumentAccess: true,
        allowedTools: template.tools,
        createdBy: ctx.user.id,
      });

      return {
        success: true,
        agentId,
      };
    }),

  create: protectedProcedure
    .input(z.object({
      workspaceId: z.number(),
      name: z.string().min(1).max(255),
      description: z.string().optional(),
      systemPrompt: z.string().min(1),
      modelId: z.number().optional(),
      temperature: z.string().optional(),
      hasDocumentAccess: z.boolean().optional(),
      hasToolAccess: z.boolean().optional(),
      allowedTools: z.array(z.string()).optional(),
      maxIterations: z.number().min(1).max(50).optional(),
      autoSummarize: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const agentId = await createAgent({
        ...input,
        createdBy: ctx.user.id,
      });

      return { id: agentId };
    }),

  get: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .query(async ({ input }) => {
      const agent = await getAgent(input.id);
      if (!agent) {
        throw new Error('Agent not found');
      }
      return agent;
    }),

  list: protectedProcedure
    .input(z.object({
      workspaceId: z.number(),
    }))
    .query(async ({ input }) => {
      return listAgents(input.workspaceId);
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().min(1).max(255).optional(),
      description: z.string().optional(),
      systemPrompt: z.string().min(1).optional(),
      modelId: z.number().optional(),
      temperature: z.string().optional(),
      hasDocumentAccess: z.boolean().optional(),
      hasToolAccess: z.boolean().optional(),
      allowedTools: z.array(z.string()).optional(),
      maxIterations: z.number().min(1).max(50).optional(),
      autoSummarize: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateAgent(id, data);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .mutation(async ({ input }) => {
      await deleteAgent(input.id);
      return { success: true };
    }),

  // Conversation management
  createConversation: protectedProcedure
    .input(z.object({
      workspaceId: z.number(),
      agentId: z.number().optional(),
      title: z.string().optional(),
      modelId: z.number().optional(),
      temperature: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const conversationId = await createConversation({
        ...input,
        userId: ctx.user.id,
      });

      return { id: conversationId };
    }),

  getConversation: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .query(async ({ input }) => {
      const conversation = await getConversationWithMessages(input.id);
      if (!conversation) {
        throw new Error('Conversation not found');
      }
      return conversation;
    }),

  listConversations: protectedProcedure
    .input(z.object({
      workspaceId: z.number(),
      agentId: z.number().optional(),
    }))
    .query(async ({ input }) => {
      return listConversations(input.workspaceId, input.agentId);
    }),

  updateConversation: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      modelId: z.number().optional(),
      temperature: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await updateConversation(id, data);
      return { success: true };
    }),

  deleteConversation: protectedProcedure
    .input(z.object({
      id: z.number(),
    }))
    .mutation(async ({ input }) => {
      await deleteConversation(input.id);
      return { success: true };
    }),

  // Agent execution
  execute: protectedProcedure
    .input(z.object({
      conversationId: z.number(),
      message: z.string().min(1),
      workspaceId: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      const result = await executeAgent({
        conversationId: input.conversationId,
        userMessage: input.message,
        userId: ctx.user.id,
        workspaceId: input.workspaceId,
      });

      return result;
    }),

  // Tool management
  listTools: protectedProcedure
    .query(() => {
      const toolRegistry = getToolRegistry();
      return toolRegistry.list().map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }));
    }),
});
