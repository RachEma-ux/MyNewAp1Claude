// GraphChangeProposalsLifecyclePanel — no-deferral continuation-19 slice 90.
//
// Closes the UI-consumer gap for the graphChangeProposals.* tRPC surface
// (Phase 11.5 — 4-mutation approval workflow: submit / approve / reject
// / withdraw). Distinct from GraphChangeProposalsRetentionPanel which
// handles the pruning cron; this surface drives the proposal lifecycle
// itself.
//
// Mutation-only constraint: the router exposes no `listProposals`
// query, so approve / reject / withdraw require operator-supplied
// `proposalId` values. The submit form returns the new `proposalId`
// on success, closing the loop for proposals created within this
// surface — but discovery of external pending proposals is out of
// scope until a list endpoint is added server-side.

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "./ui";

// Match the server-side enum exactly — see
// `server/agent-studio/services/graph-change-proposals/lifecycle.ts`
// (`GraphChangeProposalKind`) + the router's `ProposalKindEnum`.
const PROPOSAL_KINDS = [
  "create_node",
  "update_node",
  "deprecate_node",
  "create_edge",
  "update_edge",
  "remove_edge",
  "entity_merge",
  "entity_split",
  "observation_correction",
  "provenance_correction",
  "projection_correction",
] as const;

type ProposalKind = (typeof PROPOSAL_KINDS)[number];

const CONFIDENCE_OPTIONS = ["", "low", "medium", "high"] as const;
type ConfidenceOption = (typeof CONFIDENCE_OPTIONS)[number];

