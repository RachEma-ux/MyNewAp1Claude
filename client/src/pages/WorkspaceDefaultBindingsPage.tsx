/**
 * Workspace Default Bindings — admin panel.
 *
 * PMB Phase 30.1c. Workspace admins set the default Provider Connection +
 * modelRef for each of the four roles in the D-WDB-4 lattice
 * (chat / embedding / tool / classifier). The four roles map to the
 * caller migrations from Phase 29 (LR-02 / LR-03 / LR-04 / LR-08).
 *
 * Each card shows the persisted state (if any) plus a small editor that
 * picks an active provider connection and accepts a free-text modelRef.
 * Save calls `agentStudio.workspaceDefaultBindings.upsert` (governed —
 * receipt required per D-WDB-7); Clear calls `.delete` (idempotent).
 *
 * Workspace scoping: the current workspace is sourced from
 * `useCurrentWorkspace()`. No credential material flows through the UI.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, RefreshCw, Save, Trash2 } from "lucide-react";

type Role = "chat" | "embedding" | "tool" | "classifier";

const ROLES: { role: Role; label: string; description: string }[] = [
  {
    role: "chat",
    label: "Chat",
    description:
      "Default model for chat completions when an agent has no explicit binding.",
  },
  {
    role: "embedding",
    label: "Embedding",
    description:
      "Default model for embedding generation (RAG ingest, KB indexing).",
  },
  {
    role: "tool",
    label: "Tool",
    description:
      "Default model for tool-use calls invoked through the operator hub.",
  },
  {
    role: "classifier",
    label: "Classifier",
    description:
      "Default model for system classifier calls (intent routing, policy gates).",
  },
];

export default function WorkspaceDefaultBindingsPage() {
  // Workspace 1 is the development default. Phase 31+ wires this to the
  // workspace selector once it's available app-wide.
  const workspaceId = 1;

  const {
    data: bindings,
    isLoading,
    refetch,
  } = trpc.agentStudio.workspaceDefaultBindings.listForWorkspace.useQuery({
    workspaceId,
  });
  const { data: connections } = trpc.providerConnections.list.useQuery({
    workspaceId,
  });
  const { data: catalogProviders } = trpc.catalogManage.list.useQuery({
    entryType: "provider",
  });

  const getProviderName = (providerId?: number) => {
    if (typeof providerId !== "number") return undefined;
    const entry = catalogProviders?.find((e: any) => e.id === providerId);
    return entry?.displayName ?? entry?.name;
  };

  const upsert = trpc.agentStudio.workspaceDefaultBindings.upsert.useMutation({
    onSuccess: () => {
      toast.success("Default binding saved");
      refetch();
    },
    onError: (err) => toast.error(`Save failed: ${err.message}`),
  });
  const remove = trpc.agentStudio.workspaceDefaultBindings.delete.useMutation({
    onSuccess: () => {
      toast.success("Default binding cleared");
      refetch();
    },
    onError: (err) => toast.error(`Clear failed: ${err.message}`),
  });

  const findBinding = (role: Role) =>
    bindings?.find((b: any) => b.role === role) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Workspace Default Bindings
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Default Provider Connection + model for each role. Used when an
            agent has no explicit binding.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {ROLES.map(({ role, label, description }) => (
            <RoleCard
              key={role}
              role={role}
              label={label}
              description={description}
              workspaceId={workspaceId}
              binding={findBinding(role)}
              connections={connections ?? []}
              getProviderName={getProviderName}
              onSave={(input) => upsert.mutate(input)}
              onClear={() => remove.mutate({ workspaceId, role })}
              saving={upsert.isPending}
              clearing={remove.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface RoleCardProps {
  role: Role;
  label: string;
  description: string;
  workspaceId: number;
  binding: {
    providerConnectionId: number;
    modelRef: string;
    providerCatalogEntryId: number | null;
  } | null;
  connections: Array<{
    id: number;
    providerId?: number;
    lifecycleStatus?: string;
  }>;
  getProviderName: (providerId?: number) => string | undefined;
  onSave: (input: {
    workspaceId: number;
    role: Role;
    providerConnectionId: number;
    modelRef: string;
  }) => void;
  onClear: () => void;
  saving: boolean;
  clearing: boolean;
}

function RoleCard({
  role,
  label,
  description,
  workspaceId,
  binding,
  connections,
  getProviderName,
  onSave,
  onClear,
  saving,
  clearing,
}: RoleCardProps) {
  const [providerConnectionId, setProviderConnectionId] = useState<number | "">(
    binding?.providerConnectionId ?? "",
  );
  const [modelRef, setModelRef] = useState<string>(binding?.modelRef ?? "");

  const activeConnections = connections.filter(
    (c) => c.lifecycleStatus === "active",
  );

  const handleSave = () => {
    if (typeof providerConnectionId !== "number") {
      toast.error("Pick a provider connection");
      return;
    }
    if (!modelRef.trim()) {
      toast.error("Enter a model reference");
      return;
    }
    onSave({
      workspaceId,
      role,
      providerConnectionId,
      modelRef: modelRef.trim(),
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{label}</CardTitle>
          {binding ? (
            <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">
              Configured
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-gray-500/10 text-gray-400 border-gray-500/20">
              Not configured
            </Badge>
          )}
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`pc-${role}`}>Provider Connection</Label>
          <select
            id={`pc-${role}`}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={providerConnectionId}
            onChange={(e) =>
              setProviderConnectionId(
                e.target.value === "" ? "" : Number(e.target.value),
              )
            }
          >
            <option value="">— Select a connection —</option>
            {activeConnections.map((c) => {
              const name = getProviderName(c.providerId);
              return (
                <option key={c.id} value={c.id}>
                  {name ? `${name} (#${c.id})` : `Connection #${c.id}`}
                </option>
              );
            })}
          </select>
          {activeConnections.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No active connections. Set one up in Provider Connections first.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`model-${role}`}>Model Reference</Label>
          <Input
            id={`model-${role}`}
            value={modelRef}
            onChange={(e) => setModelRef(e.target.value)}
            placeholder={
              role === "embedding" ? "text-embedding-3-small" : "gpt-4o-mini"
            }
          />
          <p className="text-xs text-muted-foreground">
            Free-text modelRef passed to the provider's model-access call.
          </p>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-1.5" />
            )}
            Save
          </Button>
          {binding && (
            <Button
              size="sm"
              variant="outline"
              onClick={onClear}
              disabled={clearing}
            >
              {clearing ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1.5" />
              )}
              Clear
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
