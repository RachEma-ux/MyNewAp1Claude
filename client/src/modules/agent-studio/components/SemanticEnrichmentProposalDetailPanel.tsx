// SemanticEnrichmentProposalDetailPanel — operator UI for the T-D.4
// promotion chain. Lets an operator look up a pending semantic-
// enrichment proposal by id, inspect its payload + sourceEvidence,
// and either:
//
//   - Promote — write a graph-correction proposal (status=pending)
//     into `ags_graph_correction_proposals`. Surface review still
//     happens on the existing graph-correction triage flow.
//
//   - Promote & apply — composition of promote + immediate
//     `approveAndApplyProposal`. Goes straight from enrichment row
//     to live graph mutation in one call.
//
// Status-gated affordances: both buttons only render when the
// proposal's `status === "pending"`. Once promoted, the row's status
// flips and the buttons hide.
//
// Wires to:
//   - agentStudio.semanticEnrichment.getProposalDetail (query)
//   - agentStudio.semanticEnrichment.promote (mutation)
//   - agentStudio.semanticEnrichment.promoteAndApprove (mutation)
//
// Carry-forward 3/3 from project-td4-promotion-chain-complete.

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/_core/hooks/useAuth";
import { SectionLabel } from "./ui";

interface LastActionResult {
  readonly kind: "promote" | "promoteAndApprove";
  readonly correctionProposalId: number;
  readonly applied?: boolean;
}

