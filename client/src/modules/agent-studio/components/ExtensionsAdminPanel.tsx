/**
 * Extensions Admin panel — V1+ Phase 18 follow-up. PR-V1-163.
 *
 * Operator surface for the extensions admin tRPC router (#913).
 * Renders a single workspace's installed extensions in a table with
 * status badge + governance metadata. Read-only — install / approve
 * / setStatus mutations are exposed via the tRPC router (#913) but
 * not from this panel (operator install flow is rare + sensitive;
 * a dedicated install wizard is a separate slice).
 *
 * Pattern mirrors #908 RegionAdminPanel — small focused panel with
 * its own data fetch, mounted by a slim wrapper page.
 */

import { useState } from "react";

import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";

import { SectionLabel } from "./ui";

const EXTENSION_GOVERNANCE_STATUSES = [
  "pending_approval",
  "approved",
  "rejected",
  "disabled",
  "revoked",
] as const;
type ExtensionGovernanceStatus =
  (typeof EXTENSION_GOVERNANCE_STATUSES)[number];

function fmtTs(ts: Date | string | null | undefined): string {
  if (!ts) return "—";
  const d = typeof ts === "string" ? new Date(ts) : ts;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().replace("T", " ").replace(/\..+$/, "Z");
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "approved":
      return "text-emerald-600 dark:text-emerald-400";
    case "pending_approval":
      return "text-amber-600 dark:text-amber-400";
    case "rejected":
    case "revoked":
      return "text-destructive";
    case "disabled":
      return "text-muted-foreground";
    default:
      return "";
  }
}

interface Props {
  readonly workspaceId: number;
}

export function ExtensionsAdminPanel({ workspaceId }: Props) {
  const utils = trpc.useUtils();
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [actorUserId, setActorUserId] = useState<string>("");

  function refreshList() {
    void utils.agentStudio.extensions.list.invalidate({ workspaceId });
  }
  function onMutationSuccess() {
    setMutationError(null);
    refreshList();
  }
  function onMutationError(err: { message: string }) {
    setMutationError(err.message);
  }

  const approveMutation = trpc.agentStudio.extensions.approve.useMutation({
    onSuccess: onMutationSuccess,
    onError: onMutationError,
  });
  const setStatusMutation =
    trpc.agentStudio.extensions.setStatus.useMutation({
      onSuccess: onMutationSuccess,
      onError: onMutationError,
    });

  const listQ = trpc.agentStudio.extensions.list.useQuery(
    { workspaceId },
    { refetchOnWindowFocus: false },
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-4">
          <SectionLabel>
            Installed extensions (workspace {workspaceId})
          </SectionLabel>
          <div className="flex items-center gap-2 text-sm">
            <label
              className="font-medium"
              htmlFor="extensions-admin-actor-user-id"
            >
              Actor user ID:
            </label>
            <input
              id="extensions-admin-actor-user-id"
              type="number"
              min={1}
              className="w-24 border rounded px-2 py-1"
              value={actorUserId}
              onChange={(e) => setActorUserId(e.target.value)}
              placeholder="for approve"
            />
            {mutationError ? (
              <span className="text-destructive">{mutationError}</span>
            ) : null}
          </div>
          {listQ.isLoading ? (
            <p className="text-sm text-muted-foreground">
              Loading extensions…
            </p>
          ) : listQ.error ? (
            <p className="text-sm text-destructive">
              Failed to load extensions: {listQ.error.message}
            </p>
          ) : !listQ.data || listQ.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No extensions installed in this workspace.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-3">Key</th>
                    <th className="py-1 pr-3">Name</th>
                    <th className="py-1 pr-3">Version</th>
                    <th className="py-1 pr-3">Status</th>
                    <th className="py-1 pr-3">Lanes</th>
                    <th className="py-1 pr-3">Tools</th>
                    <th className="py-1 pr-3">Approved</th>
                    <th className="py-1 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {listQ.data.map((ext) => (
                    <tr key={ext.id} className="border-t">
                      <td className="py-1 pr-3 font-mono text-xs">
                        {ext.extensionKey}
                      </td>
                      <td className="py-1 pr-3">{ext.name}</td>
                      <td className="py-1 pr-3 font-mono text-xs">
                        {ext.version}
                      </td>
                      <td
                        className={`py-1 pr-3 ${statusBadgeClass(ext.governanceStatus)}`}
                      >
                        {ext.governanceStatus}
                      </td>
                      <td className="py-1 pr-3 font-mono text-xs">
                        {ext.capabilityLanes.join(", ")}
                      </td>
                      <td
                        className="py-1 pr-3 font-mono text-xs truncate max-w-[20ch]"
                        title={ext.declaredToolNames.join(", ")}
                      >
                        {ext.declaredToolNames.length === 0
                          ? "—"
                          : `${ext.declaredToolNames.length} tool${ext.declaredToolNames.length === 1 ? "" : "s"}`}
                      </td>
                      <td className="py-1 pr-3">
                        {fmtTs(ext.approvedAt)}
                      </td>
                      <td className="py-1 pr-3 space-x-2">
                        {ext.governanceStatus === "pending_approval" ? (
                          <button
                            type="button"
                            className="text-xs underline"
                            disabled={approveMutation.isPending}
                            onClick={() => {
                              const uid = Number.parseInt(actorUserId, 10);
                              if (!Number.isFinite(uid) || uid <= 0) {
                                setMutationError(
                                  "approve requires a positive integer Actor user ID",
                                );
                                return;
                              }
                              approveMutation.mutate({
                                extensionId: ext.id,
                                approvedByUserId: uid,
                              });
                            }}
                          >
                            approve
                          </button>
                        ) : null}
                        <select
                          className="text-xs border rounded px-1 py-0.5"
                          value={ext.governanceStatus}
                          disabled={setStatusMutation.isPending}
                          onChange={(e) => {
                            const next =
                              e.target.value as ExtensionGovernanceStatus;
                            if (next === ext.governanceStatus) return;
                            setStatusMutation.mutate({
                              extensionId: ext.id,
                              status: next,
                            });
                          }}
                        >
                          {EXTENSION_GOVERNANCE_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
