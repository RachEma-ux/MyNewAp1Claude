/**
 * Code Studio — OpenCode Normalized Types
 *
 * These types isolate OpenCode-specific shapes from the rest of the module.
 */

export interface OpenCodeHealthStatus {
  healthy: boolean;
  version?: string;
  error?: string;
}

export interface OpenCodeSession {
  id: string;
  title?: string;
  parentID?: string;
  createdAt?: string;
}

export interface OpenCodeMessage {
  id: string;
  role: string;
  parts: OpenCodeMessagePart[];
}

export interface OpenCodeMessagePart {
  type: "text" | "image" | "file" | "tool_call" | "tool_result";
  text?: string;
  toolName?: string;
  toolInput?: any;
  toolResult?: any;
}

export interface OpenCodeDiff {
  file: string;
  type: "add" | "modify" | "delete";
  content: string;
  linesAdded?: number;
  linesRemoved?: number;
}

export interface OpenCodePermissionRequest {
  id: string;
  type: string;
  toolName?: string;
  description?: string;
  input?: any;
}

export interface OpenCodeAgent {
  id: string;
  name: string;
  description?: string;
  mode?: "primary" | "subagent" | "all";
}

export interface OpenCodeEvent {
  type: string;
  data: any;
  timestamp?: string;
}

export interface OpenCodeConfig {
  url: string;
  username: string;
  password: string;
}
