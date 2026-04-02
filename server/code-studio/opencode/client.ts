/**
 * Code Studio — OpenCode HTTP Client
 *
 * Wraps OpenCode's HTTP API (serve mode) with error normalization.
 * Based on verified OpenCode API surface:
 *   - GET /global/health
 *   - POST /session (create)
 *   - GET /session (list)
 *   - GET /session/:id (get)
 *   - DELETE /session/:id (delete)
 *   - POST /session/:id/message (send message)
 *   - GET /session/:id/message (list messages)
 *   - GET /session/:id/diff (get diffs)
 *   - POST /session/:id/abort (abort)
 *   - POST /session/:id/permissions/:permissionID (respond to permission)
 *   - GET /agent (list agents)
 *   - GET /event (SSE stream)
 */

import { getOpenCodeBaseUrl, getOpenCodeAuthHeaders } from "./config";
import type {
  OpenCodeHealthStatus,
  OpenCodeSession,
  OpenCodeMessage,
  OpenCodeDiff,
  OpenCodePermissionRequest,
  OpenCodeAgent,
} from "./types";

class OpenCodeClientError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public upstream?: any
  ) {
    super(message);
    this.name = "OpenCodeClientError";
  }
}

async function ocFetch(path: string, options: RequestInit = {}): Promise<any> {
  const baseUrl = getOpenCodeBaseUrl();
  const url = `${baseUrl}${path}`;
  const headers = {
    "Content-Type": "application/json",
    ...getOpenCodeAuthHeaders(),
    ...(options.headers || {}),
  };

  try {
    const response = await fetch(url, { ...options, headers });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new OpenCodeClientError(
        `OpenCode API error: ${response.status} ${response.statusText}`,
        response.status,
        body
      );
    }
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return response.json();
    }
    return response.text();
  } catch (error: any) {
    if (error instanceof OpenCodeClientError) throw error;
    throw new OpenCodeClientError(
      `OpenCode unreachable: ${error.message}`,
      undefined,
      error
    );
  }
}

// ── Health ────────────────────────────────────────────────────────────────────

export async function checkHealth(): Promise<OpenCodeHealthStatus> {
  try {
    const data = await ocFetch("/global/health");
    return { healthy: data.healthy ?? true, version: data.version };
  } catch (error: any) {
    return { healthy: false, error: error.message };
  }
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export async function createSession(title?: string, parentID?: string): Promise<OpenCodeSession> {
  const body: any = {};
  if (title) body.title = title;
  if (parentID) body.parentID = parentID;
  return ocFetch("/session", { method: "POST", body: JSON.stringify(body) });
}

export async function listSessions(): Promise<OpenCodeSession[]> {
  const data = await ocFetch("/session");
  return Array.isArray(data) ? data : [];
}

export async function getSession(id: string): Promise<OpenCodeSession> {
  return ocFetch(`/session/${id}`);
}

export async function deleteSession(id: string): Promise<void> {
  await ocFetch(`/session/${id}`, { method: "DELETE" });
}

export async function abortSession(id: string): Promise<void> {
  await ocFetch(`/session/${id}/abort`, { method: "POST" });
}

// ── Messages ─────────────────────────────────────────────────────────────────

export async function sendMessage(
  sessionId: string,
  text: string,
  options?: { model?: string; agent?: string }
): Promise<any> {
  const body: any = {
    parts: [{ type: "text", text }],
  };
  if (options?.model) body.model = options.model;
  if (options?.agent) body.agent = options.agent;
  return ocFetch(`/session/${sessionId}/message`, { method: "POST", body: JSON.stringify(body) });
}

export async function listMessages(sessionId: string, limit?: number): Promise<OpenCodeMessage[]> {
  const qs = limit ? `?limit=${limit}` : "";
  const data = await ocFetch(`/session/${sessionId}/message${qs}`);
  return Array.isArray(data) ? data : [];
}

// ── Diffs ────────────────────────────────────────────────────────────────────

export async function getDiffs(sessionId: string, messageID?: string): Promise<OpenCodeDiff[]> {
  const qs = messageID ? `?messageID=${messageID}` : "";
  const data = await ocFetch(`/session/${sessionId}/diff${qs}`);
  // Normalize: OC may return various shapes
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && data.diffs) return data.diffs;
  return [];
}

// ── Permissions ──────────────────────────────────────────────────────────────

export async function respondToPermission(
  sessionId: string,
  permissionId: string,
  approve: boolean
): Promise<void> {
  await ocFetch(`/session/${sessionId}/permissions/${permissionId}`, {
    method: "POST",
    body: JSON.stringify({ approve }),
  });
}

// ── Agents ───────────────────────────────────────────────────────────────────

export async function listAgents(): Promise<OpenCodeAgent[]> {
  const data = await ocFetch("/agent");
  return Array.isArray(data) ? data : [];
}

// ── Children Sessions ────────────────────────────────────────────────────────

export async function getChildSessions(sessionId: string): Promise<OpenCodeSession[]> {
  const data = await ocFetch(`/session/${sessionId}/children`);
  return Array.isArray(data) ? data : [];
}

export { OpenCodeClientError };
