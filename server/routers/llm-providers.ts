/**
 * LLM Provider Registry, Policy Validation & Device Detection
 *
 * Extracted from llm.ts — provides provider browsing, configuration,
 * credential management, installation checks, and device compatibility.
 */

import { z } from "zod";
import { protectedProcedure, governedProcedure } from "../_core/trpc";
import * as providers from "../llm/providers";
import { LLMPolicyEngine } from "../policies/llm-policy-engine";

const llmRoleSchema = z.enum(["planner", "executor", "router", "guard", "observer", "embedder"]);
const environmentSchema = z.enum(["sandbox", "governed", "production"]);

const llmConfigSchema = z.object({
  runtime: z.object({
    type: z.enum(["local", "cloud", "remote"]),
    provider: z.string().optional(),
    endpoint: z.string().optional(),
  }),
  model: z.object({
    name: z.string(),
    version: z.string().optional(),
    contextLength: z.number().optional(),
  }),
  parameters: z.object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().positive().optional(),
    topP: z.number().min(0).max(1).optional(),
    streaming: z.boolean().optional(),
  }).optional(),
  capabilities: z.object({
    tools: z.array(z.string()).optional(),
    functions: z.array(z.string()).optional(),
  }).optional(),
});

/**
 * Procedure map for provider-related routes.
 * Spread into llmRouter in llm.ts to preserve the flat route namespace.
 */
