import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { actionRegistry } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// Validation schema for action creation
const actionCreateSchema = z.object({
  // Gate 0: Classification & Intent
  classification: z.enum(["side-effecting", "transformational", "control-flow", "ai-agent"]),
  isDeterministic: z.boolean(),
  isIdempotent: z.boolean(),
  safeByDefault: z.boolean(),
  intentDoc: z.string().min(10),
  sideEffects: z.string().transform((val) => {
    try {
      return JSON.parse(val);
    } catch {
      return [];
    }
  }),
  
  // Gate 1: Registry & Identity
  typeId: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  description: z.string().min(10),
  category: z.enum(["control", "logic", "communication", "integration", "data", "file", "ai", "human", "security", "observability", "system", "custom"]),
  semanticVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  icon: z.string().optional(),
  
  // Gate 2: Configuration Schema
  configSchema: z.string().transform((val) => {
    try {
      return JSON.parse(val);
    } catch {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid config schema JSON" });
    }
  }),
  defaultConfig: z.string().optional().transform((val) => {
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid default config JSON" });
    }
  }),
  
  // Gate 3: UX Safety
  requiredFields: z.string().optional().transform((val) => {
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }),
  unsafeOptions: z.string().optional().transform((val) => {
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }),
  validationRules: z.string().optional().transform((val) => {
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }),
  samplePayload: z.string().optional().transform((val) => {
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }),
  
  // Gate 4: Data Flow & Contracts
  inputContract: z.string().optional().transform((val) => {
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }),
  outputContract: z.string().transform((val) => {
    try {
      return JSON.parse(val);
    } catch {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid output contract JSON" });
    }
  }),
  outputTypes: z.string().optional().transform((val) => {
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }),
  initialWorkflowSchema: z.string().optional().transform((val) => {
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }),
  
  // Gate 5: Execution Semantics
  executionMode: z.enum(["sync", "async"]),
  blockingBehavior: z.enum(["blocking", "non-blocking"]),
  retryPolicy: z.string().transform((val) => JSON.parse(val)),
  timeoutPolicy: z.string().transform((val) => JSON.parse(val)),
  failureHandling: z.string().transform((val) => JSON.parse(val)),
  stateTier: z.enum(["ephemeral", "durable"]),
  maxStateSize: z.number().optional(),
  concurrentIsolation: z.string().min(10),
  
  // Gate 6: Error Propagation
  compensationStrategy: z.string().min(10),
  workflowFailureHandler: z.string().optional().transform((val) => {
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }),
  idempotencyKeyField: z.string().optional(),
  
  // Gate 7: Security & Governance
  requiredPermissions: z.string().optional().transform((val) => {
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }),
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  preExecutionPolicies: z.string().optional().transform((val) => {
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }),
  secretFields: z.string().optional().transform((val) => {
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }),
  
  // Gate 8: Multi-Tenancy
  tenantScoped: z.boolean(),
  tenantIsolation: z.string().min(10),
  
  // Gate 9: Observability
  metricsConfig: z.string().transform((val) => JSON.parse(val)),
  logFields: z.string().transform((val) => JSON.parse(val)),
  errorClassification: z.string().optional().transform((val) => {
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }),
  
  // Gate 10: Performance & Cost
  performanceProfile: z.enum(["light", "standard", "heavy"]),
  latencySLA: z.string().transform((val) => JSON.parse(val)),
  throughputExpectation: z.number().optional(),
  degradationBehavior: z.string().min(10),
  rateLimits: z.string().transform((val) => JSON.parse(val)),
  costQuotas: z.string().optional().transform((val) => {
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }),
  backpressureStrategy: z.string().min(10),
  
  // Gate 11: Documentation
  purposeDoc: z.string().min(10),
  useCases: z.string().optional().transform((val) => {
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }),
  failureModes: z.string().optional().transform((val) => {
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }),
  securityConsiderations: z.string().optional(),
  examples: z.string().optional().transform((val) => {
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }),
  
  // Gate 12: Testing & Simulation
  testCoverage: z.string().optional().transform((val) => {
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }),
  dryRunSupported: z.boolean(),
  simulationConfig: z.string().optional().transform((val) => {
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }),
  
  // Gate 13: Lifecycle Management
  deprecationNotice: z.string().optional(),
  migrationPath: z.string().optional(),
  replacementTypeId: z.string().optional(),
  subWorkflowSupport: z.boolean(),
  maxNestingDepth: z.number().optional(),
  variableScopingRules: z.string().optional(),
  failureBubblingRules: z.string().optional(),
  
  // Runtime handler
  handlerType: z.enum(["inline", "external", "api"]),
  handlerEndpoint: z.string().optional(),
  handlerCode: z.string().optional(),
  
  // Capability flags
  requiresNetwork: z.boolean(),
  requiresSecrets: z.boolean(),
  hasSideEffects: z.boolean(),
  hasCost: z.boolean(),
});

