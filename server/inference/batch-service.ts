import { BaseProvider } from "../providers/base";
import { GenerationRequest, GenerationResponse } from "../providers/types";
import { resourceManager } from "./resource-manager";

/**
 * Batch Inference Service
 * Handles batch processing of multiple inference requests with optimal resource utilization
 */

export interface BatchRequest {
  id: string;
  request: GenerationRequest;
  priority?: number;
  callback?: (response: GenerationResponse) => void;
}

export interface BatchJob {
  id: string;
  requests: BatchRequest[];
  provider: BaseProvider;
  status: "pending" | "processing" | "completed" | "failed";
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  results: Map<string, GenerationResponse | Error>;
  progress: {
    total: number;
    completed: number;
    failed: number;
  };
}

export interface BatchConfig {
  maxBatchSize?: number; // Maximum requests per batch
  maxConcurrency?: number; // Maximum concurrent requests within a batch
  timeout?: number; // Timeout per request in ms
  retryAttempts?: number; // Number of retry attempts for failed requests
  retryDelay?: number; // Delay between retries in ms
  workspaceId?: number; // Workspace ID for resource quota tracking
}

class BatchInferenceService {
  private jobs: Map<string, BatchJob> = new Map();
  private defaultConfig: Required<BatchConfig> = {
    maxBatchSize: 100,
    maxConcurrency: 4,
    timeout: 60000, // 60 seconds
    retryAttempts: 3,
    retryDelay: 1000, // 1 second
    workspaceId: 0,
  };

  /**
   * Create a new batch job
   */
  public createBatch(
    requests: BatchRequest[],
    provider: BaseProvider,
    config?: BatchConfig
  ): string {
    const jobId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const mergedConfig = { ...this.defaultConfig, ...config };

    // Split into smaller batches if needed
    const batches: BatchRequest[][] = [];
    for (let i = 0; i < requests.length; i += mergedConfig.maxBatchSize) {
      batches.push(requests.slice(i, i + mergedConfig.maxBatchSize));
    }

    // Create job for first batch (we'll chain them)
    const job: BatchJob = {
      id: jobId,
      requests: batches[0] || [],
      provider,
      status: "pending",
      createdAt: new Date(),
      results: new Map(),
      progress: {
        total: requests.length,
        completed: 0,
        failed: 0,
      },
    };

    this.jobs.set(jobId, job);

    // Start processing
    this.processBatch(jobId, mergedConfig).catch((error) => {
      console.error(`[BatchService] Batch ${jobId} failed:`, error);
      job.status = "failed";
    });

    return jobId;
  }

  /**
   * Process a batch job
   */
  private async processBatch(jobId: string, config: Required<BatchConfig>): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Batch job ${jobId} not found`);
    }

    job.status = "processing";
    job.startedAt = new Date();

    // Process requests with controlled concurrency
    const chunks: BatchRequest[][] = [];
    for (let i = 0; i < job.requests.length; i += config.maxConcurrency) {
      chunks.push(job.requests.slice(i, i + config.maxConcurrency));
    }

    for (const chunk of chunks) {
      await Promise.all(
        chunk.map((batchReq) =>
          this.processRequest(job, batchReq, config)
        )
      );
    }

    job.status = "completed";
    job.completedAt = new Date();

    console.log(`[BatchService] Batch ${jobId} completed:`, {
      total: job.progress.total,
      completed: job.progress.completed,
      failed: job.progress.failed,
      duration: job.completedAt.getTime() - job.startedAt!.getTime(),
    });
  }

  /**
   * Process a single request within a batch
   */
  private async processRequest(
    job: BatchJob,
    batchReq: BatchRequest,
    config: Required<BatchConfig>
  ): Promise<void> {
    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < config.retryAttempts) {
      try {
        // Acquire request slot
        await resourceManager.acquireRequestSlot(
          batchReq.id,
          config.workspaceId ?? 1,
          batchReq.priority || 1
        );

        // Execute with timeout
        const response = await Promise.race([
          job.provider.generate(batchReq.request),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Request timeout")), config.timeout)
          ),
        ]);

        // Success
        job.results.set(batchReq.id, response);
        job.progress.completed++;

        if (batchReq.callback) {
          batchReq.callback(response);
        }

        // Release request slot
        resourceManager.releaseRequestSlot(batchReq.id);

        return;
      } catch (error) {
        lastError = error as Error;
        attempts++;

        // Release request slot
        resourceManager.releaseRequestSlot(batchReq.id);

        if (attempts < config.retryAttempts) {
          console.warn(
            `[BatchService] Request ${batchReq.id} failed (attempt ${attempts}/${config.retryAttempts}), retrying...`
          );
          await new Promise((resolve) => setTimeout(resolve, config.retryDelay));
        }
      }
    }

    // All retries failed
    job.results.set(batchReq.id, lastError!);
    job.progress.failed++;
    console.error(`[BatchService] Request ${batchReq.id} failed after ${attempts} attempts:`, lastError);
  }

  /**
   * Get batch job status
   */
  public getJob(jobId: string): BatchJob | null {
    return this.jobs.get(jobId) || null;
  }

  /**
   * Get batch job results
   */
  public getResults(jobId: string): Map<string, GenerationResponse | Error> | null {
    const job = this.jobs.get(jobId);
    return job ? job.results : null;
  }

  /**
   * Cancel a batch job
   */
  public cancelJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.status === "completed") {
      return false;
    }

    job.status = "failed";
    return true;
  }

  /**
   * Get all jobs
   */
  public getAllJobs(): BatchJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Clean up completed jobs older than retention period
   */
  public cleanup(retentionMs: number = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    for (const [jobId, job] of Array.from(this.jobs.entries())) {
      if (
        job.status === "completed" &&
        job.completedAt &&
        now - job.completedAt.getTime() > retentionMs
      ) {
        this.jobs.delete(jobId);
      }
    }
  }

  /**
   * Helper: Create batch from array of prompts
   */
  public createSimpleBatch(
    prompts: string[],
    provider: BaseProvider,
    model?: string,
    config?: BatchConfig
  ): string {
    const requests: BatchRequest[] = prompts.map((prompt, index) => ({
      id: `req-${index}`,
      request: {
        messages: [{ role: "user", content: prompt }],
        model,
      },
    }));

    return this.createBatch(requests, provider, config);
  }

  /**
   * Helper: Wait for batch completion
   */
  public async waitForCompletion(
    jobId: string,
    pollInterval: number = 1000
  ): Promise<Map<string, GenerationResponse | Error>> {
    return new Promise((resolve, reject) => {
      const checkStatus = () => {
        const job = this.getJob(jobId);
        if (!job) {
          reject(new Error(`Job ${jobId} not found`));
          return;
        }

        if (job.status === "completed") {
          resolve(job.results);
        } else if (job.status === "failed") {
          reject(new Error(`Job ${jobId} failed`));
        } else {
          setTimeout(checkStatus, pollInterval);
        }
      };

      checkStatus();
    });
  }
}

// Singleton instance
export const batchService = new BatchInferenceService();

// Periodic cleanup
setInterval(() => {
  batchService.cleanup();
}, 60 * 60 * 1000); // Every hour
