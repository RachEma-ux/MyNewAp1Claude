/**
 * Web pipeline — HTML extractor.
 *
 * Lifts <title> + visible body text from a raw HTML document. No
 * external HTML parser is imported (DOMParser is unavailable in Node);
 * a small set of regex strips the common boilerplate. The result feeds
 * `data_acquisition_web_pages.title_text` and `body_text`.
 */

import type { InsertDataAcquisitionWebPage } from "../../../../../drizzle/schema";
import type { CrawlResult } from "./crawler";

const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;
const SCRIPT_RE = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
const STYLE_RE = /<style\b[^>]*>[\s\S]*?<\/style>/gi;
const TAG_RE = /<[^>]+>/g;
const WS_RE = /\s+/g;

export function extractHtml(crawl: CrawlResult): {
  titleText: string | null;
  bodyText: string | null;
} {
  if (!crawl.bodyText) return { titleText: null, bodyText: null };
  const titleMatch = TITLE_RE.exec(crawl.bodyText);
  const titleText = titleMatch ? decodeEntities(titleMatch[1].trim()) : null;
  const stripped = crawl.bodyText
    .replace(SCRIPT_RE, "")
    .replace(STYLE_RE, "")
    .replace(TAG_RE, " ");
  const bodyText = decodeEntities(stripped).replace(WS_RE, " ").trim() || null;
  return { titleText, bodyText };
}

export function buildWebPageRow(
  itemId: number,
  crawl: CrawlResult,
): InsertDataAcquisitionWebPage {
  const { titleText, bodyText } = extractHtml(crawl);
  return {
    itemId,
    url: crawl.url,
    httpStatus: crawl.httpStatus,
    titleText,
    bodyText,
    headersJson: crawl.headersJson,
    fetchedAt: crawl.fetchedAt,
    contentLength: crawl.contentLength,
  };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}
