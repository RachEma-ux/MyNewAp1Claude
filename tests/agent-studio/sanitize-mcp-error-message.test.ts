/**
 * C1-c7 (cycle-7 audit `/sdcard/Download/POST_DISPATCH_AUDIT_2026-05-09.md`
 * §C1-c7) — sanitizeMcpErrorMessage unit tests.
 *
 * Pre-cycle-7 the dispatcher's `result.error.message` flowed verbatim
 * into 3 sinks (SSE event / trace column / LLM message-content). This
 * helper is the source-of-truth scrubber that runs at the dispatcher
 * boundary; the audit row keeps the raw error.
 *
 * The contract this file pins:
 *   1. Common secret prefixes are redacted (sk-, ghp_, AKIA, etc.)
 *   2. DB connection strings are fully redacted (host is also sensitive)
 *   3. Bearer/Basic/Token auth headers are redacted (value, not the keyword)
 *   4. JWTs are redacted
 *   5. IPv4 (with optional port) and IPv6 are redacted
 *   6. Filesystem paths under common user-data dirs are redacted
 *   7. Long high-entropy strings are redacted as a backstop
 *   8. Generic words (timeout, permission denied, not found) are PRESERVED
 *      so triage info isn't lost
 *   9. Idempotent — sanitize(sanitize(x)) === sanitize(x)
 *  10. null / undefined / "" pass through unchanged (typed)
 *
 * Future PRs that "simplify" by removing patterns or weakening
 * specificity will fail this file.
 */
import { describe, it, expect } from "vitest";
import { sanitizeMcpErrorMessage } from "../../server/agent-studio/services/mcp/sanitize-error-message";

describe("sanitizeMcpErrorMessage — null/empty input", () => {
  it("returns null for null input", () => {
    expect(sanitizeMcpErrorMessage(null)).toBeNull();
  });
  it("returns null for undefined input", () => {
    expect(sanitizeMcpErrorMessage(undefined)).toBeNull();
  });
  it("returns null for empty string", () => {
    expect(sanitizeMcpErrorMessage("")).toBeNull();
  });
});

describe("sanitizeMcpErrorMessage — secret prefixes", () => {
  it("redacts OpenAI/Anthropic-style sk- keys", () => {
    expect(
      sanitizeMcpErrorMessage("API key sk-abc123def456ghi789jkl012mno345 expired"),
    ).toBe("API key [redacted] expired");
  });

  it("redacts GitHub PATs (ghp_, ghs_, gho_, ghu_, ghr_)", () => {
    expect(
      sanitizeMcpErrorMessage("token ghp_abcdefghijklmnopqrstuvwxyz1234567890 invalid"),
    ).toBe("token [redacted] invalid");
    expect(
      sanitizeMcpErrorMessage("ghs_xyzABC123def456ghi789jkl012mn"),
    ).toBe("[redacted]");
  });

  it("redacts GitHub fine-grained PATs", () => {
    expect(
      sanitizeMcpErrorMessage(
        "github_pat_11ABCDEFG0_abcdefghijklmnopqrstuvwxyz",
      ),
    ).toBe("[redacted]");
  });

  it("redacts AWS access key IDs", () => {
    expect(
      sanitizeMcpErrorMessage("auth failed for AKIAIOSFODNN7EXAMPLE"),
    ).toBe("auth failed for [redacted]");
  });

  it("redacts Google API keys", () => {
    expect(
      sanitizeMcpErrorMessage("AIzaSyD-ExAMplE1234567890abcdefghi-jklmnop"),
    ).toBe("[redacted]");
  });

  it("redacts Slack tokens", () => {
    expect(
      sanitizeMcpErrorMessage("posting to xoxb-12345-67890-abcdefghij1234"),
    ).toBe("posting to [redacted]");
  });
});

describe("sanitizeMcpErrorMessage — connection strings", () => {
  it("redacts postgres connection strings (with credentials)", () => {
    expect(
      sanitizeMcpErrorMessage(
        "Failed to connect to postgres://user:secret@db.internal.corp:5432/myapp",
      ),
    ).toBe("Failed to connect to [redacted]");
  });

  it("redacts mongodb+srv connection strings", () => {
    expect(
      sanitizeMcpErrorMessage(
        "mongodb+srv://admin:hunter2@cluster0.mongodb.net/test failed",
      ),
    ).toBe("[redacted] failed");
  });

  it("redacts mysql / redis / amqp", () => {
    expect(
      sanitizeMcpErrorMessage("mysql://root:rootpw@10.0.0.5/db"),
    ).toBe("[redacted]");
    expect(
      sanitizeMcpErrorMessage("redis://default:abc@redis-master:6379/0"),
    ).toBe("[redacted]");
    expect(
      sanitizeMcpErrorMessage("amqp://user:pw@rabbit:5672/"),
    ).toBe("[redacted]");
  });
});

describe("sanitizeMcpErrorMessage — auth headers + JWTs", () => {
  it("redacts Bearer tokens", () => {
    expect(
      sanitizeMcpErrorMessage("401 from upstream: Authorization: Bearer abc123def456"),
    ).toBe("401 from upstream: Authorization: [redacted]");
  });

  it("redacts Basic auth", () => {
    expect(
      sanitizeMcpErrorMessage("Basic dXNlcjpwYXNzd29yZA=="),
    ).toBe("[redacted]");
  });

  it("redacts JWTs", () => {
    expect(
      sanitizeMcpErrorMessage(
        "JWT expired: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NSJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
      ),
    ).toBe("JWT expired: [redacted]");
  });
});

