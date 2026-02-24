/**
 * Platform Audit Runner
 *
 * Spawns `scripts/platformAudit.ts` as a subprocess, captures output,
 * stores artifacts via ArtifactStore, and persists results in DB.
 *
 * - Concurrency: only one audit can run at a time (DB check)
 * - Timeout: 5-minute kill timer
 * - Stdout/stderr capped at 1MB
 */

import { spawn, type ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { eq, desc } from "drizzle-orm";
import { getDb } from "../db";
import { governanceAuditRuns } from "../../drizzle/schema";
import { getArtifactStore } from "./artifact-store";

const MAX_OUTPUT_BYTES = 1024 * 1024; // 1MB
const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const REPORT_DIR = path.resolve(process.cwd(), "audit-reports");

export interface AuditRunOpts {
  format: "json" | "txt" | "both";
  strict: boolean;
  design: "executive" | "standard" | "forensics";
  triggeredBy: string;
}

let activeProcess: ChildProcess | null = null;

/**
 * Check if an audit is currently running.
 */
export async function isAuditRunning(): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const running = await db
    .select({ id: governanceAuditRuns.id })
    .from(governanceAuditRuns)
    .where(eq(governanceAuditRuns.status, "running"))
    .limit(1);
  return running.length > 0;
}

/**
 * Start an audit run. Returns the new run ID immediately.
 * The actual audit executes asynchronously in the background.
 */
export async function startAuditRun(opts: AuditRunOpts): Promise<{ runId: number; status: string }> {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  // Concurrency check
  if (await isAuditRunning()) {
    throw new Error("An audit is already running. Wait for it to complete before starting another.");
  }

  // Insert queued row
  const [row] = await db
    .insert(governanceAuditRuns)
    .values({
      status: "queued",
      format: opts.format,
      strict: opts.strict,
      design: opts.design,
      triggeredBy: opts.triggeredBy,
    })
    .returning({ id: governanceAuditRuns.id });

  const runId = row.id;

  // Fire-and-forget background execution
  executeAudit(runId, opts).catch((err) => {
    console.error(`[AuditRunner] Uncaught error for run ${runId}:`, err);
  });

  return { runId, status: "queued" };
}

/**
 * Get a specific audit run by ID.
 */
export async function getAuditRun(runId: number) {
  const db = getDb();
  if (!db) return null;
  const [run] = await db
    .select()
    .from(governanceAuditRuns)
    .where(eq(governanceAuditRuns.id, runId))
    .limit(1);
  return run || null;
}

/**
 * Get the most recent audit run.
 */
export async function getLatestAuditRun() {
  const db = getDb();
  if (!db) return null;
  const [run] = await db
    .select()
    .from(governanceAuditRuns)
    .orderBy(desc(governanceAuditRuns.startedAt))
    .limit(1);
  return run || null;
}

/**
 * List audit runs with optional filters.
 */
export async function listAuditRuns(filters?: {
  limit?: number;
  status?: string;
  triggeredBy?: string;
  design?: string;
  strict?: boolean;
}) {
  const db = getDb();
  if (!db) return [];
  const limit = Math.min(filters?.limit || 20, 100);

  // Build query with dynamic conditions
  let query = db
    .select()
    .from(governanceAuditRuns)
    .orderBy(desc(governanceAuditRuns.startedAt))
    .limit(limit);

  // For simplicity, fetch and filter in-memory (small dataset)
  const rows = await query;

  return rows.filter((r) => {
    if (filters?.status && r.status !== filters.status) return false;
    if (filters?.triggeredBy && r.triggeredBy !== filters.triggeredBy) return false;
    if (filters?.design && r.design !== filters.design) return false;
    if (filters?.strict !== undefined && r.strict !== filters.strict) return false;
    return true;
  });
}

// ============================================================================
// Internal — background audit execution
// ============================================================================

