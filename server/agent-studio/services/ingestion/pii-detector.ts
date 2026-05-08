/**
 * PII detector — U5-b.2.
 *
 * Regex-based detector for the 11 entities locked in
 * `docs/architecture/agent-studio/RAC_PII_LICENSE_ENFORCEMENT.md` §3.1
 * (DD1). Pure function — no I/O. Registered as a custom validation
 * rule via `data-validation-service.ts` `registerValidationRule()`;
 * the rule's findings flow into `ags_data_validation_results`
 * (canonical audit trail) AND project to `ags_knowledge_units.pii_findings`
 * (filter hot-path projection — see `knowledge-unit-service.ts`).
 *
 * MVP severity defaults per ADR DD1:
 *   - email / phone_us_ca / ipv4              → "warn"
 *   - ssn_us / credit_card / iban / api_key_* → "block"
 *
 * Operators can register additional rules (or override severities by
 * post-processing findings) without forking this file.
 *
 * **Match strings are returned in the `PiiFinding.match` field for
 * unit-test asserts and detector debugging only.** They MUST NOT be
 * persisted alongside the canonical contentText (D-NKU-3 keeps that
 * the only authoritative text store). The validation-rule wrapper
 * in `data-validation-service.ts` strips `match` before persistence.
 */

import type { DataValidationFinding } from "./types";

export type PiiEntity =
  | "email"
  | "phone_us_ca"
  | "ssn_us"
  | "credit_card"
  | "ipv4"
  | "iban"
  | "api_key_stripe"
  | "api_key_github_classic"
  | "api_key_github_fine_grained"
  | "api_key_aws_access"
  | "api_key_openai";

export type PiiSeverity = "warn" | "block";

export interface PiiFinding {
  entity: PiiEntity;
  /** Matched substring. NEVER persisted; for unit tests + debugging. */
  match: string;
  /** Offset into the input text. */
  start: number;
  /** Exclusive end offset. */
  end: number;
  severity: PiiSeverity;
}

/** Locked default severity per entity (ADR DD1). */
export const PII_SEVERITY_DEFAULTS: Readonly<Record<PiiEntity, PiiSeverity>> =
  Object.freeze({
    email: "warn",
    phone_us_ca: "warn",
    ipv4: "warn",
    ssn_us: "block",
    credit_card: "block",
    iban: "block",
    api_key_stripe: "block",
    api_key_github_classic: "block",
    api_key_github_fine_grained: "block",
    api_key_aws_access: "block",
    api_key_openai: "block",
  });

// ── Regex set (one global-flagged regex per entity for offset capture) ────

const RE_EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
// US/Canada NANP: optional +1, 3-3-4 digits with optional separators / parens.
const RE_PHONE_US_CA =
  /(?<![\d.-])(?:\+?1[-.\s]?)?\(?([2-9]\d{2})\)?[-.\s]?(\d{3})[-.\s]?(\d{4})\b/g;
const RE_SSN_US = /\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g;
// Credit card: 13–19 digit run; Luhn-validated post-match.
const RE_CC_CANDIDATE = /\b(?:\d[ -]?){12,18}\d\b/g;
// IPv4: 4 dotted octets; range-validated post-match.
const RE_IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
// IBAN: 2 letters + 2 digits + 11–30 alphanumerics. Length-only validation
// (full mod-97 is a follow-up).
const RE_IBAN = /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g;
const RE_API_STRIPE = /\bsk_(?:test|live)_[A-Za-z0-9]{24,}\b/g;
const RE_API_GH_CLASSIC = /\bghp_[A-Za-z0-9]{36}\b/g;
const RE_API_GH_FG = /\bgithub_pat_[A-Za-z0-9_]{82}\b/g;
const RE_API_AWS = /\bAKIA[A-Z0-9]{16}\b/g;
// OpenAI: legacy `sk-` then 32+ alphanumerics. Excludes `sk_` (Stripe).
const RE_API_OPENAI = /(?<![A-Za-z0-9_])sk-[A-Za-z0-9]{32,}(?![A-Za-z0-9_])/g;

