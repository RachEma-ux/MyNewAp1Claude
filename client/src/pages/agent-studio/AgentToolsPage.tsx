/**
 * AI Agent Studio — Tools / Skills / Plugins Page
 *
 * Three tabs sharing one page:
 *   1. Tools    — 51 openllm tools (Phase 0c) + per-agent bindings
 *   2. Skills   — 19 vendored skills across 9 packs (Phase 0c) + per-agent attachments
 *   3. Plugins  — local plugin paths (Phase 0a/b)
 *
 * Catalog rendering uses the same shape across tabs: pick from a left-side
 * library, attach with sane defaults, manage on the right.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Loader2,
  Plus,
  Trash2,
  PlayCircle,
  Wrench,
  Sparkles,
  Plug,
  Package,
} from "lucide-react";
import {
  PageHeader,
  EmptyState,
  LoadingState,
  SectionLabel,
} from "@/components/agent-studio/ui";

export default function AgentToolsPage({ agentId }: { agentId: number }) {
  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Tools, Skills &amp; Plugins"
        subtitle="What this agent can invoke at runtime — tools, skills, and bundled plugins"
        icon={<Wrench className="h-4 w-4" />}
      />

      <Tabs defaultValue="tools">
        <TabsList>
          <TabsTrigger value="tools">
            <Wrench className="h-3.5 w-3.5 mr-1.5" /> Tools
          </TabsTrigger>
          <TabsTrigger value="skills">
            <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Skills
          </TabsTrigger>
          <TabsTrigger value="plugins">
            <Plug className="h-3.5 w-3.5 mr-1.5" /> Plugins
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tools">
          <ToolsTab agentId={agentId} />
        </TabsContent>
        <TabsContent value="skills">
          <SkillsTab agentId={agentId} />
        </TabsContent>
        <TabsContent value="plugins">
          <PluginsTab agentId={agentId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Tools tab (preserved from previous version) ────────────────────────────

function ToolsTab({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const catalogQuery = trpc.agentStudio.tools.listCatalog.useQuery();
  const bindingsQuery = trpc.agentStudio.tools.listBindings.useQuery({ agentId });

  const attachMut = trpc.agentStudio.tools.attach.useMutation({
    onSuccess: () => {
      toast.success("Tool attached");
      utils.agentStudio.tools.listBindings.invalidate({ agentId });
      utils.agentStudio.shell.getShellSummary.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });
  const removeMut = trpc.agentStudio.tools.remove.useMutation({
    onSuccess: () => {
      toast.success("Tool removed");
      utils.agentStudio.tools.listBindings.invalidate({ agentId });
      utils.agentStudio.shell.getShellSummary.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.agentStudio.tools.updateBinding.useMutation({
    onSuccess: () => {
      toast.success("Updated");
      utils.agentStudio.tools.listBindings.invalidate({ agentId });
      utils.agentStudio.shell.getShellSummary.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });
  const simMut = trpc.agentStudio.tools.simulateCall.useMutation({
    onSuccess: (r) =>
      toast.success(`Simulated: ${JSON.stringify(r.result).slice(0, 80)}`),
    onError: (e) => toast.error(e.message),
  });

  if (catalogQuery.isLoading || bindingsQuery.isLoading)
    return <LoadingState label="Loading tools…" />;

  const catalog = catalogQuery.data ?? [];
  const bindings = bindingsQuery.data ?? [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
      {/* Catalog */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>
            Tool Catalog{" "}
            <span className="text-muted-foreground/40 ml-1">
              · {catalog.length} available
            </span>
          </SectionLabel>
          <ul className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {catalog.map((t: any) => (
              <li
                key={t.key}
                className="border rounded p-2 text-xs flex items-center justify-between"
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="font-medium flex items-center gap-1">
                    {t.name}
                    {t.destructive && (
                      <Badge
                        variant="outline"
                        className="text-[9px] border-red-500/40 text-red-400"
                      >
                        destructive
                      </Badge>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {t.description}
                  </div>
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    <Badge variant="outline" className="text-[9px]">
                      {t.category}
                    </Badge>
                    {(t.defaultAllowedActions ?? []).map((a: string) => (
                      <Badge
                        key={a}
                        variant="outline"
                        className="text-[9px] border-emerald-500/30 text-emerald-400/80"
                      >
                        {a}
                      </Badge>
                    ))}
                    {(t.hardBlockedActions ?? []).map((a: string) => (
                      <Badge
                        key={a}
                        variant="outline"
                        className="text-[9px] border-red-500/30 text-red-400/80"
                      >
                        ✗ {a}
                      </Badge>
                    ))}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0"
                  onClick={() =>
                    attachMut.mutate({
                      agentId,
                      toolKey: t.key,
                      toolName: t.name,
                      allowedActions: t.defaultAllowedActions ?? [],
                      blockedActions: t.hardBlockedActions ?? [],
                      requiresApproval: t.defaultRequiresApproval ?? false,
                      auditRequired: true,
                    })
                  }
                >
                  <Plus className="h-3 w-3 mr-1" /> Attach
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Attached bindings */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>
            Attached Tools{" "}
            <span className="text-muted-foreground/40 ml-1">
              · {bindings.length}
            </span>
          </SectionLabel>
          {bindings.length === 0 ? (
            <EmptyState
              icon={<Wrench className="h-7 w-7" />}
              title="No tools attached"
              description="Pick a tool from the catalog to grant the agent access."
            />
          ) : (
            <ul className="space-y-2">
              {bindings.map((b: any) => (
                <BindingRow
                  key={b.id}
                  binding={b}
                  onRemove={() => removeMut.mutate({ bindingId: b.id })}
                  onUpdate={(patch) =>
                    updateMut.mutate({ bindingId: b.id, ...patch })
                  }
                  onSimulate={() =>
                    simMut.mutate({
                      agentId,
                      toolKey: b.toolKey,
                      payload: { test: true },
                    })
                  }
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BindingRow({
  binding,
  onRemove,
  onUpdate,
  onSimulate,
}: {
  binding: any;
  onRemove: () => void;
  onUpdate: (patch: { allowedActions?: string[]; requiresApproval?: boolean }) => void;
  onSimulate: () => void;
}) {
  const [allowedInput, setAllowedInput] = useState(
    (binding.allowedActions ?? []).join(", ")
  );
  return (
    <li className="border rounded p-2 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <div className="font-medium truncate">{binding.toolName}</div>
          <div className="text-[10px] text-muted-foreground font-mono truncate">
            {binding.toolKey}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={onSimulate}
            title="Simulate call"
          >
            <PlayCircle className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={onRemove}
            title="Remove"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-[10px] text-muted-foreground">Allowed actions</label>
        <input
          type="text"
          className="w-full h-7 px-2 rounded border bg-background text-[10px] font-mono"
          value={allowedInput}
          onChange={(e) => setAllowedInput(e.target.value)}
          onBlur={() =>
            onUpdate({
              allowedActions: allowedInput
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
      </div>
      <label className="flex items-center gap-2 text-[10px]">
        <input
          type="checkbox"
          checked={binding.requiresApproval}
          onChange={(e) => onUpdate({ requiresApproval: e.target.checked })}
        />
        Require approval before execution
      </label>
    </li>
  );
}

// ── Skills tab ──────────────────────────────────────────────────────────────

function SkillsTab({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const catalogQuery = trpc.agentStudio.skills.listCatalog.useQuery();
  const skillsQuery = trpc.agentStudio.skills.list.useQuery({ agentId });

  const attachMut = trpc.agentStudio.skills.attach.useMutation({
    onSuccess: () => {
      toast.success("Skill attached");
      utils.agentStudio.skills.list.invalidate({ agentId });
      utils.agentStudio.shell.getShellSummary.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });
  const removeMut = trpc.agentStudio.skills.remove.useMutation({
    onSuccess: () => {
      toast.success("Skill removed");
      utils.agentStudio.skills.list.invalidate({ agentId });
      utils.agentStudio.shell.getShellSummary.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });

  if (catalogQuery.isLoading || skillsQuery.isLoading)
    return <LoadingState label="Loading skills…" />;

  const catalog = catalogQuery.data;
  const attached = skillsQuery.data ?? [];
  const attachedKeys = new Set(attached.map((s: any) => `${s.packKey}/${s.skillKey}`));

  if (!catalog?.loaded) {
    return (
      <div className="mt-3">
        <EmptyState
          icon={<Sparkles className="h-7 w-7" />}
          title="Skill catalog not found"
          description="Run the sync script to vendor the openllm-skills repo into server/agent-studio/skills/"
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
      {/* Catalog grouped by pack */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>
            Skill Catalog{" "}
            <span className="text-muted-foreground/40 ml-1">
              · {catalog.skills.length} skills · {catalog.packs.length} packs · local
            </span>
          </SectionLabel>

          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
            {catalog.packs.map((pack) => {
              const packSkills = catalog.skills.filter(
                (s) => s.packKey === pack.key
              );
              if (packSkills.length === 0) return null;
              return (
                <div key={pack.key}>
                  <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/70 border-b pb-1 mb-1">
                    {pack.name}{" "}
                    <span className="text-muted-foreground/40 normal-case font-normal">
                      · {pack.description}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {packSkills.map((s) => {
                      const isAttached = attachedKeys.has(`${s.packKey}/${s.skillKey}`);
                      return (
                        <li
                          key={`${s.packKey}/${s.skillKey}`}
                          className="border rounded p-2 text-xs flex items-start justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="font-medium font-mono text-[10px]">
                              /{s.skillKey}
                            </div>
                            <div className="text-[10px] text-muted-foreground">
                              {s.description}
                            </div>
                            {s.allowedTools.length > 0 && (
                              <div className="flex items-center gap-1 mt-1 flex-wrap">
                                {s.allowedTools.map((t) => (
                                  <Badge
                                    key={t}
                                    variant="outline"
                                    className="text-[9px] border-blue-500/30 text-blue-400/80"
                                  >
                                    {t}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 shrink-0"
                            disabled={isAttached || attachMut.isPending}
                            onClick={() =>
                              attachMut.mutate({
                                agentId,
                                packKey: s.packKey,
                                skillKey: s.skillKey,
                                skillName: s.name,
                                allowedTools: s.allowedTools,
                              })
                            }
                          >
                            {isAttached ? (
                              "✓ Attached"
                            ) : (
                              <>
                                <Plus className="h-3 w-3 mr-1" /> Attach
                              </>
                            )}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Attached skills */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>
            Attached Skills{" "}
            <span className="text-muted-foreground/40 ml-1">
              · {attached.length}
            </span>
          </SectionLabel>
          {attached.length === 0 ? (
            <EmptyState
              icon={<Sparkles className="h-7 w-7" />}
              title="No skills attached"
              description="Pick a skill from the local catalog. Skills are invoked via /<name>."
            />
          ) : (
            <ul className="space-y-2">
              {attached.map((s: any) => (
                <li
                  key={s.id}
                  className="border rounded p-2 text-xs flex items-start justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{s.skillName}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {s.packKey} / {s.skillKey}
                    </div>
                    <div className="flex items-center gap-1 mt-1 flex-wrap">
                      {(s.allowedTools ?? []).map((t: string) => (
                        <Badge
                          key={t}
                          variant="outline"
                          className="text-[9px] border-blue-500/30 text-blue-400/80"
                        >
                          {t}
                        </Badge>
                      ))}
                      {s.requiresApproval && (
                        <Badge
                          variant="outline"
                          className="text-[9px] border-yellow-500/40 text-yellow-400"
                        >
                          requires approval
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 shrink-0"
                    onClick={() => removeMut.mutate({ skillId: s.id })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Plugins tab ─────────────────────────────────────────────────────────────

function PluginsTab({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const pluginsQuery = trpc.agentStudio.plugins.list.useQuery({ agentId });

  const saveMut = trpc.agentStudio.plugins.save.useMutation({
    onSuccess: () => {
      toast.success("Plugin saved");
      utils.agentStudio.plugins.list.invalidate({ agentId });
      utils.agentStudio.shell.getShellSummary.invalidate({ agentId });
      setNewPath("");
    },
    onError: (e) => toast.error(e.message),
  });
  const removeMut = trpc.agentStudio.plugins.remove.useMutation({
    onSuccess: () => {
      toast.success("Plugin removed");
      utils.agentStudio.plugins.list.invalidate({ agentId });
      utils.agentStudio.shell.getShellSummary.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });

  const [newPath, setNewPath] = useState("");

  if (pluginsQuery.isLoading) return <LoadingState label="Loading plugins…" />;

  const plugins = pluginsQuery.data ?? [];

  return (
    <Card className="mt-3">
      <CardContent className="p-4 space-y-3">
        <SectionLabel>
          Local Plugins{" "}
          <span className="text-muted-foreground/40 ml-1">
            · {plugins.length}
          </span>
        </SectionLabel>
        <p className="text-[10px] text-muted-foreground">
          Plugins are local directories that bundle skills/tools/commands. Mirrors
          openllm-agent2's <code className="font-mono">SdkPluginConfigSchema</code>
          (currently only the <code className="font-mono">local</code> type is
          supported).
        </p>

        <div className="flex items-center gap-2">
          <Input
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            placeholder="Absolute or relative plugin directory path"
            className="h-7 text-xs font-mono flex-1"
          />
          <Button
            size="sm"
            className="h-7"
            disabled={!newPath || saveMut.isPending}
            onClick={() =>
              saveMut.mutate({
                agentId,
                type: "local",
                path: newPath,
                enabled: true,
              })
            }
          >
            {saveMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            <Plus className="h-3 w-3 mr-1" /> Add Plugin
          </Button>
        </div>

        {plugins.length === 0 ? (
          <EmptyState
            icon={<Package className="h-7 w-7" />}
            title="No plugins attached"
            description="Add a plugin path above to load bundled skills, tools, or commands."
          />
        ) : (
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground/70 border-b">
              <tr>
                <th className="text-left py-1.5">Path</th>
                <th className="text-left py-1.5">Type</th>
                <th className="text-left py-1.5">Enabled</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {plugins.map((p: any) => (
                <tr key={p.id} className="border-t">
                  <td className="py-1.5 font-mono text-[10px]">{p.path}</td>
                  <td>
                    <Badge variant="outline" className="text-[9px]">
                      {p.type}
                    </Badge>
                  </td>
                  <td>
                    <Badge
                      variant="outline"
                      className={`text-[9px] ${
                        p.enabled
                          ? "border-emerald-500/40 text-emerald-400"
                          : "border-zinc-500/40 text-zinc-400"
                      }`}
                    >
                      {p.enabled ? "enabled" : "disabled"}
                    </Badge>
                  </td>
                  <td>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0"
                      onClick={() => removeMut.mutate({ pluginId: p.id })}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}
