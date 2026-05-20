// CagAdminPanel — no-deferral continuation-33 slice 132.
//
// Closes the partial-consumer gap on `cag.{listPacks, refreshPack,
// listPackEvents}` — 3 unconsumed endpoints. All three share an
// `{workspaceId, agentId}` agent-context input, so the panel hoists
// that input to the top and each card consumes the resolved context.

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

interface AgentContext {
  workspaceId: number;
  agentId: number;
}

export function CagAdminPanel() {
  const [workspaceIdRaw, setWorkspaceIdRaw] = useState("");
  const [agentIdRaw, setAgentIdRaw] = useState("");

  const workspaceId = parsePositiveInt(workspaceIdRaw);
  const agentId = parsePositiveInt(agentIdRaw);
  const context: AgentContext | null =
    workspaceId !== null && agentId !== null
      ? { workspaceId, agentId }
      : null;

  return (
    <div className="space-y-4" data-testid="cag-panel">
      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Agent context</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="cag-workspace-id">Workspace id</Label>
              <Input
                id="cag-workspace-id"
                data-testid="cag-workspace-id"
                type="number"
                min={1}
                value={workspaceIdRaw}
                onChange={(e) => setWorkspaceIdRaw(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="cag-agent-id">Agent id</Label>
              <Input
                id="cag-agent-id"
                data-testid="cag-agent-id"
                type="number"
                min={1}
                value={agentIdRaw}
                onChange={(e) => setAgentIdRaw(e.target.value)}
              />
            </div>
          </div>
          {context === null ? (
            <p className="text-xs text-muted-foreground">
              Enter workspace id and agent id to load packs / events.
            </p>
          ) : null}
        </CardContent>
      </Card>
      <ListPacksCard context={context} />
      <RefreshPackCard context={context} />
      <ListPackEventsCard context={context} />
    </div>
  );
}

function ListPacksCard({ context }: { context: AgentContext | null }) {
  const query = trpc.agentStudio.cag.listPacks.useQuery(
    context ?? (undefined as never),
    { enabled: context !== null, refetchOnWindowFocus: false },
  );

  const rows = (query.data as Array<{
    id: number;
    packVersion: number;
    status?: string | null;
    createdAt?: Date | string;
    sourceManifestHash?: string | null;
  }> | undefined) ?? [];

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Packs</SectionLabel>
        {context === null ? (
          <p className="text-sm text-muted-foreground">
            Awaiting agent context.
          </p>
        ) : query.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : query.error ? (
          <p className="text-sm text-destructive" data-testid="cag-packs-error">
            {query.error.message}
          </p>
        ) : rows.length === 0 ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="cag-packs-empty"
          >
            No CAG packs built yet for this agent.
          </p>
        ) : (
          <ul className="space-y-1" data-testid="cag-packs-rows">
            {rows.map((r) => (
              <li
                key={r.id}
                className="rounded border bg-background p-2 font-mono text-xs"
                data-testid="cag-packs-row"
              >
                #{r.id} v{r.packVersion}
                {r.status ? ` · ${r.status}` : ""}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function RefreshPackCard({ context }: { context: AgentContext | null }) {
  const utils = trpc.useUtils();
  const mut = trpc.agentStudio.cag.refreshPack.useMutation({
    onSuccess: (res) => {
      const r = res as { packId: number; packVersion: number; warnings: string[] };
      toast.success(`Pack #${r.packId} v${r.packVersion} refreshed`);
      void utils.agentStudio.cag.listPacks.invalidate();
      void utils.agentStudio.cag.listPackEvents.invalidate();
    },
    onError: (err) =>
      toast.error(`Refresh failed: ${err.message ?? "unknown"}`),
  });

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Refresh pack</SectionLabel>
        <p className="text-xs text-muted-foreground">
          Force the resolver path: build → validate → reuse-on-hash-match
          → persist new version. Idempotent when source manifest hash
          matches the latest fresh pack.
        </p>
        <Button
          type="button"
          disabled={context === null || mut.isPending}
          onClick={() => context && mut.mutate(context)}
          data-testid="cag-refresh-button"
        >
          {mut.isPending ? "Refreshing…" : "Refresh pack"}
        </Button>
        {mut.data ? (
          <div
            className="rounded border bg-background p-2 font-mono text-xs"
            data-testid="cag-refresh-result"
          >
            <div>
              #{(mut.data as any).packId} v{(mut.data as any).packVersion}
            </div>
            {(mut.data as any).warnings?.length > 0 ? (
              <ul className="mt-1 text-yellow-600">
                {(mut.data as any).warnings.map((w: string, i: number) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ListPackEventsCard({ context }: { context: AgentContext | null }) {
  const [limitRaw, setLimitRaw] = useState("100");
  const limit = parsePositiveInt(limitRaw);
  const limitValid = limit !== null && limit <= 500;
  const enabled = context !== null && limitValid;

  const query = trpc.agentStudio.cag.listPackEvents.useQuery(
    enabled
      ? { workspaceId: context.workspaceId, agentId: context.agentId, limit }
      : (undefined as never),
    { enabled, refetchOnWindowFocus: false },
  );

  const rows = (query.data as Array<{
    id: number;
    eventType: string;
    eventSeverity?: string | null;
    createdAt?: Date | string;
    payload?: unknown;
  }> | undefined) ?? [];

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Recent pack events</SectionLabel>
        <div className="flex items-end gap-3">
          <div className="w-24">
            <Label htmlFor="cag-limit">Limit</Label>
            <Input
              id="cag-limit"
              data-testid="cag-events-limit"
              type="number"
              min={1}
              max={500}
              value={limitRaw}
              onChange={(e) => setLimitRaw(e.target.value)}
            />
          </div>
          {!limitValid && limitRaw.length > 0 ? (
            <p
              className="text-xs text-destructive"
              data-testid="cag-limit-error"
            >
              Must be 1–500
            </p>
          ) : null}
        </div>
        {context === null ? (
          <p className="text-sm text-muted-foreground">
            Awaiting agent context.
          </p>
        ) : !limitValid ? null : query.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : query.error ? (
          <p
            className="text-sm text-destructive"
            data-testid="cag-events-error"
          >
            {query.error.message}
          </p>
        ) : rows.length === 0 ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="cag-events-empty"
          >
            No events for this agent's draft pack.
          </p>
        ) : (
          <ul className="space-y-1" data-testid="cag-events-rows">
            {rows.map((r) => (
              <li
                key={r.id}
                className="rounded border bg-background p-2 font-mono text-xs"
                data-testid="cag-events-row"
              >
                #{r.id} {r.eventType}
                {r.eventSeverity ? ` · ${r.eventSeverity}` : ""}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
