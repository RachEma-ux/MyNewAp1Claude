/**
 * SaaS pipeline — generic normalizer.
 *
 * Each SaaS connector (Notion / Slack / Confluence / etc.) hands us
 * provider-shaped objects. This normalizer maps a small set of common
 * fields into a canonical "saas_doc" payload the canonical record can
 * carry. Provider-specific extraction lives in `collaborationExtractor`.
 */

export interface RawSaasObject {
  provider: string;
  objectType: string;
  externalId: string;
  title?: string;
  body?: string;
  authorId?: string;
  url?: string;
  createdAt?: string | number | Date;
  updatedAt?: string | number | Date;
  raw?: Record<string, unknown>;
}

export interface CanonicalSaasObject {
  provider: string;
  objectType: string;
  externalId: string;
  title: string | null;
  body: string | null;
  authorId: string | null;
  url: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  raw: Record<string, unknown>;
}

export function normalizeSaasObject(raw: RawSaasObject): CanonicalSaasObject {
  return {
    provider: raw.provider,
    objectType: raw.objectType,
    externalId: raw.externalId,
    title: raw.title ?? null,
    body: raw.body ?? null,
    authorId: raw.authorId ?? null,
    url: raw.url ?? null,
    createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : null,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : null,
    raw: raw.raw ?? {},
  };
}
