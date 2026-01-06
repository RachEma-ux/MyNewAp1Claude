import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { llamaCppEngine } from "./llamacpp-engine";

/**
 * Inference Router
 * Exposes local inference engine via tRPC
 */
export const inferenceRouter = router({
  /**
   * Load a model
   */
  loadModel: protectedProcedure
    .input(
      z.object({
        modelId: z.string(),
        modelPath: z.string(),
        device: z.enum(["cpu", "cuda", "metal", "rocm"]).default("cpu"),
        nGpuLayers: z.number().optional(),
        nThreads: z.number().optional(),
        contextSize: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      await llamaCppEngine.loadModel({
        modelId: input.modelId,
        modelPath: input.modelPath,
        backend: "llamacpp",
        device: input.device,
        nGpuLayers: input.nGpuLayers,
        nThreads: input.nThreads,
        contextSize: input.contextSize,
      });
      
      return { success: true, modelId: input.modelId };
    }),
  
  /**
   * Unload a model
   */
  unloadModel: protectedProcedure
    .input(z.object({ modelId: z.string() }))
    .mutation(async ({ input }) => {
      await llamaCppEngine.unloadModel(input.modelId);
      return { success: true };
    }),
  
  /**
   * Run inference
   */
  infer: protectedProcedure
    .input(
      z.object({
        modelId: z.string(),
        messages: z.array(
          z.object({
            role: z.enum(["system", "user", "assistant"]),
            content: z.string(),
          })
        ),
        temperature: z.number().optional(),
        maxTokens: z.number().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const response = await llamaCppEngine.infer({
        modelId: input.modelId,
        messages: input.messages,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
      });
      
      return response;
    }),
  
  /**
   * Get loaded models
   */
  getLoadedModels: protectedProcedure.query(async () => {
    return llamaCppEngine.getLoadedModels();
  }),
  
  /**
   * Get hardware capabilities
   */
  getHardwareCapabilities: protectedProcedure.query(async () => {
    return await llamaCppEngine.getHardwareCapabilities();
  }),
});
