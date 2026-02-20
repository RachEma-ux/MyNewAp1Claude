/**
 * Provider Discovery Service
 *
 * Discovers LLM provider metadata from a website URL:
 *   1. Registry fast-path — instant match from shared registry
 *   2. Website scrape — fetch HTML, extract name/description/API candidates
 *   3. Candidate probing — test top candidates for API endpoints
 *   4. BestUrl selection — gate against credible evidence
 *
 * Discovery NEVER writes to DB — it returns suggestions only.
 */

import * as cheerio from "cheerio";
import { findKnownProvider } from "../../shared/provider-registry";
import { validateExternalUrl, safeFetch } from "./ssrf-guard";

// ── Failure Reason Enum ─────────────────────────────────────────────

export type DiscoveryFailureReason =
  | "INVALID_URL"
  | "SSRF_BLOCKED"
  | "DNS_FAILED"
  | "FETCH_TIMEOUT"
  | "FETCH_TOO_LARGE"
  | "FETCH_HTTP_ERROR"
  | "PARSE_FAILED"
  | "NO_METADATA_FOUND"
  | "NO_CANDIDATES"
  | "PROBE_ALL_FAILED";

// ── Types ────────────────────────────────────────────────────────────

export interface DiscoverResult {
  name: string | null;
  description: string | null;
  api: {
    bestUrl: string | null;
    candidates: ApiCandidate[];
  };
  source: "registry" | "website";
  domain: string;
  registrySlug?: string;
  authType?: string;
  compatibility?: string;
  isLocal?: boolean;

  // Structured exception handling
  status: "ok" | "partial" | "failed";
  failureReason?: DiscoveryFailureReason;
  warnings: string[];

  // Debug info for support / trend detection
  debug: {
    normalizedUrl: string;
    redirectHops: string[];
    resolvedIPs: string[];
    timingsMs: {
      total?: number;
      dns?: number;
      fetch?: number;
      parse?: number;
      probe?: number;
    };
  };
}

export interface ApiCandidate {
  url: string;
  confidence: number;
  confidenceLabel: "high" | "medium" | "low";
  probeType?: "registry-probe" | "openai-shape-best-effort";
  probe?: { path: string; status: number | null };
  evidence?: string;
}

// ── Error Mapping ───────────────────────────────────────────────────

function isSSRFError(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith("SSRF:");
}

function isDnsError(err: unknown): boolean {
  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    return m.includes("dns") || m.includes("getaddrinfo") || m.includes("no dns records");
  }
  return false;
}

function isFetchTimeout(err: unknown): boolean {
  if (err instanceof Error) {
    return err.name === "AbortError" || err.message.includes("timed out") || err.message.includes("timeout");
  }
  return false;
}

function isBodyTooLargeError(err: unknown): boolean {
  return err instanceof Error && err.message.includes("size limit");
}

export function mapDiscoveryError(
  err: unknown
): { reason: DiscoveryFailureReason; status: "failed" | "partial"; warning: string } {
  if (err instanceof Error) {
    if (err.message.includes("Invalid") && err.message.includes("URL")) {
      return { reason: "INVALID_URL", status: "failed", warning: "Invalid website URL format." };
    }
    if (isSSRFError(err) || err.message.includes("blocked") || err.message.includes("not allowed")) {
      return { reason: "SSRF_BLOCKED", status: "failed", warning: "URL blocked by outbound security policy." };
    }
    if (isDnsError(err)) {
      return { reason: "DNS_FAILED", status: "failed", warning: "Domain could not be resolved." };
    }
    if (isFetchTimeout(err)) {
      return { reason: "FETCH_TIMEOUT", status: "failed", warning: "Website request timed out." };
    }
    if (isBodyTooLargeError(err)) {
      return { reason: "FETCH_TOO_LARGE", status: "failed", warning: "Website response exceeded size limit." };
    }
  }
  return {
    reason: "PARSE_FAILED",
    status: "partial",
    warning: "Unable to complete website discovery.",
  };
}

