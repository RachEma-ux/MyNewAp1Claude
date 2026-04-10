/**
 * KGIA Observability — Structured Logging
 *
 * Consistent structured logging for all KGIA operations.
 * All log entries include: module, operation, timestamp, and context.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  module: "kgia";
  operation: string;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
  runId?: number;
  sessionId?: number;
  workspaceId?: number;
  durationMs?: number;
}

function emit(entry: LogEntry): void {
  const prefix = `[KGIA:${entry.operation}]`;
  const ctx = entry.context ? ` ${JSON.stringify(entry.context)}` : "";

  switch (entry.level) {
    case "debug":
      console.debug(`${prefix} ${entry.message}${ctx}`);
      break;
    case "info":
      console.log(`${prefix} ${entry.message}${ctx}`);
      break;
    case "warn":
      console.warn(`${prefix} ${entry.message}${ctx}`);
      break;
    case "error":
      console.error(`${prefix} ${entry.message}${ctx}`);
      break;
  }
}

export function kgiaLog(
  level: LogLevel,
  operation: string,
  message: string,
  context?: Record<string, unknown> & { runId?: number; sessionId?: number; workspaceId?: number; durationMs?: number }
): void {
  emit({
    level,
    module: "kgia",
    operation,
    message,
    context,
    timestamp: new Date().toISOString(),
    runId: context?.runId,
    sessionId: context?.sessionId,
    workspaceId: context?.workspaceId,
    durationMs: context?.durationMs,
  });
}

// Convenience helpers
export const kgiaDebug = (op: string, msg: string, ctx?: Record<string, unknown>) => kgiaLog("debug", op, msg, ctx);
export const kgiaInfo = (op: string, msg: string, ctx?: Record<string, unknown>) => kgiaLog("info", op, msg, ctx);
export const kgiaWarn = (op: string, msg: string, ctx?: Record<string, unknown>) => kgiaLog("warn", op, msg, ctx);
export const kgiaError = (op: string, msg: string, ctx?: Record<string, unknown>) => kgiaLog("error", op, msg, ctx);
