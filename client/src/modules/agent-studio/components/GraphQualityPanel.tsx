// GraphQualityPanel — no-deferral continuation-26 slice 111.
//
// Closes the partial-consumer gap on `graphQuality.*` — 12 unconsumed
// endpoints (10 already consumed via existing surfaces incl.
// GraphQualityFindingsPage).
//
// Four functional groups consumed here:
//   - Dashboard (getOperatorDashboard)
//   - Scan (listRegisteredScanKinds + listScans + getScan + runScan)
//   - Agent (listAgentRuns + runAgent)
//   - Proposal lifecycle (getFinding + applyApprovedProposal +
//     approveAndApply + verifyProposalApply + listAppliedProposals)

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

export function GraphQualityPanel() {
  const [selectedScanId, setSelectedScanId] = useState<number | null>(null);
  const [findingIdInput, setFindingIdInput] = useState("");
  const [proposalIdInput, setProposalIdInput] = useState("");

  return (
    <div className="space-y-4" data-testid="graph-quality-panel">
      <DashboardSection />
      <ScansSection
        selectedScanId={selectedScanId}
        onSelectScan={setSelectedScanId}
      />
      <AgentRunsSection />
      <FindingsAndProposalsSection
        findingIdInput={findingIdInput}
        onFindingIdChange={setFindingIdInput}
        proposalIdInput={proposalIdInput}
        onProposalIdChange={setProposalIdInput}
      />
    </div>
  );
}

function DashboardSection() {
  const dashQuery =
    trpc.agentStudio.graphQuality.getOperatorDashboard.useQuery(undefined, {
      refetchOnWindowFocus: false,
    });

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <SectionLabel>Operator dashboard</SectionLabel>
        {dashQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : dashQuery.error ? (
          <p
            className="text-sm text-destructive"
            data-testid="gq-dashboard-error"
          >
            Dashboard failed: {dashQuery.error.message}
          </p>
        ) : dashQuery.data ? (
          <pre
            className="overflow-x-auto rounded bg-muted/40 p-2 font-mono text-[10px]"
            data-testid="gq-dashboard-json"
          >
            {JSON.stringify(dashQuery.data, null, 2)}
          </pre>
        ) : null}
      </CardContent>
    </Card>
  );
}

interface ScansSectionProps {
  readonly selectedScanId: number | null;
  readonly onSelectScan: (id: number | null) => void;
}

