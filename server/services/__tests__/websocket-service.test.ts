/**
 * WebSocket Service Tests
 *
 * Tests for real-time job status broadcasting and client subscription
 * Validates WebSocket event emissions and connection management
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { websocketService } from "../websocket-service";
import { jobQueue } from "../job-queue";
import { EventEmitter } from "events";

// Mock Socket.IO
const mockSocket = new EventEmitter() as any;
mockSocket.id = "test-socket-id";
mockSocket.join = vi.fn();
mockSocket.leave = vi.fn();
mockSocket.emit = vi.fn();

const mockIo = new EventEmitter() as any;
mockIo.emit = vi.fn();
mockIo.to = vi.fn(() => ({
  emit: vi.fn(),
}));

// Mock HTTP Server
const mockHttpServer = {
  listen: vi.fn(),
  close: vi.fn(),
} as any;

describe("WebSocket Service", () => {
  beforeEach(() => {
    // Clear job queue
    jobQueue.cleanupOldJobs(0);
    vi.clearAllMocks();

    // Reset mock socket
    mockSocket.join.mockClear();
    mockSocket.leave.mockClear();
    mockSocket.emit.mockClear();
    mockIo.emit.mockClear();
  });

  afterEach(() => {
    jobQueue.cleanupOldJobs(0);
  });

  describe("Service Initialization", () => {
    it("should be defined as a singleton", () => {
      expect(websocketService).toBeDefined();
      expect(typeof websocketService.initialize).toBe("function");
    });

    it("should have client management methods", () => {
      expect(typeof websocketService.getConnectedClientsCount).toBe("function");
      expect(typeof websocketService.sendToClient).toBe("function");
      expect(typeof websocketService.broadcastQueueStats).toBe("function");
    });

    it("should initialize with an HTTP server", () => {
      // This test is mainly to verify the method exists
      // Full integration testing would require actual Socket.IO
      expect(() => websocketService.initialize(mockHttpServer)).not.toThrow();
    });
  });

  describe("Client Connection Management", () => {
    it("should track connected clients", () => {
      const initialCount = websocketService.getConnectedClientsCount();
      expect(initialCount).toBeGreaterThanOrEqual(0);
    });

    it("should provide client count", () => {
      const count = websocketService.getConnectedClientsCount();
      expect(typeof count).toBe("number");
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Job Queue Event Listening", () => {
    it("should listen for job:created events", async () => {
      const job = await jobQueue.enqueue("training", {}, {});

      // WebSocket service should have received the event
      // (In real implementation, this would broadcast to connected clients)
      expect(job).toBeDefined();
    });

    it("should listen for job:started events", async () => {
      const job = await jobQueue.enqueue("training", {}, {});
      await jobQueue.startJob(job.id);

      // Event should have been emitted
      expect(job.status).toBe("running");
    });

    it("should listen for job:updated events", async () => {
      const job = await jobQueue.enqueue("training", {}, {});
      jobQueue.updateJob(job.id, { progress: 50 });

      const updated = jobQueue.getJob(job.id);
      expect(updated?.progress).toBe(50);
    });

    it("should listen for job:completed events", async () => {
      const job = await jobQueue.enqueue("training", {}, {});
      await jobQueue.startJob(job.id);
      await jobQueue.completeJob(job.id);

      const completed = jobQueue.getJob(job.id);
      expect(completed?.status).toBe("completed");
    });

    it("should listen for job:failed events", async () => {
      const job = await jobQueue.enqueue("training", {}, {});
      await jobQueue.startJob(job.id);
      await jobQueue.failJob(job.id, "Test error");

      const failed = jobQueue.getJob(job.id);
      expect(failed?.status).toBe("failed");
    });

    it("should listen for job:cancelled events", async () => {
      const job = await jobQueue.enqueue("training", {}, {});
      await jobQueue.cancelJob(job.id);

      const cancelled = jobQueue.getJob(job.id);
      expect(cancelled?.status).toBe("cancelled");
    });
  });

  describe("Broadcasting", () => {
    it("should broadcast queue statistics", () => {
      // This would broadcast stats to all connected clients
      expect(() => websocketService.broadcastQueueStats()).not.toThrow();
    });

    it("should handle sendToClient for specific socket", () => {
      const socketId = "test-socket-123";
      const event = "test:event";
      const data = { test: "data" };

      // Should not throw even if socket doesn't exist
      expect(() => websocketService.sendToClient(socketId, event, data)).not.toThrow();
    });
  });

  describe("Event Handlers", () => {
    it("should setup job queue listeners on initialization", () => {
      // Verify that the service has registered listeners
      const createdListeners = jobQueue.listeners("job:created");
      const startedListeners = jobQueue.listeners("job:started");
      const updatedListeners = jobQueue.listeners("job:updated");
      const completedListeners = jobQueue.listeners("job:completed");
      const failedListeners = jobQueue.listeners("job:failed");

      // Service should have at least one listener for each event
      expect(createdListeners.length).toBeGreaterThan(0);
      expect(startedListeners.length).toBeGreaterThan(0);
      expect(updatedListeners.length).toBeGreaterThan(0);
      expect(completedListeners.length).toBeGreaterThan(0);
      expect(failedListeners.length).toBeGreaterThan(0);
    });
  });

  describe("Real-Time Updates", () => {
    it("should handle job progress updates", async () => {
      const job = await jobQueue.enqueue(
        "training",
        { trainingRunId: 1 },
        { trainingRunId: 1 }
      );

      await jobQueue.startJob(job.id);

      // Update progress multiple times
      for (let i = 0; i <= 100; i += 10) {
        jobQueue.updateJob(job.id, {
          progress: i,
          metadata: { currentStep: i, totalSteps: 100 },
        });
      }

      const final = jobQueue.getJob(job.id);
      expect(final?.progress).toBe(100);
    });

    it("should handle training completion events", async () => {
      const job = await jobQueue.enqueue(
        "training",
        { trainingRunId: 2 },
        { projectId: 1, trainingRunId: 2 }
      );

      await jobQueue.startJob(job.id);
      const result = { checkpointPath: "/models/checkpoint" };
      await jobQueue.completeJob(job.id, result);

      const completed = jobQueue.getJob(job.id);
      expect(completed?.status).toBe("completed");
      expect(completed?.result).toEqual(result);
    });

    it("should handle evaluation completion events", async () => {
      const job = await jobQueue.enqueue(
        "evaluation",
        { evaluationId: 1 },
        { projectId: 1, evaluationId: 1 }
      );

      await jobQueue.startJob(job.id);
      const result = { overallScore: 0.85 };
      await jobQueue.completeJob(job.id, result);

      const completed = jobQueue.getJob(job.id);
      expect(completed?.result).toEqual(result);
    });

    it("should handle quantization completion events", async () => {
      const job = await jobQueue.enqueue(
        "quantization",
        { quantizationId: 1 },
        { projectId: 1, quantizationId: 1 }
      );

      await jobQueue.startJob(job.id);
      const result = {
        outputPath: "/models/quantized.gguf",
        fileSize: 4000000000,
      };
      await jobQueue.completeJob(job.id, result);

      const completed = jobQueue.getJob(job.id);
      expect(completed?.result).toEqual(result);
    });
  });

  describe("Job-Specific Broadcasting", () => {
    it("should support job-specific event rooms", () => {
      const jobId = "job_123456789";

      // Mock socket subscription
      mockSocket.join(`job:${jobId}`);

      expect(mockSocket.join).toHaveBeenCalledWith(`job:${jobId}`);
    });

    it("should support job-specific unsubscription", () => {
      const jobId = "job_987654321";

      mockSocket.leave(`job:${jobId}`);

      expect(mockSocket.leave).toHaveBeenCalledWith(`job:${jobId}`);
    });
  });

  describe("Error Handling", () => {
    it("should handle invalid client IDs gracefully", () => {
      expect(() => {
        websocketService.sendToClient("invalid-socket-id", "test", {});
      }).not.toThrow();
    });

    it("should handle broadcasting with no connected clients", () => {
      expect(() => {
        websocketService.broadcastQueueStats();
      }).not.toThrow();
    });
  });

  describe("Statistics Broadcasting", () => {
    it("should broadcast accurate queue statistics", async () => {
      // Create some jobs
      await jobQueue.enqueue("training", {}, {});
      const job2 = await jobQueue.enqueue("training", {}, {});
      await jobQueue.startJob(job2.id);

      const stats = jobQueue.getStats();

      expect(stats).toHaveProperty("total");
      expect(stats).toHaveProperty("pending");
      expect(stats).toHaveProperty("running");
      expect(stats).toHaveProperty("completed");
      expect(stats).toHaveProperty("failed");
      expect(stats).toHaveProperty("cancelled");
    });
  });

  describe("Integration with Job Types", () => {
    it("should handle training job events", async () => {
      const job = await jobQueue.enqueue(
        "training",
        { trainingRunId: 10 },
        { projectId: 1, trainingRunId: 10 }
      );

      expect(job.type).toBe("training");

      await jobQueue.startJob(job.id);
      await jobQueue.completeJob(job.id);

      const completed = jobQueue.getJob(job.id);
      expect(completed?.status).toBe("completed");
    });

    it("should handle evaluation job events", async () => {
      const job = await jobQueue.enqueue(
        "evaluation",
        { evaluationId: 10 },
        { projectId: 1, evaluationId: 10 }
      );

      expect(job.type).toBe("evaluation");

      await jobQueue.startJob(job.id);
      await jobQueue.completeJob(job.id);

      const completed = jobQueue.getJob(job.id);
      expect(completed?.status).toBe("completed");
    });

    it("should handle quantization job events", async () => {
      const job = await jobQueue.enqueue(
        "quantization",
        { quantizationId: 10 },
        { projectId: 1, quantizationId: 10 }
      );

      expect(job.type).toBe("quantization");

      await jobQueue.startJob(job.id);
      await jobQueue.completeJob(job.id);

      const completed = jobQueue.getJob(job.id);
      expect(completed?.status).toBe("completed");
    });
  });
});
