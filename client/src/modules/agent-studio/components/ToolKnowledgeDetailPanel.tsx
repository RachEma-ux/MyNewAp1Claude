// ToolKnowledgeDetailPanel — no-deferral continuation-38 slice 147.
//
// Closes the UI-consumer gap for toolKnowledge.getTool — the only
// unconsumed endpoint on the toolKnowledge router. Rendered as a
// sibling of ToolKnowledgePanel inside RetrofitPage's tool-knowledge
// tab.

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "./ui";

interface Props {
  workspaceId: number;
}

export function ToolKnowledgeDetailPanel({ workspaceId }: Props) {
  const [mcpServerId, setMcpServerId] = useState("");
  const [toolName, setToolName] = useState("");

  const enabled =
    mcpServerId.trim().length > 0 && toolName.trim().length > 0;
  const query = trpc.agentStudio.toolKnowledge.getTool.useQuery(
    enabled
      ? {
          workspaceId,
          mcpServerId: mcpServerId.trim(),
          toolName: toolName.trim(),
        }
      : (undefined as never),
    {
      enabled,
      refetchOnWindowFocus: false,
      retry: false,
    },
  );

  const row = query.data as
    | {
        id: number;
        toolName: string;
        mcpServerId: string;
        description?: string | null;
        inputSchemaJson?: unknown;
        outputSchemaJson?: unknown;
        lastSeenAt?: Date | string | null;
        firstSeenAt?: Date | string | null;
      }
    | undefined;

  return (
    <Card>
      <CardContent className="space-y-3 p-4" data-testid="tkd-panel">
        <SectionLabel>Tool knowledge detail</SectionLabel>
        <p className="text-xs text-muted-foreground">
          Per-tool drill-in into the mirrored MCP tool knowledge for
          this workspace. Pairs with the list above — copy a server
          id + tool name and look up the full schema + last-seen
          timestamps.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="tkd-server">MCP server id</Label>
            <Input
              id="tkd-server"
              data-testid="tkd-server-id"
              value={mcpServerId}
              onChange={(e) => setMcpServerId(e.target.value)}
              maxLength={128}
            />
          </div>
          <div>
            <Label htmlFor="tkd-tool">Tool name</Label>
            <Input
              id="tkd-tool"
              data-testid="tkd-tool-name"
              value={toolName}
              onChange={(e) => setToolName(e.target.value)}
              maxLength={256}
            />
          </div>
        </div>
        {!enabled ? (
          <p className="text-sm text-muted-foreground">
            Enter MCP server id + tool name to look up.
          </p>
        ) : query.isLoading ? (
          <p className="text-sm text-muted-foreground">Looking up…</p>
        ) : query.error ? (
          <p className="text-sm text-destructive" data-testid="tkd-error">
            {query.error.message}
          </p>
        ) : row ? (
          <div
            className="space-y-2 rounded border bg-background p-3 text-xs"
            data-testid="tkd-result"
          >
            <div className="font-mono">
              #{row.id} · {row.mcpServerId}/{row.toolName}
            </div>
            {row.description ? (
              <div className="text-muted-foreground">{row.description}</div>
            ) : null}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <div className="font-semibold">First seen:</div>
                <div className="font-mono">
                  {row.firstSeenAt
                    ? new Date(row.firstSeenAt).toISOString()
                    : "—"}
                </div>
              </div>
              <div>
                <div className="font-semibold">Last seen:</div>
                <div className="font-mono">
                  {row.lastSeenAt
                    ? new Date(row.lastSeenAt).toISOString()
                    : "—"}
                </div>
              </div>
            </div>
            {row.inputSchemaJson ? (
              <details>
                <summary className="cursor-pointer font-semibold">
                  Input schema
                </summary>
                <pre className="mt-1 overflow-auto rounded bg-muted/40 p-2 font-mono text-[10px]">
                  {JSON.stringify(row.inputSchemaJson, null, 2)}
                </pre>
              </details>
            ) : null}
            {row.outputSchemaJson ? (
              <details>
                <summary className="cursor-pointer font-semibold">
                  Output schema
                </summary>
                <pre className="mt-1 overflow-auto rounded bg-muted/40 p-2 font-mono text-[10px]">
                  {JSON.stringify(row.outputSchemaJson, null, 2)}
                </pre>
              </details>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
