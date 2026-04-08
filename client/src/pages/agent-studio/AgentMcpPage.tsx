/**
 * AI Agent Studio — MCP Servers Page
 *
 * MCP (Model Context Protocol) server bindings. Mirrors openllm-agent2's
 * 4 transport types (stdio | sse | http | sdk). Each server provides tools
 * and resources to the agent at runtime.
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Trash2,
  Plug,
  Zap,
  Server,
  Power,
  PowerOff,
} from "lucide-react";
import {
  PageHeader,
  EmptyState,
  LoadingState,
  SectionLabel,
} from "@/components/agent-studio/ui";

const TRANSPORTS = [
  { value: "stdio", label: "stdio (subprocess)" },
  { value: "http", label: "http (HTTP transport)" },
  { value: "websocket", label: "websocket (long-lived WS)" },
  { value: "sse", label: "sse (server-sent events)" },
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

  // Phase 7: real connect / disconnect mutations. The server spawns the
  // child process / opens the HTTP client and stores the connection in
  // a per-process map. Status flips on the row are reflected here on
  // success via list invalidation.
  const connectMut = trpc.agentStudio.mcp.connect.useMutation({
    onSuccess: (r) => {
      if (r.status === "connected") {
        toast.success(`Connected — ${r.toolCount} tools discovered`);
      } else {
        toast.error(`Connection failed: ${r.error ?? "unknown"}`);
      }
      utils.agentStudio.mcp.list.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });
  const disconnectMut = trpc.agentStudio.mcp.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Disconnected");
      utils.agentStudio.mcp.list.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Phase 17c: OAuth connect flow ──
  // The user clicks "OAuth" on a server row → fills in authUrl/tokenUrl/
  // clientId/scopes → we call oauthInitiate which returns the
  // authorization URL → we open it in a new window → the static HTML
  // callback uses postMessage to send the code+state back to this tab
  // → we call oauthExchange which encrypts and stores the tokens.
  const [oauthModal, setOauthModal] = useState<{
    serverId: number;
    serverName: string;
  } | null>(null);
  const [oauthForm, setOauthForm] = useState({
    authorizationUrl: "",
    tokenUrl: "",
    clientId: "",
    clientSecret: "",
    scopes: "",
  });
  const oauthInitiateMut = trpc.agentStudio.mcp.oauthInitiate.useMutation({
    onSuccess: (r) => {
      // Open the provider's authorization URL in a new window. The
      // window will redirect to our static HTML callback which fires
      // postMessage back to this tab.
      window.open(r.authorizationUrl, "_blank", "width=600,height=700");
      toast.success("Authorization window opened — complete sign-in there");
    },
    onError: (e) => toast.error(e.message),
  });
  const oauthExchangeMut = trpc.agentStudio.mcp.oauthExchange.useMutation({
    onSuccess: () => {
      toast.success("OAuth tokens stored — ready to connect");
      setOauthModal(null);
      utils.agentStudio.mcp.list.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });

  // Listen for postMessage from the static OAuth callback page
  useEffect(() => {
    function onMessage(ev: MessageEvent) {
      if (ev.origin !== window.location.origin) return;
      const data = ev.data as { source?: string; code?: string; state?: string };
      if (data?.source !== "agent-studio-mcp-oauth") return;
      if (!data.code || !data.state || !oauthModal) return;
      oauthExchangeMut.mutate({
        serverId: oauthModal.serverId,
        code: data.code,
        state: data.state,
      });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [oauthModal, oauthExchangeMut]);

  function openOAuthModal(server: any) {
    setOauthModal({ serverId: server.id, serverName: server.name });
    setOauthForm({
      authorizationUrl: "",
      tokenUrl: "",
      clientId: "",
      clientSecret: "",
      scopes: "",
    });
  }
  function handleOAuthInitiate() {
    if (!oauthModal) return;
    if (
      !oauthForm.authorizationUrl ||
      !oauthForm.tokenUrl ||
      !oauthForm.clientId
    ) {
      toast.error("authorizationUrl, tokenUrl, and clientId are required");
      return;
    }
    oauthInitiateMut.mutate({
      serverId: oauthModal.serverId,
      config: {
        authorizationUrl: oauthForm.authorizationUrl,
        tokenUrl: oauthForm.tokenUrl,
        clientId: oauthForm.clientId,
        clientSecret: oauthForm.clientSecret || undefined,
        scopes: oauthForm.scopes
          ? oauthForm.scopes.split(/\s+/).filter(Boolean)
          : undefined,
      },
    });
  }

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
        subtitle="Model Context Protocol server bindings — 5 transports (stdio · http · websocket · sdk · sse). Phase 17 + 18 — full MCP unlock."
        icon={<Plug className="h-4 w-4" />}
        badges={
          <Badge variant="outline" className="text-[9px] uppercase tracking-wider ml-2">
            {servers.length} attached
          </Badge>
        }
      />

      {/* Phase 17 + 18 — runtime mode banner */}
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="p-3 text-[10px] text-muted-foreground space-y-1">
          <div className="font-semibold text-blue-300">
            MCP execution status (Phase 17 + 18)
          </div>
          <ul className="list-disc list-inside space-y-0.5">
            <li>
              <strong className="text-emerald-400">Simulation runs:</strong>{" "}
              MCP tools, prompts, and resources are FULLY executable.
              When the agent loop fires <code className="font-mono">mcp__server__tool</code>,{" "}
              <code className="font-mono">ListMcpResources</code>, or{" "}
              <code className="font-mono">ReadMcpResource</code>, the
              call goes to a real connected MCP server and the response
              appears in the trace.
            </li>
            <li>
              <strong className="text-emerald-400">Live runtime (openllm-agent2):</strong>{" "}
              Phase 18 patch in flight. The runtime adapter now sends{" "}
              <code className="font-mono">configure_session</code> with the
              MCP server list BEFORE the first message frame, so a patched
              upstream injects MCP into its tool universe. Feature
              detection: if the upstream is un-patched, the adapter waits
              2 seconds for the <code className="font-mono">session_configured</code>{" "}
              ack, then proceeds without MCP — backward compatible.
              The runs page <code className="font-mono">mcpInjection</code>{" "}
              field shows whether the ack arrived (sent / acked / serverCount /
              toolCount). Live MCP injection becomes effective once the{" "}
              <code className="font-mono">openllm-agent2</code> Phase 18
              fork is deployed.
            </li>
            <li>
              <strong>Auto-reconnect:</strong> servers in error state are
              retried every 60s with exponential backoff up to 5 min.
            </li>
            <li>
              <strong>OAuth tokens:</strong> stored encrypted at rest via
              the platform encryption helpers, decrypted server-side
              before being injected as <code className="font-mono">Authorization</code>{" "}
              headers on the live <code className="font-mono">configure_session</code>{" "}
              wire.
            </li>
          </ul>
        </CardContent>
      </Card>

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
                        {/* Phase 7: Connect / Disconnect */}
                        {s.status !== "connected" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-emerald-400"
                            title="Connect — spawn the process / open the socket"
                            onClick={() =>
                              connectMut.mutate({ serverId: s.id })
                            }
                            disabled={connectMut.isPending}
                          >
                            {connectMut.isPending &&
                            connectMut.variables?.serverId === s.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Power className="h-3 w-3" />
                            )}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 text-red-400"
                            title="Disconnect — kill the process / close the socket"
                            onClick={() =>
                              disconnectMut.mutate({ serverId: s.id })
                            }
                            disabled={disconnectMut.isPending}
                          >
                            {disconnectMut.isPending &&
                            disconnectMut.variables?.serverId === s.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <PowerOff className="h-3 w-3" />
                            )}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1.5 text-[9px]"
                          title="Connect with OAuth (Phase 17c)"
                          onClick={() => openOAuthModal(s)}
                        >
                          OAuth
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          title="Test connection (deterministic stub)"
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

      {/* Phase 17c: OAuth modal */}
      {oauthModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-xl">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  OAuth · {oauthModal.serverName}
                </h3>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[10px]"
                  onClick={() => setOauthModal(null)}
                >
                  Cancel
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Generic OAuth 2.0 + PKCE. After clicking "Open Sign-in",
                a new window opens to the provider. Once you authorize,
                the static callback page sends the code back to this tab
                and the tokens are stored encrypted.
              </p>
              <Field label="Authorization URL">
                <Input
                  value={oauthForm.authorizationUrl}
                  onChange={(e) =>
                    setOauthForm({ ...oauthForm, authorizationUrl: e.target.value })
                  }
                  placeholder="https://provider.com/oauth/authorize"
                  className="h-7 text-xs font-mono"
                />
              </Field>
              <Field label="Token URL">
                <Input
                  value={oauthForm.tokenUrl}
                  onChange={(e) =>
                    setOauthForm({ ...oauthForm, tokenUrl: e.target.value })
                  }
                  placeholder="https://provider.com/oauth/token"
                  className="h-7 text-xs font-mono"
                />
              </Field>
              <Field label="Client ID">
                <Input
                  value={oauthForm.clientId}
                  onChange={(e) =>
                    setOauthForm({ ...oauthForm, clientId: e.target.value })
                  }
                  className="h-7 text-xs font-mono"
                />
              </Field>
              <Field label="Client Secret (optional for public clients)">
                <Input
                  type="password"
                  value={oauthForm.clientSecret}
                  onChange={(e) =>
                    setOauthForm({ ...oauthForm, clientSecret: e.target.value })
                  }
                  className="h-7 text-xs font-mono"
                />
              </Field>
              <Field label="Scopes (space-separated)">
                <Input
                  value={oauthForm.scopes}
                  onChange={(e) =>
                    setOauthForm({ ...oauthForm, scopes: e.target.value })
                  }
                  placeholder="read:repo write:user"
                  className="h-7 text-xs font-mono"
                />
              </Field>
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  onClick={handleOAuthInitiate}
                  disabled={oauthInitiateMut.isPending || oauthExchangeMut.isPending}
                >
                  {oauthInitiateMut.isPending && (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  )}
                  Open Sign-in
                </Button>
              </div>
              {oauthExchangeMut.isPending && (
                <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Exchanging code for tokens…
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
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
