/**
 * WebSocket Service for Real-Time Training Updates
 *
 * Provides WebSocket connections for clients to receive real-time updates
 * on training progress, evaluation results, and quantization status
 *
 * Events emitted:
 * - training:progress - Training step progress
 * - training:completed - Training job completed
 * - training:failed - Training job failed
 * - evaluation:completed - Evaluation completed
 * - quantization:completed - Quantization completed
 */

import { Server as HTTPServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { jobQueue, Job } from "./job-queue";

class WebSocketService {
  private io: SocketIOServer | null = null;
  private connectedClients: Map<string, Socket> = new Map();

  /**
   * Initialize WebSocket server
   */
  initialize(httpServer: HTTPServer) {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.CORS_ORIGIN || "http://localhost:3000",
        methods: ["GET", "POST"],
      },
      path: "/ws/training",
    });

    this.io.on("connection", (socket: Socket) => {
      console.log(`[WebSocket] Client connected: ${socket.id}`);
      this.connectedClients.set(socket.id, socket);

      // Handle client subscribing to specific jobs
      socket.on("subscribe:job", (jobId: string) => {
        console.log(`[WebSocket] Client ${socket.id} subscribed to job ${jobId}`);
        socket.join(`job:${jobId}`);

        // Send current job status
        const job = jobQueue.getJob(jobId);
        if (job) {
          socket.emit("job:status", job);
        }
      });

      socket.on("unsubscribe:job", (jobId: string) => {
        console.log(`[WebSocket] Client ${socket.id} unsubscribed from job ${jobId}`);
        socket.leave(`job:${jobId}`);
      });

      socket.on("disconnect", () => {
        console.log(`[WebSocket] Client disconnected: ${socket.id}`);
        this.connectedClients.delete(socket.id);
      });
    });

    // Listen to job queue events and broadcast to clients
    this.setupJobQueueListeners();

    console.log("[WebSocket] Service initialized");
  }

  /**
   * Setup listeners for job queue events
   */
  private setupJobQueueListeners() {
    // Job created
    jobQueue.on("job:created", (job: Job) => {
      this.broadcast("job:created", job);
    });

    // Job started
    jobQueue.on("job:started", (job: Job) => {
      this.broadcastToJob(job.id, "job:started", job);
      this.broadcast("job:status", job);
    });

    // Job updated (progress)
    jobQueue.on("job:updated", (job: Job) => {
      this.broadcastToJob(job.id, "job:progress", {
        jobId: job.id,
        progress: job.progress,
        status: job.status,
        metadata: job.metadata,
      });
      this.broadcast("job:status", job);
    });

    // Job completed
    jobQueue.on("job:completed", (job: Job) => {
      this.broadcastToJob(job.id, "job:completed", job);
      this.broadcast("job:status", job);

      // Emit specific event based on job type
      if (job.type === "training") {
        this.broadcast("training:completed", {
          trainingRunId: job.metadata?.trainingRunId,
          result: job.result,
        });
      } else if (job.type === "evaluation") {
        this.broadcast("evaluation:completed", {
          evaluationId: job.metadata?.evaluationId,
          result: job.result,
        });
      } else if (job.type === "quantization") {
        this.broadcast("quantization:completed", {
          quantizationId: job.metadata?.quantizationId,
          result: job.result,
        });
      }
    });

    // Job failed
    jobQueue.on("job:failed", (job: Job) => {
      this.broadcastToJob(job.id, "job:failed", job);
      this.broadcast("job:status", job);

      // Emit specific event based on job type
      if (job.type === "training") {
        this.broadcast("training:failed", {
          trainingRunId: job.metadata?.trainingRunId,
          error: job.error,
        });
      }
    });

    // Job cancelled
    jobQueue.on("job:cancelled", (job: Job) => {
      this.broadcastToJob(job.id, "job:cancelled", job);
      this.broadcast("job:status", job);
    });
  }

  /**
   * Broadcast message to all connected clients
   */
  private broadcast(event: string, data: any) {
    if (!this.io) return;
    this.io.emit(event, data);
  }

  /**
   * Broadcast message to clients subscribed to a specific job
   */
  private broadcastToJob(jobId: string, event: string, data: any) {
    if (!this.io) return;
    this.io.to(`job:${jobId}`).emit(event, data);
  }

  /**
   * Send message to a specific client
   */
  sendToClient(socketId: string, event: string, data: any) {
    const socket = this.connectedClients.get(socketId);
    if (socket) {
      socket.emit(event, data);
    }
  }

  /**
   * Get connected clients count
   */
  getConnectedClientsCount(): number {
    return this.connectedClients.size;
  }

  /**
   * Get job statistics and broadcast to all clients
   */
  broadcastQueueStats() {
    const stats = jobQueue.getStats();
    this.broadcast("queue:stats", stats);
  }
}

// Singleton instance
export const websocketService = new WebSocketService();

// Broadcast queue stats every 10 seconds
const _wsStatsInterval = setInterval(() => {
  websocketService.broadcastQueueStats();
}, 10000);

export function stopWsStats() {
  clearInterval(_wsStatsInterval);
}
