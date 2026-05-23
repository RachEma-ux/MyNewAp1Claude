/**
 * AI Agent Studio — Provider/Model Binding picker.
 *
 * Plan v3 Phase 14. The "Bind to AI Types" UI per migration spec
 * §3 + Plan v3 Phase 14 checklist.
 *
 * What this page does:
 *   - Lists provider/model pairs available from the AI Types catalog
 *     (read-only, no credentials).
 *   - Lists active Provider Connections for the selected provider
 *     (also no credentials).
 *   - Saves a binding row referencing both. The save call goes through
 *     the Phase 12 gateway action which calls the Phase 8 eligibility
 *     gate — degraded / unreachable / validated-only connections are
 *     rejected with a stable reason code.
 *
 * What this page does NOT do:
 *   - It does not collect or display any credential. Per Decision D2,
 *     credentials live behind Provider Connections / Model Access.
 *   - It does not call the upstream provider. The "Test connection"
 *     button (Phase 13 split) is intentionally a separate action.
 */

import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Link as LinkIcon, AlertTriangle, RefreshCw } from "lucide-react";
import {
  PageHeader,
  LoadingState,
  SectionLabel,
} from "../components/ui";

interface AvailableProviderModel {
  providerCatalogEntryId: number | null;
  providerId: number;
  providerSlug: string;
  providerName: string;
  providerType: string;
  modelCatalogEntryId: number | null;
  modelId: number;
  modelRef: string;
  modelDisplayName: string | null;
  capabilities: string[];
}

interface ProviderConnectionRef {
  providerConnectionId: number;
  providerCatalogEntryId: number;
  workspaceId: number;
  lifecycleStatus: "active" | "validated";
  healthStatus: "ok" | "unreachable" | "unknown";
  modelCount: number;
  capabilities: string[];
  selectable: boolean;
  degradedReason?: "provider_health_unknown";
}

interface BindingRow {
  id: number;
  workspaceId: number;
  agentId: number;
  draftId: number;
  role: string;
  providerCatalogEntryId: number | null;
  modelCatalogEntryId: number | null;
  providerConnectionId: number | null;
  modelRef: string;
  status: "binding_v1" | "legacy_unresolved" | "disabled" | "archived";
  statusReason:
    | "legacy_raw_api_key"
    | "legacy_env_var"
    | "legacy_no_credential"
    | "provider_slug_unknown"
    | "migration_skipped"
    | null;
  legacyEnvVarHint: string | null;
}

