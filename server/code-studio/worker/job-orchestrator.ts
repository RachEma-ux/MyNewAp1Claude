/**
 * Code Studio — Job Orchestrator
 *
 * Owns the coding job state machine. Transitions jobs through the
 * standard workflow: prepare → plan → approve → build → review → test → governance → complete.
 *
 * OpenCode operates within each phase but Code Studio owns the state machine.
 */

import { JOB_STATUS_TRANSITIONS, type JobStatus, type AgentRole } from "../shared/constants";
import * as repo from "../repository";
import * as ocClient from "../opencode/client";
import { prepareWorkspace, finalizeWorkspace, getWorkspaceByJobId } from "./workspace-manager";

export class JobOrchestrationError extends Error {
  constructor(message: string, public jobId: number, public phase?: string) {
    super(message);
    this.name = "JobOrchestrationError";
  }
}

/**
 * Validate a job status transition.
 */
export function canTransition(from: string, to: string): boolean {
  const allowed = JOB_STATUS_TRANSITIONS[from];
  return allowed ? allowed.includes(to) : false;
}

/**
 * Transition a job to a new status with validation.
 */
export async function transitionJob(jobId: number, newStatus: JobStatus, details?: Record<string, any>) {
  const job = await repo.getJobById(jobId);
  if (!job) throw new JobOrchestrationError(`Job ${jobId} not found`, jobId);

  if (!canTransition(job.status, newStatus)) {
    throw new JobOrchestrationError(
      `Invalid transition: ${job.status} → ${newStatus}`,
      jobId,
      job.status
    );
  }

  const updateData: Record<string, any> = { status: newStatus };
  if (newStatus === "completed" || newStatus === "failed" || newStatus === "cancelled") {
    updateData.completedAt = new Date();
  }
  if (details && "errorMessage" in details) {
    updateData.errorMessage = details.errorMessage;
  }

  const updated = await repo.updateJob(jobId, updateData);

  await repo.createAuditEvent({
    eventType: "job_status_changed",
    entityType: "job",
    entityId: jobId,
    details: { from: job.status, to: newStatus, ...details },
  });

  return updated;
}

/**
 * Standard workflow step definitions for a coding job.
 */
const STANDARD_STEPS: { name: string; order: number; agentRole: AgentRole }[] = [
  { name: "prepare_workspace", order: 1, agentRole: "coding-orchestrator" },
  { name: "planning", order: 2, agentRole: "planner" },
  { name: "building", order: 3, agentRole: "builder" },
  { name: "reviewing", order: 4, agentRole: "reviewer" },
  { name: "testing", order: 5, agentRole: "tester" },
  { name: "governance_check", order: 6, agentRole: "governance" },
];

/**
 * Initialize standard workflow steps for a job.
 */
export async function initializeJobSteps(jobId: number) {
  const steps = [];
  for (const step of STANDARD_STEPS) {
    const created = await repo.createJobStep({
      jobId,
      stepName: step.name,
      stepOrder: step.order,
      agentRole: step.agentRole,
    });
    steps.push(created);
  }
  return steps;
}

/**
 * Start a job — queue it, initialize steps, and kick off async execution.
 */
export async function startJob(jobId: number) {
  const job = await repo.getJobById(jobId);
  if (!job) throw new JobOrchestrationError(`Job ${jobId} not found`, jobId);

  // Initialize steps
  await initializeJobSteps(jobId);

  // Transition to queued
  await transitionJob(jobId, "queued");

  await repo.createAuditEvent({
    eventType: "job_started",
    entityType: "job",
    entityId: jobId,
    actorUserId: job.actorUserId ?? undefined,
  });

  // Fire-and-forget: execute the job asynchronously
  executeJob(jobId).catch((err) => {
    console.error(`[CodeStudio] executeJob(${jobId}) unhandled error:`, err);
  });

  return repo.getJobById(jobId);
}

/**
 * Cancel a job.
 */
export async function cancelJob(jobId: number, actorUserId?: number) {
  const updated = await transitionJob(jobId, "cancelled");

  await repo.createAuditEvent({
    eventType: "job_cancelled",
    entityType: "job",
    entityId: jobId,
    actorUserId,
  });

  return updated;
}

