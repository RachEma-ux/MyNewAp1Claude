// SemanticEnrichmentPanel — no-deferral continuation-25 slice 108.
//
// Closes the partial-consumer gap on `semanticEnrichment.*` (8 unconsumed
// endpoints; 3 already consumed via existing single-promote surfaces).
//
// Three functional groups consumed here:
//   - Trigger (triggerRun)
//   - Run monitoring (listRecentRuns + getRunStats + listProposals)
//   - Candidate exploration (listKnownProposalKinds + listCandidatesByKind +
//     listRecentRejectionsByKind)
//   - Bulk promotion (promoteBulk)

import { useMemo, useState } from "react";
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

function parseConfidence(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : null;
}

interface RecentRunRow {
  id: number;
  proposalKind: string;
  status?: string | null;
  createdAt?: Date | string | null;
  acceptedCount?: number | null;
  totalCount?: number | null;
}

interface ProposalRow {
  id: number;
  status: string;
  proposalKind: string;
  confidence?: number | null;
  summary?: string | null;
}

export function SemanticEnrichmentPanel() {
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [explorationKind, setExplorationKind] = useState<string>("");
  const [explorationWorkspaceId, setExplorationWorkspaceId] = useState("");

  return (
    <div className="space-y-4" data-testid="semantic-enrichment-panel">
      <TriggerRunSection
        onRunSubmitted={(runId) => {
          setSelectedRunId(runId);
        }}
      />

      <RecentRunsSection
        selectedRunId={selectedRunId}
        onSelectRun={(id) => setSelectedRunId(id)}
      />

      {selectedRunId !== null ? (
        <RunDetailSection runId={selectedRunId} />
      ) : (
        <Card>
          <CardContent className="p-4">
            <p
              className="text-sm text-muted-foreground"
              data-testid="se-detail-empty"
            >
              Select a run to view its stats + proposals.
            </p>
          </CardContent>
        </Card>
      )}

      <KindExplorationSection
        proposalKind={explorationKind}
        onProposalKindChange={setExplorationKind}
        workspaceId={explorationWorkspaceId}
        onWorkspaceIdChange={setExplorationWorkspaceId}
      />
    </div>
  );
}

interface TriggerRunSectionProps {
  readonly onRunSubmitted: (runId: number) => void;
}

