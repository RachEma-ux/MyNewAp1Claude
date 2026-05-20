// PromotionLifecyclePanel — no-deferral continuation-23 slice 102.
//
// Closes the partial-consumer gap on `promotion.{submit,approve,reject,rollback}`
// — 4 lifecycle mutations previously unconsumed in the client tree.
// Mirrors continuation-19's GraphChangeProposalsLifecyclePanel shape
// (mutation-only, operator-supplied promotionId for the lifecycle
// transitions, session-local recent-submissions shelf on Submit).
//
// Distinct from NotePromotionsRetentionPanel (retention domain).
// Both panels read/write disjoint columns of `ags_note_promotions`.

import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionLabel } from "./ui";

// Match the server-side PromotionKindEnum verbatim — see
// `server/agent-studio/services/promotion/router.ts`.
const PROMOTION_KINDS = [
  "knowledge_unit",
  "cag_block",
  "graph_skill_pack",
  "tool_knowledge",
  "workflow",
  "policy",
  "evaluation_case",
  "runtime_investigation",
  "graph_entity",
  "temporal_observation",
] as const;
type PromotionKind = (typeof PROMOTION_KINDS)[number];

function parsePositiveInt(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

interface SubmitResultRow {
  readonly promotionId: number;
  readonly status: string;
  readonly promotionKind: PromotionKind;
  readonly submittedAt: number;
}

export function PromotionLifecyclePanel() {
  return (
    <div className="space-y-4" data-testid="promotion-lifecycle">
      <SubmitPromotionSection />
      <ApprovePromotionSection />
      <RejectPromotionSection />
      <RollbackPromotionSection />
    </div>
  );
}

function SubmitPromotionSection() {
  const [noteId, setNoteId] = useState("");
  const [noteVersionId, setNoteVersionId] = useState("");
  const [promotionKind, setPromotionKind] = useState<PromotionKind | "">("");
  const [rationale, setRationale] = useState("");
  const [recent, setRecent] = useState<SubmitResultRow[]>([]);

  const parsedNote = parsePositiveInt(noteId);
  const parsedNoteVer = parsePositiveInt(noteVersionId);
  const formValid =
    parsedNote !== null && parsedNoteVer !== null && promotionKind !== "";

  const submitMut = trpc.agentStudio.promotion.submit.useMutation({
    onSuccess: (res) => {
      toast.success(`Promotion #${res.promotionId} ${res.status}`);
      setRecent((prev) =>
        [
          {
            promotionId: res.promotionId,
            status: res.status,
            promotionKind: promotionKind as PromotionKind,
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
      noteId: parsedNote as number,
      noteVersionId: parsedNoteVer as number,
      promotionKind: promotionKind as PromotionKind,
      ...(rationale.trim() !== "" ? { rationale: rationale.trim() } : {}),
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Submit promotion</SectionLabel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="prom-note-id">Note id</Label>
            <Input
              id="prom-note-id"
              data-testid="prom-submit-note-id"
              type="number"
              min={1}
              value={noteId}
              onChange={(e) => setNoteId(e.target.value)}
              placeholder="e.g. 42"
            />
          </div>
          <div>
            <Label htmlFor="prom-note-ver-id">Note version id</Label>
            <Input
              id="prom-note-ver-id"
              data-testid="prom-submit-note-version-id"
              type="number"
              min={1}
              value={noteVersionId}
              onChange={(e) => setNoteVersionId(e.target.value)}
              placeholder="e.g. 7"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="prom-kind">Promotion kind</Label>
            <select
              id="prom-kind"
              data-testid="prom-submit-kind"
              className="w-full rounded border bg-background p-2 text-sm"
              value={promotionKind}
              onChange={(e) =>
                setPromotionKind(e.target.value as PromotionKind | "")
              }
            >
              <option value="">(select a kind)</option>
              {PROMOTION_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="prom-rationale">Rationale (optional)</Label>
            <Input
              id="prom-rationale"
              data-testid="prom-submit-rationale"
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Why promote this note?"
              maxLength={2000}
            />
          </div>
        </div>
        <Button
          type="button"
          disabled={!formValid || submitMut.isPending}
          onClick={handleSubmit}
          data-testid="prom-submit-button"
        >
          {submitMut.isPending ? "Submitting…" : "Submit promotion"}
        </Button>

        {recent.length > 0 ? (
          <div className="rounded border bg-muted/20 p-3">
            <SectionLabel>Recently submitted (this session)</SectionLabel>
            <ul className="mt-2 space-y-1" data-testid="prom-recent-list">
              {recent.map((row) => (
                <li
                  key={row.submittedAt}
                  data-testid="prom-recent-row"
                  className="font-mono text-xs"
                >
                  <span className="font-medium">#{row.promotionId}</span>{" "}
                  <span className="text-muted-foreground">
                    {row.promotionKind}
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

function ApprovePromotionSection() {
  const [promotionId, setPromotionId] = useState("");
  const parsed = parsePositiveInt(promotionId);
  const formValid = parsed !== null;

  const approveMut = trpc.agentStudio.promotion.approve.useMutation({
    onSuccess: (res) => {
      toast.success(`Promotion #${parsed} ${res.status}`);
      setPromotionId("");
    },
    onError: (err) => {
      toast.error(`Approve failed: ${err.message ?? "unknown"}`);
    },
  });

  function handleApprove() {
    if (!formValid) return;
    approveMut.mutate({ promotionId: parsed as number });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Approve promotion</SectionLabel>
        <div>
          <Label htmlFor="prom-approve-id">Promotion id</Label>
          <Input
            id="prom-approve-id"
            data-testid="prom-approve-id"
            type="number"
            min={1}
            value={promotionId}
            onChange={(e) => setPromotionId(e.target.value)}
            placeholder="e.g. 17"
          />
        </div>
        <Button
          type="button"
          disabled={!formValid || approveMut.isPending}
          onClick={handleApprove}
          data-testid="prom-approve-button"
        >
          {approveMut.isPending ? "Approving…" : "Approve"}
        </Button>
      </CardContent>
    </Card>
  );
}

function RejectPromotionSection() {
  const [promotionId, setPromotionId] = useState("");
  const [reason, setReason] = useState("");
  const parsed = parsePositiveInt(promotionId);
  const formValid = parsed !== null;

  const rejectMut = trpc.agentStudio.promotion.reject.useMutation({
    onSuccess: (res) => {
      toast.success(`Promotion #${parsed} ${res.status}`);
      setPromotionId("");
      setReason("");
    },
    onError: (err) => {
      toast.error(`Reject failed: ${err.message ?? "unknown"}`);
    },
  });

  function handleReject() {
    if (!formValid) return;
    rejectMut.mutate({
      promotionId: parsed as number,
      ...(reason.trim() !== "" ? { reason: reason.trim() } : {}),
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Reject promotion</SectionLabel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="prom-reject-id">Promotion id</Label>
            <Input
              id="prom-reject-id"
              data-testid="prom-reject-id"
              type="number"
              min={1}
              value={promotionId}
              onChange={(e) => setPromotionId(e.target.value)}
              placeholder="e.g. 17"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="prom-reject-reason">Reason (optional)</Label>
            <Input
              id="prom-reject-reason"
              data-testid="prom-reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why reject this promotion?"
              maxLength={1000}
            />
          </div>
        </div>
        <Button
          type="button"
          variant="destructive"
          disabled={!formValid || rejectMut.isPending}
          onClick={handleReject}
          data-testid="prom-reject-button"
        >
          {rejectMut.isPending ? "Rejecting…" : "Reject"}
        </Button>
      </CardContent>
    </Card>
  );
}

function RollbackPromotionSection() {
  const [promotionId, setPromotionId] = useState("");
  const parsed = parsePositiveInt(promotionId);
  const formValid = parsed !== null;

  const rollbackMut = trpc.agentStudio.promotion.rollback.useMutation({
    onSuccess: (res) => {
      toast.success(`Promotion #${parsed} ${res.status}`);
      setPromotionId("");
    },
    onError: (err) => {
      toast.error(`Rollback failed: ${err.message ?? "unknown"}`);
    },
  });

  function handleRollback() {
    if (!formValid) return;
    if (
      !window.confirm(
        `Roll back promotion #${parsed}? This reverses the applied effects.`,
      )
    ) {
      return;
    }
    rollbackMut.mutate({ promotionId: parsed as number });
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Rollback promotion</SectionLabel>
        <div>
          <Label htmlFor="prom-rollback-id">Promotion id</Label>
          <Input
            id="prom-rollback-id"
            data-testid="prom-rollback-id"
            type="number"
            min={1}
            value={promotionId}
            onChange={(e) => setPromotionId(e.target.value)}
            placeholder="e.g. 17"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!formValid || rollbackMut.isPending}
          onClick={handleRollback}
          data-testid="prom-rollback-button"
        >
          {rollbackMut.isPending ? "Rolling back…" : "Rollback"}
        </Button>
      </CardContent>
    </Card>
  );
}
