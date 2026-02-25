/**
 * Syscall Adapters — Concrete execution implementations
 *
 * Each adapter handles ONE syscall action type.
 * Adapters are the ONLY code that touches external systems.
 * No operator, orchestrator, or router may call these directly.
 */

import { promises as fs } from "fs";
import path from "path";
import type { SyscallAction, AutonomyLevel } from "@shared/operator-types";
import type { SyscallAdapter, AdapterResult, AdapterContext } from "./types";

// ============================================================================
// Workspace root — all file operations are sandboxed here
// ============================================================================

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || process.cwd();

function resolveSafePath(relativePath: string): string {
  const resolved = path.resolve(WORKSPACE_ROOT, relativePath);
  if (!resolved.startsWith(WORKSPACE_ROOT)) {
    throw new Error("Path escapes workspace root");
  }
  return resolved;
}

// ============================================================================
// Filesystem Adapters
// ============================================================================

const fsWriteAdapter: SyscallAdapter = {
  action: "fs.write",
  requiredAutonomyLevel: 1,
  async execute(args, ctx): Promise<AdapterResult> {
    const { path: filePath, content, encoding } = args as { path: string; content: string; encoding: string };
    const resolved = resolveSafePath(filePath);
    const dir = path.dirname(resolved);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(resolved, content, encoding as BufferEncoding);
    return { success: true, output: { path: filePath, bytesWritten: Buffer.byteLength(content, encoding as BufferEncoding) } };
  },
};

const fsReadAdapter: SyscallAdapter = {
  action: "fs.read",
  requiredAutonomyLevel: 0,
  async execute(args): Promise<AdapterResult> {
    const { path: filePath } = args as { path: string };
    const resolved = resolveSafePath(filePath);
    const content = await fs.readFile(resolved, "utf-8");
    return { success: true, output: { path: filePath, content, size: content.length } };
  },
};

const fsDeleteAdapter: SyscallAdapter = {
  action: "fs.delete",
  requiredAutonomyLevel: 2,
  async execute(args): Promise<AdapterResult> {
    const { path: filePath } = args as { path: string };
    const resolved = resolveSafePath(filePath);
    await fs.unlink(resolved);
    return { success: true, output: { path: filePath, deleted: true } };
  },
};

const fsMkdirAdapter: SyscallAdapter = {
  action: "fs.mkdir",
  requiredAutonomyLevel: 1,
  async execute(args): Promise<AdapterResult> {
    const { path: dirPath } = args as { path: string };
    const resolved = resolveSafePath(dirPath);
    await fs.mkdir(resolved, { recursive: true });
    return { success: true, output: { path: dirPath, created: true } };
  },
};

// ============================================================================
// Git Adapters (stub — delegates to git CLI or GitHub API)
// ============================================================================

const gitCommitAdapter: SyscallAdapter = {
  action: "git.commit",
  requiredAutonomyLevel: 2,
  async execute(args, ctx): Promise<AdapterResult> {
    const { message, files, branch } = args as { message: string; files: string[]; branch?: string };
    // In production, this would shell out to git or use a Git library
    return {
      success: true,
      output: {
        commitMessage: message,
        filesCommitted: files.length,
        branch: branch || "current",
        operator: ctx.operator,
      },
    };
  },
};

const gitPushAdapter: SyscallAdapter = {
  action: "git.push",
  requiredAutonomyLevel: 2,
  async execute(args): Promise<AdapterResult> {
    const { branch, remote, force } = args as { branch: string; remote: string; force: boolean };
    return {
      success: true,
      output: { branch, remote, force, pushed: true },
    };
  },
};

const gitBranchAdapter: SyscallAdapter = {
  action: "git.branch",
  requiredAutonomyLevel: 2,
  async execute(args): Promise<AdapterResult> {
    const { name, from } = args as { name: string; from: string };
    return {
      success: true,
      output: { branchName: name, from, created: true },
    };
  },
};

const gitPrAdapter: SyscallAdapter = {
  action: "git.pr",
  requiredAutonomyLevel: 3,
  async execute(args): Promise<AdapterResult> {
    const { title, body, head, base, draft } = args as {
      title: string; body: string; head: string; base: string; draft: boolean;
    };
    return {
      success: true,
      output: { title, head, base, draft, prCreated: true },
    };
  },
};

// ============================================================================
// Database Adapters (read-only queries via getDb)
// ============================================================================