async function executeAudit(runId: number, opts: AuditRunOpts): Promise<void> {
  const db = getDb();
  if (!db) return;

  const startTime = Date.now();

  // Mark as running
  await db
    .update(governanceAuditRuns)
    .set({ status: "running" })
    .where(eq(governanceAuditRuns.id, runId));

  // Build args (whitelisted only)
  const args = ["tsx", "scripts/platformAudit.ts"];
  if (opts.format === "json") args.push("--format", "json");
  else if (opts.format === "txt") args.push("--format", "txt");
  else args.push("--format", "both");
  if (opts.strict) args.push("--strict");

  // Pass baseUrl so the script can reach the governance action registry
  const port = process.env.PORT || "3000";
  const baseUrl = `http://localhost:${port}`;
  args.push(`--baseUrl=${baseUrl}`);

  let stdout = "";
  let stderr = "";
  let killed = false;

  try {
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const child = spawn("npx", args, {
        cwd: process.cwd(),
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
      });

      activeProcess = child;

      // Timeout
      const timer = setTimeout(() => {
        killed = true;
        child.kill("SIGKILL");
      }, TIMEOUT_MS);

      child.stdout?.on("data", (chunk: Buffer) => {
        if (stdout.length < MAX_OUTPUT_BYTES) {
          stdout += chunk.toString();
        }
      });

      child.stderr?.on("data", (chunk: Buffer) => {
        if (stderr.length < MAX_OUTPUT_BYTES) {
          stderr += chunk.toString();
        }
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        activeProcess = null;
        reject(err);
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        activeProcess = null;
        resolve(code);
      });
    });

    if (killed) {
      await markError(db, runId, startTime, "Audit timed out after 5 minutes");
      return;
    }

    // Process results
    const durationMs = Date.now() - startTime;
    const updateData: Record<string, any> = {
      finishedAt: new Date(),
      durationMs,
    };

    // Try to read and store artifacts
    let jsonData: any = null;
    const jsonPath = path.join(REPORT_DIR, "platform-audit.json");
    const txtPath = path.join(REPORT_DIR, "platform-audit.txt");

    if (fs.existsSync(jsonPath)) {
      try {
        const jsonContent = fs.readFileSync(jsonPath, "utf-8");
        jsonData = JSON.parse(jsonContent);

        const store = getArtifactStore();
        const stored = await store.store(jsonContent, {
          label: `platform-audit-run-${runId}`,
          contentType: "application/json",
          source: "platform-audit",
        });
        updateData.jsonRef = stored.sha256;

        // Extract parsed fields (new report format)
        updateData.summaryJson = jsonData.summary || jsonData;
        // Violations are in summary.topViolations and per-check
        const allViolations = collectViolations(jsonData);
        updateData.violationsJson = truncateViolations(allViolations, opts.design);
        // Store checks array as coverage data
        updateData.coverageJson = jsonData.checks || null;
      } catch (e: any) {
        console.warn(`[AuditRunner] Failed to process JSON artifact: ${e.message}`);
      }
    }

    if (fs.existsSync(txtPath)) {
      try {
        const txtContent = fs.readFileSync(txtPath, "utf-8");
        const store = getArtifactStore();
        const stored = await store.store(txtContent, {
          label: `platform-audit-run-${runId}`,
          contentType: "text/plain",
          source: "platform-audit",
        });
        updateData.txtRef = stored.sha256;
      } catch (e: any) {
        console.warn(`[AuditRunner] Failed to process TXT artifact: ${e.message}`);
      }
    }

    // Determine pass/fail
    if (exitCode !== 0) {
      updateData.status = "fail";
      if (!updateData.errorMessage && stderr) {
        updateData.errorMessage = stderr.slice(0, 2000);
      }
    } else if (jsonData?.summary?.status === "FAIL") {
      updateData.status = "fail";
    } else {
      updateData.status = "pass";
    }

    await db
      .update(governanceAuditRuns)
      .set(updateData)
      .where(eq(governanceAuditRuns.id, runId));

  } catch (err: any) {
    await markError(db, runId, startTime, err.message || "Unknown error");
  }
}

async function markError(db: any, runId: number, startTime: number, message: string) {
  await db
    .update(governanceAuditRuns)
    .set({
      status: "error",
      finishedAt: new Date(),
      durationMs: Date.now() - startTime,
      errorMessage: message.slice(0, 2000),
    })
    .where(eq(governanceAuditRuns.id, runId));
}

/**
 * Collect all violations from the new report format.
 * Violations live in summary.topViolations and in each check's violations array.
 */
function collectViolations(jsonData: any): any[] {
  const all: any[] = [];
  // Gather from each check
  if (Array.isArray(jsonData?.checks)) {
    for (const check of jsonData.checks) {
      if (Array.isArray(check.violations)) {
        all.push(...check.violations);
      }
    }
  }
  return all;
}

function truncateViolations(violations: any[], design: string): any[] {
  if (!Array.isArray(violations)) return [];
  switch (design) {
    case "executive":
      return violations.slice(0, 10);
    case "standard":
      return violations.slice(0, 100);
    case "forensics":
      return violations; // no limit
    default:
      return violations.slice(0, 100);
  }
}