export const actionsRouter = router({
  // Create new action (admin only)
  create: protectedProcedure
    .input(actionCreateSchema)
    .mutation(async ({ input, ctx }) => {
      // Check if user is admin
      if (ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can create action types",
        });
      }

      // Check if typeId already exists
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const existing = await db
        .select()
        .from(actionRegistry)
        .where(eq(actionRegistry.typeId, input.typeId))
        .limit(1);

      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Action type with this ID already exists",
        });
      }

      // Calculate compliance score
      const complianceScore = calculateComplianceScore(input);
      const criticalViolations = countCriticalViolations(input);
      const majorIssues = countMajorIssues(input);

      // Insert into database
      await db.insert(actionRegistry).values({
        ...input,
        createdBy: ctx.user.id,
        status: criticalViolations > 0 ? "draft" : "pending_approval",
        complianceScore,
        criticalViolations,
        majorIssues,
        lastValidated: new Date(),
      } as any); // Type assertion: input validation ensures all required fields exist

      return {
        success: true,
        status: criticalViolations > 0 ? "draft" : "pending_approval",
        complianceScore,
      };
    }),

  // List all actions (with filtering)
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(["draft", "pending_approval", "approved", "rejected", "deprecated"]).optional(),
        category: z.string().optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) return [];

      let query = db.select().from(actionRegistry);

      if (input?.status) {
        query = query.where(eq(actionRegistry.status, input.status)) as any;
      }

      if (input?.category) {
        query = query.where(eq(actionRegistry.category, input.category as any)) as any;
      }

      const actions = await query.orderBy(desc(actionRegistry.createdAt));
      return actions;
    }),

  // Get single action by ID
  getById: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const action = await db
        .select()
        .from(actionRegistry)
        .where(eq(actionRegistry.id, input.id))
        .limit(1);

      if (action.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Action not found",
        });
      }

      return action[0];
    }),

  // Approve action (admin only)
  approve: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can approve actions",
        });
      }

      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      await db
        .update(actionRegistry)
        .set({
          status: "approved",
          approvedBy: ctx.user.id,
          approvedAt: new Date(),
        })
        .where(eq(actionRegistry.id, input.id));

      return { success: true };
    }),

  // Reject action (admin only)
  reject: protectedProcedure
    .input(z.object({ id: z.number(), reason: z.string() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can reject actions",
        });
      }

      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      await db
        .update(actionRegistry)
        .set({
          status: "rejected",
          rejectionReason: input.reason,
        })
        .where(eq(actionRegistry.id, input.id));

      return { success: true };
    }),

  // Delete action (admin only)
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can delete actions",
        });
      }

      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      await db.delete(actionRegistry).where(eq(actionRegistry.id, input.id));

      return { success: true };
    }),
});

// Compliance scoring functions
function calculateComplianceScore(input: any): number {
  let score = 100;

  // Critical gates (each worth 10 points)
  if (!input.classification) score -= 10;
  if (!input.typeId || !input.name) score -= 10;
  if (!input.configSchema) score -= 10;
  if (!input.outputContract) score -= 10;
  if (!input.concurrentIsolation) score -= 10;
  if (!input.tenantIsolation) score -= 10;
  if (!input.degradationBehavior) score -= 10;
  if (!input.backpressureStrategy) score -= 10;
  if (!input.purposeDoc) score -= 10;

  // Major issues (each worth 5 points)
  if (input.riskLevel === "privileged" && !input.requiredPermissions) score -= 5;
  if (!input.retryPolicy) score -= 5;
  if (!input.failureHandling) score -= 5;

  return Math.max(0, score);
}

function countCriticalViolations(input: any): number {
  let count = 0;

  if (!input.classification) count++;
  if (!input.typeId || !input.name) count++;
  if (!input.configSchema) count++;
  if (!input.outputContract) count++;
  if (!input.concurrentIsolation) count++;
  if (!input.tenantIsolation) count++;
  if (!input.degradationBehavior) count++;
  if (!input.backpressureStrategy) count++;
  if (!input.purposeDoc) count++;

  return count;
}

function countMajorIssues(input: any): number {
  let count = 0;

  if (input.riskLevel === "privileged" && !input.requiredPermissions) count++;
  if (!input.retryPolicy) count++;
  if (!input.failureHandling) count++;

  return count;
}
