/**
 * AS Reconcile Panel — Direction B follow-up
 *
 * UI for `agentStudio.exportCatalog.reconcileSync` (Phase 41 sync-drift
 * repair). Two actions:
 *
 *   - Dry-run scan: walks every published AS agent, classifies each
 *     row's drift case, returns the report without writing any sync-log
 *     rows.
 *   - Apply: same scan, plus best-effort synthetic sync-log row writes
 *     to repair every drift case found.
 *
 * Result table breaks down each agent → catalog row → sync-log state.
 *
 * Mounted from `CandidatePage` `mode="agentStudio"` Reconcile tab.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Wrench,
  XCircle,
} from "lucide-react";

interface ReconcileItem {
  agentId: number;
  catalogEntryId: number | null;
  driftCase:
    | "in_sync"
    | "missing_registered"
    | "missing_published"
    | "missing_deprecated"
    | "no_catalog_entry"
    | string;
  latestSyncEventType: string | null;
  catalogStatus: string | null;
  repaired: boolean;
}

interface ReconcileResult {
  scanned: number;
  inSync: number;
  drift: number;
  repaired: number;
  dryRun: boolean;
  items: ReconcileItem[];
}

const DRIFT_BADGE: Record<string, { label: string; className: string }> = {
  in_sync: {
    label: "in-sync",
    className: "bg-green-600/20 text-green-400 border-green-600/30",
  },
  missing_registered: {
    label: "missing registered",
    className: "bg-red-600/20 text-red-400 border-red-600/30",
  },
  missing_published: {
    label: "missing published",
    className: "bg-yellow-600/20 text-yellow-400 border-yellow-600/30",
  },
  missing_deprecated: {
    label: "missing deprecated",
    className: "bg-yellow-600/20 text-yellow-400 border-yellow-600/30",
  },
  no_catalog_entry: {
    label: "no catalog row",
    className: "bg-gray-600/20 text-gray-400 border-gray-600/30",
  },
};

export function ASReconcilePanel() {
  const [result, setResult] = useState<ReconcileResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reconcileMutation = trpc.catalogImport.reconcileAgentStudioSync.useMutation();

  const run = async (dryRun: boolean) => {
    setError(null);
    try {
      const r = (await reconcileMutation.mutateAsync({ dryRun })) as ReconcileResult;
      setResult(r);
      if (dryRun) {
        toast.info(
          `Dry-run scan: ${r.scanned} agents, ${r.drift} drift, ${r.inSync} in-sync.`,
        );
      } else {
        toast.success(
          `Applied: ${r.repaired} repaired of ${r.drift} drift (scanned ${r.scanned}).`,
        );
      }
    } catch (e: any) {
      setError(e?.message ?? "reconcileSync failed");
      toast.error("Reconcile failed — see panel for details.");
    }
  };

  const isPending = reconcileMutation.isPending;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wrench className="h-4 w-4" />
            Reconcile Agent Studio sync log
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground break-words">
            Walks every published Agent Studio agent and compares its catalog
            row against <code>ags_catalog_sync_log</code>. Drift cases get a
            synthetic repair row when applied. <strong>Dry-run</strong> returns
            the report without writing.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => run(true)}
              disabled={isPending}
            >
              {isPending && reconcileMutation.variables?.dryRun !== false ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Dry-run scan
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => run(false)}
              disabled={isPending}
            >
              {isPending && reconcileMutation.variables?.dryRun === false ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Wrench className="h-4 w-4 mr-2" />
              )}
              Apply repairs
            </Button>
          </div>
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-red-900/20 border border-red-800/30 text-red-400 text-sm">
              <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="break-words min-w-0">{error}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
              {result.dryRun ? (
                <Badge
                  variant="outline"
                  className="bg-blue-600/20 text-blue-400 border-blue-600/30"
                >
                  Dry-run
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="bg-green-600/20 text-green-400 border-green-600/30"
                >
                  Applied
                </Badge>
              )}
              <span>
                {result.scanned} scanned · {result.inSync} in-sync ·{" "}
                {result.drift} drift
                {!result.dryRun && ` · ${result.repaired} repaired`}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {result.items.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No published Agent Studio agents found. Mark a candidate ready
                in Agent Studio and rerun.
              </p>
            ) : (
              <div className="max-h-[60vh] overflow-auto border rounded-md">
                <Table className="min-w-[640px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">Agent</TableHead>
                      <TableHead className="w-20">Catalog</TableHead>
                      <TableHead className="min-w-[140px]">
                        Drift case
                      </TableHead>
                      <TableHead className="min-w-[120px]">
                        Latest sync log
                      </TableHead>
                      <TableHead className="min-w-[100px]">
                        Catalog status
                      </TableHead>
                      <TableHead className="w-24">Repaired</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.items.map((it) => {
                      const drift =
                        DRIFT_BADGE[it.driftCase] ?? {
                          label: it.driftCase,
                          className:
                            "bg-gray-600/20 text-gray-400 border-gray-600/30",
                        };
                      return (
                        <TableRow key={`${it.agentId}-${it.catalogEntryId ?? "x"}`}>
                          <TableCell className="font-medium text-sm">
                            #{it.agentId}
                          </TableCell>
                          <TableCell className="text-sm">
                            {it.catalogEntryId
                              ? `#${it.catalogEntryId}`
                              : <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-xs ${drift.className}`}>
                              {drift.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {it.latestSyncEventType ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {it.catalogStatus ?? "—"}
                          </TableCell>
                          <TableCell>
                            {it.repaired ? (
                              <span className="inline-flex items-center gap-1 text-xs text-green-400">
                                <CheckCircle2 className="h-3 w-3" />
                                yes
                              </span>
                            ) : it.driftCase === "in_sync" ? (
                              <span className="text-xs text-muted-foreground">
                                n/a
                              </span>
                            ) : result.dryRun ? (
                              <span className="inline-flex items-center gap-1 text-xs text-yellow-400">
                                <AlertTriangle className="h-3 w-3" />
                                pending
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-red-400">
                                <XCircle className="h-3 w-3" />
                                failed
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
