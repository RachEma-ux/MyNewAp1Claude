/**
 * Job Queue Service Tests
 *
 * Tests for background job orchestration, status tracking,
 * and event emission for the training pipeline
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { jobQueue, JobType, JobStatus } from "../job-queue";

describe("JobQueue Service", () => {
  // Clear all jobs before each test
  beforeEach(() => {
    // Clear jobs by cleaning up old jobs with 0ms threshold
    jobQueue.cleanupOldJobs(0);
  });

  afterEach(() => {
    // Clean up after each test
    jobQueue.cleanupOldJobs(0);
  });

  describe("Job Enqueueing", () => {
    it("should enqueue a training job successfully", async () => {
      const job = await jobQueue.enqueue(
        "training",
        { trainingRunId: 1, config: { epochs: 3 } },
        { projectId: 1, trainingRunId: 1, userId: 1 }
      );

      expect(job).toBeDefined();
      expect(job.type).toBe("training");
      expect(job.status).toBe("pending");
      expect(job.progress).toBe(0);
      expect(job.payload.trainingRunId).toBe(1);
      expect(job.metadata?.projectId).toBe(1);
      expect(job.id).toMatch(/^job_\d+_/);
    });

    it("should enqueue multiple job types", async () => {
      const trainingJob = await jobQueue.enqueue("training", {}, {});
      const evaluationJob = await jobQueue.enqueue("evaluation", {}, {});
      const quantizationJob = await jobQueue.enqueue("quantization", {}, {});
      const datasetJob = await jobQueue.enqueue("dataset_validation", {}, {});

      expect(trainingJob.type).toBe("training");
      expect(evaluationJob.type).toBe("evaluation");
      expect(quantizationJob.type).toBe("quantization");
      expect(datasetJob.type).toBe("dataset_validation");
    });

    it("should emit job:created event when enqueueing", async () => {
      const eventSpy = vi.fn();
      jobQueue.on("job:created", eventSpy);

      const job = await jobQueue.enqueue("training", {}, {});

      expect(eventSpy).toHaveBeenCalledWith(job);
      jobQueue.off("job:created", eventSpy);
    });
  });

  describe("Job Retrieval", () => {
    it("should get a job by ID", async () => {
      const job = await jobQueue.enqueue("training", { test: "data" }, {});
      const retrieved = jobQueue.getJob(job.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(job.id);
      expect(retrieved?.payload.test).toBe("data");
    });

    it("should return undefined for non-existent job", () => {
      const job = jobQueue.getJob("non-existent-id");
      expect(job).toBeUndefined();
    });

    it("should get all jobs without filters", async () => {
      await jobQueue.enqueue("training", {}, {});
      await jobQueue.enqueue("evaluation", {}, {});
      await jobQueue.enqueue("quantization", {}, {});

      const jobs = jobQueue.getJobs();
      expect(jobs.length).toBeGreaterThanOrEqual(3);
    });

    it("should filter jobs by type", async () => {
      await jobQueue.enqueue("training", {}, {});
      await jobQueue.enqueue("training", {}, {});
      await jobQueue.enqueue("evaluation", {}, {});

      const trainingJobs = jobQueue.getJobs({ type: "training" });
      expect(trainingJobs.length).toBe(2);
      expect(trainingJobs.every((j) => j.type === "training")).toBe(true);
    });

    it("should filter jobs by status", async () => {
      const job1 = await jobQueue.enqueue("training", {}, {});
      const job2 = await jobQueue.enqueue("training", {}, {});
      await jobQueue.startJob(job1.id);

      const pendingJobs = jobQueue.getJobs({ status: "pending" });
      const runningJobs = jobQueue.getJobs({ status: "running" });

      expect(pendingJobs.length).toBeGreaterThanOrEqual(1);
      expect(runningJobs.length).toBe(1);
      expect(runningJobs[0].id).toBe(job1.id);
    });

    it("should sort jobs by creation date (newest first)", async () => {
      const job1 = await jobQueue.enqueue("training", {}, {});
      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));
      const job2 = await jobQueue.enqueue("training", {}, {});

      const jobs = jobQueue.getJobs();
      const job1Index = jobs.findIndex((j) => j.id === job1.id);
      const job2Index = jobs.findIndex((j) => j.id === job2.id);

      expect(job2Index).toBeLessThan(job1Index);
    });
  });

  describe("Job Lifecycle", () => {
    it("should start a job successfully", async () => {
      const job = await jobQueue.enqueue("training", {}, {});
      const started = await jobQueue.startJob(job.id);

      expect(started).toBeDefined();
      expect(started?.status).toBe("running");
      expect(started?.startedAt).toBeDefined();
    });

    it("should emit job:started event", async () => {
      const eventSpy = vi.fn();
      jobQueue.on("job:started", eventSpy);

      const job = await jobQueue.enqueue("training", {}, {});
      await jobQueue.startJob(job.id);

      expect(eventSpy).toHaveBeenCalled();
      jobQueue.off("job:started", eventSpy);
    });

    it("should update job progress", async () => {
      const job = await jobQueue.enqueue("training", {}, {});
      await jobQueue.startJob(job.id);

      const updated = jobQueue.updateJob(job.id, {
        progress: 50,
        metadata: { currentStep: 50, totalSteps: 100 },
      });

      expect(updated?.progress).toBe(50);
      expect(updated?.metadata?.currentStep).toBe(50);
    });

    it("should emit job:updated event on progress update", async () => {
      const eventSpy = vi.fn();
      jobQueue.on("job:updated", eventSpy);

      const job = await jobQueue.enqueue("training", {}, {});
      jobQueue.updateJob(job.id, { progress: 25 });

      expect(eventSpy).toHaveBeenCalled();
      jobQueue.off("job:updated", eventSpy);
    });

    it("should complete a job successfully", async () => {
      const job = await jobQueue.enqueue("training", {}, {});
      await jobQueue.startJob(job.id);

      const result = { checkpointPath: "/path/to/checkpoint" };
      const completed = await jobQueue.completeJob(job.id, result);

      expect(completed?.status).toBe("completed");
      expect(completed?.progress).toBe(100);
      expect(completed?.completedAt).toBeDefined();
      expect(completed?.result).toEqual(result);
    });

    it("should emit job:completed event", async () => {
      const eventSpy = vi.fn();
      jobQueue.on("job:completed", eventSpy);

      const job = await jobQueue.enqueue("training", {}, {});
      await jobQueue.startJob(job.id);
      await jobQueue.completeJob(job.id);

      expect(eventSpy).toHaveBeenCalled();
      jobQueue.off("job:completed", eventSpy);
    });

    it("should fail a job with error message", async () => {
      const job = await jobQueue.enqueue("training", {}, {});
      await jobQueue.startJob(job.id);

      const errorMsg = "Training failed due to OOM";
      const failed = await jobQueue.failJob(job.id, errorMsg);

      expect(failed?.status).toBe("failed");
      expect(failed?.error).toBe(errorMsg);
      expect(failed?.failedAt).toBeDefined();
    });

    it("should emit job:failed event", async () => {
      const eventSpy = vi.fn();
      jobQueue.on("job:failed", eventSpy);

      const job = await jobQueue.enqueue("training", {}, {});
      await jobQueue.startJob(job.id);
      await jobQueue.failJob(job.id, "Test error");

      expect(eventSpy).toHaveBeenCalled();
      jobQueue.off("job:failed", eventSpy);
    });

    it("should cancel a pending job", async () => {
      const job = await jobQueue.enqueue("training", {}, {});
      const cancelled = await jobQueue.cancelJob(job.id);

      expect(cancelled?.status).toBe("cancelled");
    });

    it("should cancel a running job", async () => {
      const job = await jobQueue.enqueue("training", {}, {});
      await jobQueue.startJob(job.id);

      const cancelled = await jobQueue.cancelJob(job.id);
      expect(cancelled?.status).toBe("cancelled");
    });

    it("should not cancel completed or failed jobs", async () => {
      const job = await jobQueue.enqueue("training", {}, {});
      await jobQueue.startJob(job.id);
      await jobQueue.completeJob(job.id);

      await expect(jobQueue.cancelJob(job.id)).rejects.toThrow(
        "Cannot cancel completed or failed job"
      );
    });

    it("should emit job:cancelled event", async () => {
      const eventSpy = vi.fn();
      jobQueue.on("job:cancelled", eventSpy);

      const job = await jobQueue.enqueue("training", {}, {});
      await jobQueue.cancelJob(job.id);

      expect(eventSpy).toHaveBeenCalled();
      jobQueue.off("job:cancelled", eventSpy);
    });
  });

  describe("Concurrency Control", () => {
    it("should respect max concurrent jobs limit", async () => {
      // Enqueue 3 jobs (max is 2)
      const job1 = await jobQueue.enqueue("training", {}, {});
      const job2 = await jobQueue.enqueue("training", {}, {});
      const job3 = await jobQueue.enqueue("training", {}, {});

      // Wait a bit for auto-processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      const runningJobs = jobQueue.getJobs({ status: "running" });
      expect(runningJobs.length).toBeLessThanOrEqual(2);
    });

    it("should auto-process next job when one completes", async () => {
      const readyEventSpy = vi.fn();
      jobQueue.on("job:ready", readyEventSpy);

      const job1 = await jobQueue.enqueue("training", {}, {});
      const job2 = await jobQueue.enqueue("training", {}, {});
      const job3 = await jobQueue.enqueue("training", {}, {});

      await jobQueue.startJob(job1.id);
      await jobQueue.startJob(job2.id);

      // Complete one job
      await jobQueue.completeJob(job1.id);

      // Should emit job:ready for the next pending job
      expect(readyEventSpy).toHaveBeenCalled();

      jobQueue.off("job:ready", readyEventSpy);
    });
  });

  describe("Queue Statistics", () => {
    it("should return accurate queue stats", async () => {
      await jobQueue.enqueue("training", {}, {});
      const job2 = await jobQueue.enqueue("training", {}, {});
      const job3 = await jobQueue.enqueue("training", {}, {});

      await jobQueue.startJob(job2.id);
      await jobQueue.completeJob(job2.id);
      await jobQueue.failJob(job3.id, "Test error");

      const stats = jobQueue.getStats();

      expect(stats.total).toBeGreaterThanOrEqual(3);
      expect(stats.pending).toBeGreaterThanOrEqual(0);
      expect(stats.running).toBeGreaterThanOrEqual(0);
      expect(stats.completed).toBeGreaterThanOrEqual(1);
      expect(stats.failed).toBeGreaterThanOrEqual(1);
    });

    it("should include cancelled jobs in stats", async () => {
      const job = await jobQueue.enqueue("training", {}, {});
      await jobQueue.cancelJob(job.id);

      const stats = jobQueue.getStats();
      expect(stats.cancelled).toBeGreaterThanOrEqual(1);
    });
  });

  describe("Job Cleanup", () => {
    it("should clean up old completed jobs", async () => {
      const job = await jobQueue.enqueue("training", {}, {});
      await jobQueue.startJob(job.id);
      await jobQueue.completeJob(job.id);

      // Manually set completedAt to past time
      const retrieved = jobQueue.getJob(job.id);
      if (retrieved) {
        retrieved.completedAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      }

      const cleaned = jobQueue.cleanupOldJobs(24 * 60 * 60 * 1000); // 24 hours
      expect(cleaned).toBeGreaterThanOrEqual(1);

      const afterCleanup = jobQueue.getJob(job.id);
      expect(afterCleanup).toBeUndefined();
    });

    it("should not clean up recent jobs", async () => {
      const job = await jobQueue.enqueue("training", {}, {});
      await jobQueue.startJob(job.id);
      await jobQueue.completeJob(job.id);

      const cleaned = jobQueue.cleanupOldJobs(24 * 60 * 60 * 1000);
      const stillExists = jobQueue.getJob(job.id);

      expect(stillExists).toBeDefined();
    });

    it("should not clean up running jobs regardless of age", async () => {
      const job = await jobQueue.enqueue("training", {}, {});
      await jobQueue.startJob(job.id);

      // Job is running, should not be cleaned up
      const cleaned = jobQueue.cleanupOldJobs(0);
      const stillExists = jobQueue.getJob(job.id);

      expect(stillExists).toBeDefined();
      expect(stillExists?.status).toBe("running");
    });
  });

  describe("Job Metadata", () => {
    it("should store and retrieve job metadata", async () => {
      const metadata = {
        projectId: 123,
        trainingRunId: 456,
        userId: 789,
      };

      const job = await jobQueue.enqueue("training", {}, metadata);

      expect(job.metadata?.projectId).toBe(123);
      expect(job.metadata?.trainingRunId).toBe(456);
      expect(job.metadata?.userId).toBe(789);
    });

    it("should update metadata during job updates", async () => {
      const job = await jobQueue.enqueue("training", {}, { projectId: 1 });

      jobQueue.updateJob(job.id, {
        metadata: {
          ...job.metadata,
          currentStep: 50,
          loss: 0.5,
        },
      });

      const updated = jobQueue.getJob(job.id);
      expect(updated?.metadata?.currentStep).toBe(50);
      expect(updated?.metadata?.loss).toBe(0.5);
      expect(updated?.metadata?.projectId).toBe(1);
    });
  });

  describe("Edge Cases", () => {
    it("should handle undefined job ID gracefully", () => {
      const job = jobQueue.getJob("");
      expect(job).toBeUndefined();
    });

    it("should handle updating non-existent job", () => {
      const updated = jobQueue.updateJob("non-existent", { progress: 50 });
      expect(updated).toBeUndefined();
    });

    it("should handle starting non-existent job", async () => {
      const started = await jobQueue.startJob("non-existent");
      expect(started).toBeUndefined();
    });

    it("should handle completing non-existent job", async () => {
      const completed = await jobQueue.completeJob("non-existent");
      expect(completed).toBeUndefined();
    });

    it("should handle failing non-existent job", async () => {
      const failed = await jobQueue.failJob("non-existent", "error");
      expect(failed).toBeUndefined();
    });
  });
});