/**
 * Retry a failed job — reset steps, transition to queued, and re-execute.
 */
export async function retryJob(jobId: number) {
  // Reset all step statuses to pending
  const steps = await repo.listJobSteps(jobId);
  for (const step of steps) {
    await repo.updateJobStep(step.id, { status: "pending", output: null });
  }

  const updated = await transitionJob(jobId, "queued", { errorMessage: null });

  // Fire-and-forget: re-execute
  executeJob(jobId).catch((err) => {
    console.error(`[CodeStudio] executeJob(${jobId}) retry error:`, err);
  });

  return updated;
}

/**
 * Check OpenCode runtime health and return status.
 */
export async function checkRuntimeHealth() {
  const ocHealth = await ocClient.checkHealth();
  const dbHealth = await repo.getHealthSummary();

  return {
    opencode: ocHealth,
    codedb: dbHealth,
    overall: ocHealth.healthy && dbHealth.connected,
  };
}

/**
 * Build evidence bundle for a completed job.
 */
export async function buildEvidenceBundle(jobId: number) {
  const job = await repo.getJobById(jobId);
  if (!job) return null;

  const steps = await repo.listJobSteps(jobId);
  const diffs = await repo.listDiffs(jobId);
  const artifacts = await repo.listArtifacts(jobId);
  const auditEvents = await repo.listAuditEvents({ entityType: "job", entityId: jobId });

  const bundle = {
    jobId,
    title: job.title,
    status: job.status,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    steps: steps.map(s => ({ name: s.stepName, status: s.status, agentRole: s.agentRole })),
    diffSummary: {
      totalFiles: diffs.length,
      added: diffs.filter(d => d.diffType === "add").length,
      modified: diffs.filter(d => d.diffType === "modify").length,
      deleted: diffs.filter(d => d.diffType === "delete").length,
    },
    artifacts: artifacts.map(a => ({ type: a.artifactType, name: a.name })),
    auditEventCount: auditEvents.length,
    generatedAt: new Date().toISOString(),
  };

  // Persist as artifact
  await repo.createArtifact({
    jobId,
    artifactType: "evidence_bundle",
    name: `evidence-bundle-job-${jobId}`,
    content: JSON.stringify(bundle, null, 2),
    metadata: { generatedAt: bundle.generatedAt },
  });

  return bundle;
}

// ── Helpers: Output Extraction, Transcript, Report ───────────────────────────

/**
 * Extract structured output directly from a sendMessage() response.
 * The POST response already contains the assistant reply — no need
 * to race with a separate listMessages() call.
 */
function extractOutputFromResponse(response: any): { summary: string; role: string } | null {
  if (!response) return null;

  // Direct string response
  if (typeof response === "string") {
    return { summary: response.slice(0, 4000), role: "assistant" };
  }

  // OpenCode shape: { info: {...}, parts: [{type: "text", text: "..."}] }
  if (response.parts && Array.isArray(response.parts)) {
    const textParts = response.parts
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text || "")
      .join("\n");
    if (textParts) return { summary: textParts.slice(0, 4000), role: "assistant" };
  }

  // Array of messages — find last assistant
  if (Array.isArray(response)) {
    for (let i = response.length - 1; i >= 0; i--) {
      const msg = response[i];
      const role = msg.role || (msg as any).type || "";
      if (role === "assistant" || role === "model") {
        const text = extractTextFromMessage(msg);
        return { summary: text.slice(0, 4000), role };
      }
    }
  }

  // Fallback: try extractTextFromMessage on the response itself
  const text = extractTextFromMessage(response);
  if (text && text.length > 2 && !text.startsWith("{")) {
    return { summary: text.slice(0, 4000), role: "assistant" };
  }

  return null;
}

/**
 * Extract text content from an OpenCode message (handles various shapes).
 */
function extractTextFromMessage(msg: any): string {
  if (typeof msg.content === "string") return msg.content;
  if (typeof msg.text === "string") return msg.text;
  if (Array.isArray(msg.content)) {
    return msg.content
      .filter((p: any) => p.type === "text" || typeof p.text === "string")
      .map((p: any) => p.text || "")
      .join("\n");
  }
  if (Array.isArray(msg.parts)) {
    return msg.parts
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text || "")
      .join("\n");
  }
  return JSON.stringify(msg).slice(0, 2000);
}

