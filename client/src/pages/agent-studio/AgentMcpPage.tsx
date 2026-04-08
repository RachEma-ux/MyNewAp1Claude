/**
 * AI Agent Studio — MCP Servers Page
 *
 * MCP (Model Context Protocol) server bindings. Mirrors openllm-agent2's
 * 4 transport types (stdio | sse | http | sdk). Each server provides tools
 * and resources to the agent at runtime.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Plug, Zap, Server } from "lucide-react";
import {
  PageHeader,
  EmptyState,
  LoadingState,
  SectionLabel,
} from "@/components/agent-studio/ui";

const TRANSPORTS = [
  { value: "stdio", label: "stdio (subprocess)" },
  { value: "sse", label: "sse (server-sent events)" },
  { value: "http", label: "http (HTTP transport)" },
  { value: "sdk", label: "sdk (in-process)" },
] as const;

const STATUS_COLORS: Record<string, string> = {
  pending: "border-zinc-500/40 text-zinc-400",
  connected: "border-emerald-500/40 text-emerald-400",
  disconnected: "border-yellow-500/40 text-yellow-400",
  error: "border-red-500/40 text-red-400",
};

export default function AgentMcpPage({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const serversQuery = trpc.agentStudio.mcp.list.useQuery({ agentId });

  const saveMut = trpc.agentStudio.mcp.save.useMutation({
    onSuccess: () => {
      toast.success("MCP server saved");
      utils.agentStudio.mcp.list.invalidate({ agentId });
      utils.agentStudio.shell.getShellSummary.invalidate({ agentId });
      // Reset form
      setNewName("");
      setNewCommand("");
      setNewArgs("");
      setNewUrl("");
      setNewEnv("");
    },
    onError: (e) => toast.error(e.message),
  });

  const removeMut = trpc.agentStudio.mcp.remove.useMutation({
    onSuccess: () => {
      toast.success("MCP server removed");
      utils.agentStudio.mcp.list.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });

  const testMut = trpc.agentStudio.mcp.testConnection.useMutation({
    onSuccess: (r) => toast.success(r.message),
    onError: (e) => toast.error(e.message),
  });

  // Form state
  const [newName, setNewName] = useState("");
  const [newTransport, setNewTransport] = useState<string>("stdio");
  const [newCommand, setNewCommand] = useState("");
  const [newArgs, setNewArgs] = useState(""); // newline-separated
  const [newUrl, setNewUrl] = useState("");
  const [newEnv, setNewEnv] = useState(""); // KEY=value per line

  if (serversQuery.isLoading) return <LoadingState label="Loading MCP servers…" />;

  const servers = serversQuery.data ?? [];

  const usesCommand = newTransport === "stdio" || newTransport === "http";
  const usesUrl = newTransport === "sse" || newTransport === "http";

  const handleAdd = () => {
    if (!newName) return;
    if (usesCommand && !newCommand && !usesUrl) {
      toast.error("Command is required for this transport");
      return;
    }
    if (usesUrl && !newUrl) {
      toast.error("URL is required for this transport");
      return;
    }

    // Parse args (one per line)
    const args = newArgs
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    // Parse env (KEY=value per line)
    const env: Record<string, string> = {};
    for (const line of newEnv.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
    }

    saveMut.mutate({
      agentId,
      name: newName,
      transport: newTransport as any,
      command: newCommand || undefined,
      args: args.length > 0 ? args : undefined,
      env: Object.keys(env).length > 0 ? env : undefined,
      url: newUrl || undefined,
    });
  };

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="MCP Servers"
        subtitle="Model Context Protocol server bindings — 4 transports (stdio · sse · http · sdk)"
        icon={<Plug className="h-4 w-4" />}
        badges={
          <Badge variant="outline" className="text-[9px] uppercase tracking-wider ml-2">
            {servers.length} attached
          </Badge>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Add Server form */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <SectionLabel icon={<Plus className="h-3 w-3" />}>
              Attach MCP Server
            </SectionLabel>

            <Field label="Name">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="my-mcp-server"
                className="h-8 text-xs"
              />
            </Field>

            <Field label="Transport">
              <select
                value={newTransport}
                onChange={(e) => setNewTransport(e.target.value)}
                className="h-8 px-2 rounded border bg-background text-xs w-full"
              >
                {TRANSPORTS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>

            {usesCommand && (
              <Field label="Command">
                <Input
                  value={newCommand}
                  onChange={(e) => setNewCommand(e.target.value)}
                  placeholder="e.g. /usr/bin/mcp-server"
                  className="h-8 text-xs font-mono"
                />
              </Field>
            )}

            {usesCommand && (
              <Field label="Args (one per line)">
                <Textarea
                  value={newArgs}
                  onChange={(e) => setNewArgs(e.target.value)}
                  placeholder="--config&#10;./mcp.json"
                  className="text-xs min-h-[60px] font-mono"
                />
              </Field>
            )}

            {usesUrl && (
              <Field label="URL">
                <Input
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://mcp.example.com/sse"
                  className="h-8 text-xs font-mono"
                />
              </Field>
            )}

            <Field label="Environment (KEY=value per line)">
              <Textarea
                value={newEnv}
                onChange={(e) => setNewEnv(e.target.value)}
                placeholder="API_KEY=secret&#10;LOG_LEVEL=info"
                className="text-xs min-h-[60px] font-mono"
              />
            </Field>

            <Button
              size="sm"
              onClick={handleAdd}
              disabled={!newName || saveMut.isPending}
              className="w-full"
            >
              {saveMut.isPending && (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              )}
              Attach Server
            </Button>
          </CardContent>
        </Card>

        {/* Server list */}
        <Card className="lg:col-span-2">
          <CardContent className="p-4 space-y-3">
            <SectionLabel>Attached Servers</SectionLabel>

            {servers.length === 0 ? (
              <EmptyState
                icon={<Server className="h-7 w-7" />}
                title="No MCP servers attached yet"
                description="Attach an MCP server to expose its tools and resources to this agent."
              />
            ) : (
              <ul className="space-y-2">
                {servers.map((s: any) => (
                  <li key={s.id} className="border rounded p-3 text-xs space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium flex items-center gap-2">
                          {s.name}
                          <Badge variant="outline" className="text-[9px] uppercase tracking-wider">
                            {s.transport}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`text-[9px] uppercase tracking-wider ${
                              STATUS_COLORS[s.status] ?? STATUS_COLORS.pending
                            }`}
                          >
                            {s.status}
                          </Badge>
                          {!s.enabled && (
                            <Badge
                              variant="outline"
                              className="text-[9px] border-zinc-500/40 text-zinc-400"
                            >
                              disabled
                            </Badge>
                          )}
                        </div>
                        {s.command && (
                          <div className="text-[10px] text-muted-foreground font-mono mt-1">
                            <span className="opacity-60">$</span> {s.command}{" "}
                            {(s.args ?? []).join(" ")}
                          </div>
                        )}
                        {s.url && (
                          <div className="text-[10px] text-muted-foreground font-mono mt-1">
                            {s.url}
                          </div>
                        )}
                        {Object.keys(s.env ?? {}).length > 0 && (
                          <div className="text-[10px] text-muted-foreground mt-1">
                            env:{" "}
                            <span className="font-mono opacity-80">
                              {Object.keys(s.env).join(", ")}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          title="Test connection"
                          onClick={() => testMut.mutate({ serverId: s.id })}
                          disabled={testMut.isPending}
                        >
                          <Zap className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={() => removeMut.mutate({ serverId: s.id })}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
        {label}
      </Label>
      {children}
    </div>
  );
}
