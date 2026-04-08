/**
 * AI Agent Studio — Tools Page
 *
 * Tool catalog, attach/remove, permission matrix, allowed/blocked actions,
 * approval flag, rate limits, audit, simulate call.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, PlayCircle, Wrench } from "lucide-react";
import {
  PageHeader,
  EmptyState,
  LoadingState,
} from "@/components/agent-studio/ui";

export default function AgentToolsPage({ agentId }: { agentId: number }) {
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
      // Tool changes drive readiness/governance — refresh shell summary
      utils.agentStudio.shell.getShellSummary.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMut = trpc.agentStudio.tools.updateBinding.useMutation({
    onSuccess: () => {
      toast.success("Updated");
      utils.agentStudio.tools.listBindings.invalidate({ agentId });
      // Permission/approval changes drive governance verdict — refresh shell
      utils.agentStudio.shell.getShellSummary.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });
  const simMut = trpc.agentStudio.tools.simulateCall.useMutation({
    onSuccess: (r) => toast.success(`Simulated: ${JSON.stringify(r.result).slice(0, 80)}`),
    onError: (e) => toast.error(e.message),
  });

  if (catalogQuery.isLoading || bindingsQuery.isLoading)
    return <LoadingState label="Loading tools…" />;

  const catalog = catalogQuery.data ?? [];
  const bindings = bindingsQuery.data ?? [];

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Tools"
        subtitle="Catalog of available tools and the agent's permission bindings"
        icon={<Wrench className="h-4 w-4" />}
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {/* Catalog */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold">Tool Catalog</h3>
          <ul className="space-y-2">
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
                  <div className="text-[10px] text-muted-foreground">{t.description}</div>
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
                      // Use catalog defaults so the user gets a sane starting state
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
          <h3 className="text-sm font-semibold">Attached Tools</h3>
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
                  onUpdate={(patch) => updateMut.mutate({ bindingId: b.id, ...patch })}
                  onSimulate={() =>
                    simMut.mutate({ agentId, toolKey: b.toolKey, payload: { test: true } })
                  }
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      </div>
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
  const [allowedInput, setAllowedInput] = useState((binding.allowedActions ?? []).join(", "));
  return (
    <li className="border rounded p-2 text-xs space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium">{binding.toolName}</div>
          <div className="text-[10px] text-muted-foreground font-mono">{binding.toolKey}</div>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onSimulate} title="Simulate call">
            <PlayCircle className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onRemove} title="Remove">
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
              allowedActions: allowedInput.split(",").map((s) => s.trim()).filter(Boolean),
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
