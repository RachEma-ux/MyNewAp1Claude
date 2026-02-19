/**
 * Provider Connection Service
 *
 * Orchestrates the full lifecycle:
 *   1. Create (DRAFT)
 *   2. Test → encrypt PAT → store secret (VALIDATED)
 *   3. Activate (ACTIVE)
 *   4. Health check failures (FAILED)
 *   5. Disable / Rotate
 *
 * PAT is NEVER stored before successful validation.
 * PAT is NEVER returned to the client after storage.
 */
import { encrypt, decrypt } from "../secrets/encryption";
import { assertTransition } from "./state-machine";
import {
  createConnection,
  getConnectionById,
  getConnectionsByWorkspace,
  getActiveConnections,
  updateConnectionStatus,
  deleteConnection,
  insertSecret,
  getLatestSecret,
  appendAuditLog,
  getAuditLog,
} from "./db";
import type { ProviderConnection, ProviderConnectionStatus } from "../../drizzle/schema";

// ============================================================================
// Test Connection (no persistence — in-memory only)
// ============================================================================

export interface TestResult {
  status: "ok" | "error";
  capabilities: string[];
  modelCount: number;
  error?: string;
  latencyMs: number;
}

/**
 * Test a provider connection without persisting anything.
 * PAT is used in-memory only and discarded after the call.
 */
export async function testConnection(
  baseUrl: string,
  pat?: string
): Promise<TestResult> {
  const start = Date.now();
  const normalizedUrl = baseUrl.replace(/\/$/, "");
  const isAnthropic = normalizedUrl.includes("anthropic.com");

  // --- Anthropic-specific test ---
  if (isAnthropic) {
    if (!pat) {
      return {
        status: "error",
        capabilities: [],
        modelCount: 0,
        error: "Anthropic requires an API key. Please enter your PAT.",
        latencyMs: Date.now() - start,
      };
    }
    try {
      const url = `${normalizedUrl}/v1/models`;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        "x-api-key": pat,
        "Authorization": `Bearer ${pat}`,
      };

      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(10000),
      });

      if (res.ok) {
        const body = await res.json();
        const models = body.data || [];
        return {
          status: "ok",
          capabilities: ["chat"],
          modelCount: models.length,
          latencyMs: Date.now() - start,
        };
      }

      const errText = await res.text().catch(() => res.statusText);
      return {
        status: "error",
        capabilities: [],
        modelCount: 0,
        error: `Anthropic API returned ${res.status}: ${errText.slice(0, 200)}`,
        latencyMs: Date.now() - start,
      };
    } catch (e: any) {
      return {
        status: "error",
        capabilities: [],
        modelCount: 0,
        error: `Could not reach Anthropic at ${normalizedUrl}: ${e.message}`,
        latencyMs: Date.now() - start,
      };
    }
  }

  // --- OpenAI-compatible /v1/models ---
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (pat) headers["Authorization"] = `Bearer ${pat}`;

  try {
    const url = `${normalizedUrl}/v1/models`;
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const body = await res.json();
      const models = body.data || [];
      const capabilities: string[] = ["chat"];
      if (models.some((m: any) => /embed/i.test(m.id))) {
        capabilities.push("embeddings");
      }
      return {
        status: "ok",
        capabilities,
        modelCount: models.length,
        latencyMs: Date.now() - start,
      };
    }

    const errText = await res.text().catch(() => res.statusText);
    return {
      status: "error",
      capabilities: [],
      modelCount: 0,
      error: `API returned ${res.status}: ${errText.slice(0, 200)}`,
      latencyMs: Date.now() - start,
    };
  } catch {
    // Fall through to Ollama format
  }

  // Try Ollama /api/tags
  try {
    const url = `${baseUrl.replace(/\/$/, "")}/api/tags`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    });

    if (res.ok) {
      const text = await res.text();
      let body: any;
      try {
        body = JSON.parse(text);
      } catch {
        const firstLine = text.split("\n").find((l) => l.trim().startsWith("{"));
        if (firstLine) body = JSON.parse(firstLine);
        else throw new Error("Invalid JSON");
      }
      const models = body.models || [];
      return {
        status: "ok",
        capabilities: ["chat"],
        modelCount: models.length,
        latencyMs: Date.now() - start,
      };
    }
  } catch {
    // Both failed
  }

  return {
    status: "error",
    capabilities: [],
    modelCount: 0,
    error: `Could not reach provider at ${baseUrl}`,
    latencyMs: Date.now() - start,
  };
}

