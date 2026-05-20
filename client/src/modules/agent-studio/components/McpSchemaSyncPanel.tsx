// McpSchemaSyncPanel — no-deferral continuation-22 slice 99.
//
// Closes the UI-consumer gap for the `mcpSchemaSync.sync` governed
// mutation (Retrofit P11) — mirrors a caller-provided live snapshot
// of an MCP server's tools into `agsMcpToolKnowledge` +
// `agsKnowledgeUnits`. Returns a diff summary
// (`toolsAdded` / `toolsUpdated` / `toolsUnchanged` / `toolsMarkedUnavailable`
// + `changedToolNames`).
//
// Operator workflow: paste a live tools snapshot (JSON array of
// `{name, description?, inputSchema?}`), provide workspace + server +
// knowledge-source + actor ids, click Sync. The returned diff is
// pushed onto a session-local recent-syncs shelf (capped 10) so
// operator can review diffs across multiple servers without losing
// them on subsequent submissions.

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "./ui";

function parsePositiveInt(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

interface ToolSnapshot {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

function parseToolsArray(s: string): ToolSnapshot[] | null {
  const trimmed = s.trim();
  if (trimmed === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  if (parsed.length > 1000) return null;
  const out: ToolSnapshot[] = [];
  for (const entry of parsed) {
    if (entry === null || typeof entry !== "object") return null;
    const e = entry as Record<string, unknown>;
    const name = e.name;
    if (typeof name !== "string" || name.length === 0 || name.length > 256) {
      return null;
    }
    const description =
      typeof e.description === "string" ? e.description : undefined;
    const inputSchema =
      e.inputSchema !== undefined &&
      e.inputSchema !== null &&
      typeof e.inputSchema === "object" &&
      !Array.isArray(e.inputSchema)
        ? (e.inputSchema as Record<string, unknown>)
        : undefined;
    out.push({
      name,
      ...(description !== undefined ? { description } : {}),
      ...(inputSchema !== undefined ? { inputSchema } : {}),
    });
  }
  return out;
}

interface RecentSyncRow {
  readonly mcpServerId: string;
  readonly workspaceId: number;
  readonly toolsAdded: number;
  readonly toolsUpdated: number;
  readonly toolsUnchanged: number;
  readonly toolsMarkedUnavailable: number;
  readonly changedToolNames: ReadonlyArray<string>;
  readonly syncedAt: number;
}

export function McpSchemaSyncPanel() {
  const [workspaceId, setWorkspaceId] = useState("");
  const [mcpServerId, setMcpServerId] = useState("");
  const [knowledgeSourceId, setKnowledgeSourceId] = useState("");
  const [actorId, setActorId] = useState("");
  const [toolsJson, setToolsJson] = useState("[]");
  const [recent, setRecent] = useState<RecentSyncRow[]>([]);

  const parsedWorkspace = parsePositiveInt(workspaceId);
  const parsedKnowledgeSource = parsePositiveInt(knowledgeSourceId);
  const parsedActor = parsePositiveInt(actorId);
  const serverValid =
    mcpServerId.trim().length > 0 && mcpServerId.trim().length <= 128;
  const parsedTools = parseToolsArray(toolsJson);
  const toolsValid = parsedTools !== null;

  const formValid =
    parsedWorkspace !== null &&
    serverValid &&
    parsedKnowledgeSource !== null &&
    parsedActor !== null &&
    toolsValid;

  const syncMut = trpc.agentStudio.mcpSchemaSync.sync.useMutation({
    onSuccess: (res) => {
      toast.success(
        `Synced ${mcpServerId.trim()} — +${res.toolsAdded} / ~${res.toolsUpdated} / =${res.toolsUnchanged}`,
      );
      setRecent((prev) =>
        [
          {
            mcpServerId: res.mcpServerId,
            workspaceId: res.workspaceId,
            toolsAdded: res.toolsAdded,
            toolsUpdated: res.toolsUpdated,
            toolsUnchanged: res.toolsUnchanged,
            toolsMarkedUnavailable: res.toolsMarkedUnavailable,
            changedToolNames: res.changedToolNames,
            syncedAt: Date.now(),
          },
          ...prev,
        ].slice(0, 10),
      );
    },
    onError: (err) => {
      toast.error(`Sync failed: ${err.message ?? "unknown"}`);
    },
  });

  function handleSync() {
    if (!formValid) return;
    syncMut.mutate({
      workspaceId: parsedWorkspace as number,
      mcpServerId: mcpServerId.trim(),
      knowledgeSourceId: parsedKnowledgeSource as number,
      actorId: parsedActor as number,
      tools: parsedTools as ToolSnapshot[],
    });
  }

  return (
    <div className="space-y-4" data-testid="mcp-schema-sync-panel">
      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Sync MCP server tool snapshot</SectionLabel>
          <p className="text-xs text-muted-foreground">
            Paste the live tools snapshot exported from an MCP server probe.
            The sync mirrors tools into <code>agsMcpToolKnowledge</code> +{" "}
            <code>agsKnowledgeUnits</code> (idempotent on{" "}
            <code>(workspaceId, mcpServerId, toolName)</code>).
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="mss-ws-id">Workspace id</Label>
              <Input
                id="mss-ws-id"
                data-testid="mss-workspace-id"
                type="number"
                min={1}
                value={workspaceId}
                onChange={(e) => setWorkspaceId(e.target.value)}
                placeholder="e.g. 7"
              />
            </div>
            <div>
              <Label htmlFor="mss-server-id">MCP server id</Label>
              <Input
                id="mss-server-id"
                data-testid="mss-server-id"
                value={mcpServerId}
                onChange={(e) => setMcpServerId(e.target.value)}
                placeholder="e.g. acme-mcp-prod"
                maxLength={128}
              />
            </div>
            <div>
              <Label htmlFor="mss-ks-id">Knowledge source id</Label>
              <Input
                id="mss-ks-id"
                data-testid="mss-knowledge-source-id"
                type="number"
                min={1}
                value={knowledgeSourceId}
                onChange={(e) => setKnowledgeSourceId(e.target.value)}
                placeholder="ags_rac_sources.id for tool_knowledge"
              />
            </div>
            <div>
              <Label htmlFor="mss-actor-id">Actor id</Label>
              <Input
                id="mss-actor-id"
                data-testid="mss-actor-id"
                type="number"
                min={1}
                value={actorId}
                onChange={(e) => setActorId(e.target.value)}
                placeholder="operator user id"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="mss-tools">
              Tools (JSON array of{" "}
              <code>{"{name, description?, inputSchema?}"}</code>, max 1000)
            </Label>
            <textarea
              id="mss-tools"
              data-testid="mss-tools"
              className="w-full rounded border bg-background p-2 font-mono text-xs"
              rows={8}
              value={toolsJson}
              onChange={(e) => setToolsJson(e.target.value)}
              placeholder='[{"name": "search_docs", "description": "...", "inputSchema": {"type": "object"}}]'
            />
            {!toolsValid ? (
              <p
                className="mt-1 text-xs text-destructive"
                data-testid="mss-tools-error"
              >
                Tools must be a JSON array of {"{name, description?, inputSchema?}"}{" "}
                — non-empty name strings, ≤ 1000 entries, inputSchema must be an
                object when provided.
              </p>
            ) : (
              <p
                className="mt-1 text-xs text-muted-foreground"
                data-testid="mss-tools-count"
              >
                {parsedTools?.length ?? 0} tool
                {(parsedTools?.length ?? 0) === 1 ? "" : "s"} parsed.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              disabled={!formValid || syncMut.isPending}
              onClick={handleSync}
              data-testid="mss-sync-button"
            >
              {syncMut.isPending ? "Syncing…" : "Sync"}
            </Button>
            {!formValid ? (
              <span className="text-xs text-muted-foreground">
                Fill all ids (positive int) + server id + a valid tools array.
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {recent.length > 0 ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            <SectionLabel>Recent syncs (this session)</SectionLabel>
            <ul className="space-y-1" data-testid="mss-recent-list">
              {recent.map((r) => (
                <li
                  key={r.syncedAt}
                  data-testid="mss-recent-row"
                  className="rounded border bg-muted/20 p-2 text-xs"
                >
                  <p className="font-mono font-medium">
                    {r.mcpServerId}{" "}
                    <span className="text-muted-foreground">
                      (ws {r.workspaceId})
                    </span>
                  </p>
                  <p className="font-mono text-muted-foreground">
                    +{r.toolsAdded} added / ~{r.toolsUpdated} changed /{" "}
                    ={r.toolsUnchanged} unchanged
                    {r.toolsMarkedUnavailable > 0
                      ? ` / ↓${r.toolsMarkedUnavailable} unavailable`
                      : ""}
                  </p>
                  {r.changedToolNames.length > 0 ? (
                    <p className="font-mono text-[10px] text-muted-foreground">
                      changed: {r.changedToolNames.join(", ")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
