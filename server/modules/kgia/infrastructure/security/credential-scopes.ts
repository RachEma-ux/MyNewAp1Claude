/**
 * KGIA Security — Credential Scopes
 *
 * Manages credential access scoping for graph source connections.
 * Ensures credentials are only used for their intended purpose.
 */

import type { GraphSource } from "../../domain/types";

export interface CredentialScope {
  sourceId: number;
  allowedOperations: ("read" | "schema" | "test")[];
  maxConcurrent: number;
  expiresAt?: Date;
}

const DEFAULT_SCOPE: Omit<CredentialScope, "sourceId"> = {
  allowedOperations: ["read", "schema", "test"],
  maxConcurrent: 5,
};

/**
 * Get the credential scope for a source.
 * Read-only sources get restricted scopes.
 */
export function getCredentialScope(source: GraphSource): CredentialScope {
  const scope: CredentialScope = {
    sourceId: source.id,
    ...DEFAULT_SCOPE,
  };

  if (source.readOnly) {
    scope.allowedOperations = ["read", "schema", "test"];
  }

  return scope;
}

/**
 * Check if an operation is within the credential scope.
 */
export function isOperationAllowed(
  scope: CredentialScope,
  operation: "read" | "schema" | "test" | "write"
): boolean {
  if (scope.expiresAt && scope.expiresAt < new Date()) return false;
  return scope.allowedOperations.includes(operation as any);
}

/**
 * Mask credentials for logging (never log raw credentials).
 */
export function maskCredentials(
  credentials: Record<string, unknown> | null | undefined
): Record<string, string> | null {
  if (!credentials) return null;

  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(credentials)) {
    if (typeof value === "string" && value.length > 0) {
      masked[key] = value.slice(0, 3) + "***" + value.slice(-2);
    } else {
      masked[key] = "***";
    }
  }
  return masked;
}
