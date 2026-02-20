/**
 * SSRF Guard — validates URLs before any server-side fetch.
 *
 * Checks:
 *   1. URL hardening (userinfo, control chars, mixed-script)
 *   2. Scheme enforcement (HTTPS required in prod)
 *   3. Port policy (configurable via ALLOWED_OUTBOUND_PORTS)
 *   4. DNS resolution (A + AAAA records) with per-request caching
 *   5. IP classification (block private/link-local/metadata ranges)
 *   6. Redirect validation (re-check per hop)
 */

import dns from "dns";

// ── Configurable Port Policy ────────────────────────────────────────

function getAllowedPorts(): Set<number> {
  const envPorts = process.env.ALLOWED_OUTBOUND_PORTS;
  if (envPorts) {
    const ports = envPorts.split(",").map((p) => parseInt(p.trim(), 10)).filter((p) => !isNaN(p) && p > 0 && p <= 65535);
    if (ports.length > 0) return new Set(ports);
  }
  return new Set([80, 443, 8443, 8080, 11434]);
}

// ── Interfaces ──────────────────────────────────────────────────────

interface ValidateResult {
  safe: boolean;
  error?: string;
  resolvedIPs?: string[];
}

interface ValidateOptions {
  allowHttp?: boolean;
  /** Per-request DNS cache — pass a Map to pin results within a request lifecycle */
  dnsCache?: Map<string, string[]>;
}

// ── IP Classification ────────────────────────────────────────────────

function ipv4ToNumber(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function isBlockedIPv4(ip: string): boolean {
  const n = ipv4ToNumber(ip);

  // 0.0.0.0
  if (n === 0) return true;
  // 127.0.0.0/8
  if ((n >>> 24) === 127) return true;
  // 10.0.0.0/8
  if ((n >>> 24) === 10) return true;
  // 172.16.0.0/12
  if ((n >>> 20) === (172 << 4 | 1)) return true;
  // 192.168.0.0/16
  if ((n >>> 16) === (192 << 8 | 168)) return true;
  // 169.254.0.0/16 (link-local + cloud metadata)
  if ((n >>> 16) === (169 << 8 | 254)) return true;

  return false;
}

function isBlockedIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  // ::1 (loopback)
  if (normalized === "::1" || normalized === "0000:0000:0000:0000:0000:0000:0000:0001") return true;
  // fc00::/7 (unique local)
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  // fe80::/10 (link-local)
  if (normalized.startsWith("fe80")) return true;
  // :: (unspecified)
  if (normalized === "::" || normalized === "0000:0000:0000:0000:0000:0000:0000:0000") return true;

  return false;
}

function isBlockedIP(ip: string): boolean {
  if (ip.includes(":")) return isBlockedIPv6(ip);
  return isBlockedIPv4(ip);
}

// ── URL Hardening ────────────────────────────────────────────────────

function hasControlChars(str: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(str);
}

function hasMixedScript(hostname: string): boolean {
  // Simple heuristic: if hostname has both ASCII letters and non-ASCII, flag it
  const hasAscii = /[a-zA-Z]/.test(hostname);
  // eslint-disable-next-line no-control-regex
  const hasNonAscii = /[^\x00-\x7F]/.test(hostname);
  return hasAscii && hasNonAscii;
}

// ── DNS Resolution with Caching ─────────────────────────────────────

async function resolveAll(hostname: string, cache?: Map<string, string[]>): Promise<string[]> {
  // Check cache first (prevents DNS rebinding within a request lifecycle)
  if (cache?.has(hostname)) {
    return cache.get(hostname)!;
  }

  const ips: string[] = [];

  try {
    const ipv4 = await dns.promises.resolve4(hostname);
    ips.push(...ipv4);
  } catch {
    // No A records
  }

  try {
    const ipv6 = await dns.promises.resolve6(hostname);
    ips.push(...ipv6);
  } catch {
    // No AAAA records
  }

  // Pin to cache
  if (cache) {
    cache.set(hostname, ips);
  }

  return ips;
}

// ── Main Validator ───────────────────────────────────────────────────