// ── Helpers ────────────────────────────────────────────────────────────────

function isValidLuhn(digits: string): boolean {
  const stripped = digits.replace(/[ -]/g, "");
  if (stripped.length < 13 || stripped.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = stripped.length - 1; i >= 0; i--) {
    let n = stripped.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function isValidIpv4Octets(s: string): boolean {
  const parts = s.split(".");
  if (parts.length !== 4) return false;
  for (const p of parts) {
    if (p.length === 0 || p.length > 3) return false;
    if (p.length > 1 && p.startsWith("0")) return false; // disallow leading-zero octets (008)
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 255) return false;
  }
  return true;
}

interface RawMatchSpec {
  entity: PiiEntity;
  re: RegExp;
  /** Optional post-match validator; return false to discard. */
  validate?: (match: string) => boolean;
}

const RAW_SPECS: ReadonlyArray<RawMatchSpec> = [
  { entity: "email", re: RE_EMAIL },
  { entity: "phone_us_ca", re: RE_PHONE_US_CA },
  { entity: "ssn_us", re: RE_SSN_US },
  { entity: "credit_card", re: RE_CC_CANDIDATE, validate: isValidLuhn },
  { entity: "ipv4", re: RE_IPV4, validate: isValidIpv4Octets },
  { entity: "iban", re: RE_IBAN },
  { entity: "api_key_stripe", re: RE_API_STRIPE },
  { entity: "api_key_github_classic", re: RE_API_GH_CLASSIC },
  { entity: "api_key_github_fine_grained", re: RE_API_GH_FG },
  { entity: "api_key_aws_access", re: RE_API_AWS },
  { entity: "api_key_openai", re: RE_API_OPENAI },
];

/** Run the regex set against `text` and return all findings. */
export function detectPii(text: string): PiiFinding[] {
  const out: PiiFinding[] = [];
  for (const spec of RAW_SPECS) {
    // Each call clones the regex via lastIndex semantics — make sure
    // the `g` flag is set on every spec.
    spec.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = spec.re.exec(text)) !== null) {
      const match = m[0];
      if (spec.validate && !spec.validate(match)) continue;
      out.push({
        entity: spec.entity,
        match,
        start: m.index,
        end: m.index + match.length,
        severity: PII_SEVERITY_DEFAULTS[spec.entity],
      });
    }
  }
  // Stable order: by start then by entity name (tests assert).
  out.sort(
    (a, b) => (a.start - b.start) || a.entity.localeCompare(b.entity),
  );
  return out;
}

/**
 * Build a `ValidationRule` from `detectPii`. The match value is
 * stripped from the persisted finding (D-NKU-3); it stays on
 * `PiiFinding.match` only for the in-memory caller (test harness).
 */
export function createPiiValidationRule(): (
  input: { contentText: string },
) => DataValidationFinding[] {
  return (input) => {
    const findings = detectPii(input.contentText);
    return findings.map((f) => ({
      rule: `pii_${f.entity}`,
      severity: f.severity,
      message: `PII detected: ${f.entity}`,
      detail: { entity: f.entity, start: f.start, end: f.end },
    }));
  };
}

/**
 * Strip the un-persistable `match` field for storage. The caller
 * passes `detectPii` output; the result is what lands in
 * `ags_knowledge_units.pii_findings` (block-severity findings only,
 * per ADR DD4 — `warn` findings stay in `ags_data_validation_results`
 * but don't enter the hot-path projection).
 */
export function projectPiiFindingsForStorage(
  findings: PiiFinding[],
): Array<Omit<PiiFinding, "match">> {
  return findings
    .filter((f) => f.severity === "block")
    .map(({ entity, start, end, severity }) => ({ entity, start, end, severity }));
}
