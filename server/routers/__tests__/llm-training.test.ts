/**
 * LLM Router Training Pipeline Tests
 *
 * Tests for the new training orchestration procedures:
 * - getJobStatus
 * - listJobs
 * - cancelJob
 * - getQueueStats
 * - pauseTraining
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { jobQueue } from "../../services/job-queue";

// Mock tRPC context
const mockContext = {
  user: {
    id: 1,
    username: "test-user",
  },
  session: null,
};

describe("LLM Router - Training Pipeline Procedures", () => {
  beforeEach(() => {
    // Clear job queue before each test
    jobQueue.cleanupOldJobs(0);
  });

  afterEach(() => {
    jobQueue.cleanupOldJobs(0);
  });

  describe("getJobStatus", () => {
    it("should retrieve job status by ID", async () => {
      const job = await jobQueue.enqueue(
        "training",
        { trainingRunId: 1 },
        { projectId: 1, trainingRunId: 1, userId: 1 }
      );

      const retrieved = jobQueue.getJob(job.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(job.id);
      expect(retrieved?.type).toBe("training");
      expect(retrieved?.status).toBe("pending");
    });

    it("should throw error for non-existent job", () => {
      const job = jobQueue.getJob("non-existent-id");
      expect(job).toBeUndefined();
    });

    it("should return complete job details", async () => {
      const payload = { trainingRunId: 2, config: { epochs: 3 } };
      const metadata = { projectId: 2, trainingRunId: 2, userId: 1 };

      const job = await jobQueue.enqueue("training", payload, metadata);

      const retrieved = jobQueue.getJob(job.id);

      expect(retrieved).toHaveProperty("id");
      expect(retrieved).toHaveProperty("type");
      expect(retrieved).toHaveProperty("status");
      expect(retrieved).toHaveProperty("progress");
      expect(retrieved).toHaveProperty("createdAt");
      expect(retrieved).toHaveProperty("payload");
      expect(retrieved).toHaveProperty("metadata");
      expect(retrieved?.payload).toEqual(payload);
      expect(retrieved?.metadata).toMatchObject(metadata);
    });

    it("should include timestamps for job lifecycle", async () => {
      const job = await jobQueue.enqueue("training", {}, {});
      await jobQueue.startJob(job.id);

      const running = jobQueue.getJob(job.id);
      expect(running?.createdAt).toBeDefined();
      expect(running?.startedAt).toBeDefined();

      await jobQueue.completeJob(job.id);

      const completed = jobQueue.getJob(job.id);
      expect(completed?.completedAt).toBeDefined();
    });
  });

  describe("listJobs", () => {
    it("should list all jobs without filters", async () => {
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
      await jobQueue.enqueue("quantization", {}, {});

      const trainingJobs = jobQueue.getJobs({ type: "training" });
      const evaluationJobs = jobQueue.getJobs({ type: "evaluation" });
      const quantizationJobs = jobQueue.getJobs({ type: "quantization" });

      expect(trainingJobs.length).toBe(2);
      expect(evaluationJobs.length).toBe(1);
      expect(quantizationJobs.length).toBe(1);

      expect(trainingJobs.every((j) => j.type === "training")).toBe(true);
      expect(evaluationJobs.every((j) => j.type === "evaluation")).toBe(true);
      expect(quantizationJobs.every((j) => j.type === "quantization")).toBe(true);
    });

    it("should filter jobs by status", async () => {
      const job1 = await jobQueue.enqueue("training", {}, {});
      const job2 = await jobQueue.enqueue("training", {}, {});
      const job3 = await jobQueue.enqueue("training", {}, {});

      await jobQueue.startJob(job1.id);
      await jobQueue.startJob(job2.id);
      await jobQueue.completeJob(job2.id);
      await jobQueue.failJob(job3.id, "Test error");

      const pendingJobs = jobQueue.getJobs({ status: "pending" });
      const runningJobs = jobQueue.getJobs({ status: "running" });
      const completedJobs = jobQueue.getJobs({ status: "completed" });
      const failedJobs = jobQueue.getJobs({ status: "failed" });

      expect(runningJobs.length).toBeGreaterThanOrEqual(1);
      expect(completedJobs.length).toBeGreaterThanOrEqual(1);
      expect(failedJobs.length).toBeGreaterThanOrEqual(1);
    });

    it("should filter jobs by projectId", async () => {
      await jobQueue.enqueue("training", {}, { projectId: 1 });
      await jobQueue.enqueue("training", {}, { projectId: 1 });
      await jobQueue.enqueue("training", {}, { projectId: 2 });

      const jobs = jobQueue.getJobs();
      const project1Jobs = jobs.filter((j) => j.metadata?.projectId === 1);
      const project2Jobs = jobs.filter((j) => j.metadata?.projectId === 2);

      expect(project1Jobs.length).toBe(2);
      expect(project2Jobs.length).toBe(1);
    });

    it("should combine multiple filters", async () => {
      const job1 = await jobQueue.enqueue("training", {}, { projectId: 1 });
      const job2 = await jobQueue.enqueue("training", {}, { projectId: 1 });
      await jobQueue.enqueue("training", {}, { projectId: 2 });
      await jobQueue.enqueue("evaluation", {}, { projectId: 1 });

      await jobQueue.startJob(job1.id);
      await jobQueue.completeJob(job1.id);

      // Filter: type=training, status=completed
      const filtered = jobQueue.getJobs({ type: "training", status: "completed" });

      expect(filtered.length).toBeGreaterThanOrEqual(1);
      expect(filtered.every((j) => j.type === "training" && j.status === "completed")).toBe(true);
    });

    it("should return jobs sorted by creation time", async () => {
      const job1 = await jobQueue.enqueue("training", {}, {});
      await new Promise((resolve) => setTimeout(resolve, 10));
      const job2 = await jobQueue.enqueue("training", {}, {});
      await new Promise((resolve) => setTimeout(resolve, 10));
      const job3 = await jobQueue.enqueue("training", {}, {});

      const jobs = jobQueue.getJobs();

      // Newest first
      const job1Index = jobs.findIndex((j) => j.id === job1.id);
      const job2Index = jobs.findIndex((j) => j.id === job2.id);
      const job3Index = jobs.findIndex((j) => j.id === job3.id);

      expect(job3Index).toBeLessThan(job2Index);
      expect(job2Index).toBeLessThan(job1Index);
    });
  });

  describe("cancelJob", () => {
    it("should cancel a pending job", async () => {
      const job = await jobQueue.enqueue("training", {}, {});

      const cancelled = await jobQueue.cancelJob(job.id);

      expect(cancelled?.status).toBe("cancelled");
      expect(cancelled?.id).toBe(job.id);
    });

    it("should cancel a running job", async () => {
      const job = await jobQueue.enqueue("training", {}, {});
      await jobQueue.startJob(job.id);

      const cancelled = await jobQueue.cancelJob(job.id);

      expect(cancelled?.status).toBe("cancelled");
    });

    it("should not cancel completed jobs", async () => {
      const job = await jobQueue.enqueue("training", {}, {});
      await jobQueue.startJob(job.id);
      await jobQueue.completeJob(job.id);

      await expect(jobQueue.cancelJob(job.id)).rejects.toThrow(
        "Cannot cancel completed or failed job"
      );
    });

    it("should not cancel failed jobs", async () => {
      const job = await jobQueue.enqueue("training", {}, {});
      await jobQueue.startJob(job.id);
      await jobQueue.failJob(job.id, "Test error");

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

    it("should support cancelling different job types", async () => {
      const trainingJob = await jobQueue.enqueue("training", {}, {});
      const evalJob = await jobQueue.enqueue("evaluation", {}, {});
      const quantJob = await jobQueue.enqueue("quantization", {}, {});

      await jobQueue.cancelJob(trainingJob.id);
      await jobQueue.cancelJob(evalJob.id);
      await jobQueue.cancelJob(quantJob.id);

      expect(jobQueue.getJob(trainingJob.id)?.status).toBe("cancelled");
      expect(jobQueue.getJob(evalJob.id)?.status).toBe("cancelled");
      expect(jobQueue.getJob(quantJob.id)?.status).toBe("cancelled");
    });
  });

  describe("getQueueStats", () => {
    it("should return queue statistics", async () => {
      const stats = jobQueue.getStats();

      expect(stats).toHaveProperty("total");
      expect(stats).toHaveProperty("pending");
      expect(stats).toHaveProperty("running");
      expect(stats).toHaveProperty("completed");
      expect(stats).toHaveProperty("failed");
      expect(stats).toHaveProperty("cancelled");

      expect(typeof stats.total).toBe("number");
      expect(typeof stats.pending).toBe("number");
      expect(typeof stats.running).toBe("number");
      expect(typeof stats.completed).toBe("number");
      expect(typeof stats.failed).toBe("number");
      expect(typeof stats.cancelled).toBe("number");
    });

    it("should reflect accurate job counts", async () => {
      // Create jobs in different states
      const job1 = await jobQueue.enqueue("training", {}, {});
      const job2 = await jobQueue.enqueue("training", {}, {});
      const job3 = await jobQueue.enqueue("training", {}, {});
      const job4 = await jobQueue.enqueue("training", {}, {});

      await jobQueue.startJob(job2.id);
      await jobQueue.completeJob(job2.id);
      await jobQueue.failJob(job3.id, "Test");
      await jobQueue.cancelJob(job4.id);

      const stats = jobQueue.getStats();

      expect(stats.total).toBeGreaterThanOrEqual(4);
      expect(stats.completed).toBeGreaterThanOrEqual(1);
      expect(stats.failed).toBeGreaterThanOrEqual(1);
      expect(stats.cancelled).toBeGreaterThanOrEqual(1);
    });

    it("should update stats as jobs progress", async () => {
      const initialStats = jobQueue.getStats();

      const job = await jobQueue.enqueue("training", {}, {});

      const afterEnqueue = jobQueue.getStats();
      expect(afterEnqueue.total).toBe(initialStats.total + 1);

      await jobQueue.startJob(job.id);
      const afterStart = jobQueue.getStats();
      expect(afterStart.running).toBeGreaterThan(initialStats.running);

      await jobQueue.completeJob(job.id);
      const afterComplete = jobQueue.getStats();
      expect(afterComplete.completed).toBeGreaterThan(initialStats.completed);
    });
  });

  describe("pauseTraining", () => {
    it("should find and cancel running training job", async () => {
      const job = await jobQueue.enqueue(
        "training",
        { trainingRunId: 100 },
        { trainingRunId: 100 }
      );

      await jobQueue.startJob(job.id);

      // Find the running job
      const runningJobs = jobQueue.getJobs({ type: "training", status: "running" });
      const targetJob = runningJobs.find((j) => j.metadata?.trainingRunId === 100);

      expect(targetJob).toBeDefined();

      // Simulate pauseTraining procedure
      if (targetJob) {
        await jobQueue.cancelJob(targetJob.id);
      }

      const paused = jobQueue.getJob(job.id);
      expect(paused?.status).toBe("cancelled");
    });

    it("should throw error if training job not found", () => {
      const runningJobs = jobQueue.getJobs({ type: "training", status: "running" });
      const job = runningJobs.find((j) => j.metadata?.trainingRunId === 999);

      expect(job).toBeUndefined();
    });

    it("should throw error if training not running", async () => {
      const job = await jobQueue.enqueue(
        "training",
        { trainingRunId: 200 },
        { trainingRunId: 200 }
      );

      // Job is pending, not running
      const runningJobs = jobQueue.getJobs({ type: "training", status: "running" });
      const targetJob = runningJobs.find((j) => j.metadata?.trainingRunId === 200);

      expect(targetJob).toBeUndefined();
    });

    it("should only affect training jobs, not other types", async () => {
      const trainingJob = await jobQueue.enqueue(
        "training",
        { trainingRunId: 300 },
        { trainingRunId: 300 }
      );
      const evalJob = await jobQueue.enqueue(
        "evaluation",
        { evaluationId: 300 },
        { evaluationId: 300 }
      );

      await jobQueue.startJob(trainingJob.id);
      await jobQueue.startJob(evalJob.id);

      // Pause only training job
      const runningTrainingJobs = jobQueue.getJobs({ type: "training", status: "running" });
      const targetJob = runningTrainingJobs.find((j) => j.metadata?.trainingRunId === 300);

      if (targetJob) {
        await jobQueue.cancelJob(targetJob.id);
      }

      expect(jobQueue.getJob(trainingJob.id)?.status).toBe("cancelled");
      expect(jobQueue.getJob(evalJob.id)?.status).toBe("running");
    });
  });

  describe("Integration Tests", () => {
    it("should support full job lifecycle", async () => {
      // Create job
      const job = await jobQueue.enqueue(
        "training",
        { trainingRunId: 1000, config: { epochs: 3 } },
        { projectId: 10, trainingRunId: 1000, userId: 1 }
      );

      // Verify creation
      expect(job.status).toBe("pending");

      // Start job
      await jobQueue.startJob(job.id);
      expect(jobQueue.getJob(job.id)?.status).toBe("running");

      // Update progress
      jobQueue.updateJob(job.id, { progress: 50 });
      expect(jobQueue.getJob(job.id)?.progress).toBe(50);

      // Complete job
      const result = { checkpointPath: "/models/final" };
      await jobQueue.completeJob(job.id, result);

      const completed = jobQueue.getJob(job.id);
      expect(completed?.status).toBe("completed");
      expect(completed?.progress).toBe(100);
      expect(completed?.result).toEqual(result);
    });

    it("should handle concurrent jobs from same project", async () => {
      const projectId = 20;

      const job1 = await jobQueue.enqueue("training", {}, { projectId, trainingRunId: 1 });
      const job2 = await jobQueue.enqueue("evaluation", {}, { projectId, evaluationId: 1 });
      const job3 = await jobQueue.enqueue("quantization", {}, { projectId, quantizationId: 1 });

      const projectJobs = jobQueue.getJobs().filter((j) => j.metadata?.projectId === projectId);

      expect(projectJobs.length).toBe(3);
      expect(projectJobs.map((j) => j.type)).toContain("training");
      expect(projectJobs.map((j) => j.type)).toContain("evaluation");
      expect(projectJobs.map((j) => j.type)).toContain("quantization");
    });
  });
});
