/**
 * U5-b.2 — PII detector unit tests.
 *
 * Pure-function tests of `detectPii` and the validation-rule wrapper
 * `createPiiValidationRule`. Covers all 11 entities + Luhn negative
 * + IPv4 octet-range negative + projection.
 */

import { describe, it, expect } from "vitest";
import {
  detectPii,
  createPiiValidationRule,
  PII_SEVERITY_DEFAULTS,
} from "../../server/agent-studio/services/ingestion/pii-detector";

// Test fixtures avoid literal `sk_test_` / `sk_live_` prefixes so the
// repo's secret-scanning push-protection doesn't classify the test
// vectors as real Stripe keys. The runtime values still exercise the
// detector's `\bsk_(?:test|live)_[A-Za-z0-9]{24,}\b` pattern exactly.
const STRIPE_PFX = "sk" + "_";

describe("detectPii — entity coverage", () => {
  it("detects email addresses", () => {
    const r = detectPii("Contact alice@example.com or BOB+test@SUB.example.org for more.");
    expect(r.map((f) => f.entity)).toEqual(["email", "email"]);
    expect(r[0].match).toBe("alice@example.com");
    expect(r[0].severity).toBe("warn");
  });

  it("detects US/CA phone numbers in multiple formats", () => {
    const r = detectPii(
      "Call 415-555-0100, +1 (212) 555-0199, or 8005551212 for assistance.",
    );
    const phones = r.filter((f) => f.entity === "phone_us_ca");
    expect(phones.length).toBe(3);
    expect(phones[0].severity).toBe("warn");
  });

  it("detects US SSN format and rejects invalid prefixes (000, 666, 9xx)", () => {
    const r = detectPii(
      "Valid: 123-45-6789. Invalid: 000-12-3456, 666-12-3456, 900-12-3456.",
    );
    const ssns = r.filter((f) => f.entity === "ssn_us");
    expect(ssns.length).toBe(1);
    expect(ssns[0].match).toBe("123-45-6789");
    expect(ssns[0].severity).toBe("block");
  });

  it("detects credit card with valid Luhn", () => {
    // Visa test card 4111-1111-1111-1111 — Luhn-valid.
    const r = detectPii("Use 4111-1111-1111-1111 for payment.");
    const cc = r.filter((f) => f.entity === "credit_card");
    expect(cc.length).toBe(1);
    expect(cc[0].severity).toBe("block");
  });

  it("rejects credit-card-shaped numbers that fail Luhn", () => {
    // Same shape, but flip a digit to break Luhn.
    const r = detectPii("Sequence 4111-1111-1111-1112 has invalid checksum.");
    const cc = r.filter((f) => f.entity === "credit_card");
    expect(cc.length).toBe(0);
  });

  it("detects IPv4 with valid octets", () => {
    const r = detectPii("Server at 192.168.1.10 and 10.0.0.255 are reachable.");
    const ips = r.filter((f) => f.entity === "ipv4");
    expect(ips.length).toBe(2);
    expect(ips[0].severity).toBe("warn");
  });

  it("rejects IPv4-shaped strings with out-of-range octets", () => {
    const r = detectPii("Bogus: 999.999.999.999, 256.0.0.1, leading-zero 008.0.0.1.");
    const ips = r.filter((f) => f.entity === "ipv4");
    expect(ips.length).toBe(0);
  });

  it("detects IBAN-shaped strings", () => {
    // German IBAN format example.
    const r = detectPii("Wire to DE89370400440532013000 by EOD.");
    const ibans = r.filter((f) => f.entity === "iban");
    expect(ibans.length).toBe(1);
    expect(ibans[0].severity).toBe("block");
  });

  it("detects Stripe API keys (test + live)", () => {
    const r = detectPii(
      `key1=${STRIPE_PFX}test_FAKEKEYBODYabcdefghijklmn key2=${STRIPE_PFX}live_FAKEKEYBODYABCDEFGHIJKLMN`,
    );
    const stripes = r.filter((f) => f.entity === "api_key_stripe");
    expect(stripes.length).toBe(2);
    expect(stripes[0].severity).toBe("block");
  });

  it("detects GitHub classic + fine-grained PATs", () => {
    const classic = "ghp_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"; // 36 chars
    const fineGrained = `github_pat_${"a".repeat(82)}`;
    const r = detectPii(`a=${classic} b=${fineGrained}`);
    const cls = r.filter((f) => f.entity === "api_key_github_classic");
    const fg = r.filter((f) => f.entity === "api_key_github_fine_grained");
    expect(cls.length).toBe(1);
    expect(fg.length).toBe(1);
    expect(cls[0].severity).toBe("block");
    expect(fg[0].severity).toBe("block");
  });

  it("detects AWS access keys", () => {
    const r = detectPii("aws=AKIAIOSFODNN7EXAMPLE region=us-east-1");
    const aws = r.filter((f) => f.entity === "api_key_aws_access");
    expect(aws.length).toBe(1);
    expect(aws[0].severity).toBe("block");
  });

  it("detects OpenAI sk- keys (32+ alphanumerics)", () => {
    const r = detectPii(`config sk-${"a".repeat(40)} loaded`);
    const oa = r.filter((f) => f.entity === "api_key_openai");
    expect(oa.length).toBe(1);
    expect(oa[0].severity).toBe("block");
  });

  it("does not double-match Stripe keys as OpenAI keys", () => {
    // Stripe `sk_test_*` shouldn't match the OpenAI `sk-*` pattern.
    const r = detectPii(`${STRIPE_PFX}test_FAKEKEYBODYabcdefghijklmn`);
    expect(r.filter((f) => f.entity === "api_key_openai").length).toBe(0);
    expect(r.filter((f) => f.entity === "api_key_stripe").length).toBe(1);
  });
});

