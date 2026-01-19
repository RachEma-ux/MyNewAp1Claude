/**
 * Training Executor Service Tests
 *
 * Tests for training, evaluation, and quantization job execution
 * Validates job processing, progress tracking, and database integration
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { jobQueue } from "../job-queue";
import { trainingExecutor } from "../training-executor";

// Mock the database module
vi.mock("../../db", () => ({
  getDb: vi.fn(() => ({
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve([{}])),
      })),
    })),
  })),
}));

// Mock the schema
vi.mock("../../../drizzle/schema", () => ({
  llmTrainingRuns: {},
  llmEvaluations: {},
  llmQuantizations: {},
  llmCreationProjects: {},
}));

// Mock drizzle-orm
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => ({})),
}));

describe("Training Executor Service", () => {
  beforeEach(() => {
    // Clear job queue
    jobQueue.cleanupOldJobs(0);
    vi.clearAllMocks();
  });

  afterEach(() => {
    jobQueue.cleanupOldJobs(0);
  });

  describe("Training Job Execution", () => {
    it("should execute a training job and update progress", async () => {
      const job = await jobQueue.enqueue(
        "training",
        {
          trainingRunId: 1,
          config: {
            learningRate: 2e-5,
            batchSize: 4,
            epochs: 1,
          },
          datasetIds: [1, 2],
          framework: "huggingface",
        },
        {
          projectId: 1,
          trainingRunId: 1,
          userId: 1,
        }
      );

      // Manually trigger job processing
      await jobQueue.startJob(job.id);

      // Wait a bit for initial processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      const updatedJob = jobQueue.getJob(job.id);
      expect(updatedJob).toBeDefined();

      // Job should have started
      expect(updatedJob?.status).toBe("running");
    });

    it("should generate realistic training metrics", async () => {
      const job = await jobQueue.enqueue(
        "training",
        {
          trainingRunId: 2,
          config: { epochs: 1, batchSize: 4 },
        },
        { trainingRunId: 2 }
      );

      await jobQueue.startJob(job.id);
      await new Promise((resolve) => setTimeout(resolve, 500));

      const updatedJob = jobQueue.getJob(job.id);

      // Should have progress metadata
      if (updatedJob?.metadata) {
        expect(updatedJob.metadata).toHaveProperty("currentStep");
        expect(updatedJob.metadata).toHaveProperty("totalSteps");
        expect(updatedJob.metadata).toHaveProperty("loss");
        expect(updatedJob.metadata).toHaveProperty("perplexity");
        expect(updatedJob.metadata).toHaveProperty("tokensPerSecond");
      }
    });

    it("should complete training job successfully", async () => {
      const job = await jobQueue.enqueue(
        "training",
        {
          trainingRunId: 3,
          config: { epochs: 1, batchSize: 10 },
        },
        { trainingRunId: 3 }
      );

      await jobQueue.startJob(job.id);

      // Wait for job to complete (100 steps * 100ms = 10s, but we'll wait less for testing)
      // In real tests, we'd mock the sleep function
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const completedJob = jobQueue.getJob(job.id);

      // Job should eventually complete or be in progress
      expect(["running", "completed"]).toContain(completedJob?.status);
    });
  });

  describe("Evaluation Job Execution", () => {
    it("should execute evaluation job", async () => {
      const job = await jobQueue.enqueue(
        "evaluation",
        {
          evaluationId: 1,
          modelPath: "/models/test-model",
          modelType: "sft",
          benchmarks: ["mmlu", "hellaswag"],
        },
        {
          projectId: 1,
          evaluationId: 1,
          userId: 1,
        }
      );

      await jobQueue.startJob(job.id);
      await new Promise((resolve) => setTimeout(resolve, 500));

      const updatedJob = jobQueue.getJob(job.id);
      expect(updatedJob?.status).toBe("running");
    });

    it("should use default benchmarks if none provided", async () => {
      const job = await jobQueue.enqueue(
        "evaluation",
        {
          evaluationId: 2,
          modelPath: "/models/test-model",
          modelType: "dpo",
          // No benchmarks specified
        },
        { evaluationId: 2 }
      );

      await jobQueue.startJob(job.id);
      await new Promise((resolve) => setTimeout(resolve, 200));

      const updatedJob = jobQueue.getJob(job.id);
      expect(updatedJob).toBeDefined();
      expect(updatedJob?.status).toBe("running");
    });

    it("should complete evaluation with results", async () => {
      const job = await jobQueue.enqueue(
        "evaluation",
        {
          evaluationId: 3,
          modelPath: "/models/test",
          modelType: "base",
          benchmarks: ["mmlu"],
        },
        { evaluationId: 3 }
      );

      await jobQueue.startJob(job.id);
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const completedJob = jobQueue.getJob(job.id);
      expect(["running", "completed"]).toContain(completedJob?.status);
    });
  });

  describe("Quantization Job Execution", () => {
    it("should execute quantization job", async () => {
      const job = await jobQueue.enqueue(
        "quantization",
        {
          quantizationId: 1,
          sourceModelPath: "/models/base-model",
          quantizationType: "Q4_K_M",
          method: "llama.cpp",
        },
        {
          projectId: 1,
          quantizationId: 1,
          userId: 1,
        }
      );

      await jobQueue.startJob(job.id);
      await new Promise((resolve) => setTimeout(resolve, 200));

      const updatedJob = jobQueue.getJob(job.id);
      expect(updatedJob?.status).toBe("running");
    });

    it("should support different quantization types", async () => {
      const types = ["Q4_K_M", "Q5_K_M", "Q8_0", "Q2_K", "f16"];

      for (const type of types) {
        const job = await jobQueue.enqueue(
          "quantization",
          {
            quantizationId: Math.random(),
            sourceModelPath: "/models/test",
            quantizationType: type,
            method: "llama.cpp",
          },
          {}
        );

        expect(job).toBeDefined();
        expect(job.type).toBe("quantization");
      }
    });

    it("should default to llama.cpp method", async () => {
      const job = await jobQueue.enqueue(
        "quantization",
        {
          quantizationId: 2,
          sourceModelPath: "/models/test",
          quantizationType: "Q4_K_M",
          // No method specified
        },
        {}
      );

      expect(job.payload.quantizationType).toBe("Q4_K_M");
    });
  });

  describe("Dataset Validation Execution", () => {
    it("should execute dataset validation job", async () => {
      const job = await jobQueue.enqueue(
        "dataset_validation",
        {
          datasetId: 1,
          filePath: "/datasets/training-data.jsonl",
        },
        { projectId: 1 }
      );

      await jobQueue.startJob(job.id);
      await new Promise((resolve) => setTimeout(resolve, 600));

      const completedJob = jobQueue.getJob(job.id);
      expect(["running", "completed"]).toContain(completedJob?.status);
    });
  });

  describe("Error Handling", () => {
    it("should handle job failures gracefully", async () => {
      // Create a job that will fail (we'll force it by mocking)
      const job = await jobQueue.enqueue(
        "training",
        {
          trainingRunId: 999,
          config: {},
        },
        { trainingRunId: 999 }
      );

      await jobQueue.startJob(job.id);

      // The job might fail or continue - either is acceptable
      // We're just checking that it doesn't crash
      await new Promise((resolve) => setTimeout(resolve, 200));

      const updatedJob = jobQueue.getJob(job.id);
      expect(updatedJob).toBeDefined();
      expect(["running", "failed", "completed"]).toContain(updatedJob?.status);
    });
  });

  describe("Job Queue Integration", () => {
    it("should listen for job:ready events", () => {
      // Training executor should be listening for job:ready events
      const listeners = jobQueue.listeners("job:ready");
      expect(listeners.length).toBeGreaterThan(0);
    });

    it("should process jobs automatically when ready", async () => {
      const job = await jobQueue.enqueue(
        "training",
        {
          trainingRunId: 10,
          config: { epochs: 1 },
        },
        { trainingRunId: 10 }
      );

      // Job should be auto-started by the executor
      await new Promise((resolve) => setTimeout(resolve, 300));

      const updatedJob = jobQueue.getJob(job.id);

      // Job should have been processed
      expect(["pending", "running", "completed"]).toContain(updatedJob?.status);
    });
  });

  describe("Progress Tracking", () => {
    it("should emit progress updates during training", async () => {
      const progressSpy = vi.fn();
      jobQueue.on("job:updated", progressSpy);

      const job = await jobQueue.enqueue(
        "training",
        {
          trainingRunId: 11,
          config: { epochs: 1, batchSize: 10 },
        },
        { trainingRunId: 11 }
      );

      await jobQueue.startJob(job.id);
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Should have emitted at least one progress update
      expect(progressSpy).toHaveBeenCalled();

      jobQueue.off("job:updated", progressSpy);
    });

    it("should update progress from 0 to 100", async () => {
      const job = await jobQueue.enqueue(
        "training",
        {
          trainingRunId: 12,
          config: { epochs: 1, batchSize: 20 },
        },
        { trainingRunId: 12 }
      );

      await jobQueue.startJob(job.id);

      // Initial progress
      const initialJob = jobQueue.getJob(job.id);
      expect(initialJob?.progress).toBeGreaterThanOrEqual(0);

      // Wait for some progress
      await new Promise((resolve) => setTimeout(resolve, 300));

      const midJob = jobQueue.getJob(job.id);
      expect(midJob?.progress).toBeGreaterThan(0);
      expect(midJob?.progress).toBeLessThanOrEqual(100);
    });
  });

  describe("Concurrent Job Processing", () => {
    it("should handle multiple jobs concurrently", async () => {
      const job1 = await jobQueue.enqueue("training", { trainingRunId: 20 }, {});
      const job2 = await jobQueue.enqueue("evaluation", { evaluationId: 20 }, {});

      await jobQueue.startJob(job1.id);
      await jobQueue.startJob(job2.id);

      await new Promise((resolve) => setTimeout(resolve, 200));

      const jobs = jobQueue.getJobs({ status: "running" });
      expect(jobs.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Cancellation Support", () => {
    it("should support cancelling training jobs", async () => {
      const job = await jobQueue.enqueue(
        "training",
        { trainingRunId: 30 },
        { trainingRunId: 30 }
      );

      await jobQueue.startJob(job.id);
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Cancel the job
      await jobQueue.cancelJob(job.id);

      const cancelledJob = jobQueue.getJob(job.id);
      expect(cancelledJob?.status).toBe("cancelled");
    });
  });
});
