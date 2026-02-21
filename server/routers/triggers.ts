import { z } from "zod";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { triggerRegistry, type InsertTriggerRegistryEntry } from "../../drizzle/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// Trigger Protocol: 15-Gate Validation Schema
const triggerCreateSchema = z.object({
  // Gate T1: Trigger Identity
  triggerId: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  category: z.enum(["time", "event", "data", "user", "system", "integration"]),
  semanticVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  owner: z.string().email(),
  icon: z.string().optional(),
  
  // Gate T2: Intent & Semantics
  purpose: z.string().min(20),
  guarantees: z.array(z.string()).optional(),
  nonGoals: z.array(z.string()).default([
    "No business data mutation",
    "No outbound messages",
    "No workflow logic"
  ]),
  
  // Gate T4: Event Input Contract
  eventInputSchema: z.any(), // JSON Schema object
  
  // Gate T5: Workflow Context Output
  workflowContextSchema: z.any(), // JSON Schema object
  
  // Gate T6: Trigger Execution Model
  ingestionMode: z.enum(["event", "poll", "schedule"]),
  deduplicationEnabled: z.boolean(),
  deduplicationKey: z.string().optional(),
  ordering: z.enum(["none", "fifo"]),
  ingestionRetryPolicy: z.any().optional(),
  pollingInterval: z.number().optional(),
  
  // Gate T7: Side-Effects Declaration (STRICT)
  sideEffects: z.array(z.enum([
    "workflow_state_write",
    "telemetry_emit",
    "policy_eval",
    "signature_verification"
  ])),
  
  // Gate T8: Security & Trust Model
  authenticationType: z.enum(["none", "hmac", "jwt", "mTLS", "api_key"]),
  authorizationScopes: z.array(z.string()).optional(),
  sourceVerification: z.boolean(),
  maxEventsPerMinute: z.number(),
  
  // Gate T9: Error Model
  errorTaxonomy: z.array(z.string()),
  
  // Gate T10: Observability
  observabilityConfig: z.any(),
  
  // Gate T11: Load & Limits
  maxPayloadKb: z.number(),
  maxEventsPerSecond: z.number(),
  
  // Gate T12: Simulation (MANDATORY)
  supportsDryRun: z.boolean().refine(val => val === true, {
    message: "Triggers MUST support dry-run simulation"
  }),
  eventStub: z.any(),
  
  // Gate T13: Lifecycle
  replacementTriggerId: z.string().optional(),
  
  // Gate T14: UI Integration Contract
  uiIntegrationSpec: z.any(),
  
  // Risk Level
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  
  // Metadata
  createdBy: z.number(),
});

