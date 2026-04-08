/**
 * AI Agent Studio — Hook Runner
 *
 * Phase 4 of the Agent Studio remaining-phases plan. Executes hook commands
 * from `agsDraftHooks` against live runtime events and persists the
 * results into `agsRuntimeHookExecutions`.
 *
 * Design notes:
 *  - Uses `spawn` (not `exec`) so we don't shell-interpret the command —
 *    the user-supplied command is parsed into argv0 + args via a simple
 *    whitespace split. Quoted args are NOT supported by design; if the
 *    user wants complex shell logic, they should put it in a script and
 *    invoke the script directly.
 *  - Hard timeout via `setTimeout` + `child.kill('SIGKILL')`.
 *  - Sets `cwd` to the agent's first workingDirectory if any. Refuses to
 *    run when no workingDirectory is configured (to prevent rogue
 *    processes from inheriting the dev server's cwd).
 *  - Forwards a small allowlist of env vars only:
 *      AGS_RUN_ID         → the runtime run id
 *      AGS_AGENT_ID       → the agent id
 *      AGS_HOOK_EVENT     → the hook event name
 *      AGS_HOOK_MATCHER   → the matcher (or empty)
 *      AGS_HOOK_PAYLOAD   → JSON-encoded event payload
 *      PATH               → so binaries are findable
 *    Nothing from the dev server's env leaks in.
 *  - Captures stdout/stderr with a 4 KiB cap to avoid blowing up the DB.
 *  - When `requiresApproval=true`, the hook is skipped (returns a synthetic
 *    "skipped: requires approval" execution row) — Phase 3's pending
 *    permission flow could be extended later but isn't wired here yet.
 */

import { spawn } from "child_process";
import * as repo from "../repository";

const STDOUT_CAP_BYTES = 4 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;
const ALLOWED_ENV_KEYS: ReadonlySet<string> = new Set(["PATH"]);

// ── Public types ────────────────────────────────────────────────────────────

export interface HookExecutionRequest {
  /** Runtime run the hook fired during */
  runId: number;
  /** Agent id, used for AGS_AGENT_ID env var */
  agentId: number;
  /** The hook row from agsDraftHooks */
  hook: {
    id: number;
    eventName: string;
    matcher?: string | null;
    command: string;
    timeoutMs?: number | null;
    requiresApproval?: boolean | null;
    enabled?: boolean | null;
  };
  /** The event payload — passed to the hook process via env var */
  payload: Record<string, unknown>;
  /** First entry of the agent's workingDirectories — required */
  workingDirectory?: string | null;
}