/**
 * Persist OpenCode session messages into code_session_messages.
 */
async function persistSessionTranscript(ocSessionId: string, dbSessionId: number): Promise<number> {
  try {
    const messages = await ocClient.listMessages(ocSessionId);
    if (!Array.isArray(messages) || messages.length === 0) return 0;
    let count = 0;
    for (const msg of messages) {
      const role = msg.role || (msg as any).type || "unknown";
      const text = extractTextFromMessage(msg);
      const toolCalls = (msg as any).tool_calls || (msg as any).toolCalls || null;
      await repo.createSessionMessage({
        sessionId: dbSessionId,
        opencodeMessageId: msg.id || undefined,
        role,
        contentPreview: text.slice(0, 8000),
        toolCalls: toolCalls ? toolCalls : undefined,
      });
      count++;
    }
    return count;
  } catch {
    return 0;
  }
}

/**
 * Generate a final report for a completed job.
 * Persists: resultSummary on job, final_report_markdown + final_report_json as artifacts.
 */
async function generateFinalReport(jobId: number): Promise<void> {
  const job = await repo.getJobById(jobId);
  if (!job) return;

  const steps = await repo.listJobSteps(jobId);
  const diffs = await repo.listDiffs(jobId);
  const sessions = await repo.listSessions({ jobId });
  const generatedAt = new Date().toISOString();

  // Determine result kind from available data
  const hasDiffs = diffs.length > 0;
  const isFailed = job.status === "failed";

  // "mixed" = has diffs AND substantial review/governance findings
  const reviewOutput = steps.find((s: any) => s.stepName === "reviewing")?.output as any;
  const govOutput = steps.find((s: any) => s.stepName === "governance_check")?.output as any;
  const hasSubstantialFindings =
    (reviewOutput?.summary?.length > 100) || (govOutput?.summary?.length > 100);
  const resultKind = isFailed
    ? "failure"
    : hasDiffs && hasSubstantialFindings
      ? "mixed"
      : hasDiffs
        ? "implementation"
        : "inspection";

  // Build step summaries
  const stepSummaries: Record<string, string> = {};
  for (const s of steps) {
    const output = s.output as any;
    if (output && typeof output === "object" && output.summary) {
      stepSummaries[s.stepName] = output.summary;
    } else if (typeof output === "string") {
      stepSummaries[s.stepName] = output;
    }
  }

  // Build final answer preview from the last meaningful step output
  let finalAnswerPreview = "";
  const meaningfulSteps = ["governance_check", "testing", "reviewing", "building", "planning"];
  for (const name of meaningfulSteps) {
    if (stepSummaries[name] && stepSummaries[name].length > 10) {
      finalAnswerPreview = stepSummaries[name].slice(0, 500);
      break;
    }
  }

  // Files touched
  const changedFiles = diffs.map((d: any) => d.filePath);

  // ── Markdown Report ────────────────────────────────────────────────
  const mdParts: string[] = [];
  mdParts.push(`# Job #${job.id}: ${job.title}`);
  mdParts.push("");
  mdParts.push(`**Status:** ${job.status}`);
  mdParts.push(`**Result Kind:** ${resultKind}`);
  mdParts.push(`**Generated:** ${generatedAt}`);
  mdParts.push("");

  mdParts.push("## Objective");
  mdParts.push(job.objective || job.description || job.title);
  mdParts.push("");

  if (finalAnswerPreview) {
    mdParts.push("## Final Answer");
    mdParts.push(finalAnswerPreview);
    mdParts.push("");
  }

  mdParts.push("## Step Summaries");
  for (const s of steps) {
    const summary = stepSummaries[s.stepName] || "(no output)";
    const statusEmoji = s.status === "completed" ? "[OK]" : s.status === "failed" ? "[FAIL]" : "[--]";
    mdParts.push(`### ${s.stepOrder}. ${s.stepName.replace(/_/g, " ")} ${statusEmoji}`);
    mdParts.push(summary.slice(0, 3000));
    mdParts.push("");
  }

  if (hasDiffs) {
    mdParts.push("## Diff Summary");
    mdParts.push(`**Files changed:** ${diffs.length}`);
    const added = diffs.filter((d: any) => d.diffType === "add").length;
    const modified = diffs.filter((d: any) => d.diffType === "modify").length;
    const deleted = diffs.filter((d: any) => d.diffType === "delete").length;
    mdParts.push(`- Added: ${added}`);
    mdParts.push(`- Modified: ${modified}`);
    mdParts.push(`- Deleted: ${deleted}`);
    mdParts.push("");
    mdParts.push("### Changed Files");
    for (const d of diffs) {
      mdParts.push(`- \`${d.filePath}\` (${d.diffType}, +${d.linesAdded || 0}/-${d.linesRemoved || 0})`);
    }
    mdParts.push("");
  } else {
    mdParts.push("## Diff Summary");
    mdParts.push("No code changes were made. This was a read-only / inspection job.");
    mdParts.push("");
  }

  if (job.errorMessage) {
    mdParts.push("## Errors");
    mdParts.push(job.errorMessage);
    mdParts.push("");
  }

  mdParts.push("---");
  mdParts.push(`*Report generated at ${generatedAt} by Code Studio*`);

  const markdownContent = mdParts.join("\n");

  // ── JSON Report ────────────────────────────────────────────────────
  const jsonReport = {
    jobId,
    title: job.title,
    objective: job.objective || job.description || job.title,
    status: job.status,
    resultKind,
    stepSummaries,
    diffSummary: {
      totalFiles: diffs.length,
      added: diffs.filter((d: any) => d.diffType === "add").length,
      modified: diffs.filter((d: any) => d.diffType === "modify").length,
      deleted: diffs.filter((d: any) => d.diffType === "delete").length,
      changedFiles,
    },
    sessionCount: sessions.length,
    errorMessage: job.errorMessage || null,
    generatedAt,
  };

  // Idempotent: remove stale report artifacts before creating new ones
  await repo.deleteArtifactsByType(jobId, "final_report_markdown");
  await repo.deleteArtifactsByType(jobId, "final_report_json");

  // Persist artifacts
  await repo.createArtifact({
    jobId,
    artifactType: "final_report_markdown",
    name: `final-report-job-${jobId}.md`,
    content: markdownContent,
    metadata: { generatedAt, resultKind },
  });

  await repo.createArtifact({
    jobId,
    artifactType: "final_report_json",
    name: `final-report-job-${jobId}.json`,
    content: JSON.stringify(jsonReport, null, 2),
    metadata: { generatedAt, resultKind },
  });

  // ── Result Summary (persisted on job AFTER artifacts succeed) ──────
  const resultSummary = {
    resultKind,
    headline: job.title,
    finalAnswerPreview,
    diffCount: diffs.length,
    sessionCount: sessions.length,
    changedFilesCount: changedFiles.length,
    hasReport: true,
    hasDiffs,
    hasWorkspaceChanges: hasDiffs,
    finalStepCompleted: steps.filter((s: any) => s.status === "completed").pop()?.stepName || null,
    generatedAt,
  };

  await repo.updateJob(jobId, { resultSummary });
}