// ============================================================================
// Create Connection (DRAFT state — no PAT stored yet)
// ============================================================================

export async function createProviderConnection(params: {
  providerId: number;
  workspaceId: number;
  baseUrl: string;
  createdBy: number;
}): Promise<ProviderConnection> {
  const conn = await createConnection({
    providerId: params.providerId,
    workspaceId: params.workspaceId,
    baseUrl: params.baseUrl,
    lifecycleStatus: "draft",
    secretVersion: 1,
    createdBy: params.createdBy,
  });

  await appendAuditLog(conn.id, "CONNECTION_CREATED", params.createdBy, {
    providerId: params.providerId,
    baseUrl: params.baseUrl,
  });

  return conn;
}

// ============================================================================
// Validate & Store Secret (DRAFT/FAILED → VALIDATED)
// ============================================================================

/**
 * Test connection, encrypt PAT, store secret, transition to VALIDATED.
 * PAT is never stored before successful validation.
 */
export async function validateAndStoreSecret(params: {
  connectionId: number;
  pat: string;
  actor: number;
}): Promise<TestResult> {
  const conn = await getConnectionById(params.connectionId);
  if (!conn) throw new Error("Connection not found");

  // Enforce state machine
  assertTransition(conn.lifecycleStatus, "validated");

  // Test the connection first — PAT stays in memory
  const result = await testConnection(conn.baseUrl, params.pat);

  if (result.status !== "ok") {
    // Do NOT store the PAT — test failed
    await appendAuditLog(conn.id, "CONNECTION_TESTED", params.actor, {
      status: "failed",
      error: result.error,
      latencyMs: result.latencyMs,
    });
    return result;
  }

  // Test succeeded — encrypt and store
  const encryptedPat = encrypt(params.pat);

  await insertSecret({
    connectionId: conn.id,
    encryptedPat,
    keyVersion: 1,
  });

  // Transition to VALIDATED
  await updateConnectionStatus(conn.id, "validated", {
    capabilities: result.capabilities,
    modelCount: result.modelCount,
    healthStatus: "ok",
    lastHealthCheck: new Date(),
  });

  await appendAuditLog(conn.id, "CONNECTION_TESTED", params.actor, {
    status: "ok",
    capabilities: result.capabilities,
    modelCount: result.modelCount,
    latencyMs: result.latencyMs,
  });

  return result;
}

// ============================================================================
// Activate (VALIDATED → ACTIVE)
// ============================================================================

export async function activateConnection(
  connectionId: number,
  actor: number
): Promise<void> {
  const conn = await getConnectionById(connectionId);
  if (!conn) throw new Error("Connection not found");

  assertTransition(conn.lifecycleStatus, "active");

  await updateConnectionStatus(conn.id, "active");
  await appendAuditLog(conn.id, "CONNECTION_ACTIVATED", actor);
}

// ============================================================================
// Disable (ACTIVE/FAILED → DISABLED)
// ============================================================================

export async function disableConnection(
  connectionId: number,
  actor: number
): Promise<void> {
  const conn = await getConnectionById(connectionId);
  if (!conn) throw new Error("Connection not found");

  assertTransition(conn.lifecycleStatus, "disabled");

  await updateConnectionStatus(conn.id, "disabled");
  await appendAuditLog(conn.id, "CONNECTION_DISABLED", actor);
}

// ============================================================================
// Health Check (updates health status, may transition to FAILED)
// ============================================================================

