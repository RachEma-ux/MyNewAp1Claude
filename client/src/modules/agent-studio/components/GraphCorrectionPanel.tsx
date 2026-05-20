// GraphCorrectionPanel — no-deferral continuation-24 slice 105.
//
// Closes the partial-consumer gap on `graphCorrection.*` (10
// unconsumed lifecycle endpoints; the 2 retention endpoints already
// had a consumer via GraphCorrectionProposalsRetentionPanel).
//
// First true master-detail in the partial-consumer audit cycle:
// list + get + listAudit means the panel discovers proposals
// (operator-supplied id not required). Plus multi-row select for
// bulkApprove / bulkReject, and the NEW `requestRevision` lifecycle
// node (distinct from approve/reject — flips status to
// `revision_requested` without ending the lifecycle).

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "./ui";

const PROPOSAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "revision_requested",
  "withdrawn",
] as const;
type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

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

function parseJsonRecord(s: string): Record<string, unknown> | null {
  const trimmed = s.trim();
  if (trimmed === "") return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

interface ProposalRow {
  id: number;
  proposalKind: string;
  status: string;
  targetTypeKey?: string | null;
  targetId?: number | null;
  confidence?: number | null;
  proposedByUserId?: number | null;
  proposedByAgentId?: number | null;
}

export function GraphCorrectionPanel() {
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | "">("");
  const [proposalKindFilter, setProposalKindFilter] = useState("");
  const [limit, setLimit] = useState("50");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [detailId, setDetailId] = useState<number | null>(null);

  const parsedLimit = parsePositiveInt(limit);
  const limitValid = parsedLimit !== null && parsedLimit <= 500;

  const listInput = useMemo(
    () => ({
      ...(statusFilter !== "" ? { status: statusFilter } : {}),
      ...(proposalKindFilter.trim() !== ""
        ? { proposalKind: proposalKindFilter.trim() }
        : {}),
      ...(limitValid && parsedLimit !== 50
        ? { limit: parsedLimit as number }
        : {}),
    }),
    [statusFilter, proposalKindFilter, parsedLimit, limitValid],
  );

  const utils = trpc.useUtils();
  const listQuery = trpc.agentStudio.graphCorrection.list.useQuery(
    listInput,
    { refetchOnWindowFocus: false },
  );

  const rows = (listQuery.data ?? []) as ProposalRow[];

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function clearSelection() {
    setSelectedIds(new Set());
  }

  return (
    <div className="space-y-4" data-testid="graph-correction-panel">
      <SubmitSection
        onMutate={() => {
          void utils.agentStudio.graphCorrection.list.invalidate();
        }}
      />

      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>Filter proposals</SectionLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="gc-status">Status</Label>
              <select
                id="gc-status"
                data-testid="gc-status-filter"
                className="w-full rounded border bg-background p-2 text-sm"
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as ProposalStatus | "")
                }
              >
                <option value="">(all)</option>
                {PROPOSAL_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="gc-kind">Proposal kind</Label>
              <Input
                id="gc-kind"
                data-testid="gc-kind-filter"
                value={proposalKindFilter}
                onChange={(e) => setProposalKindFilter(e.target.value)}
                placeholder="any"
                maxLength={100}
              />
            </div>
            <div>
              <Label htmlFor="gc-limit">Limit (1-500)</Label>
              <Input
                id="gc-limit"
                data-testid="gc-limit"
                type="number"
                min={1}
                max={500}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <ListSection
        rows={rows}
        isLoading={listQuery.isLoading}
        error={listQuery.error}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onClearSelection={clearSelection}
        onSelectDetail={(id) => setDetailId(id)}
        detailId={detailId}
        onMutate={() => {
          void utils.agentStudio.graphCorrection.list.invalidate();
        }}
      />

      {detailId !== null ? (
        <DetailSection
          proposalId={detailId}
          onMutate={() => {
            void utils.agentStudio.graphCorrection.list.invalidate();
            void utils.agentStudio.graphCorrection.get.invalidate({
              proposalId: detailId,
            });
            void utils.agentStudio.graphCorrection.listAudit.invalidate({
              proposalId: detailId,
            });
          }}
        />
      ) : (
        <Card>
          <CardContent className="p-4">
            <p
              className="text-sm text-muted-foreground"
              data-testid="gc-detail-empty"
            >
              Click a proposal row to view detail + audit trail.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

interface SubmitSectionProps {
  readonly onMutate: () => void;
}

function SubmitSection({ onMutate }: SubmitSectionProps) {
  const [proposalKind, setProposalKind] = useState("");
  const [targetTypeKey, setTargetTypeKey] = useState("");
  const [targetId, setTargetId] = useState("");
  const [proposedChange, setProposedChange] = useState("{}");
  const [confidence, setConfidence] = useState("");
  const [rationale, setRationale] = useState("");

  const parsedTargetId =
    targetId.trim() === "" ? undefined : parsePositiveInt(targetId);
  const targetIdValid =
    targetId.trim() === "" || (parsedTargetId !== null && parsedTargetId !== undefined);
  const parsedConfidence =
    confidence.trim() === "" ? undefined : parseConfidence(confidence);
  const confidenceValid =
    confidence.trim() === "" ||
    (parsedConfidence !== null && parsedConfidence !== undefined);
  const parsedChange = parseJsonRecord(proposedChange);
  const formValid =
    proposalKind.trim().length > 0 &&
    parsedChange !== null &&
    targetIdValid &&
    confidenceValid;

  const submitMut = trpc.agentStudio.graphCorrection.submit.useMutation({
    onSuccess: () => {
      toast.success("Proposal submitted");
      setProposalKind("");
      setTargetTypeKey("");
      setTargetId("");
      setProposedChange("{}");
      setConfidence("");
      setRationale("");
      onMutate();
    },
    onError: (err) => {
      toast.error(`Submit failed: ${err.message ?? "unknown"}`);
    },
  });

  function handleSubmit() {
    if (!formValid) return;
    submitMut.mutate({
      proposalKind: proposalKind.trim(),
      ...(targetTypeKey.trim() !== ""
        ? { targetTypeKey: targetTypeKey.trim() }
        : {}),
      ...(parsedTargetId !== undefined && parsedTargetId !== null
        ? { targetId: parsedTargetId }
        : {}),
      proposedChange: parsedChange as Record<string, unknown>,
      ...(parsedConfidence !== undefined && parsedConfidence !== null
        ? { confidence: parsedConfidence }
        : {}),
      ...(rationale.trim() !== "" ? { rationale: rationale.trim() } : {}),
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Submit correction proposal</SectionLabel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="gc-submit-kind">Proposal kind</Label>
            <Input
              id="gc-submit-kind"
              data-testid="gc-submit-kind"
              value={proposalKind}
              onChange={(e) => setProposalKind(e.target.value)}
              placeholder="e.g. entity_rename / merge_duplicates"
              maxLength={100}
            />
          </div>
          <div>
            <Label htmlFor="gc-submit-confidence">
              Confidence (0–1, optional)
            </Label>
            <Input
              id="gc-submit-confidence"
              data-testid="gc-submit-confidence"
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={confidence}
              onChange={(e) => setConfidence(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="gc-submit-target-type">
              Target typeKey (optional)
            </Label>
            <Input
              id="gc-submit-target-type"
              data-testid="gc-submit-target-type"
              value={targetTypeKey}
              onChange={(e) => setTargetTypeKey(e.target.value)}
              placeholder="e.g. Concept"
              maxLength={100}
            />
          </div>
          <div>
            <Label htmlFor="gc-submit-target-id">Target id (optional)</Label>
            <Input
              id="gc-submit-target-id"
              data-testid="gc-submit-target-id"
              type="number"
              min={1}
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="gc-submit-change">Proposed change (JSON)</Label>
            <textarea
              id="gc-submit-change"
              data-testid="gc-submit-change"
              className="w-full rounded border bg-background p-2 font-mono text-xs"
              rows={4}
              value={proposedChange}
              onChange={(e) => setProposedChange(e.target.value)}
              placeholder='{"oldName": "Foo", "newName": "Bar"}'
            />
            {parsedChange === null ? (
              <p
                className="mt-1 text-xs text-destructive"
                data-testid="gc-submit-change-error"
              >
                Proposed change must be a JSON object.
              </p>
            ) : null}
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="gc-submit-rationale">Rationale (optional)</Label>
            <Input
              id="gc-submit-rationale"
              data-testid="gc-submit-rationale"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              maxLength={2000}
            />
          </div>
        </div>
        <Button
          type="button"
          disabled={!formValid || submitMut.isPending}
          onClick={handleSubmit}
          data-testid="gc-submit-button"
        >
          {submitMut.isPending ? "Submitting…" : "Submit proposal"}
        </Button>
      </CardContent>
    </Card>
  );
}

interface ListSectionProps {
  readonly rows: ReadonlyArray<ProposalRow>;
  readonly isLoading: boolean;
  readonly error: { message: string } | null;
  readonly selectedIds: Set<number>;
  readonly onToggleSelect: (id: number) => void;
  readonly onClearSelection: () => void;
  readonly onSelectDetail: (id: number) => void;
  readonly detailId: number | null;
  readonly onMutate: () => void;
}

function ListSection({
  rows,
  isLoading,
  error,
  selectedIds,
  onToggleSelect,
  onClearSelection,
  onSelectDetail,
  detailId,
  onMutate,
}: ListSectionProps) {
  const [bulkRationale, setBulkRationale] = useState("");

  const bulkApproveMut =
    trpc.agentStudio.graphCorrection.bulkApprove.useMutation({
      onSuccess: () => {
        toast.success(`Bulk-approved ${selectedIds.size} proposal(s)`);
        onClearSelection();
        setBulkRationale("");
        onMutate();
      },
      onError: (err) =>
        toast.error(`Bulk approve failed: ${err.message ?? "unknown"}`),
    });
  const bulkRejectMut = trpc.agentStudio.graphCorrection.bulkReject.useMutation({
    onSuccess: () => {
      toast.success(`Bulk-rejected ${selectedIds.size} proposal(s)`);
      onClearSelection();
      setBulkRationale("");
      onMutate();
    },
    onError: (err) =>
      toast.error(`Bulk reject failed: ${err.message ?? "unknown"}`),
  });

  function handleBulkApprove() {
    if (selectedIds.size === 0) return;
    bulkApproveMut.mutate({
      proposalIds: Array.from(selectedIds),
      ...(bulkRationale.trim() !== ""
        ? { rationale: bulkRationale.trim() }
        : {}),
    });
  }
  function handleBulkReject() {
    if (selectedIds.size === 0) return;
    bulkRejectMut.mutate({
      proposalIds: Array.from(selectedIds),
      ...(bulkRationale.trim() !== ""
        ? { rationale: bulkRationale.trim() }
        : {}),
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Proposals</SectionLabel>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : error ? (
          <p
            className="text-sm text-destructive"
            data-testid="gc-list-error"
          >
            List failed: {error.message}
          </p>
        ) : rows.length === 0 ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="gc-list-empty"
          >
            No proposals match this filter.
          </p>
        ) : (
          <>
            <ul className="space-y-1" data-testid="gc-list">
              {rows.map((r) => {
                const isSelected = selectedIds.has(r.id);
                const isOnDetail = r.id === detailId;
                return (
                  <li
                    key={r.id}
                    data-testid="gc-list-row"
                    className={
                      "flex items-center gap-2 rounded border p-2 text-sm " +
                      (isOnDetail
                        ? "border-primary bg-primary/10"
                        : "bg-background")
                    }
                  >
                    <input
                      type="checkbox"
                      data-testid="gc-list-row-checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(r.id)}
                    />
                    <button
                      type="button"
                      onClick={() => onSelectDetail(r.id)}
                      className="flex flex-1 items-center gap-2 text-left"
                      data-testid="gc-list-row-select"
                    >
                      <span className="font-mono text-xs">#{r.id}</span>
                      <span className="font-medium">{r.proposalKind}</span>
                      <span
                        className={
                          "rounded px-1.5 py-0.5 text-[10px] font-medium " +
                          (r.status === "approved"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                            : r.status === "rejected"
                              ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                              : r.status === "revision_requested"
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                                : "bg-muted text-muted-foreground")
                        }
                      >
                        {r.status}
                      </span>
                      {r.targetTypeKey ? (
                        <span className="font-mono text-xs text-muted-foreground">
                          {r.targetTypeKey}:{r.targetId ?? "?"}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
            {selectedIds.size > 0 ? (
              <div
                className="space-y-2 rounded border bg-muted/20 p-3"
                data-testid="gc-bulk-bar"
              >
                <div className="text-xs">
                  {selectedIds.size} selected
                </div>
                <Input
                  data-testid="gc-bulk-rationale"
                  value={bulkRationale}
                  onChange={(e) => setBulkRationale(e.target.value)}
                  placeholder="Shared rationale (optional)"
                  maxLength={2000}
                />
                <div className="flex gap-2">
                  <Button
                    type="button"
                    disabled={bulkApproveMut.isPending}
                    onClick={handleBulkApprove}
                    data-testid="gc-bulk-approve"
                  >
                    {bulkApproveMut.isPending
                      ? "Approving…"
                      : "Bulk approve"}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={bulkRejectMut.isPending}
                    onClick={handleBulkReject}
                    data-testid="gc-bulk-reject"
                  >
                    {bulkRejectMut.isPending ? "Rejecting…" : "Bulk reject"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onClearSelection}
                    data-testid="gc-bulk-clear"
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
  );
}

interface DetailSectionProps {
  readonly proposalId: number;
  readonly onMutate: () => void;
}

function DetailSection({ proposalId, onMutate }: DetailSectionProps) {
  const [rationale, setRationale] = useState("");

  const detailQuery = trpc.agentStudio.graphCorrection.get.useQuery(
    { proposalId },
    { refetchOnWindowFocus: false },
  );
  const auditQuery = trpc.agentStudio.graphCorrection.listAudit.useQuery(
    { proposalId },
    {
      enabled: detailQuery.data !== undefined,
      refetchOnWindowFocus: false,
    },
  );

  const approveMut = trpc.agentStudio.graphCorrection.approve.useMutation({
    onSuccess: () => {
      toast.success(`Proposal #${proposalId} approved`);
      setRationale("");
      onMutate();
    },
    onError: (err) =>
      toast.error(`Approve failed: ${err.message ?? "unknown"}`),
  });
  const rejectMut = trpc.agentStudio.graphCorrection.reject.useMutation({
    onSuccess: () => {
      toast.success(`Proposal #${proposalId} rejected`);
      setRationale("");
      onMutate();
    },
    onError: (err) =>
      toast.error(`Reject failed: ${err.message ?? "unknown"}`),
  });
  const reviseMut = trpc.agentStudio.graphCorrection.requestRevision.useMutation({
    onSuccess: () => {
      toast.success(`Revision requested on #${proposalId}`);
      setRationale("");
      onMutate();
    },
    onError: (err) =>
      toast.error(`Request revision failed: ${err.message ?? "unknown"}`),
  });
  const withdrawMut = trpc.agentStudio.graphCorrection.withdraw.useMutation({
    onSuccess: () => {
      toast.success(`Proposal #${proposalId} withdrawn`);
      setRationale("");
      onMutate();
    },
    onError: (err) =>
      toast.error(`Withdraw failed: ${err.message ?? "unknown"}`),
  });

  function maybeRationale(): { rationale?: string } {
    return rationale.trim() !== "" ? { rationale: rationale.trim() } : {};
  }
  function handleApprove() {
    approveMut.mutate({ proposalId, ...maybeRationale() });
  }
  function handleReject() {
    rejectMut.mutate({ proposalId, ...maybeRationale() });
  }
  function handleRevise() {
    reviseMut.mutate({ proposalId, ...maybeRationale() });
  }
  function handleWithdraw() {
    if (!window.confirm(`Withdraw proposal #${proposalId}?`)) return;
    withdrawMut.mutate({ proposalId, ...maybeRationale() });
  }

  if (detailQuery.isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">Loading detail…</p>
        </CardContent>
      </Card>
    );
  }
  if (detailQuery.error) {
    return (
      <Card>
        <CardContent className="p-4">
          <p
            className="text-sm text-destructive"
            data-testid="gc-detail-error"
          >
            Detail failed: {detailQuery.error.message}
          </p>
        </CardContent>
      </Card>
    );
  }
  const detail = detailQuery.data;
  if (!detail) return null;
  const proposedChange = (detail as { proposedChange?: unknown })
    .proposedChange;

  return (
    <div className="space-y-3" data-testid="gc-detail">
      <Card>
        <CardContent className="space-y-2 p-4">
          <SectionLabel>
            Proposal #{detail.id} — {detail.proposalKind}
          </SectionLabel>
          <p className="font-mono text-xs text-muted-foreground">
            status: {detail.status}
            {detail.confidence != null
              ? ` · confidence: ${detail.confidence}`
              : ""}
          </p>
          {proposedChange &&
          typeof proposedChange === "object" &&
          Object.keys(proposedChange as Record<string, unknown>).length > 0 ? (
            <pre
              className="overflow-x-auto rounded bg-muted/40 p-2 font-mono text-[10px]"
              data-testid="gc-detail-change"
            >
              {JSON.stringify(proposedChange, null, 2)}
            </pre>
          ) : null}

          <div className="space-y-2">
            <Input
              data-testid="gc-detail-rationale"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Rationale for the decision (optional)"
              maxLength={2000}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={approveMut.isPending}
                onClick={handleApprove}
                data-testid="gc-detail-approve"
              >
                {approveMut.isPending ? "Approving…" : "Approve"}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={rejectMut.isPending}
                onClick={handleReject}
                data-testid="gc-detail-reject"
              >
                {rejectMut.isPending ? "Rejecting…" : "Reject"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={reviseMut.isPending}
                onClick={handleRevise}
                data-testid="gc-detail-revise"
              >
                {reviseMut.isPending ? "Requesting…" : "Request revision"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={withdrawMut.isPending}
                onClick={handleWithdraw}
                data-testid="gc-detail-withdraw"
              >
                {withdrawMut.isPending ? "Withdrawing…" : "Withdraw"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-4">
          <SectionLabel>Audit trail</SectionLabel>
          {auditQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading audit…</p>
          ) : auditQuery.error ? (
            <p
              className="text-sm text-destructive"
              data-testid="gc-audit-error"
            >
              Audit failed: {auditQuery.error.message}
            </p>
          ) : !auditQuery.data || auditQuery.data.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="gc-audit-empty"
            >
              No audit events.
            </p>
          ) : (
            <ul
              className="space-y-1 text-xs"
              data-testid="gc-audit-list"
            >
              {auditQuery.data.map((ev) => (
                <li
                  key={ev.id}
                  data-testid="gc-audit-row"
                  className="rounded border bg-background p-2 font-mono"
                >
                  #{ev.id} {ev.eventKind}
                  {ev.actedByUserId != null ? ` · user ${ev.actedByUserId}` : ""}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
