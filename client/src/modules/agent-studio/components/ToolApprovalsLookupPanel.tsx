// ToolApprovalsLookupPanel — no-deferral continuation-37 slice 144.
//
// Closes the UI-consumer gap for toolApprovals.{list, getByHash} — the
// 2 unconsumed endpoints on the toolApprovals router. Rendered as a
// sibling of ApprovalsPanel inside RetrofitPage's approvals tab.

import { useState } from "react";
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

interface Props {
  agentDraftId: number | null;
}

export function ToolApprovalsLookupPanel({ agentDraftId }: Props) {
  return (
    <div className="space-y-3" data-testid="tal-panel">
      <ListByRunCard />
      <GetByHashCard agentDraftId={agentDraftId} />
    </div>
  );
}

function ListByRunCard() {
  const [runIdRaw, setRunIdRaw] = useState("");
  const runtimeRunId = parsePositiveInt(runIdRaw);
  const enabled = runtimeRunId !== null;
  const query = trpc.agentStudio.toolApprovals.list.useQuery(
    enabled ? { runtimeRunId, limit: 50 } : (undefined as never),
    { enabled, refetchOnWindowFocus: false },
  );
  const rows = (query.data as Array<{
    id: number;
    status: string;
    toolKey?: string | null;
    createdAt?: Date | string;
    proposedToolCallHash?: string | null;
  }> | undefined) ?? [];

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>List approvals by runtime run</SectionLabel>
        <div className="flex items-end gap-3">
          <div className="w-40">
            <Label htmlFor="tal-run-id">Runtime run id</Label>
            <Input
              id="tal-run-id"
              data-testid="tal-run-id"
              type="number"
              min={1}
              value={runIdRaw}
              onChange={(e) => setRunIdRaw(e.target.value)}
            />
          </div>
        </div>
        {!enabled ? (
          <p className="text-sm text-muted-foreground">
            Enter a runtime run id to list its approvals.
          </p>
        ) : query.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : query.error ? (
          <p className="text-sm text-destructive" data-testid="tal-list-error">
            {query.error.message}
          </p>
        ) : rows.length === 0 ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="tal-list-empty"
          >
            No approvals for this run.
          </p>
        ) : (
          <ul className="space-y-1" data-testid="tal-list-rows">
            {rows.map((r) => (
              <li
                key={r.id}
                className="rounded border bg-background p-2 font-mono text-xs"
                data-testid="tal-list-row"
              >
                #{r.id} · {r.status}
                {r.toolKey ? ` · ${r.toolKey}` : ""}
                {r.proposedToolCallHash ? (
                  <div className="mt-1 break-all text-muted-foreground">
                    {r.proposedToolCallHash}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function GetByHashCard({ agentDraftId }: { agentDraftId: number | null }) {
  const [hash, setHash] = useState("");
  const hashValid = /^[0-9a-f]{64}$/.test(hash.trim());
  const enabled = agentDraftId !== null && hashValid;
  const query = trpc.agentStudio.toolApprovals.getByHash.useQuery(
    enabled
      ? { agentDraftId, proposedToolCallHash: hash.trim() }
      : (undefined as never),
    { enabled, refetchOnWindowFocus: false },
  );
  const row = query.data as
    | {
        id: number;
        status: string;
        toolKey?: string | null;
        createdAt?: Date | string;
      }
    | null
    | undefined;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <SectionLabel>Get approval by tool-call hash</SectionLabel>
        <div>
          <Label htmlFor="tal-hash">Proposed tool-call hash (64 hex chars)</Label>
          <Input
            id="tal-hash"
            data-testid="tal-hash"
            className="font-mono text-xs"
            value={hash}
            onChange={(e) => setHash(e.target.value)}
            maxLength={64}
            placeholder="sha256 hex"
          />
          {hash.length > 0 && !hashValid ? (
            <p
              className="mt-1 text-xs text-destructive"
              data-testid="tal-hash-error"
            >
              Must be 64 lowercase hex chars.
            </p>
          ) : null}
        </div>
        {agentDraftId === null ? (
          <p className="text-sm text-muted-foreground">
            Awaiting agent draft.
          </p>
        ) : !hashValid ? null : query.isLoading ? (
          <p className="text-sm text-muted-foreground">Looking up…</p>
        ) : query.error ? (
          <p className="text-sm text-destructive" data-testid="tal-hash-q-error">
            {query.error.message}
          </p>
        ) : row === null ? (
          <p
            className="text-sm text-muted-foreground"
            data-testid="tal-hash-not-found"
          >
            No approval found for that hash.
          </p>
        ) : row ? (
          <div
            className="rounded border bg-background p-2 font-mono text-xs"
            data-testid="tal-hash-result"
          >
            <div>#{row.id} · {row.status}</div>
            {row.toolKey ? <div>tool: {row.toolKey}</div> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