export async function healthCheck(connectionId: number): Promise<TestResult> {
  const conn = await getConnectionById(connectionId);
  if (!conn) throw new Error("Connection not found");
  if (conn.lifecycleStatus !== "active") {
    throw new Error("Health check only applicable to active connections");
  }

  // Decrypt PAT for the probe
  const secret = await getLatestSecret(connectionId);
  if (!secret) throw new Error("No secret found for connection");

  const pat = decrypt(secret.encryptedPat);
  const result = await testConnection(conn.baseUrl, pat);

  if (result.status === "ok") {
    await updateConnectionStatus(conn.id, "active", {
      healthStatus: "ok",
      lastHealthCheck: new Date(),
    });
    await appendAuditLog(conn.id, "HEALTH_CHECK_OK", 0, {
      latencyMs: result.latencyMs,
    });
  } else {
    // Transition to FAILED
    await updateConnectionStatus(conn.id, "failed", {
      healthStatus: "unreachable",
      lastHealthCheck: new Date(),
    });
    await appendAuditLog(conn.id, "HEALTH_CHECK_FAILED", 0, {
      error: result.error,
      latencyMs: result.latencyMs,
    });
  }

  return result;
}

// ============================================================================
// Rotate Secret
// ============================================================================

/**
 * Rotate PAT: test new PAT → encrypt → store new version → activate.
 */
export async function rotateSecret(params: {
  connectionId: number;
  newPat: string;
  actor: number;
}): Promise<TestResult> {
  const conn = await getConnectionById(params.connectionId);
  if (!conn) throw new Error("Connection not found");

  // Can rotate from active, failed, or disabled
  if (!["active", "failed", "disabled"].includes(conn.lifecycleStatus)) {
    throw new Error(`Cannot rotate secret in '${conn.lifecycleStatus}' state`);
  }

  // Test the new PAT
  const result = await testConnection(conn.baseUrl, params.newPat);
  if (result.status !== "ok") {
    await appendAuditLog(conn.id, "SECRET_ROTATED", params.actor, {
      status: "failed",
      error: result.error,
    });
    return result;
  }

  // Encrypt and store new secret
  const oldSecret = await getLatestSecret(params.connectionId);
  const encryptedPat = encrypt(params.newPat);

  await insertSecret({
    connectionId: conn.id,
    encryptedPat,
    keyVersion: (oldSecret?.keyVersion ?? 0) + 1,
    rotatedFrom: oldSecret?.id ?? null,
  });

  // Update connection
  await updateConnectionStatus(conn.id, "active", {
    secretVersion: (oldSecret?.keyVersion ?? 0) + 1,
    healthStatus: "ok",
    lastHealthCheck: new Date(),
    capabilities: result.capabilities,
    modelCount: result.modelCount,
  });

  await appendAuditLog(conn.id, "SECRET_ROTATED", params.actor, {
    status: "ok",
    newKeyVersion: (oldSecret?.keyVersion ?? 0) + 1,
    capabilities: result.capabilities,
  });

  return result;
}

// ============================================================================
// Runtime Secret Access (orchestrator-only)
// ============================================================================

/**
 * Decrypt and return PAT for runtime injection.
 * Should ONLY be called by the orchestrator at inference time.
 * PAT must be cleared from memory after use.
 */
export async function getDecryptedPat(connectionId: number): Promise<string> {
  const conn = await getConnectionById(connectionId);
  if (!conn) throw new Error("Connection not found");
  if (conn.lifecycleStatus !== "active") {
    throw new Error("Cannot access secret for non-active connection");
  }

  const secret = await getLatestSecret(connectionId);
  if (!secret) throw new Error("No secret found for connection");

  return decrypt(secret.encryptedPat);
}

// ============================================================================
// Query Helpers (re-export for router convenience)
// ============================================================================

export {
  getConnectionById,
  getConnectionsByWorkspace,
  getActiveConnections,
  deleteConnection,
  getAuditLog,
};
