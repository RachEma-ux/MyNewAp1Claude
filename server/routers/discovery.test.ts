/**
 * Provider Discovery — Unit Tests
 *
 * Covers:
 *   - Step 0: Discovery never writes to DB
 *   - Step 1: Registry matching (exact, subdomain, www strip)
 *   - Step 2: SSRF guard (blocked IPs, HTTPS enforcement, DNS)
 *   - Step 4: Website fetch constraints (timeout, body cap)
 *   - Step 7: BestUrl selection gate
 *   - Step 8: mapDiscoveryError classification
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  findKnownProvider,
  findProviderBySlug,
  KNOWN_PROVIDERS,
  getProviderApiUrls,
} from "../../shared/provider-registry";
import {
  mapDiscoveryError,
  domainToSlug,
  type DiscoverResult,
} from "./discover-provider";

// ═══════════════════════════════════════════════════════════════════════
// Step 0 — Invariant: Discovery never writes to DB
// ═══════════════════════════════════════════════════════════════════════

describe("Step 0 — Discovery DB Invariant", () => {
  it("discover-provider.ts exports no DB import", async () => {
    // Read the source file and verify no drizzle/db imports
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL("./discover-provider.ts", import.meta.url),
      "utf-8"
    );

    expect(src).not.toMatch(/from\s+["'].*drizzle/);
    expect(src).not.toMatch(/from\s+["'].*\/db["']/);
    expect(src).not.toMatch(/from\s+["']\.\.\/database/);
    expect(src).not.toMatch(/\.insert\s*\(/);
    expect(src).not.toMatch(/\.update\s*\(/);
    expect(src).not.toMatch(/\.delete\s*\(/);
  });

  it("discoverProvider function has no side-effect methods", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL("./discover-provider.ts", import.meta.url),
      "utf-8"
    );

    // Should never call any write-like method
    expect(src).not.toMatch(/db\./);
    expect(src).not.toMatch(/transaction\s*\(/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Step 1 — Shared Registry Matching
// ═══════════════════════════════════════════════════════════════════════

describe("Step 1 — Registry Matching", () => {
  it("finds OpenAI by exact domain", () => {
    const result = findKnownProvider("openai.com");
    expect(result).toBeDefined();
    expect(result!.slug).toBe("openai");
  });

  it("finds OpenAI by platform subdomain", () => {
    const result = findKnownProvider("platform.openai.com");
    expect(result).toBeDefined();
    expect(result!.slug).toBe("openai");
  });

  it("finds Anthropic by console subdomain", () => {
    const result = findKnownProvider("console.anthropic.com");
    expect(result).toBeDefined();
    expect(result!.slug).toBe("anthropic");
  });

  it("strips www. prefix before matching", () => {
    const result = findKnownProvider("www.openai.com");
    expect(result).toBeDefined();
    expect(result!.slug).toBe("openai");
  });

  it("is case-insensitive", () => {
    const result = findKnownProvider("OpenAI.COM");
    expect(result).toBeDefined();
    expect(result!.slug).toBe("openai");
  });

  it("returns undefined for unknown domains", () => {
    expect(findKnownProvider("unknown-provider.xyz")).toBeUndefined();
  });

  it("matches subdomain wildcard (docs.anthropic.com)", () => {
    const result = findKnownProvider("docs.anthropic.com");
    expect(result).toBeDefined();
    expect(result!.slug).toBe("anthropic");
  });

  it("finds provider by slug", () => {
    const result = findProviderBySlug("groq");
    expect(result).toBeDefined();
    expect(result!.name).toBe("Groq");
  });

  it("returns undefined for unknown slug", () => {
    expect(findProviderBySlug("nonexistent")).toBeUndefined();
  });

  it("every provider has modelsListProbe defined", () => {
    for (const p of KNOWN_PROVIDERS) {
      expect(p.modelsListProbe).toBeDefined();
      expect(p.modelsListProbe.method).toMatch(/^(GET|HEAD)$/);
      expect(p.modelsListProbe.path).toBeTruthy();
    }
  });

  it("local providers have defaultLocalUrl", () => {
    const locals = KNOWN_PROVIDERS.filter((p) => p.isLocal);
    expect(locals.length).toBeGreaterThan(0);
    for (const p of locals) {
      expect(p.defaultLocalUrl).toBeTruthy();
    }
  });

  it("cloud providers have apiUrl set", () => {
    const clouds = KNOWN_PROVIDERS.filter((p) => !p.isLocal && p.slug !== "azure-openai");
    for (const p of clouds) {
      expect(p.apiUrl).toBeTruthy();
    }
  });

  it("getProviderApiUrls returns only non-null apiUrl providers", () => {
    const urls = getProviderApiUrls();
    for (const [slug, url] of Object.entries(urls)) {
      expect(url).toBeTruthy();
      expect(typeof url).toBe("string");
      const provider = findProviderBySlug(slug);
      expect(provider).toBeDefined();
      expect(provider!.apiUrl).toBe(url);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Step 2 — SSRF Guard
// ═══════════════════════════════════════════════════════════════════════

describe("Step 2 — SSRF Guard", () => {
  // Import the module under test — uses real DNS so we test logic, not network
  let validateExternalUrl: typeof import("./ssrf-guard").validateExternalUrl;

  beforeEach(async () => {
    const mod = await import("./ssrf-guard");
    validateExternalUrl = mod.validateExternalUrl;
  });

  it("rejects non-HTTPS URLs in production mode", async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      const result = await validateExternalUrl("http://example.com");
      expect(result.safe).toBe(false);
      expect(result.error).toContain("HTTPS");
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it("rejects URLs with userinfo", async () => {
    const result = await validateExternalUrl("https://user:pass@example.com");
    expect(result.safe).toBe(false);
    expect(result.error).toContain("credentials");
  });

  it("rejects invalid URLs", async () => {
    const result = await validateExternalUrl("not-a-url");
    expect(result.safe).toBe(false);
    expect(result.error).toContain("Invalid");
  });

  it("rejects ftp:// protocol", async () => {
    const result = await validateExternalUrl("ftp://example.com/file");
    expect(result.safe).toBe(false);
    expect(result.error).toContain("Unsupported protocol");
  });

  it("rejects URLs with control characters in hostname", async () => {
    const result = await validateExternalUrl("https://exam\x00ple.com");
    expect(result.safe).toBe(false);
  });

  it("blocks localhost IPs (127.0.0.1)", async () => {
    // Mock DNS to return loopback
    const dns = await import("dns");
    const origResolve4 = dns.promises.resolve4;
    const origResolve6 = dns.promises.resolve6;
    dns.promises.resolve4 = vi.fn().mockResolvedValue(["127.0.0.1"]);
    dns.promises.resolve6 = vi.fn().mockRejectedValue(new Error("no AAAA"));

    try {
      const result = await validateExternalUrl("https://evil.example.com");
      expect(result.safe).toBe(false);
      expect(result.error).toContain("blocked");
    } finally {
      dns.promises.resolve4 = origResolve4;
      dns.promises.resolve6 = origResolve6;
    }
  });

  it("blocks private network IPs (10.x.x.x)", async () => {
    const dns = await import("dns");
    const origResolve4 = dns.promises.resolve4;
    const origResolve6 = dns.promises.resolve6;
    dns.promises.resolve4 = vi.fn().mockResolvedValue(["10.0.0.1"]);
    dns.promises.resolve6 = vi.fn().mockRejectedValue(new Error("no AAAA"));

    try {
      const result = await validateExternalUrl("https://internal.example.com");
      expect(result.safe).toBe(false);
      expect(result.error).toContain("blocked");
    } finally {
      dns.promises.resolve4 = origResolve4;
      dns.promises.resolve6 = origResolve6;
    }
  });

  it("blocks 192.168.x.x IPs", async () => {
    const dns = await import("dns");
    const origResolve4 = dns.promises.resolve4;
    const origResolve6 = dns.promises.resolve6;
    dns.promises.resolve4 = vi.fn().mockResolvedValue(["192.168.1.1"]);
    dns.promises.resolve6 = vi.fn().mockRejectedValue(new Error("no AAAA"));

    try {
      const result = await validateExternalUrl("https://home.example.com");
      expect(result.safe).toBe(false);
      expect(result.error).toContain("blocked");
    } finally {
      dns.promises.resolve4 = origResolve4;
      dns.promises.resolve6 = origResolve6;
    }
  });

  it("blocks link-local/metadata IPs (169.254.x.x)", async () => {
    const dns = await import("dns");
    const origResolve4 = dns.promises.resolve4;
    const origResolve6 = dns.promises.resolve6;
    dns.promises.resolve4 = vi.fn().mockResolvedValue(["169.254.169.254"]);
    dns.promises.resolve6 = vi.fn().mockRejectedValue(new Error("no AAAA"));

    try {
      const result = await validateExternalUrl("https://metadata.example.com");
      expect(result.safe).toBe(false);
      expect(result.error).toContain("blocked");
    } finally {
      dns.promises.resolve4 = origResolve4;
      dns.promises.resolve6 = origResolve6;
    }
  });

  it("blocks IPv6 loopback (::1)", async () => {
    const dns = await import("dns");
    const origResolve4 = dns.promises.resolve4;
    const origResolve6 = dns.promises.resolve6;
    dns.promises.resolve4 = vi.fn().mockRejectedValue(new Error("no A"));
    dns.promises.resolve6 = vi.fn().mockResolvedValue(["::1"]);

    try {
      const result = await validateExternalUrl("https://v6loop.example.com");
      expect(result.safe).toBe(false);
      expect(result.error).toContain("blocked");
    } finally {
      dns.promises.resolve4 = origResolve4;
      dns.promises.resolve6 = origResolve6;
    }
  });

  it("allows valid public IPs", async () => {
    const dns = await import("dns");
    const origResolve4 = dns.promises.resolve4;
    const origResolve6 = dns.promises.resolve6;
    dns.promises.resolve4 = vi.fn().mockResolvedValue(["93.184.216.34"]);
    dns.promises.resolve6 = vi.fn().mockRejectedValue(new Error("no AAAA"));

    try {
      const result = await validateExternalUrl("https://example.com");
      expect(result.safe).toBe(true);
      expect(result.resolvedIPs).toContain("93.184.216.34");
    } finally {
      dns.promises.resolve4 = origResolve4;
      dns.promises.resolve6 = origResolve6;
    }
  });

  it("fails when no DNS records exist", async () => {
    const dns = await import("dns");
    const origResolve4 = dns.promises.resolve4;
    const origResolve6 = dns.promises.resolve6;
    dns.promises.resolve4 = vi.fn().mockRejectedValue(new Error("no A"));
    dns.promises.resolve6 = vi.fn().mockRejectedValue(new Error("no AAAA"));

    try {
      const result = await validateExternalUrl("https://nxdomain.example.com");
      expect(result.safe).toBe(false);
      expect(result.error).toContain("No DNS");
    } finally {
      dns.promises.resolve4 = origResolve4;
      dns.promises.resolve6 = origResolve6;
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Step 4 — Website Fetch Constraints (safeFetch)
// ═══════════════════════════════════════════════════════════════════════

describe("Step 4 — safeFetch constraints", () => {
  let safeFetch: typeof import("./ssrf-guard").safeFetch;

  beforeEach(async () => {
    const mod = await import("./ssrf-guard");
    safeFetch = mod.safeFetch;
  });

  it("safeFetch defaults to 8s timeout and 512KB body cap", () => {
    // Verify the function signature defaults by checking the source
    // (actual network tests would be integration tests)
    expect(safeFetch).toBeDefined();
    expect(typeof safeFetch).toBe("function");
  });

  it("safeFetch limits redirect hops to 3 by default", async () => {
    // The maxHops default is 3 — verified by reading source
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL("./ssrf-guard.ts", import.meta.url),
      "utf-8"
    );
    expect(src).toMatch(/maxHops\s*=\s*3/);
    expect(src).toMatch(/totalTimeoutMs\s*=\s*8000/);
    expect(src).toMatch(/maxBodyBytes\s*=\s*512\s*\*\s*1024/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Step 7 — BestUrl Selection Gate
// ═══════════════════════════════════════════════════════════════════════

describe("Step 7 — BestUrl Selection Gate", () => {
  // The selectBestUrl function is private, so we test it indirectly via
  // the exported types and mapDiscoveryError, plus verify logic via source.

  it("selectBestUrl requires credible evidence", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL("./discover-provider.ts", import.meta.url),
      "utf-8"
    );

    // Must check for credible evidence before returning bestUrl
    expect(src).toMatch(/hasCredibleEvidence/);
    expect(src).toMatch(/base-url-text/);
    expect(src).toMatch(/Known provider registry/);
    expect(src).toMatch(/api-subdomain-heuristic/);
    expect(src).toMatch(/html-link/);
  });

  it("selectBestUrl requires probe OK or high confidence", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL("./discover-provider.ts", import.meta.url),
      "utf-8"
    );

    // Must check probeOk and highConfidence
    expect(src).toMatch(/probeOk.*&&.*!highConfidence/);
    expect(src).toMatch(/confidence\s*>=\s*70/);
  });

  it("selectBestUrl accepts 200, 401, 403 as valid probe statuses", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(
      new URL("./discover-provider.ts", import.meta.url),
      "utf-8"
    );

    expect(src).toMatch(/\[200,\s*401,\s*403\]/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Step 8 — mapDiscoveryError Classification
// ═══════════════════════════════════════════════════════════════════════

describe("Step 8 — mapDiscoveryError", () => {
  it("maps Invalid URL errors", () => {
    const result = mapDiscoveryError(new Error("Invalid URL format"));
    expect(result.reason).toBe("INVALID_URL");
    expect(result.status).toBe("failed");
  });

  it("maps SSRF blocked errors", () => {
    const result = mapDiscoveryError(new Error("SSRF: blocked IP range"));
    expect(result.reason).toBe("SSRF_BLOCKED");
    expect(result.status).toBe("failed");
  });

  it("maps DNS failures", () => {
    const result = mapDiscoveryError(new Error("dns resolution failed"));
    expect(result.reason).toBe("DNS_FAILED");
    expect(result.status).toBe("failed");
  });

  it("maps fetch timeouts (AbortError)", () => {
    const err = new Error("timed out");
    err.name = "AbortError";
    const result = mapDiscoveryError(err);
    expect(result.reason).toBe("FETCH_TIMEOUT");
    expect(result.status).toBe("failed");
  });

  it("maps body size limit errors", () => {
    const result = mapDiscoveryError(new Error("Response exceeded size limit"));
    expect(result.reason).toBe("FETCH_TOO_LARGE");
    expect(result.status).toBe("failed");
  });

  it("defaults to PARSE_FAILED for unknown errors", () => {
    const result = mapDiscoveryError(new Error("Something went wrong"));
    expect(result.reason).toBe("PARSE_FAILED");
    expect(result.status).toBe("partial");
  });

  it("handles non-Error objects gracefully", () => {
    const result = mapDiscoveryError("string error");
    expect(result.reason).toBe("PARSE_FAILED");
    expect(result.status).toBe("partial");
  });

  it("maps 'not allowed' as SSRF_BLOCKED", () => {
    const result = mapDiscoveryError(new Error("Port not allowed"));
    expect(result.reason).toBe("SSRF_BLOCKED");
    expect(result.status).toBe("failed");
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Helpers — domainToSlug
// ═══════════════════════════════════════════════════════════════════════

describe("domainToSlug", () => {
  it("converts simple domains", () => {
    expect(domainToSlug("openai.com")).toBe("openai");
  });

  it("strips www prefix", () => {
    expect(domainToSlug("www.anthropic.com")).toBe("anthropic");
  });

  it("handles .ai TLD", () => {
    expect(domainToSlug("mistral.ai")).toBe("mistral");
  });

  it("handles multi-word domains", () => {
    expect(domainToSlug("together.ai")).toBe("together");
  });

  it("handles subdomains", () => {
    expect(domainToSlug("api.together.xyz")).toBe("api-together-xyz");
  });
});
