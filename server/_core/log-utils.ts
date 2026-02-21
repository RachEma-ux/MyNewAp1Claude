/**
 * Logging utilities — sanitize sensitive data before logging
 */

// Patterns that may contain secrets
const SENSITIVE_PATTERNS = [
  /Bearer\s+\S+/gi,
  /\bsk-[a-zA-Z0-9]{20,}/g,
  /\bAPI[_-]?KEY\s*[:=]\s*\S+/gi,
  /\bkey\s*[:=]\s*["']?[a-zA-Z0-9_\-]{16,}["']?/gi,
  /\btoken\s*[:=]\s*["']?[a-zA-Z0-9_\-\.]{16,}["']?/gi,
  /\bpassword\s*[:=]\s*\S+/gi,
  /\bsecret\s*[:=]\s*\S+/gi,
  /\bauthorization\s*[:=]\s*\S+/gi,
  /\bcredential\s*[:=]\s*\S+/gi,
  /\bENCRYPTION_KEY\s*[:=]\s*\S+/gi,
];

/**
 * Sanitize an error for safe logging.
 * Extracts only the message (and status code if present),
 * then strips patterns that look like secrets or credentials.
 */
export function sanitizeErrorForLogging(error: unknown): string {
  let message: string;

  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === "string") {
    message = error;
  } else {
    message = "Unknown error";
  }

  // Strip sensitive patterns
  for (const pattern of SENSITIVE_PATTERNS) {
    message = message.replace(pattern, "[REDACTED]");
  }

  return message;
}
