/**
 * AI Agent Studio — Slash Command Parser & Executor
 *
 * Phase 6 of the Agent Studio remaining-phases plan. Provides the operator
 * UI piece that openllm-agent2 has at the CLI: `/help`, `/clear`, `/compact`,
 * `/cost`, `/cancel`, `/cwd <path>` typed against a live runtime run.
 *
 * Design notes:
 *  - Pure parser: `parseSlashCommand("/cost")` → `{ command: "cost", args: [] }`.
 *    Strict `^/` prefix; non-slash input returns null. The runs page input
 *    box only fires the executor when this returns non-null.
 *  - Executor takes a runtime run id (so it can scope its actions) and the
 *    parsed command, and returns a structured result the UI can render
 *    inline. Most commands are read-only; the destructive ones (`cancel`,
 *    `cwd`) write to the run / draft.
 *  - This file has zero cross-module imports — it stays inside
 *    server/agent-studio/ like the rest of the module.
 */

import * as repo from "../repository";

// ── Public types ────────────────────────────────────────────────────────────

export interface ParsedSlashCommand {
  /** Lowercased command name with no leading slash */
  command: string;
  /** Whitespace-split args after the command */
  args: string[];
  /** The full original raw input including the leading slash */
  raw: string;
}

export type SlashCommandKind =
  | "help"
  | "clear"
  | "compact"
  | "cost"
  | "cancel"
  | "cwd";

export interface SlashCommandResult {
  command: SlashCommandKind;
  ok: boolean;
  /** Human-readable message — rendered inline in the runs page */
  message: string;
  /** Optional structured payload for richer rendering */
  data?: Record<string, unknown>;
}

// ── Parser ──────────────────────────────────────────────────────────────────

const KNOWN_COMMANDS: ReadonlySet<SlashCommandKind> = new Set([
  "help",
  "clear",
  "compact",
  "cost",
  "cancel",
  "cwd",
]);

/**
 * Parse a raw input string into a structured slash command. Returns null
 * for empty strings, strings without a leading slash, or unknown commands.
 *
 * Examples:
 *   "/help"            → { command: "help", args: [] }
 *   "/cwd /tmp/work"   → { command: "cwd", args: ["/tmp/work"] }
 *   "/COST"            → { command: "cost", args: [] }    (case-insensitive)
 *   "hello"            → null                              (no slash)
 *   "/unknown"         → null                              (not in registry)
 */
export function parseSlashCommand(input: string): ParsedSlashCommand | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;
  // Strip the leading "/" and split on whitespace
  const body = trimmed.slice(1);
  if (body.length === 0) return null;
  const parts = body.split(/\s+/);
  const command = parts[0].toLowerCase();
  if (!KNOWN_COMMANDS.has(command as SlashCommandKind)) return null;
  return {
    command,
    args: parts.slice(1),
    raw: trimmed,
  };
}

/**
 * Static help text — built from the same registry the parser uses, so
 * adding a new command in one place updates `/help` automatically.
 */
const HELP_LINES: Record<SlashCommandKind, string> = {
  help: "/help — show this list",
  clear: "/clear — clear the active conversation context (no-op until Phase 11)",
  compact: "/compact — compact the conversation history (no-op until Phase 11)",
  cost: "/cost — show the run's current token + cost totals",
  cancel: "/cancel — abort the run (flips status → failed)",
  cwd: "/cwd <path> — set the agent's working directory",
};

// ── Executor ────────────────────────────────────────────────────────────────

/**
 * Execute a parsed slash command against a runtime run. Stateless — every
 * call reads the latest row from the DB and writes back if needed.
 *
 * Caller must validate that the runtimeRunId belongs to an agent the user
 * is allowed to operate on (the tRPC procedure does this via auth context).
 */