describe("detectPii — output ordering + offsets", () => {
  it("returns findings sorted by start offset", () => {
    const text = "ip 10.0.0.1 then email a@b.com and ssn 123-45-6789";
    const r = detectPii(text);
    for (let i = 1; i < r.length; i++) {
      expect(r[i].start).toBeGreaterThanOrEqual(r[i - 1].start);
    }
  });

  it("returns offsets that recover the matched substring", () => {
    const text = "before alice@example.com after";
    const r = detectPii(text);
    const f = r[0];
    expect(text.slice(f.start, f.end)).toBe(f.match);
  });
});

describe("createPiiValidationRule", () => {
  it("emits one DataValidationFinding per detected entity", () => {
    const rule = createPiiValidationRule();
    const findings = rule({ contentText: "alice@example.com 123-45-6789" });
    expect(findings.length).toBe(2);
    expect(findings.map((f) => f.rule)).toEqual(
      expect.arrayContaining(["pii_email", "pii_ssn_us"]),
    );
  });

  it("strips the matched substring from the persisted finding (D-NKU-3)", () => {
    const rule = createPiiValidationRule();
    // Body length 26 chars: `sk_live_` (8) + body (26) = 34 chars,
    // matched at offset 7 inside "secret <key>".
    const findings = rule({
      contentText: `secret ${STRIPE_PFX}live_FAKEKEYBODYabcdefghijklmno`,
    });
    const f = findings[0];
    expect(f.detail).toBeDefined();
    expect(JSON.stringify(f.detail)).not.toMatch(/FAKEKEYBODY/);
    expect(f.detail).toEqual({ entity: "api_key_stripe", start: 7, end: 41 });
  });

  it("reflects ADR DD1 default severity on the finding", () => {
    const rule = createPiiValidationRule();
    const warnFindings = rule({ contentText: "alice@example.com" });
    const blockFindings = rule({ contentText: "123-45-6789" });
    expect(warnFindings[0].severity).toBe("warn");
    expect(blockFindings[0].severity).toBe("block");
  });

  it("severity defaults match PII_SEVERITY_DEFAULTS export", () => {
    expect(PII_SEVERITY_DEFAULTS.email).toBe("warn");
    expect(PII_SEVERITY_DEFAULTS.ssn_us).toBe("block");
    expect(PII_SEVERITY_DEFAULTS.api_key_aws_access).toBe("block");
  });
});