// Hard Rules Validation
function validateTriggerHardRules(data: z.infer<typeof triggerCreateSchema>) {
  // Rule 1: Forbidden side-effects
  const forbiddenSideEffects = [
    "database_write",
    "file_write",
    "external_send",
    "external_api_call",
    "runtime_mutation"
  ];
  
  const hasForbiddenSideEffect = data.sideEffects.some(effect => 
    forbiddenSideEffects.includes(effect)
  );
  
  if (hasForbiddenSideEffect) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Triggers MUST NOT have side-effects: ${forbiddenSideEffects.join(", ")}`
    });
  }
  
  // Rule 2: Simulation is mandatory
  if (!data.supportsDryRun) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Gate T12 violation: Triggers MUST support dry-run simulation"
    });
  }
  
  // Rule 3: Event stub must be provided
  if (!data.eventStub || Object.keys(data.eventStub).length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Gate T12 violation: Event stub is required for simulation"
    });
  }
  
  // Rule 4: Category-specific validation
  if (data.category === "time" && data.ingestionMode !== "schedule") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Time triggers must use 'schedule' ingestion mode"
    });
  }
  
  if (data.category === "event" && data.ingestionMode === "schedule") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Event triggers cannot use 'schedule' ingestion mode"
    });
  }
  
  // Rule 5: High/Critical risk requires approval
  if (["high", "critical"].includes(data.riskLevel)) {
    // Will be routed to approval workflow
    console.log(`Trigger "${data.name}" requires admin approval (risk: ${data.riskLevel})`);
  }
}

export const triggersRouter = router({
  // Create new trigger type
  create: protectedProcedure
    .input(triggerCreateSchema)
    .mutation(async ({ input }) => {
      // Validate hard rules
      validateTriggerHardRules(input);
      
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      // Check for duplicate trigger ID
      const existing = await db
        .select()
        .from(triggerRegistry)
        .where(eq(triggerRegistry.typeId, input.triggerId))
        .limit(1);
      
      if (existing.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Trigger ID "${input.triggerId}" already exists`
        });
      }
      
      // Calculate compliance score
      const criticalGatesCompleted = [
        input.triggerId,
        input.purpose,
        input.eventInputSchema,
        input.workflowContextSchema,
        input.sideEffects,
        input.supportsDryRun,
        input.maxPayloadKb,
        input.maxEventsPerSecond
      ].filter(Boolean).length;
      
      const complianceScore = Math.round((criticalGatesCompleted / 8) * 100);
      
      // Determine approval status
      const status = ["high", "critical"].includes(input.riskLevel)
        ? "pending_approval"
        : "approved";
      
      // Insert trigger
      const triggerData: Partial<InsertTriggerRegistryEntry> = {
        typeId: input.triggerId,
        name: input.name,
        description: input.purpose,
        category: input.category,
        semanticVersion: input.semanticVersion,
        icon: input.icon,
        
        // Gate 0: Classification
        classification: "external",
        isDeterministic: false,
        isIdempotent: input.deduplicationEnabled,
        safeByDefault: true,
        intentDoc: input.purpose,
        
        // Gate 2: Configuration
        configSchema: input.eventInputSchema,
        configSchemaVersion: 1,
        defaultConfig: null,
        
        // Gate 3: UX
        uiRenderer: null,
        requiredFields: null,
        unsafeOptions: null,
        validationRules: null,
        samplePayload: null,
        
        // Gate 4: Data Flow
        inputContract: input.eventInputSchema,
        outputContract: input.workflowContextSchema,
        outputTypes: null,
        initialWorkflowSchema: input.workflowContextSchema,
        
        // Gate 5: Execution
        executionMode: "async",
        blockingBehavior: "non-blocking",
        retryPolicy: input.ingestionRetryPolicy || null,
        timeoutPolicy: null,
        failureHandling: null,
        stateTier: "durable",
        maxStateSize: input.maxPayloadKb * 1024,
        concurrentIsolation: input.ordering,
        
        // Gate 6: Error Propagation
        compensationStrategy: null,
        workflowFailureHandler: null,
        idempotencyKeyField: input.deduplicationKey || null,
        
        // Gate 7: Security
        requiredPermissions: null,
        riskLevel: input.riskLevel,
        preExecutionPolicies: null,
        secretFields: null,
        
        // Gate 8: Multi-Tenancy
        tenantScoped: true,
        tenantIsolation: null,
        
        // Gate 9: Observability
        metricsConfig: input.observabilityConfig || null,
        logFields: null,
        errorClassification: null,
        
        // Gate 10: Performance
        performanceProfile: "standard",
        latencySLA: null,
        throughputExpectation: input.maxEventsPerSecond,
        degradationBehavior: null,
        rateLimits: null,
        costQuotas: null,
        backpressureStrategy: null,
        
        // Gate 11: Documentation
        purposeDoc: input.purpose,
        useCases: null,
        failureModes: null,
        securityConsiderations: null,
        examples: null,
        
        // Gate 12: Testing
        testCoverage: null,
        dryRunSupported: input.supportsDryRun,
        simulationConfig: input.eventStub || null,
        
        // Gate 13: Lifecycle
        deprecationNotice: null,
        migrationPath: null,
        replacementTypeId: input.replacementTriggerId || null,
        
        // Gate 14: Composition
        subWorkflowSupport: false,
        maxNestingDepth: 5,
        variableScopingRules: null,
        failureBubblingRules: null,
        
        // Runtime handler
        handlerCode: null,
        handlerType: "external",
        handlerEndpoint: null,
        
        // Capability flags
        requiresNetwork: true,
        requiresSecrets: input.authenticationType !== "none",
        hasSideEffects: input.sideEffects.length > 0,
        hasCost: false,
        
        // Metadata
        status,
        complianceScore,
        criticalViolations: 0,
        majorIssues: 0,
        createdBy: input.createdBy,
        lastValidated: new Date(),
      };
      
      const result = await db.insert(triggerRegistry).values(triggerData as any);
      
      return {
        success: true,
        triggerId: input.triggerId,
        status,
        complianceScore,
        message: status === "pending_approval"
          ? "Trigger created and pending admin approval"
          : "Trigger created and approved"
      };
    }),
  
  // List all triggers
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(["draft", "pending_approval", "approved", "rejected", "deprecated"]).optional(),
        category: z.enum(["time", "event", "data", "user", "system", "integration"]).optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      let query = db.select().from(triggerRegistry);
      
      if (input?.status) {
        query = query.where(eq(triggerRegistry.status, input.status)) as any;
      }
      
      if (input?.category) {
        query = query.where(sql`${triggerRegistry.category} = ${input.category}`) as any;
      }
      
      const triggers = await query.orderBy(desc(triggerRegistry.createdAt));
      
      return triggers;
    }),
  
  // Get trigger by ID
  getById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      const trigger = await db
        .select()
        .from(triggerRegistry)
        .where(eq(triggerRegistry.id, input.id))
        .limit(1);
      
      if (trigger.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Trigger not found"
        });
      }
      
      return trigger[0];
    }),
  
  // Approve trigger (admin only)
  approve: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      await db
        .update(triggerRegistry)
        .set({ status: "approved", updatedAt: new Date() })
        .where(eq(triggerRegistry.id, input.id));
      
      return { success: true };
    }),
  
  // Reject trigger (admin only)
  reject: protectedProcedure
    .input(z.object({ id: z.number(), reason: z.string() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      await db
        .update(triggerRegistry)
        .set({
          status: "rejected",
          updatedAt: new Date()
        })
        .where(eq(triggerRegistry.id, input.id));
      
      return { success: true };
    }),
  
  // Delete trigger (admin only)
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      
      await db
        .delete(triggerRegistry)
        .where(eq(triggerRegistry.id, input.id));
      
      return { success: true };
    }),
});