export function SemanticEnrichmentProposalDetailPanel() {
  const { user } = useAuth();
  const [proposalIdInput, setProposalIdInput] = useState("");
  const [proposalId, setProposalId] = useState<number | null>(null);
  const [rationale, setRationale] = useState("");
  const [lastResult, setLastResult] = useState<LastActionResult | null>(null);

  const detailQuery =
    trpc.agentStudio.semanticEnrichment.getProposalDetail.useQuery(
      proposalId === null ? { proposalId: 1 } : { proposalId },
      { enabled: proposalId !== null },
    );

  const utils = trpc.useUtils();

  const promoteMut =
    trpc.agentStudio.semanticEnrichment.promote.useMutation({
      onSuccess: (data) => {
        setLastResult({
          kind: "promote",
          correctionProposalId: data.correctionProposalId,
        });
        toast.success(
          `Promoted enrichment proposal — created correction proposal #${data.correctionProposalId}`,
        );
        void utils.agentStudio.semanticEnrichment.getProposalDetail.invalidate();
      },
      onError: (err) =>
        toast.error(`Promote failed: ${err.message ?? "unknown"}`),
    });

  const promoteAndApproveMut =
    trpc.agentStudio.semanticEnrichment.promoteAndApprove.useMutation({
      onSuccess: (data) => {
        setLastResult({
          kind: "promoteAndApprove",
          correctionProposalId: data.correctionProposalId,
          applied: data.applied,
        });
        toast.success(
          `Promoted + ${data.applied ? "applied" : "approved (apply skipped)"} — correction proposal #${data.correctionProposalId}`,
        );
        void utils.agentStudio.semanticEnrichment.getProposalDetail.invalidate();
      },
      onError: (err) =>
        toast.error(`Promote & apply failed: ${err.message ?? "unknown"}`),
    });

  function handleLookup() {
    const parsed = parseInt(proposalIdInput.trim(), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Enter a positive proposal id");
      return;
    }
    setProposalId(parsed);
    setLastResult(null);
  }

  function handlePromote() {
    if (proposalId === null) return;
    const trimmedRationale = rationale.trim();
    promoteMut.mutate({
      proposalId,
      ...(trimmedRationale.length > 0
        ? { decisionRationale: trimmedRationale }
        : {}),
    });
  }

  function handlePromoteAndApprove() {
    if (proposalId === null) return;
    if (!user?.id) {
      toast.error("Sign-in required for promote & apply (decidedByUserId)");
      return;
    }
    const trimmedRationale = rationale.trim();
    promoteAndApproveMut.mutate({
      proposalId,
      decidedByUserId: user.id,
      ...(trimmedRationale.length > 0
        ? { rationale: trimmedRationale }
        : {}),
    });
  }

  const isMutating = promoteMut.isPending || promoteAndApproveMut.isPending;
  const detail =
    detailQuery.data?.status === "ok" ? detailQuery.data.proposal : null;
  const notFound =
    detailQuery.data?.status === "not_found" && proposalId !== null;
  const isPending = detail?.status === "pending";

  return (
    <div className="grid grid-cols-1 gap-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <SectionLabel>
            Semantic enrichment — proposal detail + promotion
          </SectionLabel>
          <div className="text-xs text-zinc-400">
            Look up a pending semantic-enrichment proposal and route it
            into the graph-correction triage chain. <em>Promote</em>
            writes a correction proposal at <code>status=pending</code>
            (operator still reviews + approves downstream).{" "}
            <em>Promote & apply</em> is the combo — promote + immediate
            approve + live graph mutation in one call.
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label
                htmlFor="enrichment-proposal-id"
                className="text-xs text-zinc-400"
              >
                Proposal id
              </Label>
              <Input
                id="enrichment-proposal-id"
                type="number"
                min={1}
                value={proposalIdInput}
                onChange={(e) => setProposalIdInput(e.target.value)}
                placeholder="e.g. 1234"
                className="w-48"
              />
            </div>
            <Button
              variant="secondary"
              onClick={handleLookup}
              disabled={detailQuery.isFetching}
            >
              {detailQuery.isFetching ? "Loading…" : "Look up"}
            </Button>
          </div>

          {proposalId !== null && detailQuery.isLoading ? (
            <div className="text-sm text-zinc-400">
              Loading proposal #{proposalId}…
            </div>
          ) : null}

          {notFound ? (
            <div className="rounded border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-300">
              Proposal #{proposalId} not found (may have been pruned).
            </div>
          ) : null}

          {detail ? (
            <div className="space-y-3 rounded border border-zinc-800 p-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div>
                  <div className="text-xs uppercase text-zinc-400">Id</div>
                  <div className="font-semibold">#{detail.id}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-zinc-400">Kind</div>
                  <div className="font-semibold">{detail.proposalKind}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-zinc-400">Status</div>
                  <div
                    className={
                      isPending
                        ? "font-semibold text-emerald-400"
                        : "font-semibold text-zinc-400"
                    }
                  >
                    {detail.status}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase text-zinc-400">
                    Confidence
                  </div>
                  <div className="font-semibold">
                    {detail.confidence ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase text-zinc-400">
                    Target type
                  </div>
                  <div className="font-semibold">
                    {detail.targetTypeKey ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase text-zinc-400">
                    Target id
                  </div>
                  <div className="font-semibold">
                    {detail.targetId ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase text-zinc-400">Run id</div>
                  <div className="font-semibold">{detail.runId ?? "—"}</div>
                </div>
              </div>

              <details className="text-xs">
                <summary className="cursor-pointer text-zinc-300">
                  Payload
                </summary>
                <pre className="mt-1 max-h-64 overflow-auto rounded bg-zinc-950 p-2 text-zinc-200">
                  {JSON.stringify(detail.payload ?? {}, null, 2)}
                </pre>
              </details>

              <details className="text-xs">
                <summary className="cursor-pointer text-zinc-300">
                  Source evidence
                </summary>
                <pre className="mt-1 max-h-64 overflow-auto rounded bg-zinc-950 p-2 text-zinc-200">
                  {JSON.stringify(detail.sourceEvidence ?? {}, null, 2)}
                </pre>
              </details>

              {isPending ? (
                <div className="space-y-2 border-t border-zinc-800 pt-3">
                  <div className="flex flex-col gap-1">
                    <Label
                      htmlFor="enrichment-rationale"
                      className="text-xs text-zinc-400"
                    >
                      Decision rationale (optional)
                    </Label>
                    <Input
                      id="enrichment-rationale"
                      value={rationale}
                      onChange={(e) => setRationale(e.target.value)}
                      placeholder="e.g. confidence ≥ 0.95, source evidence verified"
                      maxLength={2000}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="default"
                      onClick={handlePromote}
                      disabled={isMutating}
                      data-testid="promote-btn"
                    >
                      {promoteMut.isPending ? "Promoting…" : "Promote"}
                    </Button>
                    <Button
                      variant="default"
                      onClick={handlePromoteAndApprove}
                      disabled={isMutating}
                      data-testid="promote-and-approve-btn"
                    >
                      {promoteAndApproveMut.isPending
                        ? "Promoting + applying…"
                        : "Promote & apply"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="border-t border-zinc-800 pt-3 text-sm text-zinc-400">
                  Status is{" "}
                  <span className="font-semibold">{detail.status}</span> —
                  promotion affordances are pending-only.
                </div>
              )}
            </div>
          ) : null}

          {lastResult ? (
            <div className="rounded border border-emerald-800 bg-emerald-950/30 p-3 text-sm text-emerald-200">
              Last action:{" "}
              <span className="font-semibold">
                {lastResult.kind === "promote"
                  ? "Promote"
                  : "Promote & apply"}
              </span>{" "}
              → correction proposal{" "}
              <span className="font-semibold">
                #{lastResult.correctionProposalId}
              </span>
              {lastResult.kind === "promoteAndApprove" ? (
                <span>
                  {" "}
                  ({lastResult.applied ? "applied" : "approved (no-op apply)"})
                </span>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
