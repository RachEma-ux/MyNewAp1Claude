/**
 * Web pipeline — single-page fetcher.
 *
 * Fetches one URL and returns body/headers/status. Crawler policy
 * (depth, allowlist, robots.txt) is the connector's responsibility —
 * this layer is the per-page primitive. No external SDKs; uses global
 * `fetch` with a short timeout.
 */

export interface CrawlInput {
  url: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  userAgent?: string;
}

export interface CrawlResult {
  url: string;
  httpStatus: number;
  bodyText: string;
  headersJson: Record<string, unknown>;
  contentLength: number;
  fetchedAt: Date;
  errorMessage?: string;
}

export async function fetchPage(input: CrawlInput): Promise<CrawlResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 7000);
  const headers: Record<string, string> = {
    "user-agent":
      input.userAgent ?? "MyNewAppV1-DataAcquisitionCrawler/1.0 (+respect robots.txt)",
    ...(input.headers ?? {}),
  };
  try {
    const res = await fetch(input.url, { signal: controller.signal, headers });
    const text = await res.text().catch(() => "");
    const headersJson: Record<string, unknown> = {};
    res.headers.forEach((v, k) => {
      headersJson[k] = v;
    });
    return {
      url: input.url,
      httpStatus: res.status,
      bodyText: text,
      headersJson,
      contentLength: text.length,
      fetchedAt: new Date(),
      errorMessage: res.ok ? undefined : `HTTP ${res.status} ${res.statusText}`,
    };
  } catch (err) {
    return {
      url: input.url,
      httpStatus: 0,
      bodyText: "",
      headersJson: {},
      contentLength: 0,
      fetchedAt: new Date(),
      errorMessage: (err as Error).message,
    };
  } finally {
    clearTimeout(timer);
  }
}