export interface HookExecutionResult {
  hookId: number;
  eventName: string;
  matcher?: string | null;
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  error?: string;
  /** True if we declined to run the hook (skipped/disabled) */
  skipped?: boolean;
  skipReason?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Truncate a Buffer to STDOUT_CAP_BYTES and add a marker so the truncation
 * is visible in the trace UI.
 */
function capBuffer(buf: Buffer): string {
  if (buf.length <= STDOUT_CAP_BYTES) return buf.toString("utf-8");
  const head = buf.subarray(0, STDOUT_CAP_BYTES).toString("utf-8");
  return `${head}\n…[truncated ${buf.length - STDOUT_CAP_BYTES} more bytes]`;
}

/** Whitespace-split a command string into argv0 + args. No shell parsing. */
function splitCommand(command: string): { argv0: string; args: string[] } {
  const parts = command.trim().split(/\s+/).filter(Boolean);
  return {
    argv0: parts[0] ?? "",
    args: parts.slice(1),
  };
}

/**
 * Match a tool name against the hook's `matcher` field. Reuses the same
 * semantics as the Phase 1c permission rule matcher (mirrors openllm
 * matcher: exact / Tool(*) / glob / *). Lives here as a copy because we
 * don't want a cross-service import (simulation imports hook-runner).
 */
export function matchesHookMatcher(toolName: string, matcher?: string | null): boolean {
  if (!matcher) return true; // null/empty matcher = match all
  if (matcher === "*") return true;
  if (matcher === toolName) return true;
  const noParen = matcher.replace(/\s*\(\*\)\s*$/, "");
  if (noParen === toolName) return true;
  if (matcher.includes("*")) {
    const regexBody = matcher
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*");
    const re = new RegExp(`^${regexBody}$`);
    if (re.test(toolName)) return true;
  }
  return false;
}

// ── Main entry point ────────────────────────────────────────────────────────

/**
 * Execute a single hook against a runtime event. Always persists a row to
 * `agsRuntimeHookExecutions` (even on skip/error) so the trace is complete.
 */
export async function executeHook(
  req: HookExecutionRequest
): Promise<HookExecutionResult> {
  const start = Date.now();

  // Skip disabled hooks
  if (req.hook.enabled === false) {
    const result = makeSkipped(req, "hook disabled", start);
    await persist(result, req.runId);
    return result;
  }

  // Skip approval-required hooks for now (Phase 4 doesn't wire approval)
  if (req.hook.requiresApproval === true) {
    const result = makeSkipped(
      req,
      "requires approval — skipped (Phase 4 doesn't wire approval flow yet)",
      start
    );
    await persist(result, req.runId);
    return result;
  }

  // Working directory is mandatory — we refuse to inherit the dev server's cwd
  if (!req.workingDirectory) {
    const result: HookExecutionResult = {
      hookId: req.hook.id,
      eventName: req.hook.eventName,
      matcher: req.hook.matcher,
      command: req.hook.command,
      exitCode: null,
      stdout: "",
      stderr: "",
      durationMs: Date.now() - start,
      timedOut: false,
      error: "No working directory configured for the agent — refusing to run hook",
      skipped: true,
      skipReason: "no working directory",
    };
    await persist(result, req.runId);
    return result;
  }

  // Parse argv from the command
  const { argv0, args } = splitCommand(req.hook.command);
  if (!argv0) {
    const result: HookExecutionResult = {
      hookId: req.hook.id,
      eventName: req.hook.eventName,
      matcher: req.hook.matcher,
      command: req.hook.command,
      exitCode: null,
      stdout: "",
      stderr: "",
      durationMs: Date.now() - start,
      timedOut: false,
      error: "Hook command is empty",
      skipped: true,
      skipReason: "empty command",
    };
    await persist(result, req.runId);
    return result;
  }

  // Build the sanitized env
  const safeEnv: NodeJS.ProcessEnv = {
    AGS_RUN_ID: String(req.runId),
    AGS_AGENT_ID: String(req.agentId),
    AGS_HOOK_EVENT: req.hook.eventName,
    AGS_HOOK_MATCHER: req.hook.matcher ?? "",
    AGS_HOOK_PAYLOAD: JSON.stringify(req.payload),
  };
  for (const key of ALLOWED_ENV_KEYS) {
    if (process.env[key] != null) safeEnv[key] = process.env[key]!;
  }

  const timeoutMs = req.hook.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Spawn + capture
  return new Promise<HookExecutionResult>((resolve) => {
    const stdoutBuf: Buffer[] = [];
    const stderrBuf: Buffer[] = [];
    let stdoutLen = 0;
    let stderrLen = 0;
    let timedOut = false;
    let resolved = false;

    const finishWith = async (
      exitCode: number | null,
      error: string | undefined
    ) => {
      if (resolved) return;
      resolved = true;
      const result: HookExecutionResult = {
        hookId: req.hook.id,
        eventName: req.hook.eventName,
        matcher: req.hook.matcher,
        command: req.hook.command,
        exitCode,
        stdout: capBuffer(Buffer.concat(stdoutBuf)),
        stderr: capBuffer(Buffer.concat(stderrBuf)),
        durationMs: Date.now() - start,
        timedOut,
        error,
      };
      try {
        await persist(result, req.runId);
      } catch {
        /* ignore — failure to persist a hook row shouldn't crash a run */
      }
      resolve(result);
    };

    let child;
    try {
      child = spawn(argv0, args, {
        cwd: req.workingDirectory!,
        env: safeEnv,
        // Don't inherit stdio — we capture stdout/stderr ourselves
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (e) {
      finishWith(null, e instanceof Error ? e.message : String(e));
      return;
    }

    // Hard timeout
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      // Stop appending once we exceed the cap so we don't OOM on a runaway hook
      if (stdoutLen < STDOUT_CAP_BYTES * 2) {
        stdoutBuf.push(chunk);
        stdoutLen += chunk.length;
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderrLen < STDOUT_CAP_BYTES * 2) {
        stderrBuf.push(chunk);
        stderrLen += chunk.length;
      }
    });

    child.on("error", (err: Error) => {
      clearTimeout(timer);
      finishWith(null, err.message);
    });
    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      finishWith(code, undefined);
    });
  });
}

/**
 * List + execute all hooks matching an event for a draft. Convenience
 * wrapper used by the simulation engine. Returns the array of results in
 * the order they were executed.
 */
export async function fireHooksForEvent(input: {
  runId: number;
  agentId: number;
  draftId: number;
  eventName: string;
  toolName?: string;
  payload: Record<string, unknown>;
  workingDirectory?: string | null;
}): Promise<HookExecutionResult[]> {
  const allHooks = await repo.listHooks(input.draftId);
  const matching = allHooks.filter((h) => {
    if (h.eventName !== input.eventName) return false;
    // For tool-scoped events (PreToolUse / PostToolUse) the matcher
    // narrows further. For other events we ignore the matcher.
    const isToolScoped =
      input.eventName === "PreToolUse" || input.eventName === "PostToolUse";
    if (!isToolScoped) return true;
    return matchesHookMatcher(input.toolName ?? "", h.matcher);
  });
  const results: HookExecutionResult[] = [];
  for (const hook of matching) {
    const r = await executeHook({
      runId: input.runId,
      agentId: input.agentId,
      hook: {
        id: hook.id,
        eventName: hook.eventName,
        matcher: hook.matcher,
        command: hook.command,
        timeoutMs: hook.timeoutMs,
        requiresApproval: hook.requiresApproval,
        enabled: hook.enabled,
      },
      payload: input.payload,
      workingDirectory: input.workingDirectory,
    });
    results.push(r);
  }
  return results;
}

// ── Persistence ────────────────────────────────────────────────────────────

async function persist(result: HookExecutionResult, runId: number) {
  await repo.appendRuntimeHookExecution({
    runId,
    hookId: result.hookId,
    eventName: result.eventName,
    matcher: result.matcher ?? null,
    command: result.command,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs: result.durationMs,
    timedOut: result.timedOut,
    error: result.error ?? null,
  });
}

function makeSkipped(
  req: HookExecutionRequest,
  reason: string,
  start: number
): HookExecutionResult {
  return {
    hookId: req.hook.id,
    eventName: req.hook.eventName,
    matcher: req.hook.matcher,
    command: req.hook.command,
    exitCode: null,
    stdout: "",
    stderr: "",
    durationMs: Date.now() - start,
    timedOut: false,
    skipped: true,
    skipReason: reason,
  };
}
