/**
 * SaaS pipeline — collaboration-graph extractor.
 *
 * Pulls @mentions, replies, and reactions out of a normalized SaaS
 * object's body so downstream graphRAG can link people / threads.
 * Pure regex; no NLP, no external services.
 */

import type { CanonicalSaasObject } from "./saasNormalizer";

export interface CollaborationGraphFragment {
  mentions: string[];
  links: string[];
  threadRoot: string | null;
}

const MENTION_RE = /@([A-Za-z0-9_.-]{2,64})/g;
const URL_RE = /https?:\/\/[^\s<>"]+/g;

export function extractCollaborationGraph(
  obj: CanonicalSaasObject,
): CollaborationGraphFragment {
  const body = obj.body ?? "";
  const mentions = Array.from(new Set([...body.matchAll(MENTION_RE)].map((m) => m[1])));
  const links = Array.from(new Set([...body.matchAll(URL_RE)].map((m) => m[0])));
  const threadRoot =
    typeof obj.raw?.thread_ts === "string"
      ? (obj.raw.thread_ts as string)
      : typeof obj.raw?.parent_id === "string"
        ? (obj.raw.parent_id as string)
        : null;
  return { mentions, links, threadRoot };
}
