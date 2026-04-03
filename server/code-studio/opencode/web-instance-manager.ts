/**
 * Code Studio — OpenCode Web Instance Manager
 *
 * Manages lifecycle of `opencode web` processes for workspace-bound IDE sessions.
 * Each instance is bound to a job/workspace and proxied through a stable route.
 *
 * Responsibilities:
 * 1. Resolve workspace path for a job/session
 * 2. Start `opencode web` for that workspace when needed
 * 3. Reuse an existing healthy instance for the same workspace
 * 4. Allocate/track ports (sequential from OPENCODE_WEB_BASE_PORT)
 * 5. Health check instances
 * 6. Stop or expire stale instances
 * 7. Provide proxy target information
 */

import { spawn, execFileSync, type ChildProcess } from "child_process";
import * as crypto from "crypto";
import * as fs from "fs";
import * as repo from "../repository";
import { getWorkspaceByJobId } from "../worker/workspace-manager";
import {
  OPENCODE_WEB_BASE_PORT,
  OPENCODE_WEB_MAX_PORT,
  OPENCODE_WEB_HOSTNAME,
  OPENCODE_WEB_TTL_MINUTES,
  OPENCODE_BINARY_PATH,
} from "../shared/constants";
import type { IdeInstanceLaunchResult } from "./types";

// ── Termux/Android compatibility ──────────────────────────────────────────
// OpenCode is a Bun-based Linux ELF binary. On Termux (Android + proot),
// Bun's listen() syscall fails because proot can't intercept io_uring.
// The fix: run OpenCode inside the Ubuntu proot-distro rootfs where glibc
// and syscall translation work correctly.

const UBUNTU_ROOTFS = process.env.OPENCODE_UBUNTU_ROOTFS
  || "/data/data/com.termux/files/usr/var/lib/proot-distro/installed-rootfs/ubuntu";

const IS_TERMUX = fs.existsSync(UBUNTU_ROOTFS) && process.platform === "linux"
  && fs.existsSync("/data/data/com.termux");

function buildLdLibraryPath(): string {
  const glibcDir =
    process.env.OPENCODE_GLIBC_DIR ||
    `${UBUNTU_ROOTFS}/usr/lib/aarch64-linux-gnu`;
  const existing = process.env.LD_LIBRARY_PATH || "";
  if (existing.includes(glibcDir)) return existing;
  return existing ? `${glibcDir}:${existing}` : glibcDir;
}

// ── In-memory process tracking ────────────────────────────────────────────

const liveProcesses = new Map<number, ChildProcess>();

// ── Port Allocation ───────────────────────────────────────────────────────

async function allocatePort(): Promise<number> {
  const usedPorts = await repo.getAllocatedPorts();
  const usedSet = new Set(usedPorts);
  for (let port = OPENCODE_WEB_BASE_PORT; port <= OPENCODE_WEB_MAX_PORT; port++) {
    if (!usedSet.has(port)) return port;
  }
  throw new Error(
    `Port exhaustion: all ports ${OPENCODE_WEB_BASE_PORT}-${OPENCODE_WEB_MAX_PORT} are in use`
  );
}

function generateProxyKey(): string {
  return crypto.randomBytes(12).toString("hex");
}

// ── Workspace Resolution ──────────────────────────────────────────────────

export async function resolveWorkspacePathForJob(jobId: number): Promise<{
  workspacePath: string;
  workspaceId: number | null;
}> {
  const workspace = await getWorkspaceByJobId(jobId);
  if (workspace && workspace.workspacePath) {
    return { workspacePath: workspace.workspacePath, workspaceId: workspace.id };
  }
  // Fallback: use a deterministic path based on jobId
  const fallbackPath = `/tmp/code-studio-workspaces/job-${jobId}`;
  return { workspacePath: fallbackPath, workspaceId: null };
}

