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
  models?: string[];
  modelCount?: number;
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
  // Split on common title separators: |, –, —, " - "
  const segments = raw.split(/\s*[|–—]\s*|\s+-\s+/).map(s => s.trim()).filter(Boolean);
  if (segments.length > 1) {
    // Pick the shortest segment with ≤4 words (likely the brand name)
    const brand = segments
      .filter(s => s.split(/\s+/).length <= 4)
      .sort((a, b) => a.length - b.length)[0];
    if (brand) return brand.replace(/[.!]+$/, "").trim();
  }
  // Single segment or no short candidate — strip known suffixes
  return (segments[0] || raw)
    .replace(/\s*[-–|:]\s*(Home|Official Site|Welcome|Homepage|API).*$/i, "")
    .replace(/[.!]+$/, "")
    .trim();
}

function cleanDescription(raw: string): string {
  if (raw.length <= 200) return raw.trim();
  // Truncate to 200 chars and cut at the last sentence boundary
  const truncated = raw.slice(0, 200);
  const lastSentence = truncated.search(/[.!?]\s+[^.!?]*$/);
  if (lastSentence > 80) {
    return truncated.slice(0, lastSentence + 1).trim();
  }
  return truncated.trimEnd().replace(/[,;:\s]+$/, "") + "…";
}

function elapsed(start: number): number {
  return Math.round(performance.now() - start);
}

// ── Structured Log Emitter ──────────────────────────────────────────

