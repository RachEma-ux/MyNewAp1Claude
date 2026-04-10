/**
 * KGIA Security — Redaction
 *
 * Redacts sensitive data from query results, evidence graphs,
 * and answer envelopes before they are returned to the client.
 */

/** Patterns that indicate sensitive data */
const SENSITIVE_PATTERNS = [
  /\bpassword\b/i, /\bsecret\b/i, /\btoken\b/i, /\bapi[_-]?key\b/i,
  /\bcredential\b/i, /\bssn\b/i, /\bsocial[_\s]?security\b/i,
  /\bcredit[_\s]?card\b/i, /\bbank[_\s]?account\b/i,
  /\bprivate[_\s]?key\b/i, /\bauth[_\s]?token\b/i,
];

/** Redaction marker */
const REDACTED = "[REDACTED]";

/**
 * Redact sensitive fields from a record.
 */
export function redactRecord(record: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (isSensitiveKey(key)) {
      result[key] = REDACTED;
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      result[key] = redactRecord(value as Record<string, unknown>);
    } else if (typeof value === "string" && containsSensitiveValue(value)) {
      result[key] = REDACTED;
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Redact sensitive content from a text string.
 */
export function redactText(text: string): string {
  let result = text;

  // Redact email addresses
  result = result.replace(/\b[\w.-]+@[\w.-]+\.\w{2,}\b/g, "[EMAIL REDACTED]");

  // Redact phone numbers (basic patterns)
  result = result.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, "[PHONE REDACTED]");

  // Redact credit card-like numbers
  result = result.replace(/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, "[CC REDACTED]");

  // Redact SSN-like patterns
  result = result.replace(/\b\d{3}[-]?\d{2}[-]?\d{4}\b/g, "[SSN REDACTED]");

  return result;
}

/**
 * Redact evidence graph node properties.
 */
export function redactEvidenceProperties(
  properties: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!properties) return properties;
  return redactRecord(properties);
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_PATTERNS.some((p) => p.test(key));
}

function containsSensitiveValue(value: string): boolean {
  // Check for patterns that look like tokens/keys
  if (/^[a-zA-Z0-9]{32,}$/.test(value)) return true; // Long hex/alpha strings
  if (/^(sk|pk|rk|ak)-[a-zA-Z0-9]+/.test(value)) return true; // Prefixed keys
  return false;
}