export async function executeSlashCommand(input: {
  runtimeRunId: number;
  parsed: ParsedSlashCommand;
}): Promise<SlashCommandResult> {
  const { runtimeRunId, parsed } = input;
  const command = parsed.command as SlashCommandKind;

  switch (command) {
    case "help": {
      return {
        command,
        ok: true,
        message: Object.values(HELP_LINES).join("\n"),
        data: { commands: Object.keys(HELP_LINES) },
      };
    }

    case "cost": {
      const run = await repo.getRuntimeRunById(runtimeRunId);
      if (!run) {
        return {
          command,
          ok: false,
          message: `Run #${runtimeRunId} not found`,
        };
      }
      const totalTokens = (run as any).totalTokens as number | null;
      const inputTokens = (run as any).inputTokens as number | null;
      const outputTokens = (run as any).outputTokens as number | null;
      const costMicrocents = (run as any).costMicrocents as number | null;
      if (totalTokens == null && costMicrocents == null) {
        return {
          command,
          ok: true,
          message:
            "No usage recorded yet — usage is captured when the live runtime run completes.",
          data: { runId: runtimeRunId },
        };
      }
      const dollars =
        costMicrocents != null
          ? `$${(costMicrocents / 1_000_000).toFixed(4)}`
          : "(no cost)";
      const tokenSummary =
        totalTokens != null
          ? `${inputTokens ?? 0} in / ${outputTokens ?? 0} out / ${totalTokens} total`
          : "(no token counts)";
      return {
        command,
        ok: true,
        message: `Tokens: ${tokenSummary} · Cost: ${dollars}`,
        data: { inputTokens, outputTokens, totalTokens, costMicrocents },
      };
    }

    case "cancel": {
      const run = await repo.getRuntimeRunById(runtimeRunId);
      if (!run) {
        return {
          command,
          ok: false,
          message: `Run #${runtimeRunId} not found`,
        };
      }
      if (run.status !== "running" && run.status !== "pending") {
        return {
          command,
          ok: false,
          message: `Run #${runtimeRunId} is already ${run.status} — nothing to cancel`,
        };
      }
      // Phase 6 cancel is best-effort — we flip the row state. Phase 1b's
      // adapter has its own AbortSignal that triggers a {type:"cancel"}
      // message; wiring those together is a Phase 11 concern. For now this
      // gives the runs page a way to mark a wedged run as failed so it
      // stops blocking the UI.
      await repo.updateRuntimeRun(runtimeRunId, {
        status: "failed",
        summary: "Cancelled by user via /cancel",
        finishedAt: new Date(),
      });
      return {
        command,
        ok: true,
        message: `Run #${runtimeRunId} marked as failed (cancelled)`,
      };
    }

    case "cwd": {
      const path = parsed.args[0];
      if (!path) {
        return {
          command,
          ok: false,
          message: "Usage: /cwd <absolute or relative path>",
        };
      }
      const run = await repo.getRuntimeRunById(runtimeRunId);
      if (!run) {
        return {
          command,
          ok: false,
          message: `Run #${runtimeRunId} not found`,
        };
      }
      // Update the agent's draft workingDirectories so the next run uses it
      const config = await repo.getRuntimeConfig(run.agentId);
      const next = Array.isArray(config?.workingDirectories)
        ? Array.from(new Set([...config!.workingDirectories, path]))
        : [path];
      await repo.updateRuntimeConfig(run.agentId, {
        workingDirectories: next,
      });
      return {
        command,
        ok: true,
        message: `Working directories now: ${next.join(", ")}`,
        data: { workingDirectories: next },
      };
    }

    case "clear":
    case "compact": {
      // Phase 6 stubs — actual implementation is the Phase 11 work
      // (resume / rewind / compact). Returning ok=true with a stub
      // message makes the UI integration testable now and avoids
      // dropping the user's input on the floor.
      return {
        command,
        ok: true,
        message: `${parsed.raw} acknowledged — full implementation arrives in Phase 11`,
      };
    }

    default: {
      // Unreachable because the parser already filters unknown commands,
      // but TS doesn't narrow on Set membership so we need the case.
      return {
        command,
        ok: false,
        message: `Unknown command: ${parsed.raw}`,
      };
    }
  }
}

/**
 * Convenience wrapper used by the tRPC procedure: parse + execute in one
 * call. Returns null when the input isn't a slash command at all (so the
 * caller can fall through to other input handling).
 */
export async function parseAndExecuteSlashCommand(input: {
  runtimeRunId: number;
  rawInput: string;
}): Promise<SlashCommandResult | null> {
  const parsed = parseSlashCommand(input.rawInput);
  if (!parsed) return null;
  return executeSlashCommand({
    runtimeRunId: input.runtimeRunId,
    parsed,
  });
}