export const llmProvidersProcedures = {
  // ============================================================================
  // Policy Validation
  // ============================================================================

  validatePolicy: protectedProcedure
    .input(
      z.object({
        identity: z.object({
          name: z.string(),
          role: llmRoleSchema,
          ownerTeam: z.string().optional(),
        }),
        configuration: llmConfigSchema,
        environment: environmentSchema.optional().default("sandbox"),
      })
    )
    .mutation(async ({ input }) => {
      const result = await LLMPolicyEngine.evaluate({
        identity: {
          name: input.identity.name,
          role: input.identity.role,
          ownerTeam: input.identity.ownerTeam,
        },
        configuration: input.configuration,
        environment: input.environment,
      });

      return result;
    }),

  // ============================================================================
  // Provider Registry
  // ============================================================================

  listProviders: protectedProcedure.query(async () => {
    return providers.getAllProviders();
  }),

  getProvider: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const provider = providers.getProvider(input.id);
      if (!provider) {
        throw new Error(`Provider not found: ${input.id}`);
      }
      return provider;
    }),

  getProviderModels: protectedProcedure
    .input(z.object({ providerId: z.string() }))
    .query(async ({ input }) => {
      return providers.getProviderModels(input.providerId);
    }),

  listPresets: protectedProcedure.query(async () => {
    return providers.getAllPresets();
  }),

  getPreset: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const preset = providers.getPreset(input.id);
      if (!preset) {
        throw new Error(`Preset not found: ${input.id}`);
      }
      return preset;
    }),

  // ============================================================================
  // Provider Configuration & Testing
  // ============================================================================

  testProviderConnection: protectedProcedure
    .input(
      z.object({
        providerId: z.string(),
        credentials: z.object({
          apiKey: z.string().optional(),
          endpoint: z.string().optional(),
        }),
      })
    )
    .mutation(async ({ input }) => {
      const { testProviderConnection } = await import("../llm/provider-test");
      return await testProviderConnection(input.providerId, input.credentials);
    }),

  configureProvider: governedProcedure
    .input(
      z.object({
        dbProviderId: z.number(),
        providerId: z.string(),
        credentials: z.object({
          apiKey: z.string().optional(),
          apiSecret: z.string().optional(),
          endpoint: z.string().optional(),
          organizationId: z.string().optional(),
          projectId: z.string().optional(),
        }),
        setAsDefault: z.boolean().optional().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { storeProviderCredentials } = await import("../llm/provider-credentials");

      await storeProviderCredentials(input.dbProviderId, input.credentials);

      if (input.setAsDefault) {
        console.log(`[LLM Router] Set provider ${input.providerId} as default for user ${ctx.user.id}`);
      }

      return {
        success: true,
        message: "Provider configured successfully",
      };
    }),

  getProviderCredentials: protectedProcedure
    .input(z.object({ dbProviderId: z.number() }))
    .query(async ({ input }) => {
      const { getProviderCredentials, maskCredential } = await import("../llm/provider-credentials");

      const credentials = await getProviderCredentials(input.dbProviderId);

      if (!credentials) {
        return null;
      }

      return {
        apiKey: credentials.apiKey ? maskCredential(credentials.apiKey) : undefined,
        apiSecret: credentials.apiSecret ? maskCredential(credentials.apiSecret) : undefined,
        endpoint: credentials.endpoint,
        organizationId: credentials.organizationId,
        projectId: credentials.projectId,
      };
    }),

  deleteProviderCredentials: governedProcedure
    .input(z.object({ dbProviderId: z.number() }))
    .mutation(async ({ input }) => {
      const { deleteProviderCredentials } = await import("../llm/provider-credentials");

      await deleteProviderCredentials(input.dbProviderId);

      return {
        success: true,
        message: "Credentials deleted successfully",
      };
    }),

  // ============================================================================
  // Provider Installation & Model Management
  // ============================================================================

  checkProviderInstallation: protectedProcedure
    .input(z.object({ providerId: z.string() }))
    .query(async ({ input }) => {
      const { checkProviderInstallation } = await import("../llm/provider-installation");
      return await checkProviderInstallation(input.providerId);
    }),

  getInstallationInstructions: protectedProcedure
    .input(z.object({ providerId: z.string() }))
    .query(async ({ input }) => {
      const { getInstallationInstructions } = await import("../llm/provider-installation");
      return getInstallationInstructions(input.providerId);
    }),

  getAvailableModels: protectedProcedure
    .input(z.object({ providerId: z.string() }))
    .query(async ({ input }) => {
      const { getAvailableModels } = await import("../llm/provider-installation");
      return await getAvailableModels(input.providerId);
    }),

  getInstalledModels: protectedProcedure
    .input(z.object({ providerId: z.string() }))
    .query(async ({ input }) => {
      const { getInstalledModels } = await import("../llm/provider-installation");
      return await getInstalledModels(input.providerId);
    }),

  downloadModel: protectedProcedure
    .input(z.object({ providerId: z.string(), modelId: z.string() }))
    .mutation(async ({ input }) => {
      const { downloadModel } = await import("../llm/provider-installation");
      return await downloadModel(input.providerId, input.modelId);
    }),

  removeModel: protectedProcedure
    .input(z.object({ providerId: z.string(), modelId: z.string() }))
    .mutation(async ({ input }) => {
      const { removeModel } = await import("../llm/provider-installation");
      return await removeModel(input.providerId, input.modelId);
    }),

  // ============================================================================
  // Device Detection & Compatibility
  // ============================================================================

  getDeviceSpecs: protectedProcedure.query(async () => {
    const { detectDeviceSpecs } = await import("../llm/device-detection");
    return await detectDeviceSpecs();
  }),

  checkModelCompatibility: protectedProcedure
    .input(z.object({ providerId: z.string(), modelId: z.string() }))
    .query(async ({ input }) => {
      const { detectDeviceSpecs, checkCompatibility } = await import("../llm/device-detection");
      const { getProvider } = await import("../llm/providers");

      const provider = getProvider(input.providerId);
      if (!provider) {
        throw new Error(`Provider not found: ${input.providerId}`);
      }

      const model = provider.models.find((m) => m.id === input.modelId);
      if (!model) {
        throw new Error(`Model not found: ${input.modelId}`);
      }

      if (!model.systemRequirements) {
        return {
          compatible: true,
          warnings: [],
          errors: [],
          recommendations: [],
          deviceSpecs: await detectDeviceSpecs(),
          requirements: null,
        };
      }

      const deviceSpecs = await detectDeviceSpecs();
      return checkCompatibility(deviceSpecs, model.systemRequirements);
    }),
} as const;