describe("sanitizeMcpErrorMessage — IP addresses", () => {
  it("redacts IPv4 with port", () => {
    expect(
      sanitizeMcpErrorMessage("connection refused at 192.168.1.100:5432"),
    ).toBe("connection refused at [redacted]");
  });

  it("redacts IPv4 without port", () => {
    expect(
      sanitizeMcpErrorMessage("could not reach 10.0.0.5 within timeout"),
    ).toBe("could not reach [redacted] within timeout");
  });

  it("redacts IPv6", () => {
    expect(
      sanitizeMcpErrorMessage("error from fe80::1 routing"),
    ).toBe("error from [redacted] routing");
    expect(
      sanitizeMcpErrorMessage("2001:db8::1234:5678 unreachable"),
    ).toBe("[redacted] unreachable");
  });
});

describe("sanitizeMcpErrorMessage — filesystem paths", () => {
  it("redacts user home directory paths", () => {
    expect(
      sanitizeMcpErrorMessage("Failed to read /home/alice/.ssh/config (permission denied)"),
    ).toBe("Failed to read [redacted] (permission denied)");
  });

  it("redacts /Users (macOS)", () => {
    expect(
      sanitizeMcpErrorMessage("ENOENT: /Users/bob/Documents/secret.txt"),
    ).toBe("ENOENT: [redacted]");
  });

  it("redacts /var, /tmp, /etc, /opt, /root", () => {
    expect(sanitizeMcpErrorMessage("write failed at /var/log/app/db.log")).toBe(
      "write failed at [redacted]",
    );
    expect(sanitizeMcpErrorMessage("/tmp/mcp-cache/abc.json missing")).toBe(
      "[redacted] missing",
    );
    expect(sanitizeMcpErrorMessage("/etc/secrets/api.key denied")).toBe(
      "[redacted] denied",
    );
    expect(sanitizeMcpErrorMessage("/root/.config/credentials.toml absent")).toBe(
      "[redacted] absent",
    );
  });

  it("redacts Windows absolute paths", () => {
    expect(
      sanitizeMcpErrorMessage("Cannot open C:\\Users\\Alice\\.ssh\\id_rsa"),
    ).toBe("Cannot open [redacted]");
  });

  it("redacts UNC paths (\\\\server\\share)", () => {
    expect(
      sanitizeMcpErrorMessage("share \\\\fileserver\\private\\bob"),
    ).toBe("share [redacted]");
  });
});

describe("sanitizeMcpErrorMessage — preserves triage-useful generic terms", () => {
  // The contract: generic English words explaining the failure class
  // MUST survive sanitization so operators can still triage from
  // logs / SSE without reading the audit row.
  it("keeps 'timeout'", () => {
    expect(sanitizeMcpErrorMessage("Request timeout after 30s")).toContain("timeout");
  });
  it("keeps 'permission denied'", () => {
    expect(
      sanitizeMcpErrorMessage("permission denied for resource"),
    ).toContain("permission denied");
  });
  it("keeps 'not found'", () => {
    expect(sanitizeMcpErrorMessage("Resource not found")).toContain("not found");
  });
  it("keeps short version numbers", () => {
    // "v1.2.3" looks like an IP fragment — important it survives
    expect(sanitizeMcpErrorMessage("upgrade required: server v1.2.3")).toContain(
      "v1.2.3",
    );
  });
  it("keeps generic 'connection refused'", () => {
    expect(
      sanitizeMcpErrorMessage("connection refused"),
    ).toBe("connection refused");
  });
});

describe("sanitizeMcpErrorMessage — idempotent + multi-pattern", () => {
  it("is idempotent: sanitize(sanitize(x)) === sanitize(x)", () => {
    const input =
      "DB at postgres://u:p@10.0.0.1:5432/db failed; key sk-abc123def456ghi789jkl012";
    const once = sanitizeMcpErrorMessage(input);
    const twice = sanitizeMcpErrorMessage(once);
    expect(twice).toBe(once);
  });

  it("scrubs multiple patterns in one input", () => {
    const out = sanitizeMcpErrorMessage(
      "DB at postgres://user:pw@10.0.0.5:5432/app failed; token ghp_abcdefghijklmnopqrstuvwxyz1234567890",
    );
    expect(out).not.toMatch(/postgres:\/\//);
    expect(out).not.toMatch(/10\.0\.0\.5/);
    expect(out).not.toMatch(/ghp_/);
    // Triage words preserved
    expect(out).toContain("DB at");
    expect(out).toContain("failed");
    expect(out).toContain("token");
  });

  it("handles repeated occurrences of the same pattern", () => {
    // Catches a future regex without /g flag that only redacts the
    // first match.
    const out = sanitizeMcpErrorMessage(
      "first 10.0.0.1 second 10.0.0.2 third 10.0.0.3",
    );
    expect(out).toBe("first [redacted] second [redacted] third [redacted]");
  });
});

describe("sanitizeMcpErrorMessage — long high-entropy backstop", () => {
  it("redacts long base64-ish strings as a final backstop", () => {
    // 32+ chars of alphanumeric — likely a secret even if not matching
    // a known prefix.
    const out = sanitizeMcpErrorMessage(
      "unknown failure: AbCdEf0123456789ZyXwVuTsRqPoNmLkJiHgFeDcBa",
    );
    expect(out).toContain("[redacted]");
    expect(out).not.toMatch(/AbCdEf01/);
  });

  it("preserves short alphanumeric tokens (likely not secrets)", () => {
    // Don't over-scrub things like commit hashes (8 chars), short ids.
    expect(sanitizeMcpErrorMessage("commit abc123 missing")).toBe(
      "commit abc123 missing",
    );
  });
});
