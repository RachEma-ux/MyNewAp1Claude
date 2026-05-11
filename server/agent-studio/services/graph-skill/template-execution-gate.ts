/**
 * Graph Skill Pack — query-template execution gate.
 *
 * Phase 12.5 §13. Wires the `TemplateExecutionGate` port on the
 * retrieval router (decides whether a registered query template is
 * allowed to run before any Cypher hits the backend).
 *
 * Enforcement rules:
 *   - `read_only === false` → DENY with `mutation_not_allowed` unless
 *     the caller supplies a runtime override (today: no override
 *     channel exists, so mutating templates always deny — that's the
 *     intended baseline). When `D-TEMPLATE-MUT-OVERRIDE` lands, the
 *     gate will accept an admin maintenance flag.
 *   - `allowed_roles` non-null → DENY with `role_not_allowed` when
 *     `runtime.userRole` isn't in the list.
 *   - `risk_level === "high"` and `runtime.userRole !== "admin"` →
 *     DENY with `high_risk_admin_only`. Conservative default —
 *     operators can loosen per-template via `allowed_roles`.
 *
 * Caching: template metadata is cached with a short TTL (60s) so the
 * gate doesn't round-trip per call. Matches the §5/§11 recorder
 * caching pattern.
 *
 * Failure modes:
 *   - ASDB unavailable → ALLOW (fail-open). Same contract as the
 *     §4–§12 recorders: an audit/gate write failure must not block
 *     retrieval. Operators see the absence of gate denials in the
 *     trace; the §11 audit row still fires.
 *   - Unknown templateKey → ALLOW. The downstream
 *     `repository.executeTemplate()` will surface the unknown-key
 *     error from its own path; the gate doesn't duplicate that
 *     surface.
 *
 * ADR: docs/architecture/agent-studio-cypher-query-template-system.md §1.6
 */

import { eq } from "drizzle-orm";
import { getAsDb } from "../../db/connection.js";
import { agsQueryTemplates } from "../../../../drizzle/tables/agent-studio-graph-skill.js";
import type { TemplateExecutionGate } from "../graph/retrieval/retrieval-router.js";

const DEFAULT_CACHE_TTL_MS = 60_000;

interface TemplateMeta {
  readonly readOnly: boolean;
  readonly allowedRoles: string[] | null;
  readonly riskLevel: string;
}

interface CacheEntry {
  readonly meta: TemplateMeta | null;
  readonly expiresAt: number;
}

export interface CreateTemplateExecutionGateOptions {
  readonly getDb?: typeof getAsDb;
  readonly cacheTtlMs?: number;
}

export function createTemplateExecutionGate(
  options: CreateTemplateExecutionGateOptions = {},
): TemplateExecutionGate {
  const getDb = options.getDb ?? getAsDb;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const cache = new Map<string, CacheEntry>();

  async function resolveMeta(templateKey: string): Promise<TemplateMeta | null> {
    const now = Date.now();
    const cached = cache.get(templateKey);
    if (cached && cached.expiresAt > now) return cached.meta;

    const db = getDb();
    if (!db) return null;

    const rows = await db
      .select({
        readOnly: agsQueryTemplates.readOnly,
        allowedRoles: agsQueryTemplates.allowedRoles,
        riskLevel: agsQueryTemplates.riskLevel,
      })
      .from(agsQueryTemplates)
      .where(eq(agsQueryTemplates.templateKey, templateKey))
      .limit(1);

    const meta = rows[0]
      ? {
          readOnly: rows[0].readOnly,
          allowedRoles: rows[0].allowedRoles,
          riskLevel: rows[0].riskLevel,
        }
      : null;
    cache.set(templateKey, { meta, expiresAt: now + cacheTtlMs });
    return meta;
  }

  return async (input) => {
    const meta = await resolveMeta(input.templateKey);

    // Unknown templateKey or ASDB unavailable → fail-open. Let the
    // downstream executor surface the right error.
    if (!meta) return { allowed: true };

    if (meta.readOnly === false) {
      return { allowed: false, reason: "mutation_not_allowed" };
    }

    const userRole = input.runtime.userRole;
    if (meta.allowedRoles && meta.allowedRoles.length > 0) {
      if (!userRole || !meta.allowedRoles.includes(userRole)) {
        return { allowed: false, reason: "role_not_allowed" };
      }
    }

    if (meta.riskLevel === "high" && userRole !== "admin") {
      return { allowed: false, reason: "high_risk_admin_only" };
    }

    return { allowed: true };
  };
}
