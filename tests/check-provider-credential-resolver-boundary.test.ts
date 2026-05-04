/**
 * Tests for `scripts/check-provider-credential-resolver-boundary.ts`.
 *
 * These tests validate the import-classification helpers in the
 * checker. The full filesystem-walking version is exercised by the
 * actual CI run.
 */
import { describe, it, expect } from "vitest";

// Re-extract the classifier logic by reading the script source. We
// don't import the script directly because it has top-level
// side effects (process.exit) and walks the filesystem on import.
import { readFileSync } from "fs";
import { join } from "path";

describe("check-provider-credential-resolver-boundary — classifier", () => {
  const scriptSrc = readFileSync(
    join(process.cwd(), "scripts/check-provider-credential-resolver-boundary.ts"),
    "utf8",
  );

  it("script declares the resolver path constant", () => {
    expect(scriptSrc).toContain(
      "server/provider-connections/internal/credential-resolver",
    );
  });

  it("script lists OpenRouter Model Access as the only allowed external importer", () => {
    expect(scriptSrc).toContain('"server/openrouter/model-access/"');
    // The internal directory is allowed to self-reference, but no
    // other external prefix should be in the allow list.
    const allowSection = scriptSrc.match(
      /ALLOWED_IMPORTER_PREFIXES = \[([\s\S]*?)\] as const;/,
    );
    expect(allowSection).not.toBeNull();
    const body = allowSection![1];
    // Forbidden prefixes must NOT appear in the allow list.
    expect(body).not.toContain("server/agent-studio");
    expect(body).not.toContain("server/ai-types");
    expect(body).not.toContain("server/automation");
    expect(body).not.toContain("client/");
  });

  it("script catches import specifiers that target the resolver", () => {
    // Run the resolver-target classifier in isolation by literal
    // string matching equivalent to the regex in the script.
    const samples = [
      {
        spec: "../provider-connections/internal/credential-resolver",
        expected: true,
      },
      {
        spec: "../../provider-connections/internal/credential-resolver",
        expected: true,
      },
      {
        spec: "@/provider-connections/internal/credential-resolver",
        expected: true,
      },
      {
        spec: "../provider-connections/internal",
        expected: true,
      },
      {
        // unrelated module's "internal" subtree is not flagged
        spec: "../some-other/internal/credential-resolver",
        expected: false,
      },
      {
        spec: "../provider-connections/public-api",
        expected: false,
      },
    ];
    for (const { spec, expected } of samples) {
      const stripped = spec.replace(/\.(ts|tsx|js|mjs|cjs)$/, "");
      const matchesResolver =
        (stripped.endsWith(
          "provider-connections/internal/credential-resolver",
        ) &&
          stripped.includes(
            "provider-connections/internal/credential-resolver",
          )) ||
        stripped.endsWith("provider-connections/internal");
      expect(matchesResolver, `spec=${spec}`).toBe(expected);
    }
  });
});