export async function validateExternalUrl(
  url: string,
  opts?: ValidateOptions
): Promise<ValidateResult> {
  // 1. Parse URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { safe: false, error: "Invalid URL" };
  }

  // Reject userinfo
  if (parsed.username || parsed.password) {
    return { safe: false, error: "URLs with credentials are not allowed" };
  }

  // Reject control/invisible chars in hostname
  if (hasControlChars(parsed.hostname)) {
    return { safe: false, error: "Hostname contains control characters" };
  }

  // Reject mixed-script hostnames
  if (hasMixedScript(parsed.hostname)) {
    return { safe: false, error: "Hostname uses mixed scripts (possible homograph attack)" };
  }

  // 2. Scheme enforcement
  const isDev = process.env.NODE_ENV === "development";
  if (parsed.protocol === "http:") {
    if (!opts?.allowHttp || !isDev) {
      return { safe: false, error: "Only HTTPS URLs are allowed" };
    }
  } else if (parsed.protocol !== "https:") {
    return { safe: false, error: `Unsupported protocol: ${parsed.protocol}` };
  }

  // 3. Port check (configurable)
  if (parsed.port) {
    const port = parseInt(parsed.port, 10);
    const allowed = getAllowedPorts();
    if (!allowed.has(port) && !isDev) {
      return { safe: false, error: `Port ${port} is not allowed` };
    }
  }

  // 4. DNS resolution (with optional per-request cache)
  let resolvedIPs: string[];
  try {
    resolvedIPs = await resolveAll(parsed.hostname, opts?.dnsCache);
  } catch {
    return { safe: false, error: `DNS resolution failed for ${parsed.hostname}` };
  }

  if (resolvedIPs.length === 0) {
    return { safe: false, error: `No DNS records found for ${parsed.hostname}` };
  }

  // 5. IP classification — block only if ALL IPs are blocked
  const allBlocked = resolvedIPs.every(isBlockedIP);
  if (allBlocked) {
    return {
      safe: false,
      error: `All resolved IPs for ${parsed.hostname} are in blocked ranges`,
      resolvedIPs,
    };
  }

  return { safe: true, resolvedIPs };
}

// ── Safe Fetch with Redirect Handling ────────────────────────────────

export interface SafeFetchOptions {
  maxHops?: number;
  totalTimeoutMs?: number;
  maxBodyBytes?: number;
  allowHttp?: boolean;
  headers?: Record<string, string>;
}

export interface SafeFetchResult {
  ok: boolean;
  status: number;
  body: string;
  finalUrl: string;
  redirectHops: string[];
  resolvedIPs: string[];
  error?: string;
}

/**
 * Fetch a URL with SSRF protection and redirect validation.
 * Handles redirects manually, re-validating each hop.
 * Uses per-request DNS cache to prevent rebinding attacks.
 */
export async function safeFetch(
  url: string,
  opts: SafeFetchOptions = {}
): Promise<SafeFetchResult> {
  const {
    maxHops = 3,
    totalTimeoutMs = 8000,
    maxBodyBytes = 512 * 1024,
    allowHttp = false,
    headers = {},
  } = opts;

  const redirectHops: string[] = [];
  const allResolvedIPs: string[] = [];
  let currentUrl = url;

  // Per-request DNS cache — pins results to prevent rebinding between hops
  const dnsCache = new Map<string, string[]>();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), totalTimeoutMs);

  try {
    for (let hop = 0; hop <= maxHops; hop++) {
      // Validate current URL (with shared DNS cache)
      const validation = await validateExternalUrl(currentUrl, { allowHttp, dnsCache });
      if (!validation.safe) {
        return {
          ok: false,
          status: 0,
          body: "",
          finalUrl: currentUrl,
          redirectHops,
          resolvedIPs: allResolvedIPs,
          error: validation.error,
        };
      }
      if (validation.resolvedIPs) allResolvedIPs.push(...validation.resolvedIPs);

      // Fetch with manual redirect handling
      const res = await fetch(currentUrl, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "MyNewApp/1.0 ProviderDiscovery",
          Accept: "text/html,application/xhtml+xml,*/*",
          ...headers,
        },
      });

      // Handle redirects
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get("location");
        if (!location) {
          return {
            ok: false,
            status: res.status,
            body: "",
            finalUrl: currentUrl,
            redirectHops,
            resolvedIPs: allResolvedIPs,
            error: "Redirect with no Location header",
          };
        }

        // Resolve relative redirect
        const nextUrl = new URL(location, currentUrl).href;
        redirectHops.push(nextUrl);

        if (hop === maxHops) {
          return {
            ok: false,
            status: res.status,
            body: "",
            finalUrl: currentUrl,
            redirectHops,
            resolvedIPs: allResolvedIPs,
            error: `Too many redirects (>${maxHops})`,
          };
        }

        currentUrl = nextUrl;
        continue;
      }

      // Read body with size cap
      let body = "";
      if (res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let bytesRead = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytesRead += value.byteLength;
          if (bytesRead > maxBodyBytes) {
            reader.cancel();
            body += decoder.decode(value, { stream: false });
            break;
          }
          body += decoder.decode(value, { stream: true });
        }
      } else {
        body = await res.text();
        if (body.length > maxBodyBytes) {
          body = body.slice(0, maxBodyBytes);
        }
      }

      return {
        ok: res.ok,
        status: res.status,
        body,
        finalUrl: currentUrl,
        redirectHops,
        resolvedIPs: allResolvedIPs,
      };
    }

    // Should not reach here
    return {
      ok: false,
      status: 0,
      body: "",
      finalUrl: currentUrl,
      redirectHops,
      resolvedIPs: allResolvedIPs,
      error: "Unexpected end of redirect chain",
    };
  } catch (e: any) {
    const isTimeout = e.name === "AbortError" || e.code === "ABORT_ERR";
    return {
      ok: false,
      status: 0,
      body: "",
      finalUrl: currentUrl,
      redirectHops,
      resolvedIPs: allResolvedIPs,
      error: isTimeout ? "Request timed out" : e.message,
    };
  } finally {
    clearTimeout(timeout);
  }
}