// ── Helpers ──────────────────────────────────────────────────────────

function confidenceLabel(c: number): "high" | "medium" | "low" {
  if (c >= 70) return "high";
  if (c >= 40) return "medium";
  return "low";
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url;
  }
}

export function domainToSlug(domain: string): string {
  return domain
    .replace(/^www\./, "")
    .replace(/\.(com|ai|io|dev|org|net|co)$/i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function cleanTitle(raw: string): string {
  return raw
    .replace(/\s*[-–|:]\s*(Home|Official Site|Welcome|Homepage|API).*$/i, "")
    .replace(/\s*\|\s*$/i, "")
    .trim();
}

function elapsed(start: number): number {
  return Math.round(performance.now() - start);
}

// ── Main Discovery Function ──────────────────────────────────────────

export async function discoverProvider(websiteUrl: string): Promise<DiscoverResult> {
  const totalStart = performance.now();
  const warnings: string[] = [];
  const debug: DiscoverResult["debug"] = {
    normalizedUrl: "",
    redirectHops: [],
    resolvedIPs: [],
    timingsMs: {},
  };

  // 1. Normalize URL
  let normalizedUrl = websiteUrl.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = "https://" + normalizedUrl;
  }
  debug.normalizedUrl = normalizedUrl;

  let domain: string;
  try {
    domain = extractDomain(normalizedUrl);
  } catch {
    return makeFailedResult("INVALID_URL", "Invalid website URL format.", normalizedUrl, debug, totalStart);
  }

  const isDev = process.env.NODE_ENV === "development";

  // 2. SSRF guard on input
  const dnsStart = performance.now();
  const validation = await validateExternalUrl(normalizedUrl, { allowHttp: isDev });
  debug.timingsMs.dns = elapsed(dnsStart);

  if (!validation.safe) {
    debug.resolvedIPs = validation.resolvedIPs || [];
    const reason: DiscoveryFailureReason =
      validation.error?.includes("DNS") || validation.error?.includes("No DNS") ? "DNS_FAILED" : "SSRF_BLOCKED";
    const warning = reason === "DNS_FAILED"
      ? "Domain could not be resolved."
      : "URL blocked by outbound security policy.";

    return {
      name: null,
      description: null,
      api: { bestUrl: null, candidates: [] },
      source: "website",
      domain,
      status: "failed",
      failureReason: reason,
      warnings: [warning],
      debug: { ...debug, timingsMs: { ...debug.timingsMs, total: elapsed(totalStart) } },
    };
  }
  if (validation.resolvedIPs) debug.resolvedIPs.push(...validation.resolvedIPs);

  console.log(`[Discovery] Starting discovery for domain=${domain} url=${normalizedUrl}`);

  // 3. Registry fast-path
  const knownProvider = findKnownProvider(domain);
  if (knownProvider && knownProvider.apiUrl) {
    console.log(`[Discovery] Registry hit: ${knownProvider.slug}`);
    return {
      name: knownProvider.name,
      description: knownProvider.description,
      api: {
        bestUrl: knownProvider.apiUrl,
        candidates: [
          {
            url: knownProvider.apiUrl,
            confidence: 100,
            confidenceLabel: "high",
            probeType: "registry-probe",
            evidence: "Known provider registry",
          },
        ],
      },
      source: "registry",
      domain,
      registrySlug: knownProvider.slug,
      authType: knownProvider.authType,
      compatibility: knownProvider.compatibility,
      isLocal: knownProvider.isLocal,
      status: "ok",
      warnings,
      debug: { ...debug, timingsMs: { ...debug.timingsMs, total: elapsed(totalStart) } },
    };
  }

  // If registry match but local (no apiUrl), still return registry info
  if (knownProvider && !knownProvider.apiUrl) {
    console.log(`[Discovery] Registry hit (local): ${knownProvider.slug}`);
    return {
      name: knownProvider.name,
      description: knownProvider.description,
      api: {
        bestUrl: knownProvider.defaultLocalUrl || null,
        candidates: knownProvider.defaultLocalUrl
          ? [
              {
                url: knownProvider.defaultLocalUrl,
                confidence: 100,
                confidenceLabel: "high",
                probeType: "registry-probe",
                evidence: "Local provider default URL",
              },
            ]
          : [],
      },
      source: "registry",
      domain,
      registrySlug: knownProvider.slug,
      authType: knownProvider.authType,
      compatibility: knownProvider.compatibility,
      isLocal: knownProvider.isLocal,
      status: "ok",
      warnings,
      debug: { ...debug, timingsMs: { ...debug.timingsMs, total: elapsed(totalStart) } },
    };
  }

  // 4. Fetch HTML
  const fetchStart = performance.now();
  const fetchResult = await safeFetch(normalizedUrl, {
    allowHttp: isDev,
    maxBodyBytes: 512 * 1024,
    totalTimeoutMs: 8000,
  });
  debug.timingsMs.fetch = elapsed(fetchStart);
  debug.redirectHops = fetchResult.redirectHops;
  debug.resolvedIPs.push(...fetchResult.resolvedIPs);

  if (!fetchResult.ok) {
    // Determine failure reason from fetch error
    let failureReason: DiscoveryFailureReason = "FETCH_HTTP_ERROR";
    let warning = "Website returned an unexpected HTTP response.";
    if (fetchResult.error?.includes("timed out") || fetchResult.error?.includes("timeout")) {
      failureReason = "FETCH_TIMEOUT";
      warning = "Website request timed out.";
    } else if (fetchResult.error?.includes("blocked") || fetchResult.error?.includes("not allowed")) {
      failureReason = "SSRF_BLOCKED";
      warning = "URL blocked by outbound security policy.";
    }
    warnings.push(warning);

    // Still try heuristic candidates
    const probeStart = performance.now();
    const heuristicCandidates = await probeHeuristicCandidates(domain, isDev);
    debug.timingsMs.probe = elapsed(probeStart);
    const bestUrl = selectBestUrl(heuristicCandidates);

    const hasUsableData = bestUrl !== null || heuristicCandidates.length > 0;

    return {
      name: null,
      description: null,
      api: { bestUrl, candidates: heuristicCandidates },
      source: "website",
      domain,
      status: hasUsableData ? "partial" : "failed",
      failureReason,
      warnings,
      debug: { ...debug, timingsMs: { ...debug.timingsMs, total: elapsed(totalStart) } },
    };
  }

  console.log(
    `[Discovery] Fetched ${fetchResult.body.length} bytes, ${fetchResult.redirectHops.length} redirects, IPs=[${fetchResult.resolvedIPs.join(",")}]`
  );

  // 5. Parse HTML with cheerio
  const parseStart = performance.now();
  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(fetchResult.body);
  } catch {
    debug.timingsMs.parse = elapsed(parseStart);
    warnings.push("Unable to parse website metadata.");
    return {
      name: null,
      description: null,
      api: { bestUrl: null, candidates: [] },
      source: "website",
      domain,
      status: "partial",
      failureReason: "PARSE_FAILED",
      warnings,
      debug: { ...debug, timingsMs: { ...debug.timingsMs, total: elapsed(totalStart) } },
    };
  }

  // Extract name
  let name: string | null = null;
  const ogSiteName = $('meta[property="og:site_name"]').attr("content");
  if (ogSiteName) {
    name = ogSiteName.trim();
  } else {
    // Try JSON-LD
    $('script[type="application/ld+json"]').each((_, el) => {
      if (name) return;
      try {
        const data = JSON.parse($(el).html() || "");
        const org = Array.isArray(data) ? data.find((d: any) => d["@type"] === "Organization") : data;
        if (org?.name) name = org.name;
      } catch {
        // Invalid JSON-LD
      }
    });
  }
  if (!name) {
    const titleText = $("title").text();
    if (titleText) name = cleanTitle(titleText);
  }
  if (!name) {
    // Fallback: capitalize domain
    name = domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1);
  }

  // Extract description
  let description: string | null = null;
  const metaDesc = $('meta[name="description"]').attr("content");
  if (metaDesc) {
    description = metaDesc.trim();
  } else {
    const ogDesc = $('meta[property="og:description"]').attr("content");
    if (ogDesc) description = ogDesc.trim();
  }

  debug.timingsMs.parse = elapsed(parseStart);

  // Flag if no metadata at all
  if (!name && !description) {
    warnings.push("No usable metadata found on website.");
  }

  // 6. Find API URL candidates
  const candidates: ApiCandidate[] = [];
  const seenUrls = new Set<string>();

  function addCandidate(url: string, confidence: number, evidence: string) {
    const normalized = url.replace(/\/+$/, "");
    if (seenUrls.has(normalized)) return;
    seenUrls.add(normalized);
    candidates.push({
      url: normalized,
      confidence,
      confidenceLabel: confidenceLabel(confidence),
      evidence,
    });
  }

  // Scan text for "Base URL: https://..." patterns
  const bodyText = $.text();
  const baseUrlMatches = bodyText.match(/(?:base\s*url|api\s*(?:url|endpoint|base))\s*[:=]\s*(https?:\/\/[^\s"'<>,]+)/gi);
  if (baseUrlMatches) {
    for (const m of baseUrlMatches) {
      const urlMatch = m.match(/(https?:\/\/[^\s"'<>,]+)/i);
      if (urlMatch) addCandidate(urlMatch[1], 50, "base-url-text");
    }
  }

  // Scan links for API-related URLs
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || !href.startsWith("http")) return;
    try {
      const linkUrl = new URL(href);
      const linkHost = linkUrl.hostname.toLowerCase();
      if (
        linkHost.startsWith("api.") ||
        linkHost.startsWith("developers.") ||
        linkUrl.pathname.includes("/api") ||
        linkUrl.pathname.includes("/docs")
      ) {
        // Extract base URL (just scheme + host)
        const base = `${linkUrl.protocol}//${linkUrl.host}`;
        addCandidate(base, 40, "html-link");
      }
    } catch {
      // Invalid URL
    }
  });

  // Heuristic: try api.{domain}
  addCandidate(`https://api.${domain}`, 20, "api-subdomain-heuristic");

  if (candidates.length === 0) {
    warnings.push("No API endpoint candidates found.");
  }

  // 7. Probe top 3 candidates
  const probeStart = performance.now();
  const toProbe = candidates
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);

  for (const candidate of toProbe) {
    const probeResult = await probeCandidate(candidate.url, isDev);
    if (probeResult) {
      candidate.probe = probeResult;
      candidate.probeType = "openai-shape-best-effort";

      if (probeResult.status === 200) {
        candidate.confidence = Math.min(candidate.confidence + 50, 90);
      } else if (probeResult.status === 401 || probeResult.status === 403) {
        candidate.confidence = Math.min(candidate.confidence + 45, 90);
      }
      candidate.confidenceLabel = confidenceLabel(candidate.confidence);
    } else {
      // Network error — remove from candidates
      candidate.confidence = 0;
      candidate.confidenceLabel = "low";
    }
  }
  debug.timingsMs.probe = elapsed(probeStart);

  // Remove failed probes
  const viableCandidates = candidates.filter((c) => c.confidence > 0);
  viableCandidates.sort((a, b) => b.confidence - a.confidence);

  // Check if all probed candidates failed
  const allProbesFailed = toProbe.length > 0 && toProbe.every((c) => c.confidence === 0);
  if (allProbesFailed && viableCandidates.length === 0) {
    warnings.push("API endpoint verification failed for all candidates.");
  }

  // 8. Select bestUrl
  const bestUrl = selectBestUrl(viableCandidates);

  // Determine status
  let status: DiscoverResult["status"] = "ok";
  let failureReason: DiscoveryFailureReason | undefined;

  if (!name && !description && viableCandidates.length === 0) {
    status = "failed";
    failureReason = "NO_METADATA_FOUND";
  } else if (viableCandidates.length === 0 && candidates.length > 0) {
    status = "partial";
    failureReason = "PROBE_ALL_FAILED";
  } else if (viableCandidates.length === 0) {
    status = "partial";
    failureReason = "NO_CANDIDATES";
  } else if (!bestUrl) {
    status = "partial";
    // Candidates exist but none pass bestUrl gate
  }

  debug.timingsMs.total = elapsed(totalStart);

  console.log(
    `[Discovery] domain=${domain} source=website status=${status} name="${name}" bestUrl=${bestUrl} candidates=${viableCandidates.length} timings=${JSON.stringify(debug.timingsMs)}`
  );

  return {
    name,
    description,
    api: { bestUrl, candidates: viableCandidates },
    source: "website",
    domain,
    status,
    failureReason,
    warnings,
    debug,
  };
}

// ── Probe a candidate URL ────────────────────────────────────────────

async function probeCandidate(
  baseUrl: string,
  allowHttp: boolean
): Promise<{ path: string; status: number | null } | null> {
  const path = "/v1/models";
  const url = `${baseUrl}${path}`;

  // SSRF validate the candidate
  const validation = await validateExternalUrl(url, { allowHttp });
  if (!validation.safe) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "MyNewApp/1.0 ProviderDiscovery",
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return { path, status: res.status };
  } catch {
    return null;
  }
}

