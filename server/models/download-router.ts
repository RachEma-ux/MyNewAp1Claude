import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import * as downloadDb from "./download-db";
import { startModelDownload, pauseDownload, resumeDownload, cancelDownload, simulateDownload } from "./download-service";

/**
 * Model Download tRPC Router
 * Handles model download management and tracking
 */

export const modelDownloadRouter = router({
  // Create a new download with scheduling options
  create: protectedProcedure
    .input(
      z.object({
        modelId: z.number(),
        sourceUrl: z.string().url(),
        fileSize: z.string().optional(),
        modelName: z.string().optional(),
        startImmediately: z.boolean().optional(),
        priority: z.number().optional(),
        scheduledFor: z.date().optional(),
        bandwidthLimit: z.number().optional(), // KB/s
      })
    )
    .mutation(async ({ input, ctx }) => {
      const downloadId = await downloadDb.createModelDownload({
        modelId: input.modelId,
        userId: ctx.user.id,
        sourceUrl: input.sourceUrl,
        fileSize: input.fileSize,
        status: "queued",
        priority: input.priority ?? 0,
        scheduledFor: input.scheduledFor,
        bandwidthLimit: input.bandwidthLimit,
      });
      
      // Start download immediately if requested
      if (input.startImmediately !== false) {
        const modelName = input.modelName || `model-${input.modelId}`;
        
        // Use simulated download for now (replace with real download when HuggingFace URLs are available)
        const sizeGB = parseFloat(input.fileSize || "3.8");
        simulateDownload(downloadId, modelName, sizeGB).catch(console.error);
      }
      
      return { downloadId };
    }),

  // Get all user downloads
  getAll: protectedProcedure.query(async ({ ctx }) => {
    return downloadDb.getUserDownloads(ctx.user.id);
  }),

  // Get active downloads
  getActive: protectedProcedure.query(async ({ ctx }) => {
    return downloadDb.getActiveDownloads(ctx.user.id);
  }),

  // Get download by ID
  getById: protectedProcedure
    .input(z.object({ downloadId: z.number() }))
    .query(async ({ input }) => {
      return downloadDb.getModelDownload(input.downloadId);
    }),

  // Update download progress
  updateProgress: protectedProcedure
    .input(
      z.object({
        downloadId: z.number(),
        progress: z.number().min(0).max(100),
        bytesDownloaded: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      await downloadDb.updateDownloadProgress(
        input.downloadId,
        input.progress,
        input.bytesDownloaded
      );
      return { success: true };
    }),

  // Update download status
  updateStatus: protectedProcedure
    .input(
      z.object({
        downloadId: z.number(),
        status: z.enum(["queued", "downloading", "paused", "completed", "failed"]),
        errorMessage: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      await downloadDb.updateDownloadStatus(
        input.downloadId,
        input.status,
        input.errorMessage
      );
      return { success: true };
    }),

  // Pause download
  pause: protectedProcedure
    .input(z.object({ downloadId: z.number() }))
    .mutation(async ({ input }) => {
      const success = await pauseDownload(input.downloadId);
      return { success };
    }),

  // Resume download
  resume: protectedProcedure
    .input(z.object({ downloadId: z.number() }))
    .mutation(async ({ input }) => {
      const success = await resumeDownload(input.downloadId);
      return { success };
    }),

  // Cancel download
  cancel: protectedProcedure
    .input(z.object({ downloadId: z.number() }))
    .mutation(async ({ input }) => {
      const success = await cancelDownload(input.downloadId);
      return { success };
    }),

  // Update download priority
  updatePriority: protectedProcedure
    .input(
      z.object({
        downloadId: z.number(),
        priority: z.number(),
      })
    )
    .mutation(async ({ input }) => {
      await downloadDb.updateDownloadPriority(input.downloadId, input.priority);
      return { success: true };
    }),

  // Delete download
  delete: protectedProcedure
    .input(z.object({ downloadId: z.number() }))
    .mutation(async ({ input }) => {
      await downloadDb.deleteModelDownload(input.downloadId);
      return { success: true };
    }),

  // Get model catalog (HuggingFace popular models)
  getCatalog: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        category: z.enum(["text", "code", "embedding", "all"]).optional(),
      })
    )
    .query(async ({ input }) => {
      // Mock catalog - in production, this would call HuggingFace API
      const allModels = [
        {
          id: 1,
          name: "llama-2-7b-chat",
          displayName: "Llama 2 7B Chat",
          description: "Meta's Llama 2 optimized for dialogue",
          category: "text",
          size: "3.8 GB",
          parameters: "7B",
          source: "huggingface",
          downloadUrl: "https://huggingface.co/meta-llama/Llama-2-7b-chat-hf",
          currentVersion: "2.0",
          availableVersions: ["2.0", "1.1", "1.0"],
          requirements: {
            minVRAM: 8,
            minRAM: 16,
            gpuRequired: false,
            cpuCompatible: true,
          },
        },
        {
          id: 2,
          name: "mistral-7b-instruct",
          displayName: "Mistral 7B Instruct",
          description: "Mistral AI's instruction-tuned model",
          category: "text",
          size: "4.1 GB",
          parameters: "7B",
          source: "huggingface",
          downloadUrl: "https://huggingface.co/mistralai/Mistral-7B-Instruct-v0.2",
          currentVersion: "0.2",
          availableVersions: ["0.2", "0.1"],
          requirements: {
            minVRAM: 8,
            minRAM: 16,
            gpuRequired: false,
            cpuCompatible: true,
          },
        },
        {
          id: 3,
          name: "codellama-7b",
          displayName: "Code Llama 7B",
          description: "Meta's code-specialized Llama model",
          category: "code",
          size: "3.8 GB",
          parameters: "7B",
          source: "huggingface",
          downloadUrl: "https://huggingface.co/codellama/CodeLlama-7b-hf",
          currentVersion: "1.0",
          availableVersions: ["1.0"],
          requirements: {
            minVRAM: 8,
            minRAM: 16,
            gpuRequired: false,
            cpuCompatible: true,
          },
        },
        {
          id: 4,
          name: "bge-large-en-v1.5",
          displayName: "BGE Large EN v1.5",
          description: "BAAI's general embedding model",
          category: "embedding",
          size: "1.34 GB",
          parameters: "335M",
          source: "huggingface",
          downloadUrl: "https://huggingface.co/BAAI/bge-large-en-v1.5",
          currentVersion: "1.5",
          availableVersions: ["1.5", "1.0"],
          requirements: {
            minVRAM: 2,
            minRAM: 4,
            gpuRequired: false,
            cpuCompatible: true,
          },
        },
        {
          id: 5,
          name: "mixtral-8x7b-instruct",
          displayName: "Mixtral 8x7B Instruct",
          description: "Mistral AI's mixture-of-experts model",
          category: "text",
          size: "26.9 GB",
          parameters: "47B",
          source: "huggingface",
          downloadUrl: "https://huggingface.co/mistralai/Mixtral-8x7B-Instruct-v0.1",
          currentVersion: "0.1",
          availableVersions: ["0.1"],
          requirements: {
            minVRAM: 24,
            minRAM: 64,
            gpuRequired: true,
            cpuCompatible: false,
          },
        },
      ];

      let filtered = allModels;

      if (input.category && input.category !== "all") {
        filtered = filtered.filter((m) => m.category === input.category);
      }

      if (input.search) {
        const search = input.search.toLowerCase();
        filtered = filtered.filter(
          (m) =>
            m.name.toLowerCase().includes(search) ||
            m.displayName.toLowerCase().includes(search) ||
            m.description.toLowerCase().includes(search)
        );
      }

      return filtered;
    }),
});