// ── Phase Prompt Builders ────────────────────────────────────────────────────

function buildPhasePrompt(job: any, phase: string): string {
  const objective = job.objective || job.description || job.title;
  const constraints = job.constraints
    ? `\nConstraints: ${JSON.stringify(job.constraints)}`
    : "";

  switch (phase) {
    case "planning":
      return `You are the Planner agent for Code Studio Job #${job.id}.\n\nObjective: ${objective}${constraints}\n\nAnalyze the codebase and produce a detailed implementation plan. List files to modify, approach, risks, and validation steps.`;
    case "building":
      return `You are the Builder agent for Code Studio Job #${job.id}.\n\nObjective: ${objective}${constraints}\n\nImplement the planned changes. Follow existing patterns and conventions.`;
    case "reviewing":
      return `You are the Reviewer agent for Code Studio Job #${job.id}.\n\nObjective: ${objective}\n\nReview all changes for correctness, security, and adherence to project conventions. Report any issues.`;
    case "testing":
      return `You are the Tester agent for Code Studio Job #${job.id}.\n\nObjective: ${objective}\n\nRun relevant tests and verify the implementation meets the objective. Report pass/fail status.`;
    case "governance_check":
      return `You are the Governance agent for Code Studio Job #${job.id}.\n\nObjective: ${objective}\n\nVerify changes comply with project policies, security requirements, and coding standards.`;
    default:
      return `Execute phase: ${phase}\n\nObjective: ${objective}`;
  }
}