function TriggerRunSection({ onRunSubmitted }: TriggerRunSectionProps) {
  const kindsQuery =
    trpc.agentStudio.semanticEnrichment.listKnownProposalKinds.useQuery(
      undefined,
      { refetchOnWindowFocus: false },
    );
  const utils = trpc.useUtils();

  const [workspaceId, setWorkspaceId] = useState("");
  const [proposalKind, setProposalKind] = useState("");
  const [providerConnectionId, setProviderConnectionId] = useState("");
  const [modelRef, setModelRef] = useState("");
  const [actorId, setActorId] = useState("");
  const [minConfidence, setMinConfidence] = useState("");
  const [maxProposals, setMaxProposals] = useState("");

  const triggerMut = trpc.agentStudio.semanticEnrichment.triggerRun.useMutation(
    {
      onSuccess: (res) => {
        const runId =
          (res as { runId?: number }).runId ??
          (res as { run?: { id?: number } }).run?.id ??
          null;
        toast.success(`Run triggered${runId ? ` (#${runId})` : ""}`);
        if (runId != null) onRunSubmitted(runId);
        void utils.agentStudio.semanticEnrichment.listRecentRuns.invalidate();
      },
      onError: (err) => {
        toast.error(`Trigger run failed: ${err.message ?? "unknown"}`);
      },
    },
  );

  const parsedWorkspace = parsePositiveInt(workspaceId);
  const parsedProvider = parsePositiveInt(providerConnectionId);
  const parsedActor = parsePositiveInt(actorId);
  const parsedMin = minConfidence.trim() === "" ? undefined : parseConfidence(minConfidence);
  const minValid = minConfidence.trim() === "" || (parsedMin !== null && parsedMin !== undefined);
  const parsedMax = maxProposals.trim() === "" ? undefined : parsePositiveInt(maxProposals);
  const maxValid = maxProposals.trim() === "" || (parsedMax !== null && parsedMax !== undefined);

  const formValid =
    parsedWorkspace !== null &&
    proposalKind !== "" &&
    parsedProvider !== null &&
    modelRef.trim().length > 0 &&
    parsedActor !== null &&
    minValid &&
    maxValid;

  function handleTrigger() {
    if (!formValid) return;
    triggerMut.mutate({
      workspaceId: parsedWorkspace as number,
      proposalKind: proposalKind as never,
      providerConnectionId: parsedProvider as number,
      modelRef: modelRef.trim(),
      actorId: parsedActor as number,
      ...(parsedMin !== undefined && parsedMin !== null
        ? { minConfidence: parsedMin }
        : {}),
      ...(parsedMax !== undefined && parsedMax !== null
        ? { maxProposals: parsedMax }
        : {}),
    });
  }

  const kindOptions = (kindsQuery.data?.kinds ?? []) as ReadonlyArray<string>;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Trigger enrichment run</SectionLabel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="se-ws-id">Workspace id</Label>
            <Input
              id="se-ws-id"
              data-testid="se-trigger-workspace-id"
              type="number"
              min={1}
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="se-kind">Proposal kind</Label>
            <select
              id="se-kind"
              data-testid="se-trigger-kind"
              className="w-full rounded border bg-background p-2 text-sm"
              value={proposalKind}
              onChange={(e) => setProposalKind(e.target.value)}
              disabled={kindsQuery.isLoading}
            >
              <option value="">(select a kind)</option>
              {kindOptions.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="se-provider">Provider connection id</Label>
            <Input
              id="se-provider"
              data-testid="se-trigger-provider"
              type="number"
              min={1}
              value={providerConnectionId}
              onChange={(e) => setProviderConnectionId(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="se-model">Model ref</Label>
            <Input
              id="se-model"
              data-testid="se-trigger-model"
              value={modelRef}
              onChange={(e) => setModelRef(e.target.value)}
              placeholder="e.g. openai/gpt-4o-mini"
              maxLength={200}
            />
          </div>
          <div>
            <Label htmlFor="se-actor">Actor id</Label>
            <Input
              id="se-actor"
              data-testid="se-trigger-actor"
              type="number"
              min={1}
              value={actorId}
              onChange={(e) => setActorId(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="se-min-conf">Min confidence (0-1, optional)</Label>
            <Input
              id="se-min-conf"
              data-testid="se-trigger-min-confidence"
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={minConfidence}
              onChange={(e) => setMinConfidence(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="se-max-prop">Max proposals (optional)</Label>
            <Input
              id="se-max-prop"
              data-testid="se-trigger-max-proposals"
              type="number"
              min={1}
              value={maxProposals}
              onChange={(e) => setMaxProposals(e.target.value)}
            />
          </div>
        </div>
        <Button
          type="button"
          disabled={!formValid || triggerMut.isPending}
          onClick={handleTrigger}
          data-testid="se-trigger-button"
        >
          {triggerMut.isPending ? "Triggering…" : "Trigger run"}
        </Button>
      </CardContent>
    </Card>
  );
}

interface RecentRunsSectionProps {
  readonly selectedRunId: number | null;
  readonly onSelectRun: (id: number) => void;
}

function RecentRunsSection({
  selectedRunId,
  onSelectRun,
}: RecentRunsSectionProps) {
  const runsQuery = trpc.agentStudio.semanticEnrichment.listRecentRuns.useQuery(
    { limit: 50 },
    { refetchOnWindowFocus: false },
  );

  const runs = (runsQuery.data?.runs ?? []) as RecentRunRow[];

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Recent runs</SectionLabel>
        {runsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : runsQuery.error ? (
          <p
            className="text-sm text-destructive"
            data-testid="se-runs-error"
          >
            List failed: {runsQuery.error.message}
          </p>
        ) : runs.length === 0 ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="se-runs-empty"
          >
            No runs yet.
          </p>
        ) : (
          <ul className="space-y-1" data-testid="se-runs-list">
            {runs.map((r) => {
              const isSelected = r.id === selectedRunId;
              return (
                <li
                  key={r.id}
                  data-testid="se-run-row"
                  className={
                    "rounded border p-2 text-sm " +
                    (isSelected
                      ? "border-primary bg-primary/10"
                      : "bg-background")
                  }
                >
                  <button
                    type="button"
                    onClick={() => onSelectRun(r.id)}
                    className="flex w-full items-center gap-2 text-left"
                    data-testid="se-run-select"
                  >
                    <span className="font-mono text-xs">#{r.id}</span>
                    <span className="font-medium">{r.proposalKind}</span>
                    {r.status ? (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                        {r.status}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

interface RunDetailSectionProps {
  readonly runId: number;
}

function RunDetailSection({ runId }: RunDetailSectionProps) {
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedProposalIds, setSelectedProposalIds] = useState<Set<number>>(
    new Set(),
  );
  const [bulkRationale, setBulkRationale] = useState("");

  const utils = trpc.useUtils();
  const statsQuery = trpc.agentStudio.semanticEnrichment.getRunStats.useQuery(
    { runId },
    { refetchOnWindowFocus: false },
  );
  const proposalsQuery =
    trpc.agentStudio.semanticEnrichment.listProposals.useQuery(
      {
        runId,
        ...(statusFilter !== "" ? { status: statusFilter } : {}),
        limit: 100,
      },
      { refetchOnWindowFocus: false },
    );

  const promoteBulkMut =
    trpc.agentStudio.semanticEnrichment.promoteBulk.useMutation({
      onSuccess: () => {
        toast.success(`Bulk-promoted ${selectedProposalIds.size} proposal(s)`);
        setSelectedProposalIds(new Set());
        setBulkRationale("");
        void utils.agentStudio.semanticEnrichment.listProposals.invalidate({
          runId,
        });
        void utils.agentStudio.semanticEnrichment.getRunStats.invalidate({
          runId,
        });
      },
      onError: (err) => {
        toast.error(`Bulk promote failed: ${err.message ?? "unknown"}`);
      },
    });

  function toggleSelect(id: number) {
    setSelectedProposalIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleBulkPromote() {
    if (selectedProposalIds.size === 0) return;
    promoteBulkMut.mutate({
      proposalIds: Array.from(selectedProposalIds),
      ...(bulkRationale.trim() !== ""
        ? { decisionRationale: bulkRationale.trim() }
        : {}),
    });
  }

  const statsEnvelope = statsQuery.data;
  const proposals = (proposalsQuery.data?.proposals ?? []) as ProposalRow[];

  return (
    <div className="space-y-3" data-testid="se-detail">
      <Card>
        <CardContent className="space-y-2 p-4">
          <SectionLabel>Run #{runId} — stats</SectionLabel>
          {statsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading stats…</p>
          ) : statsQuery.error ? (
            <p
              className="text-sm text-destructive"
              data-testid="se-stats-error"
            >
              Stats failed: {statsQuery.error.message}
            </p>
          ) : statsEnvelope?.status === "not_found" ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="se-stats-not-found"
            >
              Run not found (stale link).
            </p>
          ) : statsEnvelope?.status === "ok" ? (
            <pre
              className="overflow-x-auto rounded bg-muted/40 p-2 font-mono text-[10px]"
              data-testid="se-stats-ok"
            >
              {JSON.stringify(statsEnvelope.stats, null, 2)}
            </pre>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Proposals</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="se-status-filter">Status filter (optional)</Label>
              <Input
                id="se-status-filter"
                data-testid="se-status-filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                placeholder="e.g. pending / rejected_below_threshold"
                maxLength={100}
              />
            </div>
          </div>
          {proposalsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : proposalsQuery.error ? (
            <p
              className="text-sm text-destructive"
              data-testid="se-proposals-error"
            >
              List failed: {proposalsQuery.error.message}
            </p>
          ) : proposals.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="se-proposals-empty"
            >
              No proposals for this filter.
            </p>
          ) : (
            <>
              <ul className="space-y-1" data-testid="se-proposals-list">
                {proposals.map((p) => {
                  const isSelected = selectedProposalIds.has(p.id);
                  return (
                    <li
                      key={p.id}
                      data-testid="se-proposal-row"
                      className="flex items-center gap-2 rounded border bg-background p-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        data-testid="se-proposal-checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(p.id)}
                      />
                      <span className="font-mono text-xs">#{p.id}</span>
                      <span className="font-medium">{p.proposalKind}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                        {p.status}
                      </span>
                      {p.confidence != null ? (
                        <span className="text-xs text-muted-foreground">
                          conf {p.confidence.toFixed(2)}
                        </span>
                      ) : null}
                      {p.summary ? (
                        <span className="flex-1 truncate text-xs text-muted-foreground">
                          {p.summary}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              {selectedProposalIds.size > 0 ? (
                <div
                  className="space-y-2 rounded border bg-muted/20 p-3"
                  data-testid="se-bulk-bar"
                >
                  <div className="text-xs">
                    {selectedProposalIds.size} selected
                  </div>
                  <Input
                    data-testid="se-bulk-rationale"
                    value={bulkRationale}
                    onChange={(e) => setBulkRationale(e.target.value)}
                    placeholder="Decision rationale (optional)"
                    maxLength={2000}
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      disabled={promoteBulkMut.isPending}
                      onClick={handleBulkPromote}
                      data-testid="se-bulk-promote"
                    >
                      {promoteBulkMut.isPending
                        ? "Promoting…"
                        : "Bulk promote"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSelectedProposalIds(new Set())}
                      data-testid="se-bulk-clear"
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface KindExplorationSectionProps {
  readonly proposalKind: string;
  readonly onProposalKindChange: (k: string) => void;
  readonly workspaceId: string;
  readonly onWorkspaceIdChange: (w: string) => void;
}

function KindExplorationSection({
  proposalKind,
  onProposalKindChange,
  workspaceId,
  onWorkspaceIdChange,
}: KindExplorationSectionProps) {
  const kindsQuery =
    trpc.agentStudio.semanticEnrichment.listKnownProposalKinds.useQuery(
      undefined,
      { refetchOnWindowFocus: false },
    );
  const parsedWorkspace = parsePositiveInt(workspaceId);

  const candidatesEnabled = proposalKind !== "" && parsedWorkspace !== null;
  const candidatesQuery =
    trpc.agentStudio.semanticEnrichment.listCandidatesByKind.useQuery(
      candidatesEnabled
        ? {
            proposalKind: proposalKind as never,
            workspaceId: parsedWorkspace as number,
            limit: 50,
          }
        : (undefined as never),
      { enabled: candidatesEnabled, refetchOnWindowFocus: false },
    );

  const rejectionsEnabled = proposalKind !== "";
  const rejectionsQuery =
    trpc.agentStudio.semanticEnrichment.listRecentRejectionsByKind.useQuery(
      rejectionsEnabled
        ? {
            proposalKind: proposalKind as never,
            runLimit: 20,
            rowLimit: 100,
          }
        : (undefined as never),
      { enabled: rejectionsEnabled, refetchOnWindowFocus: false },
    );

  const kindOptions = (kindsQuery.data?.kinds ?? []) as ReadonlyArray<string>;
  const candidates =
    ((candidatesQuery.data as { candidates?: ReadonlyArray<unknown> } | undefined)
      ?.candidates ?? []) as ReadonlyArray<{
      typeKey: string;
      id: number | string;
      summary?: string;
    }>;
  const rejections =
    ((rejectionsQuery.data as { rows?: ReadonlyArray<unknown> } | undefined)
      ?.rows ?? []) as ReadonlyArray<{
      id: number;
      proposalKind?: string;
      confidence?: number | null;
      reason?: string | null;
    }>;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Per-kind exploration</SectionLabel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="se-explore-kind">Proposal kind</Label>
            <select
              id="se-explore-kind"
              data-testid="se-explore-kind"
              className="w-full rounded border bg-background p-2 text-sm"
              value={proposalKind}
              onChange={(e) => onProposalKindChange(e.target.value)}
              disabled={kindsQuery.isLoading}
            >
              <option value="">(select a kind)</option>
              {kindOptions.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="se-explore-ws">Workspace id (for candidates)</Label>
            <Input
              id="se-explore-ws"
              data-testid="se-explore-workspace-id"
              type="number"
              min={1}
              value={workspaceId}
              onChange={(e) => onWorkspaceIdChange(e.target.value)}
            />
          </div>
        </div>

        <div>
          <SectionLabel>Candidates</SectionLabel>
          {!candidatesEnabled ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="se-candidates-disabled"
            >
              Pick a kind + workspace to see candidate rows.
            </p>
          ) : candidatesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : candidatesQuery.error ? (
            <p className="text-sm text-destructive">
              {candidatesQuery.error.message}
            </p>
          ) : candidates.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="se-candidates-empty"
            >
              No candidates for this kind + workspace.
            </p>
          ) : (
            <ul
              className="space-y-1 text-xs"
              data-testid="se-candidates-list"
            >
              {candidates.map((c) => (
                <li
                  key={`${c.typeKey}::${c.id}`}
                  data-testid="se-candidate-row"
                  className="rounded border bg-background p-2 font-mono"
                >
                  {c.typeKey}:{String(c.id)}
                  {c.summary ? (
                    <span className="ml-2 text-muted-foreground">
                      {c.summary}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <SectionLabel>Recent rejections</SectionLabel>
          {!rejectionsEnabled ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="se-rejections-disabled"
            >
              Pick a kind to see recent below-threshold rejections.
            </p>
          ) : rejectionsQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : rejectionsQuery.error ? (
            <p className="text-sm text-destructive">
              {rejectionsQuery.error.message}
            </p>
          ) : rejections.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="se-rejections-empty"
            >
              No rejections for this kind.
            </p>
          ) : (
            <ul
              className="space-y-1 text-xs"
              data-testid="se-rejections-list"
            >
              {rejections.map((r) => (
                <li
                  key={r.id}
                  data-testid="se-rejection-row"
                  className="rounded border bg-background p-2 font-mono"
                >
                  #{r.id}
                  {r.confidence != null
                    ? ` · conf ${r.confidence.toFixed(2)}`
                    : ""}
                  {r.reason ? ` · ${r.reason}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