// ── Heuristic candidates (when HTML fetch fails) ─────────────────────

async function probeHeuristicCandidates(
  domain: string,
  allowHttp: boolean
): Promise<ApiCandidate[]> {
  const candidates: ApiCandidate[] = [
    {
      url: `https://api.${domain}`,
      confidence: 20,
      confidenceLabel: "low",
      evidence: "api-subdomain-heuristic",
    },
  ];

  for (const candidate of candidates) {
    const probeResult = await probeCandidate(candidate.url, allowHttp);
    if (probeResult) {
      candidate.probe = probeResult;
      candidate.probeType = "openai-shape-best-effort";
      if (probeResult.status === 200) {
        candidate.confidence = Math.min(candidate.confidence + 50, 90);
      } else if (probeResult.status === 401 || probeResult.status === 403) {
        candidate.confidence = Math.min(candidate.confidence + 45, 90);
      }
      candidate.confidenceLabel = confidenceLabel(candidate.confidence);
    } else {
      candidate.confidence = 0;
    }
  }

  return candidates.filter((c) => c.confidence > 0);
}

// ── BestUrl Selection Gate ───────────────────────────────────────────

function selectBestUrl(candidates: ApiCandidate[]): string | null {
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);

  for (const c of sorted) {
    const probeOk = c.probe && [200, 401, 403].includes(c.probe.status!);
    const highConfidence = c.confidence >= 70;

    if (!probeOk && !highConfidence) continue;

    // Credible evidence check
    const hasCredibleEvidence =
      c.evidence === "base-url-text" ||
      c.evidence === "Known provider registry" ||
      (c.evidence === "api-subdomain-heuristic" && probeOk) ||
      (c.evidence === "html-link" && probeOk);

    if (hasCredibleEvidence) return c.url;
  }

  return null;
}

// ── Helper: build a failed result ────────────────────────────────────

function makeFailedResult(
  reason: DiscoveryFailureReason,
  warning: string,
  normalizedUrl: string,
  debug: DiscoverResult["debug"],
  totalStart: number
): DiscoverResult {
  debug.timingsMs.total = elapsed(totalStart);
  return {
    name: null,
    description: null,
    api: { bestUrl: null, candidates: [] },
    source: "website",
    domain: extractDomain(normalizedUrl),
    status: "failed",
    failureReason: reason,
    warnings: [warning],
    debug,
  };
}