function emitDiscoveryAttempt(result: DiscoverResult) {
  const entry = {
    event: "discovery_attempt",
    ts: new Date().toISOString(),
    domain: result.domain,
    source: result.source,
    status: result.status,
    failureReason: result.failureReason ?? null,
    bestUrl: result.api.bestUrl !== null,
    candidateCount: result.api.candidates.length,
    registrySlug: result.registrySlug ?? null,
    timingsMs: result.debug.timingsMs,
    warnings: result.warnings,
  };
  console.log(`[DiscoveryAttempt] ${JSON.stringify(entry)}`);
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
    const r = makeFailedResult("INVALID_URL", "Invalid website URL format.", normalizedUrl, debug, totalStart);
    emitDiscoveryAttempt(r);
    return r;
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

    const r: DiscoverResult = {
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
    emitDiscoveryAttempt(r);
    return r;
  }
  if (validation.resolvedIPs) debug.resolvedIPs.push(...validation.resolvedIPs);

  console.log(`[Discovery] Starting discovery for domain=${domain} url=${normalizedUrl}`);

  // 3. Registry fast-path
  const knownProvider = findKnownProvider(domain);
  if (knownProvider && knownProvider.apiUrl) {
    console.log(`[Discovery] Registry hit: ${knownProvider.slug}`);
    const r: DiscoverResult = {
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
    emitDiscoveryAttempt(r);
    return r;
  }

  // If registry match but local (no apiUrl), still return registry info
  if (knownProvider && !knownProvider.apiUrl) {
    console.log(`[Discovery] Registry hit (local): ${knownProvider.slug}`);
    const r: DiscoverResult = {
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
    emitDiscoveryAttempt(r);
    return r;
  }

  // 4. Phase 1: Direct API probing (multi-subdomain × multi-path)
  console.log(`[Discovery] Phase 1: Direct API probing for ${domain}`);
  const apiProbeStart = performance.now();
  const apiProbeCandidates = await probeHeuristicCandidates(domain, isDev);
  debug.timingsMs.probe = elapsed(apiProbeStart);

  if (apiProbeCandidates.length > 0) {
    const bestUrl = selectBestUrl(apiProbeCandidates);
    if (bestUrl) {
      console.log(`[Discovery] Phase 1 hit: ${bestUrl}`);
      // Still fetch HTML briefly for name/description
      let apiName: string | null = null;
      let apiDescription: string | null = null;
      try {
        const quickFetch = await safeFetch(normalizedUrl, {
          allowHttp: isDev,
          maxBodyBytes: 256 * 1024,
          totalTimeoutMs: 4000,
        });
        if (quickFetch.ok) {
          const q$ = cheerio.load(quickFetch.body);
          const ogName = q$('meta[property="og:site_name"]').attr("content");
          apiName = ogName?.trim() || cleanTitle(q$("title").text()) || null;
          if (apiName) apiName = cleanTitle(apiName);
          const rawDesc = q$('meta[name="description"]').attr("content")?.trim()
            || q$('meta[property="og:description"]').attr("content")?.trim()
            || null;
          apiDescription = rawDesc ? cleanDescription(rawDesc) : null;
        }
      } catch { /* name lookup is best-effort */ }

      if (!apiName) {
        apiName = domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1);
      }

      debug.timingsMs.total = elapsed(totalStart);
      const r: DiscoverResult = {
        name: apiName,
        description: apiDescription,
        api: { bestUrl, candidates: apiProbeCandidates },
        source: "website",
        domain,
        status: "ok",
        warnings,
        debug,
      };
      emitDiscoveryAttempt(r);
      return r;
    }
  }

  // 5. Phase 2: Fetch HTML (fallback when direct probing didn't find a confirmed API)
  console.log(`[Discovery] Phase 2: HTML scraping for ${domain}`);
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

    const r: DiscoverResult = {
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
    emitDiscoveryAttempt(r);
    return r;
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
    const r: DiscoverResult = {
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
    emitDiscoveryAttempt(r);
    return r;
  }

  // Extract name
  let name: string | null = null;
  const ogSiteName = $('meta[property="og:site_name"]').attr("content");
  if (ogSiteName) {
    name = cleanTitle(ogSiteName.trim());
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
  const rawMetaDesc = $('meta[name="description"]').attr("content")?.trim()
    || $('meta[property="og:description"]').attr("content")?.trim()
    || null;
  if (rawMetaDesc) {
    description = cleanDescription(rawMetaDesc);
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

  const result: DiscoverResult = {
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
  emitDiscoveryAttempt(result);
  return result;
}

// ── API Probe Paths & Subdomains ─────────────────────────────────────

const API_PATHS = [
  "/v1/models",
  "/studio/v1/models",   // AI21
  "/v2/models",          // Cohere
  "/api/v1/models",
  "/v1/engines",         // older OpenAI style
  "/models",             // bare
];

const API_SUBDOMAINS = [
  "api",
  "studio",
  "developers",
  "platform",
];

// ── Probe a single URL ──────────────────────────────────────────────

interface ProbeResult {
  path: string;
  status: number | null;
  models?: string[];      // model IDs from 200 response
  modelCount?: number;
}

async function probeSingleUrl(
  url: string,
  path: string,
  allowHttp: boolean
): Promise<ProbeResult | null> {
  const validation = await validateExternalUrl(url, { allowHttp });
  if (!validation.safe) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "MyNewApp/1.0 ProviderDiscovery",
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const result: ProbeResult = { path, status: res.status };

    // Read response body on 200 to extract model info
    if (res.status === 200) {
      try {
        const text = await res.text();
        const body = JSON.parse(text.slice(0, 32768)); // limit parse size
        // OpenAI-compatible: { data: [{ id: "model-name" }, ...] }
        if (body.data && Array.isArray(body.data)) {
          result.models = body.data.slice(0, 20).map((m: any) => m.id || m.name).filter(Boolean);
          result.modelCount = body.data.length;
        }
        // Some providers: { models: [{ name: "..." }, ...] }
        else if (body.models && Array.isArray(body.models)) {
          result.models = body.models.slice(0, 20).map((m: any) => m.id || m.name || m.model).filter(Boolean);
          result.modelCount = body.models.length;
        }
        // Bare array: [{ id: "..." }, ...]
        else if (Array.isArray(body)) {
          result.models = body.slice(0, 20).map((m: any) => m.id || m.name).filter(Boolean);
          result.modelCount = body.length;
        }
      } catch {
        // JSON parse failed — still a valid 200 probe
      }
    }

    return result;
  } catch {
    return null;
  }
}

// ── Probe a candidate base URL with multiple paths ──────────────────

async function probeCandidate(
  baseUrl: string,
  allowHttp: boolean
): Promise<ProbeResult | null> {
  // Try all paths in parallel for speed
  const probes = API_PATHS.map((path) =>
    probeSingleUrl(`${baseUrl}${path}`, path, allowHttp)
  );
  const results = await Promise.all(probes);

  // Pick best result: prefer 200 with models, then 200, then 401/403
  let best: ProbeResult | null = null;
  for (const r of results) {
    if (!r) continue;
    if (r.status === 200 && r.models?.length) return r; // ideal — stop early
    if (r.status === 200 && (!best || best.status !== 200)) best = r;
    if ((r.status === 401 || r.status === 403) && !best) best = r;
  }
  return best;
}

// ── Direct API probing (Phase 1) ────────────────────────────────────

async function probeHeuristicCandidates(
  domain: string,
  allowHttp: boolean
): Promise<ApiCandidate[]> {
  // Build candidate base URLs from subdomain patterns
  const baseUrls = API_SUBDOMAINS.map((sub) => `https://${sub}.${domain}`);
  // Also try the bare domain itself
  baseUrls.push(`https://${domain}`);

  // Probe all subdomains in parallel
  const probePromises = baseUrls.map(async (baseUrl): Promise<ApiCandidate | null> => {
    const result = await probeCandidate(baseUrl, allowHttp);
    if (!result) return null;

    let confidence = 20;
    if (result.status === 200 && result.models?.length) {
      confidence = 90;
    } else if (result.status === 200) {
      confidence = 70;
    } else if (result.status === 401 || result.status === 403) {
      confidence = 65;
    } else {
      return null; // not useful
    }

    return {
      url: `${baseUrl}${result.path.replace(/\/models$|\/engines$/, "")}`,
      confidence,
      confidenceLabel: confidenceLabel(confidence),
      probeType: "openai-shape-best-effort",
      probe: { path: result.path, status: result.status },
      evidence: "api-probe",
      models: result.models,
      modelCount: result.modelCount,
    };
  });

  const results = await Promise.all(probePromises);
  return results
    .filter((c): c is ApiCandidate => c !== null)
    .sort((a, b) => b.confidence - a.confidence);
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
      c.evidence === "api-probe" ||
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