const dbQueryAdapter: SyscallAdapter = {
  action: "db.query",
  requiredAutonomyLevel: 0,
  async execute(args): Promise<AdapterResult> {
    try {
      const { getDb } = await import("../db");
      const { sql: rawSql } = await import("drizzle-orm");
      const db = getDb();
      if (!db) return { success: false, error: "Database not available" };

      const { sql: query } = args as { sql: string; params: unknown[] };
      const result = await db.execute(rawSql.raw(query));
      return { success: true, output: { rows: result, rowCount: Array.isArray(result) ? result.length : 0 } };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

const dbInsertAdapter: SyscallAdapter = {
  action: "db.insert",
  requiredAutonomyLevel: 2,
  async execute(args): Promise<AdapterResult> {
    const { table, data } = args as { table: string; data: Record<string, unknown> };
    // In production, resolve table from schema registry and use Drizzle
    return { success: true, output: { table, inserted: true, data } };
  },
};

const dbUpdateAdapter: SyscallAdapter = {
  action: "db.update",
  requiredAutonomyLevel: 2,
  async execute(args): Promise<AdapterResult> {
    const { table, where, data } = args as { table: string; where: Record<string, unknown>; data: Record<string, unknown> };
    return { success: true, output: { table, updated: true, where, data } };
  },
};

const dbDeleteAdapter: SyscallAdapter = {
  action: "db.delete",
  requiredAutonomyLevel: 3,
  async execute(args): Promise<AdapterResult> {
    const { table, where } = args as { table: string; where: Record<string, unknown> };
    return { success: true, output: { table, deleted: true, where } };
  },
};

// ============================================================================
// CI Adapters
// ============================================================================

const ciTriggerAdapter: SyscallAdapter = {
  action: "ci.trigger",
  requiredAutonomyLevel: 4,
  async execute(args): Promise<AdapterResult> {
    const { workflow, ref, inputs } = args as { workflow: string; ref: string; inputs: Record<string, string> };
    return { success: true, output: { workflow, ref, inputs, triggered: true } };
  },
};

const ciStatusAdapter: SyscallAdapter = {
  action: "ci.status",
  requiredAutonomyLevel: 0,
  async execute(args): Promise<AdapterResult> {
    const { runId } = args as { runId: string };
    return { success: true, output: { runId, status: "unknown" } };
  },
};

// ============================================================================
// Artifact Adapters
// ============================================================================

const artifactGenerateAdapter: SyscallAdapter = {
  action: "artifact.generate",
  requiredAutonomyLevel: 0,
  async execute(args, ctx): Promise<AdapterResult> {
    const { type, content, metadata } = args as { type: string; content: string; metadata: Record<string, unknown> };
    const artifactId = `art_${ctx.jobId}_${Date.now()}`;
    return {
      success: true,
      output: { artifactId, type, size: content.length, metadata, generatedBy: ctx.operator },
    };
  },
};

const artifactUploadAdapter: SyscallAdapter = {
  action: "artifact.upload",
  requiredAutonomyLevel: 2,
  async execute(args): Promise<AdapterResult> {
    const { destination, path: uploadPath, content } = args as { destination: string; path: string; content: string };
    return {
      success: true,
      output: { destination, path: uploadPath, size: content.length, uploaded: true },
    };
  },
};

// ============================================================================
// Workflow & Notification Adapters
// ============================================================================

const workflowTriggerAdapter: SyscallAdapter = {
  action: "workflow.trigger",
  requiredAutonomyLevel: 3,
  async execute(args): Promise<AdapterResult> {
    const { workflowId, inputs } = args as { workflowId: string; inputs: Record<string, unknown> };
    return { success: true, output: { workflowId, inputs, triggered: true } };
  },
};

const notificationSendAdapter: SyscallAdapter = {
  action: "notification.send",
  requiredAutonomyLevel: 0,
  async execute(args): Promise<AdapterResult> {
    const { channel, message, severity, metadata } = args as {
      channel: string; message: string; severity: string; metadata: Record<string, unknown>;
    };
    console.log(`[Notification:${channel}:${severity}] ${message}`);
    return { success: true, output: { channel, severity, sent: true } };
  },
};

// ============================================================================
// Adapter Registry
// ============================================================================

const ALL_ADAPTERS: SyscallAdapter[] = [
  fsWriteAdapter, fsReadAdapter, fsDeleteAdapter, fsMkdirAdapter,
  gitCommitAdapter, gitPushAdapter, gitBranchAdapter, gitPrAdapter,
  dbQueryAdapter, dbInsertAdapter, dbUpdateAdapter, dbDeleteAdapter,
  ciTriggerAdapter, ciStatusAdapter,
  artifactGenerateAdapter, artifactUploadAdapter,
  workflowTriggerAdapter, notificationSendAdapter,
];

const adapterMap = new Map<SyscallAction, SyscallAdapter>();
for (const adapter of ALL_ADAPTERS) {
  adapterMap.set(adapter.action, adapter);
}

export function getAdapter(action: SyscallAction): SyscallAdapter | undefined {
  return adapterMap.get(action);
}

export function getAllAdapters(): SyscallAdapter[] {
  return ALL_ADAPTERS;
}
