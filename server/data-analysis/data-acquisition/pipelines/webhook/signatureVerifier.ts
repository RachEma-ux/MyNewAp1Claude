/**
 * Webhook pipeline — HMAC signature verification.
 *
 * Pure HMAC-SHA256 helper using node:crypto. Providers (GitHub, Stripe,
 * Slack, generic) deliver the raw body + a signature header. This
 * function checks that HMAC(secret, body) matches the expected
 * signature in constant time. The secret is fetched by the caller
 * from the source row's `configJson.secret` — never logged.
 */

import { createHmac, timingSafeEqual } from "crypto";

export interface VerifyInput {
  body: string;
  signatureHeader: string;
  secret: string;
  algorithm?: "sha256" | "sha1";
  /** Provider-style prefix (e.g. "sha256=" for GitHub). Strip before compare. */
  prefix?: string;
}

export function verifySignature(input: VerifyInput): boolean {
  if (!input.body || !input.signatureHeader || !input.secret) return false;
  const algo = input.algorithm ?? "sha256";
  const prefix = input.prefix ?? `${algo}=`;
  const provided = input.signatureHeader.startsWith(prefix)
    ? input.signatureHeader.slice(prefix.length)
    : input.signatureHeader;
  const expected = createHmac(algo, input.secret).update(input.body).digest("hex");
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}
