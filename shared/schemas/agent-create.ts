import { z } from "zod";

export const AGENT_CREATE_ROLE_CLASSES = [
  "assistant",
  "analyst",
  "executor",
  "monitor",
  "compliance",
  "analysis",
  "ideation",
  "support",
  "reviewer",
  "automator",
  "custom",
] as const;

export const AGENT_CREATE_MODES = [
  "template",
  "scratch",
  "clone",
  "workflow",
  "conversation",
  "event",
  "import",
] as const;

export const AgentCreateRoleClassSchema = z.enum(AGENT_CREATE_ROLE_CLASSES);
export const AgentCreateModeSchema = z.enum(AGENT_CREATE_MODES);

export const AgentCreateInputSchema = z.object({
  identity: z.object({
    name: z.string().trim().min(1, "Agent name is required").max(255, "Agent name is too long"),
    version: z.string().trim().min(1, "Version is required").max(50, "Version is too long"),
    description: z.string().trim().max(4000, "Description is too long").optional().default(""),
    tags: z.array(z.string().trim().min(1).max(50)).optional().default([]),
  }),
  definition: z.object({
    creationMode: AgentCreateModeSchema,
    roleClass: AgentCreateRoleClassSchema,
    systemPrompt: z.string().trim().min(1, "System prompt is required").max(20000, "System prompt is too long"),
    anatomy: z.record(z.string(), z.unknown()).optional().default({}),
  }),
  runtime: z.object({
    modelId: z.string().trim().min(1, "Model is required").max(255, "Model ID is too long"),
    temperature: z.number().min(0, "Temperature must be at least 0").max(2, "Temperature must be at most 2"),
  }),
  capabilities: z.object({
    hasDocumentAccess: z.boolean(),
    hasToolAccess: z.boolean(),
    allowedTools: z.array(z.string().trim().min(1).max(100)).default([]),
    custom: z.record(z.string(), z.unknown()).optional().default({}),
  }),
  limits: z.object({
    maxTokens: z.number().int("Max tokens must be an integer").min(1, "Max tokens must be at least 1"),
    dailyBudget: z.number().min(0, "Daily budget must be at least 0"),
    sandboxConstraints: z.record(z.string(), z.unknown()).optional().default({}),
    expiresAt: z.union([z.string().trim().min(1), z.null()]).optional().default(null),
  }),
}).superRefine((input, ctx) => {
  if (!input.capabilities.hasToolAccess && input.capabilities.allowedTools.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["capabilities", "allowedTools"],
      message: "Allowed tools require tool access to be enabled",
    });
  }
});

export type AgentCreateInput = z.infer<typeof AgentCreateInputSchema>;

export const DEFAULT_AGENT_CREATE_INPUT: AgentCreateInput = {
  identity: {
    name: "",
    version: "1.0.0",
    description: "",
    tags: [],
  },
  definition: {
    creationMode: "scratch",
    roleClass: "analysis",
    systemPrompt: "",
    anatomy: {},
  },
  runtime: {
    modelId: "",
    temperature: 0.7,
  },
  capabilities: {
    hasDocumentAccess: false,
    hasToolAccess: false,
    allowedTools: [],
    custom: {},
  },
  limits: {
    maxTokens: 2000,
    dailyBudget: 100,
    sandboxConstraints: {},
    expiresAt: null,
  },
};