export default function AgentBindingPage({
  agentId,
  workspaceId = 1,
}: {
  agentId: number;
  workspaceId?: number;
}) {
  const utils = trpc.useUtils();

  const ctxQuery = trpc.agentStudio.providerBindings.pickerContext.useQuery({
    agentId,
  });
  const draftId = ctxQuery.data?.draftId ?? -1;
  // The actor id falls back to a sensible default; the actual user id is
  // applied server-side by the procedure context.
  const actorId = 1;

  const existingBinding = trpc.agentStudio.providerBindings.getForDraft.useQuery(
    {
      draftId,
      role: "primary",
    },
    { enabled: ctxQuery.data !== undefined && draftId > 0 },
  );

  const availableModels =
    trpc.agentStudio.providerBindings.pickerAvailableModels.useQuery({
      workspaceId,
    });

  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const [selectedModelRef, setSelectedModelRef] = useState<string>("");
  const [selectedConnectionId, setSelectedConnectionId] = useState<number | null>(
    null,
  );

  // Pre-populate from the existing binding when it loads.
  useEffect(() => {
    const b = existingBinding.data as BindingRow | null | undefined;
    if (!b) return;
    if (b.modelRef) setSelectedModelRef(b.modelRef);
    if (b.providerConnectionId) setSelectedConnectionId(b.providerConnectionId);
    const matchingModel = (availableModels.data as AvailableProviderModel[] | undefined)?.find(
      (m) => m.modelRef === b.modelRef,
    );
    if (matchingModel) setSelectedSlug(matchingModel.providerSlug);
  }, [existingBinding.data, availableModels.data]);

  // Picker passes the provider's catalog entry id; the resolver
  // joins through `catalog_entries.providerId` to filter
  // `provider_connections.providerId`. See `listActiveForProvider`
  // doc-comment for the canonical contract.
  const matchingProviderCatalogEntryId = useMemo(() => {
    const m = (availableModels.data as AvailableProviderModel[] | undefined)?.find(
      (x) => x.providerSlug === selectedSlug && x.modelRef === selectedModelRef,
    );
    return m?.providerCatalogEntryId ?? null;
  }, [availableModels.data, selectedSlug, selectedModelRef]);

  const activeConnections =
    trpc.agentStudio.providerBindings.pickerActiveConnections.useQuery(
      {
        workspaceId,
        providerCatalogEntryId: matchingProviderCatalogEntryId ?? -1,
      },
      { enabled: matchingProviderCatalogEntryId !== null },
    );

  const upsertMut = trpc.agentStudio.providerBindings.upsert.useMutation({
    onSuccess: () => {
      toast.success("Binding saved");
      utils.agentStudio.providerBindings.getForDraft.invalidate({
        draftId,
        role: "primary",
      });
      utils.agentStudio.providerBindings.validate.invalidate({
        draftId,
        role: "primary",
      });
    },
    onError: (err) => {
      toast.error(`Save failed: ${err.message}`);
    },
  });

  const validateQuery = trpc.agentStudio.providerBindings.validate.useQuery(
    { draftId, role: "primary" },
    { enabled: existingBinding.data !== undefined && existingBinding.data !== null },
  );

  const refreshMut =
    trpc.agentStudio.providerBindings.refreshValidation.useMutation({
      onSuccess: (res) => {
        if (res.ok) {
          toast.success("Binding revalidated");
        } else {
          toast.error(`Validation failed: ${res.reason ?? "unknown"}`);
        }
        utils.agentStudio.providerBindings.validate.invalidate({
          draftId,
          role: "primary",
        });
        utils.agentStudio.providerBindings.getForDraft.invalidate({
          draftId,
          role: "primary",
        });
      },
      onError: (err) => {
        toast.error(`Refresh failed: ${err.message}`);
      },
    });

  if (ctxQuery.isLoading || existingBinding.isLoading) return <LoadingState label="Loading binding…" />;
  if (ctxQuery.error) return <div className="text-sm text-destructive">{ctxQuery.error.message}</div>;

  const matchingModel = (availableModels.data as
    | AvailableProviderModel[]
    | undefined)?.find(
    (m) => m.providerSlug === selectedSlug && m.modelRef === selectedModelRef,
  );

  const handleSave = () => {
    if (!selectedSlug || !selectedModelRef) {
      toast.error("Pick a provider and a model");
      return;
    }
    if (!matchingModel) {
      toast.error("Selected model not found in AI Types catalog");
      return;
    }
    // Local providers don't need a Provider Connection.
    const isLocal = ["ollama", "llama.cpp", "llamacpp", "local"].includes(
      matchingModel.providerType.toLowerCase(),
    );
    if (!isLocal && !selectedConnectionId) {
      toast.error("Pick a Provider Connection (or pick a local provider)");
      return;
    }

    upsertMut.mutate({
      workspaceId,
      agentId,
      draftId,
      role: "primary",
      providerCatalogEntryId: matchingModel.providerCatalogEntryId,
      modelCatalogEntryId: matchingModel.modelCatalogEntryId,
      providerConnectionId: isLocal ? null : selectedConnectionId,
      modelRef: matchingModel.modelRef,
      status: "binding_v1",
      createdBy: actorId,
    });
  };

  const binding = existingBinding.data as BindingRow | null | undefined;
  const validation = validateQuery.data as
    | {
        ok: boolean;
        reason?: string;
        lastValidatedAt?: string | Date | null;
        staleAtCallTime?: boolean;
      }
    | undefined;
  const lastValidatedAt = (() => {
    const raw = validation?.lastValidatedAt;
    if (!raw) return null;
    const d = typeof raw === "string" ? new Date(raw) : raw;
    return isNaN(d.getTime()) ? null : d;
  })();

  return (
    <div className="space-y-4">
      <PageHeader
        icon={<LinkIcon className="h-5 w-5" />}
        title="Bind to AI Types Catalog"
        description="Select a provider/model pair and an active Provider Connection. Credentials are not entered here — they live in Provider Connections."
      />

      {binding && binding.status === "legacy_unresolved" && (
        <Card className="border-amber-500/40 bg-amber-500/10">
          <CardContent className="py-3 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
              <div className="space-y-1">
                <div className="font-medium">Legacy binding — operator action required.</div>
                <div className="text-xs text-muted-foreground">
                  Reason: <code>{binding.statusReason ?? "unknown"}</code>
                  {binding.legacyEnvVarHint && (
                    <>
                      {" "}
                      · referenced env var <code>{binding.legacyEnvVarHint}</code>
                    </>
                  )}
                </div>
                <div className="text-xs">
                  Migrated from a prior `providerConfig` shape during the Plan v3 Phase 10 run. Pick a
                  Provider Connection below to resolve, then save.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-1">
            <SectionLabel>Provider</SectionLabel>
            <select
              className="w-full rounded border bg-background p-2 text-sm"
              value={selectedSlug}
              onChange={(e) => {
                setSelectedSlug(e.target.value);
                setSelectedModelRef("");
                setSelectedConnectionId(null);
              }}
            >
              <option value="">— Pick a provider —</option>
              {Array.from(
                new Map(
                  ((availableModels.data as AvailableProviderModel[] | undefined) ?? []).map(
                    (m) => [m.providerSlug, m.providerName],
                  ),
                ).entries(),
              ).map(([slug, name]) => (
                <option key={slug} value={slug}>
                  {name} ({slug})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <SectionLabel>Model</SectionLabel>
            <select
              className="w-full rounded border bg-background p-2 text-sm"
              value={selectedModelRef}
              onChange={(e) => setSelectedModelRef(e.target.value)}
              disabled={!selectedSlug}
            >
              <option value="">— Pick a model —</option>
              {((availableModels.data as AvailableProviderModel[] | undefined) ?? [])
                .filter((m) => m.providerSlug === selectedSlug)
                .map((m) => (
                  <option key={`${m.providerSlug}/${m.modelRef}`} value={m.modelRef}>
                    {m.modelDisplayName ?? m.modelRef}
                    {m.capabilities.length > 0 && ` · ${m.capabilities.join(", ")}`}
                  </option>
                ))}
            </select>
          </div>

          <div className="space-y-1">
            <SectionLabel>Provider Connection</SectionLabel>
            {matchingProviderCatalogEntryId === null ? (
              <div className="text-xs text-muted-foreground">
                Pick a model above to see active connections.
              </div>
            ) : (
              <>
                <select
                  className="w-full rounded border bg-background p-2 text-sm"
                  value={selectedConnectionId ?? ""}
                  onChange={(e) =>
                    setSelectedConnectionId(
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                  disabled={activeConnections.isLoading}
                >
                  <option value="">— Pick a connection —</option>
                  {((activeConnections.data as ProviderConnectionRef[] | undefined) ?? []).map(
                    (c) => (
                      <option
                        key={c.providerConnectionId}
                        value={c.providerConnectionId}
                        disabled={!c.selectable}
                      >
                        Connection #{c.providerConnectionId} ·{" "}
                        {c.lifecycleStatus} · {c.healthStatus}
                        {c.degradedReason ? ` · ${c.degradedReason}` : ""}
                        {!c.selectable ? " · (not selectable)" : ""}
                      </option>
                    ),
                  )}
                </select>
                <div className="mt-1 text-xs text-muted-foreground">
                  Disabled options are validated-only / unreachable / missing-secret. Promote them in
                  Provider Connections before binding.
                </div>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button onClick={handleSave} disabled={upsertMut.isPending}>
              {upsertMut.isPending ? (
                <>
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Saving…
                </>
              ) : (
                "Save binding"
              )}
            </Button>
            {validation && (
              <Badge
                variant={
                  validation.ok && !validation.staleAtCallTime
                    ? "default"
                    : validation.staleAtCallTime
                      ? "secondary"
                      : "destructive"
                }
              >
                {validation.ok && !validation.staleAtCallTime
                  ? "Active"
                  : validation.staleAtCallTime
                    ? "Degraded: validation stale"
                    : `Blocked: ${validation.reason ?? "unknown"}`}
              </Badge>
            )}
            {binding && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    refreshMut.mutate({ draftId, role: "primary" })
                  }
                  disabled={refreshMut.isPending}
                >
                  {refreshMut.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" /> Refreshing…
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-3 w-3" /> Refresh validation
                    </>
                  )}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {lastValidatedAt
                    ? `Last validated at ${lastValidatedAt.toLocaleString()}`
                    : "Never validated since Phase 15 landed"}
                </span>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