/**
 * Execute a job through the full workflow pipeline.
 * Called asynchronously (fire-and-forget) from startJob / retryJob.
 *
 * Resilient to OpenCode being offline — the state machine progresses
 * regardless. When OpenCode IS available, sessions are created and
 * prompts are sent. When offline, steps complete with a note.
 */
export async function executeJob(jobId: number): Promise<void> {
  try {
    const job = await repo.getJobById(jobId);
    if (!job || job.status !== "queued") return;

    // ── Pre-flight: check OpenCode health (non-blocking) ───────────────
    const health = await ocClient.checkHealth();
    const ocAvailable = health.healthy;

    await repo.createAuditEvent({
      eventType: "execution_started",
      entityType: "job",
      entityId: jobId,
      details: { opencodeAvailable: ocAvailable },
    });

    // ── Step 1: Prepare workspace ──────────────────────────────────────
    await transitionJob(jobId, "preparing_workspace");
    const steps = await repo.listJobSteps(jobId);
    const prepStep = steps.find((s: any) => s.stepName === "prepare_workspace");
    if (prepStep) await repo.updateJobStep(prepStep.id, { status: "in_progress" });

    if (job.repoId) {
      try {
        await prepareWorkspace(jobId, job.repoId);
      } catch (err: any) {
        if (prepStep)
          await repo.updateJobStep(prepStep.id, { status: "failed", output: err.message });
        await transitionJob(jobId, "failed", {
          errorMessage: `Workspace preparation failed: ${err.message}`,
        });
        return;
      }
    }
    if (prepStep) await repo.updateJobStep(prepStep.id, { status: "completed" });

    // ── Step 2: Start OpenCode session (if available) ──────────────────
    await transitionJob(jobId, "starting_session");
    let ocSessionId: string | null = null;

    if (ocAvailable) {
      try {
        const ocSession = await ocClient.createSession(`Job #${jobId}: ${job.title}`);
        ocSessionId = ocSession.id;

        await repo.createSession({
          jobId,
          opencodeSessionId: ocSessionId,
          agentRole: "coding-orchestrator",
        });

        await repo.createAuditEvent({
          eventType: "session_created",
          entityType: "job",
          entityId: jobId,
          details: { opencodeSessionId: ocSessionId },
        });
      } catch (err: any) {
        // OpenCode session failed — continue without it
        ocSessionId = null;
        await repo.createAuditEvent({
          eventType: "session_skipped",
          entityType: "job",
          entityId: jobId,
          details: { reason: err.message },
        });
      }
    } else {
      // Record a local-only session (no OpenCode)
      await repo.createSession({
        jobId,
        agentRole: "coding-orchestrator",
      });
    }

    // ── Steps 3-6: Execute agent phases ────────────────────────────────
    const phaseMap: { stepName: string; jobStatus: JobStatus }[] = [
      { stepName: "planning", jobStatus: "planning" },
      { stepName: "building", jobStatus: "building" },
      { stepName: "reviewing", jobStatus: "reviewing" },
      { stepName: "testing", jobStatus: "testing" },
      { stepName: "governance_check", jobStatus: "governance_check" },
    ];

    for (const phase of phaseMap) {
      // Check if job was cancelled mid-execution
      const currentJob = await repo.getJobById(jobId);
      if (!currentJob || currentJob.status === "cancelled") return;

      await transitionJob(jobId, phase.jobStatus);
      const step = steps.find((s: any) => s.stepName === phase.stepName);
      if (step) await repo.updateJobStep(step.id, { status: "in_progress", startedAt: new Date() });

      if (ocSessionId) {
        // OpenCode available — send the phase prompt and poll for response
        try {
          const prompt = buildPhasePrompt(job, phase.stepName);

          // OpenCode blocks during LLM execution (single-threaded Bun server).
          // Use synchronous send with 10-minute timeout. The server will be
          // unresponsive to other requests until this completes.
          const response = await ocClient.sendMessage(ocSessionId, prompt);

          // Check for provider errors inside the response (HTTP 200 but no output)
          const providerError = response?.info?.error;
          if (providerError) {
            const errMsg = providerError.data?.message || providerError.name || "Unknown provider error";
            if (step) await repo.updateJobStep(step.id, {
              status: "failed",
              completedAt: new Date(),
              output: { summary: `Provider error: ${errMsg}`, phase: phase.stepName, error: providerError },
            });
            // Fail the job — no point continuing if the LLM can't respond
            await transitionJob(jobId, "failed");
            await repo.createAuditEvent({
              eventType: "execution_failed",
              entityType: "job",
              entityId: jobId,
              details: { phase: phase.stepName, error: errMsg },
            });
            return;
          }

          // Extract output directly from the response (no race condition)
          const stepOutput = extractOutputFromResponse(response);
          if (step) await repo.updateJobStep(step.id, {
            status: "completed",
            completedAt: new Date(),
            output: stepOutput || { summary: "Phase completed via OpenCode", phase: phase.stepName },
          });
        } catch (err: any) {
          // Phase send failed — fail the job
          if (step)
            await repo.updateJobStep(step.id, {
              status: "failed",
              completedAt: new Date(),
              output: { summary: `OpenCode error: ${err.message}`, phase: phase.stepName },
            });
          await transitionJob(jobId, "failed");
          await repo.createAuditEvent({
            eventType: "execution_failed",
            entityType: "job",
            entityId: jobId,
            details: { phase: phase.stepName, error: err.message },
          });
          return;
        }
      } else {
        // No OpenCode — complete step locally
        if (step) await repo.updateJobStep(step.id, {
          status: "completed",
          completedAt: new Date(),
          output: { summary: "Completed (OpenCode offline)", phase: phase.stepName },
        });
      }
    }

    // ── Persist session transcript ──────────────────────────────────
    if (ocSessionId) {
      try {
        const dbSessions = await repo.listSessions({ jobId });
        const dbSession = dbSessions.find((s: any) => s.opencodeSessionId === ocSessionId);
        if (dbSession) {
          const msgCount = await persistSessionTranscript(ocSessionId, dbSession.id);
          await repo.updateSession(dbSession.id, { status: "completed", closedAt: new Date() });
          await repo.createAuditEvent({
            eventType: "transcript_persisted",
            entityType: "job",
            entityId: jobId,
            details: { sessionId: dbSession.id, messageCount: msgCount },
          });
        }
      } catch {
        /* non-fatal */
      }
    }

    // ── Complete ──────────────────────────────────────────────────────
    await transitionJob(jobId, "completed");

    // Finalize workspace if one was created
    if (job.repoId) {
      try {
        const ws = await getWorkspaceByJobId(jobId);
        if (ws) await finalizeWorkspace(ws.id, "head", []);
      } catch {
        /* non-fatal */
      }
    }

    // Generate final report + result summary
    try {
      await generateFinalReport(jobId);
    } catch {
      /* non-fatal */
    }

    // Build evidence bundle
    try {
      await buildEvidenceBundle(jobId);
    } catch {
      /* non-fatal */
    }

    await repo.createAuditEvent({
      eventType: "job_completed",
      entityType: "job",
      entityId: jobId,
      details: { opencodeUsed: !!ocSessionId },
    });
  } catch (err: any) {
    // Catch-all: fail the job gracefully
    try {
      const currentJob = await repo.getJobById(jobId);
      if (
        currentJob &&
        !["completed", "failed", "cancelled"].includes(currentJob.status)
      ) {
        await transitionJob(jobId, "failed", {
          errorMessage: `Unexpected execution error: ${err.message}`,
        });
      }
    } catch {
      console.error(`[CodeStudio] Failed to mark job ${jobId} as failed:`, err);
    }
  }
}
