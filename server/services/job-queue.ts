/**
 * Job Queue Service
 *
 * Manages background jobs for LLM training, evaluation, and quantization
 * Uses an in-memory queue with persistence to database
 *
 * Future: Can be replaced with BullMQ/Redis for production scale
 */

import EventEmitter from "events";

export type JobType = "training" | "evaluation" | "quantization" | "dataset_validation";

export type JobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  payload: any;
  progress: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  error?: string;
  result?: any;
  metadata?: {
    projectId?: number;
    trainingRunId?: number;
    evaluationId?: number;
    quantizationId?: number;
    userId?: number;
    [key: string]: any; // Allow additional metadata fields
  };
}

class JobQueue extends EventEmitter {
  private jobs: Map<string, Job> = new Map();
  private runningJobs: Set<string> = new Set();
  private maxConcurrentJobs: number = 2; // Limit concurrent training jobs

  constructor() {
    super();
  }

  /**
   * Add a new job to the queue
   */
  async enqueue(type: JobType, payload: any, metadata?: Job["metadata"]): Promise<Job> {
    const job: Job = {
      id: this.generateJobId(),
      type,
      status: "pending",
      payload,
      progress: 0,
      createdAt: new Date(),
      metadata,
    };

    this.jobs.set(job.id, job);
    this.emit("job:created", job);

    console.log(`[JobQueue] Job ${job.id} (${type}) enqueued`);

    // Auto-start if under concurrency limit
    this.processNext();

    return job;
  }

  /**
   * Get a job by ID
   */
  getJob(jobId: string): Job | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Get all jobs (with optional filters)
   */
  getJobs(filters?: { type?: JobType; status?: JobStatus }): Job[] {
    let jobs = Array.from(this.jobs.values());

    if (filters?.type) {
      jobs = jobs.filter((j) => j.type === filters.type);
    }

    if (filters?.status) {
      jobs = jobs.filter((j) => j.status === filters.status);
    }

    return jobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Update job status and progress
   */
  updateJob(jobId: string, updates: Partial<Job>): Job | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;

    Object.assign(job, updates);

    this.emit("job:updated", job);
    this.emit(`job:${jobId}:updated`, job);

    console.log(`[JobQueue] Job ${jobId} updated: ${updates.status || ""} ${updates.progress || 0}%`);

    return job;
  }

  /**
   * Mark job as running
   */
  async startJob(jobId: string): Promise<Job | undefined> {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;

    job.status = "running";
    job.startedAt = new Date();
    this.runningJobs.add(jobId);

    this.emit("job:started", job);
    this.emit(`job:${jobId}:started`, job);

    console.log(`[JobQueue] Job ${jobId} (${job.type}) started`);

    return job;
  }

  /**
   * Mark job as completed
   */
  async completeJob(jobId: string, result?: any): Promise<Job | undefined> {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;

    job.status = "completed";
    job.progress = 100;
    job.completedAt = new Date();
    job.result = result;
    this.runningJobs.delete(jobId);

    this.emit("job:completed", job);
    this.emit(`job:${jobId}:completed`, job);

    console.log(`[JobQueue] Job ${jobId} (${job.type}) completed`);

    // Process next pending job
    this.processNext();

    return job;
  }

  /**
   * Mark job as failed
   */
  async failJob(jobId: string, error: string): Promise<Job | undefined> {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;

    job.status = "failed";
    job.failedAt = new Date();
    job.error = error;
    this.runningJobs.delete(jobId);

    this.emit("job:failed", job);
    this.emit(`job:${jobId}:failed`, job);

    console.error(`[JobQueue] Job ${jobId} (${job.type}) failed:`, error);

    // Process next pending job
    this.processNext();

    return job;
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<Job | undefined> {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;

    if (job.status === "completed" || job.status === "failed") {
      throw new Error("Cannot cancel completed or failed job");
    }

    job.status = "cancelled";
    this.runningJobs.delete(jobId);

    this.emit("job:cancelled", job);
    this.emit(`job:${jobId}:cancelled`, job);

    console.log(`[JobQueue] Job ${jobId} (${job.type}) cancelled`);

    // Process next pending job
    this.processNext();

    return job;
  }

  /**
   * Process next pending job if under concurrency limit
   */
  private processNext() {
    if (this.runningJobs.size >= this.maxConcurrentJobs) {
      console.log(`[JobQueue] Max concurrent jobs (${this.maxConcurrentJobs}) reached`);
      return;
    }

    const pendingJobs = this.getJobs({ status: "pending" });
    if (pendingJobs.length === 0) {
      return;
    }

    const nextJob = pendingJobs[0];
    console.log(`[JobQueue] Processing next job: ${nextJob.id} (${nextJob.type})`);

    this.emit("job:ready", nextJob);
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      total: this.jobs.size,
      pending: this.getJobs({ status: "pending" }).length,
      running: this.runningJobs.size,
      completed: this.getJobs({ status: "completed" }).length,
      failed: this.getJobs({ status: "failed" }).length,
      cancelled: this.getJobs({ status: "cancelled" }).length,
    };
  }

  /**
   * Clear completed jobs older than specified time
   */
  cleanupOldJobs(olderThanMs: number = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, job] of Array.from(this.jobs.entries())) {
      if (
        (job.status === "completed" || job.status === "failed") &&
        job.completedAt &&
        now - job.completedAt.getTime() > olderThanMs
      ) {
        this.jobs.delete(id);
        cleaned++;
      }
    }

    console.log(`[JobQueue] Cleaned up ${cleaned} old jobs`);
    return cleaned;
  }
}

// Singleton instance
export const jobQueue = new JobQueue();

// Cleanup old jobs every hour
const _jobCleanupInterval = setInterval(() => {
  jobQueue.cleanupOldJobs();
}, 60 * 60 * 1000);

export function stopJobCleanup() {
  clearInterval(_jobCleanupInterval);
}
