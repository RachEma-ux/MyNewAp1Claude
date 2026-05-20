/**
 * MCP Schema Sync admin page — no-deferral continuation-22 slice 99.
 *
 * Global Agent Studio page reachable at `/agent-studio/mcp-schema-sync`.
 * Closes the UI-consumer gap for the `mcpSchemaSync.sync` governed
 * mutation (Retrofit P11 tool-knowledge mirroring).
 */

import { Webhook } from "lucide-react";

import { PageHeader } from "../components/ui";
import { McpSchemaSyncPanel } from "../components/McpSchemaSyncPanel";

export default function McpSchemaSyncPage() {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="MCP Schema Sync"
        subtitle="Mirror an MCP server's live tools snapshot into ags_mcp_tool_knowledge + ags_knowledge_units. Idempotent on (workspaceId, mcpServerId, toolName); identical schemaHash → no UPDATE."
        icon={<Webhook className="h-5 w-5" />}
      />
      <McpSchemaSyncPanel />
    </div>
  );
}