export async function resolveWorkspacePathForSession(sessionId: number): Promise<{
  workspacePath: string;
  workspaceId: number | null;
  jobId: number | null;
}> {
  const session = await repo.getSessionById(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  if (session.jobId) {
    const resolved = await resolveWorkspacePathForJob(session.jobId);
    return { ...resolved, jobId: session.jobId };
  }

  throw new Error(`Session ${sessionId} has no associated job — cannot resolve workspace`);
}

// ── Instance Health Check ─────────────────────────────────────────────────

async function isInstanceHealthy(instance: any): Promise<boolean> {
  if (instance.status !== "running") return false;

  // Check if process is still alive
  const proc = liveProcesses.get(instance.id);
  if (proc && proc.exitCode !== null) return false;

  // Check if expired
  if (instance.expiresAt && new Date(instance.expiresAt) < new Date()) return false;

  // HTTP health check to the OpenCode Web instance
  try {
    const url = `http://${instance.hostname}:${instance.port}/global/health`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const password = process.env.OPENCODE_WEB_PASSWORD || process.env.OPENCODE_SERVER_PASSWORD || "";
    if (password) {
      const username = process.env.OPENCODE_SERVER_USERNAME || "opencode";
      headers.Authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
    }
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Start Instance ────────────────────────────────────────────────────────

async function startOpenCodeWeb(
  workspacePath: string,
  port: number
): Promise<ChildProcess> {
  // Pre-flight: check binary exists and is executable
  if (!fs.existsSync(OPENCODE_BINARY_PATH)) {
    throw new Error(
      `OpenCode binary not found at "${OPENCODE_BINARY_PATH}". ` +
      `Install OpenCode or set OPENCODE_BINARY_PATH env var.`
    );
  }
  try {
    execFileSync(OPENCODE_BINARY_PATH, ["--version"], {
      timeout: 15000,
      stdio: "pipe",
      env: { ...process.env, LD_LIBRARY_PATH: buildLdLibraryPath() },
    });
  } catch (e: any) {
    throw new Error(
      `OpenCode binary at "${OPENCODE_BINARY_PATH}" cannot execute on this platform: ${e.message?.split("\n")[0]}`
    );
  }

  // Ensure workspace directory exists before spawning
  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true });
  }

  const hostname = OPENCODE_WEB_HOSTNAME;
  const password = process.env.OPENCODE_WEB_PASSWORD || process.env.OPENCODE_SERVER_PASSWORD || "";

  const ocArgs = ["serve", "--port", String(port), "--hostname", hostname];

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    HOME: process.env.HOME || "",
    PATH: process.env.PATH || "",
  };

  if (password) {
    env.OPENCODE_SERVER_PASSWORD = password;
  }
  if (process.env.OPENCODE_SERVER_USERNAME) {
    env.OPENCODE_SERVER_USERNAME = process.env.OPENCODE_SERVER_USERNAME;
  }

  let spawnCmd: string;
  let spawnArgs: string[];

  if (IS_TERMUX) {
    // On Termux, run through proot with Ubuntu rootfs so Bun can bind ports
    spawnCmd = "proot";
    spawnArgs = [
      "--kill-on-exit",
      "-r", UBUNTU_ROOTFS,
      "-b", "/dev:/dev",
      "-b", "/proc:/proc",
      "-b", `${process.env.HOME || "/data/data/com.termux/files/home"}:/home`,
      "-b", "/data/data/com.termux/files/usr/tmp:/tmp",
      "-w", workspacePath,
      OPENCODE_BINARY_PATH,
      ...ocArgs,
    ];
  } else {
    spawnCmd = OPENCODE_BINARY_PATH;
    spawnArgs = ocArgs;
    env.LD_LIBRARY_PATH = buildLdLibraryPath();
  }

  const child = spawn(spawnCmd, spawnArgs, {
    cwd: IS_TERMUX ? undefined : workspacePath,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  return child;
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Open (or reuse) an OpenCode Web instance for a job.
 */
export async function openForJob(jobId: number): Promise<IdeInstanceLaunchResult> {
  const job = await repo.getJobById(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  // 1. Check for existing running instance for this job
  const existing = await repo.getRunningIdeInstanceForJob(jobId);
  if (existing && await isInstanceHealthy(existing)) {
    await repo.updateIdeInstance(existing.id, { lastAccessedAt: new Date() });
    return {
      instance: existing as any,
      proxyUrl: `/api/code-studio/ide/${existing.proxyKey}/`,
      directUrl: `http://${existing.hostname}:${existing.port}/`,
      isReused: true,
    };
  }

  // 2. Resolve workspace
  const { workspacePath, workspaceId } = await resolveWorkspacePathForJob(jobId);

  // 3. Check for existing instance on same workspace path
  const wsInstance = await repo.getRunningIdeInstanceForWorkspacePath(workspacePath);
  if (wsInstance && await isInstanceHealthy(wsInstance)) {
    // Reuse — update jobId reference
    await repo.updateIdeInstance(wsInstance.id, {
      jobId,
      lastAccessedAt: new Date(),
    });
    return {
      instance: { ...wsInstance, jobId } as any,
      proxyUrl: `/api/code-studio/ide/${wsInstance.proxyKey}/`,
      directUrl: `http://${wsInstance.hostname}:${wsInstance.port}/`,
      isReused: true,
    };
  }

  // 4. Allocate port and create instance record
  const port = await allocatePort();
  const proxyKey = generateProxyKey();
  const expiresAt = new Date(Date.now() + OPENCODE_WEB_TTL_MINUTES * 60 * 1000);

  const launchCommand = IS_TERMUX
    ? `proot -r ${UBUNTU_ROOTFS} ${OPENCODE_BINARY_PATH} serve --port ${port} --hostname ${OPENCODE_WEB_HOSTNAME}`
    : `${OPENCODE_BINARY_PATH} serve --port ${port} --hostname ${OPENCODE_WEB_HOSTNAME}`;

  const instance = await repo.createIdeInstance({
    jobId,
    workspaceId: workspaceId ?? undefined,
    workspacePath,
    hostname: OPENCODE_WEB_HOSTNAME,
    port,
    proxyKey,
    launchCommand,
    expiresAt,
  });

  // 5. Start the process
  try {
    const child = await startOpenCodeWeb(workspacePath, port);

    liveProcesses.set(instance.id, child);

    child.on("exit", async (code) => {
      liveProcesses.delete(instance.id);
      try {
        await repo.updateIdeInstance(instance.id, {
          status: "stopped",
          closedAt: new Date(),
          errorMessage: code !== 0 ? `Process exited with code ${code}` : null,
        });
      } catch { /* non-fatal */ }
    });

    child.on("error", async (err) => {
      liveProcesses.delete(instance.id);
      try {
        await repo.updateIdeInstance(instance.id, {
          status: "failed",
          closedAt: new Date(),
          errorMessage: err.message,
        });
      } catch { /* non-fatal */ }
    });

    // Update instance with PID and running status
    const updated = await repo.updateIdeInstance(instance.id, {
      processId: child.pid || null,
      status: "running",
    });

    await repo.createAuditEvent({
      eventType: "ide_instance_started",
      entityType: "ide_instance",
      entityId: instance.id,
      details: { jobId, port, workspacePath, proxyKey },
    });

    return {
      instance: updated as any,
      proxyUrl: `/api/code-studio/ide/${proxyKey}/`,
      directUrl: `http://${OPENCODE_WEB_HOSTNAME}:${port}/`,
      isReused: false,
    };
  } catch (err: any) {
    await repo.updateIdeInstance(instance.id, {
      status: "failed",
      closedAt: new Date(),
      errorMessage: err.message,
    });
    throw new Error(`Failed to start OpenCode Web: ${err.message}`);
  }
}

/**
 * Open (or reuse) an OpenCode Web instance for a session.
 * Delegates to openForJob after resolving the session's job.
 */
export async function openForSession(sessionId: number): Promise<IdeInstanceLaunchResult> {
  const resolved = await resolveWorkspacePathForSession(sessionId);
  if (!resolved.jobId) {
    throw new Error(`Session ${sessionId} has no associated job`);
  }
  return openForJob(resolved.jobId);
}

/**
 * Get status of a specific IDE instance.
 */
export async function getInstanceStatus(instanceId: number) {
  const instance = await repo.getIdeInstanceById(instanceId);
  if (!instance) return null;

  const healthy = await isInstanceHealthy(instance);
  if (instance.status === "running" && !healthy) {
    await repo.updateIdeInstance(instanceId, { status: "stopped", closedAt: new Date() });
    return { ...instance, status: "stopped", healthy: false };
  }

  return { ...instance, healthy };
}

/**
 * Close / stop an IDE instance.
 */
export async function closeInstance(instanceId: number): Promise<void> {
  const instance = await repo.getIdeInstanceById(instanceId);
  if (!instance) throw new Error(`IDE instance ${instanceId} not found`);

  // Kill the process
  const proc = liveProcesses.get(instanceId);
  if (proc && proc.exitCode === null) {
    proc.kill("SIGTERM");
  }
  liveProcesses.delete(instanceId);

  await repo.updateIdeInstance(instanceId, {
    status: "stopped",
    closedAt: new Date(),
  });

  await repo.createAuditEvent({
    eventType: "ide_instance_closed",
    entityType: "ide_instance",
    entityId: instanceId,
    details: { jobId: instance.jobId },
  });
}

/**
 * Expire stale instances (called on access or periodically).
 */
export async function expireStaleInstances(): Promise<number> {
  const running = await repo.listIdeInstances({ status: "running" });
  let expired = 0;
  for (const inst of running) {
    if (inst.expiresAt && new Date(inst.expiresAt) < new Date()) {
      try {
        await closeInstance(inst.id);
        await repo.updateIdeInstance(inst.id, { status: "expired" });
        expired++;
      } catch { /* non-fatal */ }
    }
  }
  return expired;
}