function ScansSection({ selectedScanId, onSelectScan }: ScansSectionProps) {
  const [scanKind, setScanKind] = useState("");
  const [scope, setScope] = useState("");
  const [sampleSize, setSampleSize] = useState("");

  const utils = trpc.useUtils();
  const kindsQuery =
    trpc.agentStudio.graphQuality.listRegisteredScanKinds.useQuery(undefined, {
      refetchOnWindowFocus: false,
    });
  const listQuery = trpc.agentStudio.graphQuality.listScans.useQuery(
    {},
    { refetchOnWindowFocus: false },
  );
  const detailQuery = trpc.agentStudio.graphQuality.getScan.useQuery(
    selectedScanId !== null ? { scanId: selectedScanId } : (undefined as never),
    {
      enabled: selectedScanId !== null,
      refetchOnWindowFocus: false,
    },
  );

  const parsedSample = sampleSize.trim() === "" ? undefined : parsePositiveInt(sampleSize);
  const sampleValid = sampleSize.trim() === "" || (parsedSample !== null && parsedSample !== undefined);
  const formValid = scanKind.trim().length > 0 && sampleValid;

  const runMut = trpc.agentStudio.graphQuality.runScan.useMutation({
    onSuccess: () => {
      toast.success(`Scan ${scanKind} started`);
      setScanKind("");
      setScope("");
      setSampleSize("");
      void utils.agentStudio.graphQuality.listScans.invalidate();
    },
    onError: (err) => toast.error(`Run scan failed: ${err.message ?? "unknown"}`),
  });

  function handleRun() {
    if (!formValid) return;
    runMut.mutate({
      scanKind: scanKind.trim(),
      ...(scope.trim() !== "" ? { scope: scope.trim() } : {}),
      ...(parsedSample !== undefined && parsedSample !== null
        ? { sampleSize: parsedSample }
        : {}),
    });
  }

  const kinds = (kindsQuery.data?.kinds ?? []) as ReadonlyArray<string>;
  const scans = (listQuery.data ?? []) as Array<{
    id: number;
    scanKind: string;
    status: string;
  }>;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Scans</SectionLabel>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Run scan</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="gq-scan-kind">Scan kind</Label>
              <select
                id="gq-scan-kind"
                data-testid="gq-scan-kind"
                className="w-full rounded border bg-background p-2 text-sm"
                value={scanKind}
                onChange={(e) => setScanKind(e.target.value)}
                disabled={kindsQuery.isLoading}
              >
                <option value="">(select a kind)</option>
                {kinds.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="gq-scan-scope">Scope (optional)</Label>
              <Input
                id="gq-scan-scope"
                data-testid="gq-scan-scope"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                maxLength={100}
              />
            </div>
            <div>
              <Label htmlFor="gq-scan-sample">Sample size (1-50000, optional)</Label>
              <Input
                id="gq-scan-sample"
                data-testid="gq-scan-sample"
                type="number"
                min={1}
                max={50000}
                value={sampleSize}
                onChange={(e) => setSampleSize(e.target.value)}
              />
            </div>
          </div>
          <Button
            type="button"
            disabled={!formValid || runMut.isPending}
            onClick={handleRun}
            data-testid="gq-scan-run"
          >
            {runMut.isPending ? "Running…" : "Run scan"}
          </Button>
        </div>

        {listQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : listQuery.error ? (
          <p
            className="text-sm text-destructive"
            data-testid="gq-scans-error"
          >
            List failed: {listQuery.error.message}
          </p>
        ) : scans.length === 0 ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="gq-scans-empty"
          >
            No scans yet.
          </p>
        ) : (
          <ul className="space-y-1" data-testid="gq-scans-list">
            {scans.map((s) => {
              const isSelected = s.id === selectedScanId;
              return (
                <li
                  key={s.id}
                  data-testid="gq-scan-row"
                  className={
                    "rounded border p-2 text-sm " +
                    (isSelected
                      ? "border-primary bg-primary/10"
                      : "bg-background")
                  }
                >
                  <button
                    type="button"
                    onClick={() => onSelectScan(s.id)}
                    className="flex w-full items-center gap-2 text-left"
                    data-testid="gq-scan-select"
                  >
                    <span className="font-mono text-xs">#{s.id}</span>
                    <span className="font-medium">{s.scanKind}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                      {s.status}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {selectedScanId !== null ? (
          <div
            className="rounded border bg-muted/20 p-3"
            data-testid="gq-scan-detail"
          >
            <SectionLabel>Scan #{selectedScanId}</SectionLabel>
            {detailQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : detailQuery.error ? (
              <p
                className="text-sm text-destructive"
                data-testid="gq-scan-detail-error"
              >
                {detailQuery.error.message}
              </p>
            ) : detailQuery.data ? (
              <pre
                className="overflow-x-auto rounded bg-background p-2 font-mono text-[10px]"
                data-testid="gq-scan-detail-json"
              >
                {JSON.stringify(detailQuery.data, null, 2)}
              </pre>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function AgentRunsSection() {
  const [agentKey, setAgentKey] = useState("");
  const [autoConvert, setAutoConvert] = useState(false);
  const [notifyMe, setNotifyMe] = useState(false);

  const utils = trpc.useUtils();
  const listQuery = trpc.agentStudio.graphQuality.listAgentRuns.useQuery(
    {},
    { refetchOnWindowFocus: false },
  );

  const runMut = trpc.agentStudio.graphQuality.runAgent.useMutation({
    onSuccess: () => {
      toast.success("Agent run started");
      setAgentKey("");
      void utils.agentStudio.graphQuality.listAgentRuns.invalidate();
    },
    onError: (err) =>
      toast.error(`Run agent failed: ${err.message ?? "unknown"}`),
  });

  function handleRun() {
    runMut.mutate({
      ...(agentKey.trim() !== "" ? { agentKey: agentKey.trim() } : {}),
      ...(autoConvert ? { autoConvertFindings: true } : {}),
      ...(notifyMe ? { notifyMe: true } : {}),
    });
  }

  const runs = (listQuery.data ?? []) as Array<{
    id: number;
    agentKey?: string | null;
    status: string;
  }>;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Agent runs</SectionLabel>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Run agent</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="gq-agent-key">Agent key (optional)</Label>
              <Input
                id="gq-agent-key"
                data-testid="gq-agent-key"
                value={agentKey}
                onChange={(e) => setAgentKey(e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  data-testid="gq-agent-auto-convert"
                  checked={autoConvert}
                  onChange={(e) => setAutoConvert(e.target.checked)}
                />
                Auto-convert findings
              </label>
            </div>
            <div className="flex items-end gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  data-testid="gq-agent-notify-me"
                  checked={notifyMe}
                  onChange={(e) => setNotifyMe(e.target.checked)}
                />
                Notify me
              </label>
            </div>
          </div>
          <Button
            type="button"
            disabled={runMut.isPending}
            onClick={handleRun}
            data-testid="gq-agent-run"
          >
            {runMut.isPending ? "Running…" : "Run agent"}
          </Button>
        </div>

        {listQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : listQuery.error ? (
          <p
            className="text-sm text-destructive"
            data-testid="gq-agent-runs-error"
          >
            {listQuery.error.message}
          </p>
        ) : runs.length === 0 ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="gq-agent-runs-empty"
          >
            No agent runs yet.
          </p>
        ) : (
          <ul className="space-y-1" data-testid="gq-agent-runs-list">
            {runs.map((r) => (
              <li
                key={r.id}
                data-testid="gq-agent-run-row"
                className="rounded border bg-background p-2 text-sm"
              >
                <span className="font-mono text-xs">#{r.id}</span>{" "}
                {r.agentKey ? (
                  <span className="font-medium">{r.agentKey}</span>
                ) : null}{" "}
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                  {r.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

interface FindingsAndProposalsProps {
  readonly findingIdInput: string;
  readonly onFindingIdChange: (s: string) => void;
  readonly proposalIdInput: string;
  readonly onProposalIdChange: (s: string) => void;
}

function FindingsAndProposalsSection({
  findingIdInput,
  onFindingIdChange,
  proposalIdInput,
  onProposalIdChange,
}: FindingsAndProposalsProps) {
  const [rationale, setRationale] = useState("");
  const [notifyMe, setNotifyMe] = useState(false);

  const utils = trpc.useUtils();
  const parsedFindingId = parsePositiveInt(findingIdInput);
  const parsedProposalId = parsePositiveInt(proposalIdInput);

  const findingQuery = trpc.agentStudio.graphQuality.getFinding.useQuery(
    parsedFindingId !== null
      ? { findingId: parsedFindingId }
      : (undefined as never),
    { enabled: parsedFindingId !== null, refetchOnWindowFocus: false },
  );

  const appliedQuery =
    trpc.agentStudio.graphQuality.listAppliedProposals.useQuery({}, {
      refetchOnWindowFocus: false,
    });

  const applyMut =
    trpc.agentStudio.graphQuality.applyApprovedProposal.useMutation({
      onSuccess: () => {
        toast.success(`Proposal #${parsedProposalId} applied`);
        setRationale("");
        void utils.agentStudio.graphQuality.listAppliedProposals.invalidate();
      },
      onError: (err) =>
        toast.error(`Apply failed: ${err.message ?? "unknown"}`),
    });
  const approveAndApplyMut =
    trpc.agentStudio.graphQuality.approveAndApply.useMutation({
      onSuccess: () => {
        toast.success(`Proposal #${parsedProposalId} approved + applied`);
        setRationale("");
        void utils.agentStudio.graphQuality.listAppliedProposals.invalidate();
      },
      onError: (err) =>
        toast.error(`Approve+apply failed: ${err.message ?? "unknown"}`),
    });
  const verifyMut =
    trpc.agentStudio.graphQuality.verifyProposalApply.useMutation({
      onSuccess: () => {
        toast.success(`Verify written for proposal #${parsedProposalId}`);
      },
      onError: (err) =>
        toast.error(`Verify failed: ${err.message ?? "unknown"}`),
    });

  function handleApply() {
    if (parsedProposalId === null) return;
    applyMut.mutate({
      proposalId: parsedProposalId,
      ...(notifyMe ? { notifyMe: true } : {}),
    });
  }
  function handleApproveAndApply() {
    if (parsedProposalId === null) return;
    approveAndApplyMut.mutate({
      proposalId: parsedProposalId,
      ...(rationale.trim() !== "" ? { rationale: rationale.trim() } : {}),
      ...(notifyMe ? { notifyMe: true } : {}),
    });
  }
  function handleVerify() {
    if (parsedProposalId === null) return;
    verifyMut.mutate({ proposalId: parsedProposalId });
  }

  const proposalValid = parsedProposalId !== null;
  const applied = (appliedQuery.data ?? []) as Array<{
    id: number;
    proposalId?: number | null;
    status?: string | null;
  }>;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Findings + applied proposals</SectionLabel>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Finding lookup</SectionLabel>
          <div>
            <Label htmlFor="gq-finding-id">Finding id</Label>
            <Input
              id="gq-finding-id"
              data-testid="gq-finding-id"
              type="number"
              min={1}
              value={findingIdInput}
              onChange={(e) => onFindingIdChange(e.target.value)}
            />
          </div>
          {parsedFindingId !== null ? (
            findingQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : findingQuery.error ? (
              <p
                className="text-sm text-destructive"
                data-testid="gq-finding-error"
              >
                {findingQuery.error.message}
              </p>
            ) : findingQuery.data ? (
              <pre
                className="overflow-x-auto rounded bg-background p-2 font-mono text-[10px]"
                data-testid="gq-finding-json"
              >
                {JSON.stringify(findingQuery.data, null, 2)}
              </pre>
            ) : null
          ) : null}
        </div>

        <div className="space-y-2 rounded border bg-muted/20 p-3">
          <SectionLabel>Proposal actions</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="gq-proposal-id">Proposal id</Label>
              <Input
                id="gq-proposal-id"
                data-testid="gq-proposal-id"
                type="number"
                min={1}
                value={proposalIdInput}
                onChange={(e) => onProposalIdChange(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="gq-proposal-rationale">Rationale (optional)</Label>
              <Input
                id="gq-proposal-rationale"
                data-testid="gq-proposal-rationale"
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                maxLength={2000}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              data-testid="gq-proposal-notify-me"
              checked={notifyMe}
              onChange={(e) => setNotifyMe(e.target.checked)}
            />
            Notify me
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={!proposalValid || applyMut.isPending}
              onClick={handleApply}
              data-testid="gq-proposal-apply"
            >
              {applyMut.isPending ? "Applying…" : "Apply approved"}
            </Button>
            <Button
              type="button"
              disabled={!proposalValid || approveAndApplyMut.isPending}
              onClick={handleApproveAndApply}
              data-testid="gq-proposal-approve-and-apply"
            >
              {approveAndApplyMut.isPending
                ? "Approving+applying…"
                : "Approve & apply"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!proposalValid || verifyMut.isPending}
              onClick={handleVerify}
              data-testid="gq-proposal-verify"
            >
              {verifyMut.isPending ? "Verifying…" : "Verify apply"}
            </Button>
          </div>
        </div>

        <div>
          <SectionLabel>Recent applied proposals</SectionLabel>
          {appliedQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : appliedQuery.error ? (
            <p
              className="text-sm text-destructive"
              data-testid="gq-applied-error"
            >
              {appliedQuery.error.message}
            </p>
          ) : applied.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="gq-applied-empty"
            >
              No applied proposals yet.
            </p>
          ) : (
            <ul
              className="space-y-1 text-xs"
              data-testid="gq-applied-list"
            >
              {applied.map((row) => (
                <li
                  key={row.id}
                  data-testid="gq-applied-row"
                  className="rounded border bg-background p-2 font-mono"
                >
                  #{row.id}
                  {row.proposalId != null ? ` · proposal ${row.proposalId}` : ""}
                  {row.status ? ` · ${row.status}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
