/**
 * Syscall Kernel — Zod Validation Schemas
 *
 * Every syscall argument set is validated before execution.
 * Invalid payloads are rejected before reaching adapters.
 */

import { z } from "zod";
import type { SyscallAction } from "@shared/operator-types";

// ============================================================================
// Per-Action Argument Schemas
// ============================================================================

const fsWriteSchema = z.object({
  path: z.string().min(1).max(1024).refine(
    (p) => !p.includes("..") && !p.startsWith("/"),
    { message: "Path must be relative and cannot traverse directories" }
  ),
  content: z.string().max(1_000_000),
  encoding: z.enum(["utf-8", "base64"]).default("utf-8"),
});

const fsReadSchema = z.object({
  path: z.string().min(1).max(1024).refine(
    (p) => !p.includes("..") && !p.startsWith("/"),
    { message: "Path must be relative and cannot traverse directories" }
  ),
});

const fsDeleteSchema = z.object({
  path: z.string().min(1).max(1024).refine(
    (p) => !p.includes("..") && !p.startsWith("/"),
    { message: "Path must be relative and cannot traverse directories" }
  ),
});

const fsMkdirSchema = z.object({
  path: z.string().min(1).max(1024).refine(
    (p) => !p.includes("..") && !p.startsWith("/"),
    { message: "Path must be relative and cannot traverse directories" }
  ),
});

const gitCommitSchema = z.object({
  message: z.string().min(1).max(500),
  files: z.array(z.string().min(1).max(512)).min(1).max(100),
  branch: z.string().min(1).max(128).optional(),
});

const gitPushSchema = z.object({
  branch: z.string().min(1).max(128),
  remote: z.string().max(256).default("origin"),
  force: z.boolean().default(false),
});

const gitBranchSchema = z.object({
  name: z.string().min(1).max(128).regex(/^[a-zA-Z0-9/_.-]+$/),
  from: z.string().max(128).default("main"),
});

const gitPrSchema = z.object({
  title: z.string().min(1).max(256),
  body: z.string().max(10_000).default(""),
  head: z.string().min(1).max(128),
  base: z.string().max(128).default("main"),
  draft: z.boolean().default(false),
});

const dbQuerySchema = z.object({
  sql: z.string().min(1).max(10_000).refine(
    (s) => {
      const upper = s.toUpperCase().trim();
      return upper.startsWith("SELECT") || upper.startsWith("WITH");
    },
    { message: "Only SELECT and WITH (CTE) queries are allowed" }
  ),
  params: z.array(z.unknown()).max(50).default([]),
});

const dbInsertSchema = z.object({
  table: z.string().min(1).max(128).regex(/^[a-z_][a-z0-9_]*$/),
  data: z.record(z.unknown()),
});

const dbUpdateSchema = z.object({
  table: z.string().min(1).max(128).regex(/^[a-z_][a-z0-9_]*$/),
  where: z.record(z.unknown()),
  data: z.record(z.unknown()),
});

const dbDeleteSchema = z.object({
  table: z.string().min(1).max(128).regex(/^[a-z_][a-z0-9_]*$/),
  where: z.record(z.unknown()),
});

const ciTriggerSchema = z.object({
  workflow: z.string().min(1).max(256),
  ref: z.string().max(128).default("main"),
  inputs: z.record(z.string()).default({}),
});

const ciStatusSchema = z.object({
  runId: z.string().min(1).max(64),
});

const artifactGenerateSchema = z.object({
  type: z.enum(["report", "diff", "plan", "summary", "code"]),
  content: z.string().max(500_000),
  metadata: z.record(z.unknown()).default({}),
});

const artifactUploadSchema = z.object({
  destination: z.enum(["github", "storage"]),
  path: z.string().min(1).max(1024),
  content: z.string().max(1_000_000),
});

const workflowTriggerSchema = z.object({
  workflowId: z.string().min(1).max(128),
  inputs: z.record(z.unknown()).default({}),
});

const notificationSendSchema = z.object({
  channel: z.enum(["log", "webhook", "internal"]),
  message: z.string().min(1).max(4000),
  severity: z.enum(["info", "warning", "error", "critical"]).default("info"),
  metadata: z.record(z.unknown()).default({}),
});

// ============================================================================
// Schema Registry
// ============================================================================

export const SYSCALL_SCHEMAS: Record<SyscallAction, z.ZodSchema> = {
  "fs.write": fsWriteSchema,
  "fs.read": fsReadSchema,
  "fs.delete": fsDeleteSchema,
  "fs.mkdir": fsMkdirSchema,
  "git.commit": gitCommitSchema,
  "git.push": gitPushSchema,
  "git.branch": gitBranchSchema,
  "git.pr": gitPrSchema,
  "db.query": dbQuerySchema,
  "db.insert": dbInsertSchema,
  "db.update": dbUpdateSchema,
  "db.delete": dbDeleteSchema,
  "ci.trigger": ciTriggerSchema,
  "ci.status": ciStatusSchema,
  "artifact.generate": artifactGenerateSchema,
  "artifact.upload": artifactUploadSchema,
  "workflow.trigger": workflowTriggerSchema,
  "notification.send": notificationSendSchema,
};

/**
 * Validate syscall arguments against registered schema.
 * Returns parsed args or throws ZodError.
 */
export function validateSyscallArgs(action: SyscallAction, args: Record<string, unknown>): Record<string, unknown> {
  const schema = SYSCALL_SCHEMAS[action];
  if (!schema) {
    throw new Error(`Unknown syscall action: ${action}`);
  }
  return schema.parse(args) as Record<string, unknown>;
}