function parsePositiveInt(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
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

interface SubmitResultRow {
  readonly proposalId: number;
  readonly status: string;
  readonly proposalKind: ProposalKind;
  readonly submittedAt: number;
}

export function GraphChangeProposalsLifecyclePanel() {
  return (
    <div className="space-y-4" data-testid="graph-change-proposals-lifecycle">
      <SubmitProposalSection />
      <ApproveProposalSection />
      <RejectProposalSection />
      <WithdrawProposalSection />
    </div>
  );
}

function SubmitProposalSection() {
  const [proposalKind, setProposalKind] = useState<ProposalKind | "">("");
  const [summary, setSummary] = useState("");
  const [confidence, setConfidence] = useState<ConfidenceOption>("");
  const [proposedByAgentId, setProposedByAgentId] = useState("");
  const [itemKind, setItemKind] = useState("");
  const [itemPayload, setItemPayload] = useState("{}");
  const [sourceEvidence, setSourceEvidence] = useState("");
  const [recent, setRecent] = useState<SubmitResultRow[]>([]);

  const parsedAgent = parsePositiveInt(proposedByAgentId);
  const agentValid =
    proposedByAgentId.trim() === "" || parsedAgent !== null;
  const parsedItemPayload = parseJsonRecord(itemPayload);
  const parsedSourceEvidence =
    sourceEvidence.trim() === ""
      ? null
      : parseJsonRecord(sourceEvidence);
  const sourceEvidenceValid =
    sourceEvidence.trim() === "" || parsedSourceEvidence !== null;

  const formValid =
    proposalKind !== "" &&
    itemKind.trim().length > 0 &&
    parsedItemPayload !== null &&
    agentValid &&
    sourceEvidenceValid;

  const submitMut =
    trpc.agentStudio.graphChangeProposals.submit.useMutation({
      onSuccess: (res) => {
        toast.success(
          `Proposal #${res.proposalId} ${res.status}`,
        );
        setRecent((prev) =>
          [
            {
              proposalId: res.proposalId,
              status: res.status,
              proposalKind: proposalKind as ProposalKind,
              submittedAt: Date.now(),
            },
            ...prev,
          ].slice(0, 10),
        );
      },
      onError: (err) => {
        toast.error(`Submit failed: ${err.message ?? "unknown"}`);
      },
    });

  function handleSubmit() {
    if (!formValid) return;
    submitMut.mutate({
      proposalKind: proposalKind as ProposalKind,
      ...(summary.trim() !== "" ? { summary: summary.trim() } : {}),
      ...(confidence !== ""
        ? { confidence: confidence as "low" | "medium" | "high" }
        : {}),
      ...(parsedAgent !== null
        ? { proposedByAgentId: parsedAgent }
        : {}),
      items: [
        {
          itemKind: itemKind.trim(),
          itemPayload: parsedItemPayload as Record<string, unknown>,
          ...(parsedSourceEvidence !== null
            ? { sourceEvidence: parsedSourceEvidence }
            : {}),
        },
      ],
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Submit proposal</SectionLabel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="gcp-kind">Proposal kind</Label>
            <select
              id="gcp-kind"
              data-testid="gcp-submit-kind"
              className="w-full rounded border bg-background p-2 text-sm"
              value={proposalKind}
              onChange={(e) =>
                setProposalKind(e.target.value as ProposalKind | "")
              }
            >
              <option value="">(select a kind)</option>
              {PROPOSAL_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="gcp-confidence">Confidence (optional)</Label>
            <select
              id="gcp-confidence"
              data-testid="gcp-submit-confidence"
              className="w-full rounded border bg-background p-2 text-sm"
              value={confidence}
              onChange={(e) =>
                setConfidence(e.target.value as ConfidenceOption)
              }
            >
              <option value="">(unset)</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="gcp-summary">Summary (optional)</Label>
            <Input
              id="gcp-summary"
              data-testid="gcp-submit-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="One-line description of the proposed change"
              maxLength={2000}
            />
          </div>
          <div>
            <Label htmlFor="gcp-agent-id">
              Proposed by agent id (optional)
            </Label>
            <Input
              id="gcp-agent-id"
              data-testid="gcp-submit-agent-id"
              type="number"
              min={1}
              value={proposedByAgentId}
              onChange={(e) => setProposedByAgentId(e.target.value)}
              placeholder="e.g. 42"
            />
          </div>
          <div>
            <Label htmlFor="gcp-item-kind">Item kind</Label>
            <Input
              id="gcp-item-kind"
              data-testid="gcp-submit-item-kind"
              value={itemKind}
              onChange={(e) => setItemKind(e.target.value)}
              placeholder="e.g. node / edge / observation"
              maxLength={100}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="gcp-item-payload">
              Item payload (JSON object)
            </Label>
            <textarea
              id="gcp-item-payload"
              data-testid="gcp-submit-item-payload"
              className="w-full rounded border bg-background p-2 font-mono text-xs"
              rows={4}
              value={itemPayload}
              onChange={(e) => setItemPayload(e.target.value)}
              placeholder='{"name": "Foo", "typeKey": "Concept"}'
            />
            {!parsedItemPayload && itemPayload.trim() !== "" ? (
              <p
                className="mt-1 text-xs text-destructive"
                data-testid="gcp-submit-item-payload-error"
              >
                Item payload must be a JSON object.
              </p>
            ) : null}
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="gcp-source-evidence">
              Source evidence (JSON object, optional)
            </Label>
            <textarea
              id="gcp-source-evidence"
              data-testid="gcp-submit-source-evidence"
              className="w-full rounded border bg-background p-2 font-mono text-xs"
              rows={3}
              value={sourceEvidence}
              onChange={(e) => setSourceEvidence(e.target.value)}
              placeholder='{"runId": 7, "noteId": 42}'
            />
            {!sourceEvidenceValid ? (
              <p
                className="mt-1 text-xs text-destructive"
                data-testid="gcp-submit-source-evidence-error"
              >
                Source evidence must be a JSON object when provided.
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            disabled={!formValid || submitMut.isPending}
            onClick={handleSubmit}
            data-testid="gcp-submit-button"
          >
            {submitMut.isPending ? "Submitting…" : "Submit proposal"}
          </Button>
          {!formValid ? (
            <span className="text-xs text-muted-foreground">
              Pick a kind, fill item kind, and provide a JSON-object payload.
            </span>
          ) : null}
        </div>

        {recent.length > 0 ? (
          <div className="rounded border bg-muted/20 p-3">
            <SectionLabel>Recently submitted (this session)</SectionLabel>
            <ul className="mt-2 space-y-1" data-testid="gcp-submit-recent-list">
              {recent.map((row) => (
                <li
                  key={row.submittedAt}
                  data-testid="gcp-submit-recent-row"
                  className="font-mono text-xs"
                >
                  <span className="font-medium">#{row.proposalId}</span>{" "}
                  <span className="text-muted-foreground">
                    {row.proposalKind}
                  </span>{" "}
                  <span
                    className={
                      "rounded px-1.5 py-0.5 text-[10px] font-medium " +
                      (row.status === "approved"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : row.status === "in_review"
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                          : row.status === "rejected"
                            ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                            : "bg-muted text-muted-foreground")
                    }
                  >
                    {row.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ApproveProposalSection() {
  const [proposalId, setProposalId] = useState("");
  const [rationale, setRationale] = useState("");

  const parsed = parsePositiveInt(proposalId);
  const formValid = parsed !== null;

  const approveMut =
    trpc.agentStudio.graphChangeProposals.approve.useMutation({
      onSuccess: (res) => {
        toast.success(`Proposal #${parsed} ${res.status}`);
        setProposalId("");
        setRationale("");
      },
      onError: (err) => {
        toast.error(`Approve failed: ${err.message ?? "unknown"}`);
      },
    });

  function handleApprove() {
    if (!formValid) return;
    approveMut.mutate({
      proposalId: parsed as number,
      ...(rationale.trim() !== ""
        ? { rationale: rationale.trim() }
        : {}),
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Approve proposal</SectionLabel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="gcp-approve-id">Proposal id</Label>
            <Input
              id="gcp-approve-id"
              data-testid="gcp-approve-id"
              type="number"
              min={1}
              value={proposalId}
              onChange={(e) => setProposalId(e.target.value)}
              placeholder="e.g. 17"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="gcp-approve-rationale">
              Rationale (optional)
            </Label>
            <Input
              id="gcp-approve-rationale"
              data-testid="gcp-approve-rationale"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Why approve this proposal?"
              maxLength={2000}
            />
          </div>
        </div>
        <Button
          type="button"
          disabled={!formValid || approveMut.isPending}
          onClick={handleApprove}
          data-testid="gcp-approve-button"
        >
          {approveMut.isPending ? "Approving…" : "Approve"}
        </Button>
      </CardContent>
    </Card>
  );
}

function RejectProposalSection() {
  const [proposalId, setProposalId] = useState("");
  const [rationale, setRationale] = useState("");

  const parsed = parsePositiveInt(proposalId);
  const formValid = parsed !== null;

  const rejectMut =
    trpc.agentStudio.graphChangeProposals.reject.useMutation({
      onSuccess: (res) => {
        toast.success(`Proposal #${parsed} ${res.status}`);
        setProposalId("");
        setRationale("");
      },
      onError: (err) => {
        toast.error(`Reject failed: ${err.message ?? "unknown"}`);
      },
    });

  function handleReject() {
    if (!formValid) return;
    rejectMut.mutate({
      proposalId: parsed as number,
      ...(rationale.trim() !== ""
        ? { rationale: rationale.trim() }
        : {}),
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Reject proposal</SectionLabel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="gcp-reject-id">Proposal id</Label>
            <Input
              id="gcp-reject-id"
              data-testid="gcp-reject-id"
              type="number"
              min={1}
              value={proposalId}
              onChange={(e) => setProposalId(e.target.value)}
              placeholder="e.g. 17"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="gcp-reject-rationale">Rationale (optional)</Label>
            <Input
              id="gcp-reject-rationale"
              data-testid="gcp-reject-rationale"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Why reject this proposal?"
              maxLength={2000}
            />
          </div>
        </div>
        <Button
          type="button"
          variant="destructive"
          disabled={!formValid || rejectMut.isPending}
          onClick={handleReject}
          data-testid="gcp-reject-button"
        >
          {rejectMut.isPending ? "Rejecting…" : "Reject"}
        </Button>
      </CardContent>
    </Card>
  );
}

function WithdrawProposalSection() {
  const [proposalId, setProposalId] = useState("");

  const parsed = parsePositiveInt(proposalId);
  const formValid = parsed !== null;

  const withdrawMut =
    trpc.agentStudio.graphChangeProposals.withdraw.useMutation({
      onSuccess: (res) => {
        toast.success(`Proposal #${parsed} ${res.status}`);
        setProposalId("");
      },
      onError: (err) => {
        toast.error(`Withdraw failed: ${err.message ?? "unknown"}`);
      },
    });

  function handleWithdraw() {
    if (!formValid) return;
    withdrawMut.mutate({ proposalId: parsed as number });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Withdraw proposal</SectionLabel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="gcp-withdraw-id">Proposal id</Label>
            <Input
              id="gcp-withdraw-id"
              data-testid="gcp-withdraw-id"
              type="number"
              min={1}
              value={proposalId}
              onChange={(e) => setProposalId(e.target.value)}
              placeholder="e.g. 17"
            />
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!formValid || withdrawMut.isPending}
          onClick={handleWithdraw}
          data-testid="gcp-withdraw-button"
        >
          {withdrawMut.isPending ? "Withdrawing…" : "Withdraw"}
        </Button>
      </CardContent>
    </Card>
  );
}
