/**
 * C1-c7 (cycle-7 audit closure §C1-c7) — sanitize MCP dispatcher error
 * messages before they leave the dispatcher.
 *
 * Pre-cycle-7 the dispatcher's `result.error.message` flowed verbatim into
 * 3 downstream sinks:
 *   1. SSE `tool_end` event (chat-stream.ts) — operator-visible payload
 *   2. `agsToolCallTraces.errorMessage` column — durable forensic record
 *      readable by anyone with trace-row read access
 *   3. `role="tool"` message content fed back to the LLM — model
 *      reasons on the secret + persists to `agsChatMessages.content`
 *
 * MCP server exceptions can carry:
 *   - filesystem paths (`/home/alice/.ssh/config`)
 *   - internal IPs and hostnames (`192.168.1.100`, `db.internal.corp`)
 *   - API keys / tokens (`sk-...`, `ghp_...`, `AKIA...`)
 *   - DB connection strings (`postgres://user:pw@host/db`)
 *   - bearer tokens, JWTs, base64-encoded secrets
 *
 * Source-of-truth fix is HERE: the dispatcher calls this once before
 * returning, the audit row keeps the raw error (operator-only), and the
 * 3 downstream sinks automatically benefit because they consume the
 * sanitized `result.error.message`.
 *
 * Design choice: scrub conservatively. Keep enough structure for
 * triage (preserve generic words like "timeout", "permission denied",
 * "not found") but redact specific values. False positives on
 * legitimate non-secret base64ish strings are acceptable; false
 * negatives on real secrets are NOT.
 *
 * Audit retains the unredacted error in `agsRuntimePolicyEvents` for
 * forensics — operators investigating a security incident need the
 * raw message. Operator-UI / SSE / message-store consumers see the
 * scrubbed version.
 */

const REDACTED = "[redacted]";

interface ScrubPattern {
  /** Description (used in tests + diagnostics, not in output) */
  readonly name: string;
  /** Regex that matches the value to redact */
  readonly pattern: RegExp;
}

/**
 * Pattern set, ordered most-specific-first. The order matters because
 * a generic pattern (e.g., long base64) would otherwise swallow
 * specific patterns (e.g., AWS access keys).
 */
const PATTERNS: readonly ScrubPattern[] = [
  // ── Specific secret prefixes ──
  // OpenAI / Anthropic API key (sk-...)
  { name: "openai_anthropic_key", pattern: /\bsk-[A-Za-z0-9_-]{20,}/g },
  // GitHub PAT (ghp_..., gho_..., ghu_..., ghs_..., ghr_...)
  { name: "github_token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}/g },
  // GitHub fine-grained PAT
  { name: "github_pat", pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}/g },
  // AWS Access Key ID
  { name: "aws_access_key", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  // Google API key
  { name: "google_api_key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  // Slack tokens
  { name: "slack_token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g },

  // ── Connection strings (with embedded credentials) ──
  // postgres://user:pass@host:port/db, mysql://, mongodb://, redis://
  // We redact the WHOLE URL because the host part is also sensitive.
  {
    name: "db_connection_string",
    pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s'"`]+/gi,
  },

  // ── Authorization headers / bearer tokens ──
  // Catches "Authorization: Bearer xyz" and similar
  {
    name: "bearer_token",
    pattern: /\b(?:Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  },

  // ── JWTs (3 base64 segments separated by dots) ──
  {
    name: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  },

  // ── IP addresses ──
  // IPv4 (with optional :port)
  {
    name: "ipv4",
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b/g,
  },
  // IPv6 (loose match — at least one hex group followed by 2+ colon-
  // separated segments, allowing empty segments for `::` compression).
  // Catches `fe80::1`, `2001:db8::1234:5678`, full 8-group form.
  {
    name: "ipv6",
    pattern: /\b[0-9a-fA-F]{1,4}(?::[0-9a-fA-F]{0,4}){2,}\b/g,
  },

  // ── Filesystem paths ──
  // Unix absolute paths under common user-data dirs (/home/, /Users/,
  // /root/, /var/, /tmp/, /opt/, /etc/) — at least 2 path segments to
  // avoid scrubbing things like "/api" in URLs.
  {
    name: "unix_path",
    pattern: /\/(?:home|Users|root|var|tmp|opt|etc|private|mnt|data)\/[^\s'"`)]{2,}/g,
  },
  // Windows absolute paths (C:\..., D:\..., \\server\share)
  {
    name: "windows_path",
    pattern: /(?:[A-Za-z]:\\|\\\\)[^\s'"`)]{2,}/g,
  },

  // ── Generic high-entropy strings ──
  // Long base64-ish runs (32+ chars of alphanumerics + base64 chars).
  // Placed LAST so specific patterns above win first. The 32-char
  // floor avoids hitting common words/UUIDs (UUIDs are 36 chars but
  // contain dashes which still match — accepted false positive).
  {
    name: "long_base64ish",
    pattern: /\b[A-Za-z0-9+/=_-]{32,}\b/g,
  },
];

/**
 * Scrub PII / secrets from an MCP dispatcher error message.
 *
 * Returns the input unchanged if it's null, undefined, or empty. Otherwise
 * applies all patterns in order, replacing matches with `[redacted]`.
 *
 * Idempotent — calling twice produces the same output as calling once
 * (the literal `[redacted]` doesn't match any pattern).
 */
export function sanitizeMcpErrorMessage(
  message: string | null | undefined,
): string | null {
  if (message == null || message === "") return null;
  let scrubbed = message;
  for (const p of PATTERNS) {
    scrubbed = scrubbed.replace(p.pattern, REDACTED);
  }
  return scrubbed;
}
