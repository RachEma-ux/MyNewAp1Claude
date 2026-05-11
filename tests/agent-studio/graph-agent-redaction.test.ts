/**
 * Phase 14 §4 — sensitive-payload redaction tests.
 *
 * Covers `redactSensitivePayload()` and `redactExplanationSteps()`
 * from `services/graph-agent/redaction.ts`. Pure-function tests, no
 * DB or tRPC dependencies.
 */

import { describe, it, expect } from "vitest";
import {
  redactSensitivePayload,
  redactExplanationSteps,
} from "../../server/agent-studio/services/graph-agent/redaction";

describe("redactSensitivePayload — Phase 14 §4", () => {
  it("passes through null/undefined/numbers/booleans verbatim", () => {
    expect(redactSensitivePayload(null)).toBeNull();
    expect(redactSensitivePayload(undefined)).toBeUndefined();
    expect(redactSensitivePayload(42)).toBe(42);
    expect(redactSensitivePayload(true)).toBe(true);
    expect(redactSensitivePayload(false)).toBe(false);
  });

  it("scrubs email addresses in string values", () => {
    expect(redactSensitivePayload("contact alice@example.com today")).toBe(
      "contact [REDACTED] today",
    );
  });

  it("scrubs OpenAI / Anthropic-style sk-... API keys", () => {
    expect(redactSensitivePayload("key: sk-abc123def456ghi789jkl")).toBe(
      "key: [REDACTED]",
    );
  });

  it("scrubs Bearer tokens (case insensitive)", () => {
    expect(
      redactSensitivePayload("Authorization: Bearer abc123def456ghi789"),
    ).toBe("Authorization: [REDACTED]");
  });

  it("scrubs JWTs", () => {
    expect(
      redactSensitivePayload(
        "token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc",
      ),
    ).toBe("token=[REDACTED]");
  });

  it("scrubs GitHub PAT shapes", () => {
    expect(redactSensitivePayload("token=ghp_abcdefghijklmnopqrst")).toBe(
      "token=[REDACTED]",
    );
    expect(
      redactSensitivePayload(
        "token=github_pat_abcdefghijklmnopqrstuvwx_abcdefghij",
      ),
    ).toBe("token=[REDACTED]");
  });

  it("scrubs SSN-shaped 9-digit blocks", () => {
    expect(redactSensitivePayload("ssn: 123-45-6789 confirmed")).toBe(
      "ssn: [REDACTED] confirmed",
    );
  });

  it("does NOT scrub keys — only values", () => {
    const result = redactSensitivePayload({
      email_field: "alice@example.com",
    });
    expect(result).toEqual({ email_field: "[REDACTED]" });
  });

  it("recurses into nested objects + arrays", () => {
    const result = redactSensitivePayload({
      a: {
        b: ["hello", "bob@example.com"],
        c: { token: "sk-aaaaaaaaaaaaaaaaaaaa" },
      },
    });
    expect(result).toEqual({
      a: {
        b: ["hello", "[REDACTED]"],
        c: { token: "[REDACTED]" },
      },
    });
  });

  it("does not scrub benign strings", () => {
    expect(redactSensitivePayload("retrievalMode")).toBe("retrievalMode");
    expect(redactSensitivePayload("user.id=42")).toBe("user.id=42");
    expect(redactSensitivePayload("abc.def.ghi")).toBe("abc.def.ghi");
  });

  it("does not mutate the input — returns a fresh object", () => {
    const input = { token: "sk-abcdefghijklmnopqrst" };
    const result = redactSensitivePayload(input);
    expect(input.token).toBe("sk-abcdefghijklmnopqrst");
    expect(result).not.toBe(input);
  });
});

describe("redactExplanationSteps — Phase 14 §4", () => {
  it("scrubs step inputs + outputs but preserves other step fields", () => {
    const steps = [
      {
        stepIndex: 1,
        stepKind: "model_call",
        stepInput: { apiKey: "sk-abcdefghijklmnopqrst" },
        stepOutput: { reply: "Hello alice@example.com" },
        durationMs: 100,
        createdAt: new Date(),
      },
    ];
    const redacted = redactExplanationSteps(steps);
    expect(redacted[0].stepIndex).toBe(1);
    expect(redacted[0].stepKind).toBe("model_call");
    expect(redacted[0].durationMs).toBe(100);
    expect(redacted[0].stepInput).toEqual({ apiKey: "[REDACTED]" });
    expect(redacted[0].stepOutput).toEqual({ reply: "Hello [REDACTED]" });
  });

  it("leaves null stepInput / stepOutput as null", () => {
    const steps = [
      {
        stepIndex: 1,
        stepKind: "plan_retrieval_mode",
        stepInput: null,
        stepOutput: null,
        durationMs: 1,
        createdAt: new Date(),
      },
    ];
    const redacted = redactExplanationSteps(steps);
    expect(redacted[0].stepInput).toBeNull();
    expect(redacted[0].stepOutput).toBeNull();
  });

  it("does not mutate the input array", () => {
    const original = {
      stepIndex: 1,
      stepKind: "x",
      stepInput: { secret: "sk-abcdefghijklmnopqrst" },
      stepOutput: null,
      durationMs: 1,
      createdAt: new Date(),
    };
    const steps = [original];
    redactExplanationSteps(steps);
    expect(original.stepInput).toEqual({ secret: "sk-abcdefghijklmnopqrst" });
  });
});
