/**
 * RAC P11 — CAG Capability Pack inspector panel.
 *
 * Reads `agentStudio.cag.getLatestPack` for the latest persisted pack
 * (P1A store) and `agentStudio.cag.previewInjectedContext` for the
 * dry-run composer output (P1D). The pack view is structured by section
 * (identity → skills → tools → sources) so reviewers can verify the
 * D-TOOL-3 boundary (no input-schema JSON, no example invocations) and
 * the D-PRM-4 collision-A rule (mission line stripped at render).
 *
 * Tools render their `riskClass` badge so D-TOOL-4 hard-block conditions
 * (quarantined, code_execution-without-sandbox) are visible without
 * cross-referencing the export wizard.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Eye, RefreshCw } from "lucide-react";
import { LoadingState, EmptyState, SectionLabel } from "./ui";

interface Props {
  workspaceId: number;
  agentId: number;
}

const RISK_TONE: Record<string, string> = {
  read_only: "border-emerald-700/40 text-emerald-400",
  write: "border-amber-700/40 text-amber-400",
  external_side_effect: "border-amber-700/40 text-amber-400",
  destructive: "border-red-700/40 text-red-400",
  governance_sensitive: "border-amber-700/40 text-amber-400",
  credential_sensitive: "border-fuchsia-700/40 text-fuchsia-400",
  code_execution: "border-blue-700/40 text-blue-400",
  quarantined: "border-red-800/50 text-red-300",
};

export default function CagPackPanel({ workspaceId, agentId }: Props) {
  const packQuery = trpc.agentStudio.cag.getLatestPack.useQuery({
    workspaceId,
    agentId,
  });
  const utils = trpc.useUtils();
  const [previewVisible, setPreviewVisible] = useState(false);
  const previewQuery = trpc.agentStudio.cag.previewInjectedContext.useQuery(
    { workspaceId, agentId, mode: "safe_degraded" },
    { enabled: previewVisible },
  );

  const pack = packQuery.data;
  const content = (pack as { contentJson?: any } | undefined)?.contentJson as
    | {
        identity?: { name?: string; role?: string | null; scope?: string | null };
        skills?: Array<{ name: string; summary: string }>;
        tools?: Array<{
          name: string;
          riskClass: string;
          summary: string;
          approvalRequired?: boolean;
          sandboxRequired?: boolean;
        }>;
        sources?: Array<{ sourceType: string; refId: string }>;
      }
    | undefined;

  if (packQuery.isLoading) return <LoadingState label="Loading capability pack…" />;
  if (packQuery.isError) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-red-400">
          Failed to load CAG pack:{" "}
          {(packQuery.error as { message?: string } | null)?.message ?? "unknown"}
        </CardContent>
      </Card>
    );
  }
  if (!pack || !content) {
    return (
      <EmptyState
        title="No capability pack yet"
        description="The CAG builder writes a pack on the next chat run. Trigger a chat or run the builder via the API to populate this view."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <SectionLabel>Identity</SectionLabel>
              <div className="text-sm font-medium">
                {content.identity?.name ?? "(unnamed)"}
              </div>
              <div className="text-xs text-muted-foreground">
                role: {content.identity?.role ?? "—"} · scope:{" "}
                {content.identity?.scope ?? "—"}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void utils.agentStudio.cag.getLatestPack.invalidate({
                  workspaceId,
                  agentId,
                });
              }}
            >
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-2">
          <SectionLabel>Tools ({content.tools?.length ?? 0})</SectionLabel>
          {content.tools && content.tools.length > 0 ? (
            <ul className="space-y-1">
              {content.tools.map((t) => (
                <li
                  key={t.name}
                  className="flex items-start gap-2 text-sm border-b border-border/40 pb-1"
                >
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      RISK_TONE[t.riskClass] ?? "border-zinc-700 text-zinc-400"
                    }`}
                  >
                    {t.riskClass}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{t.name}</div>
                    <div className="text-xs text-muted-foreground break-words">
                      {t.summary || "(no summary)"}
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground shrink-0">
                    {t.approvalRequired ? "approval" : ""}
                    {t.approvalRequired && t.sandboxRequired ? " · " : ""}
                    {t.sandboxRequired ? "sandbox" : ""}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">No tools in this pack.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-2">
          <SectionLabel>Skills ({content.skills?.length ?? 0})</SectionLabel>
          {content.skills && content.skills.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {content.skills.map((s) => (
                <li key={s.name} className="border-b border-border/40 pb-1">
                  <span className="font-medium">{s.name}</span>{" "}
                  <span className="text-xs text-muted-foreground">{s.summary}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">No skills in this pack.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-2">
          <SectionLabel>Sources ({content.sources?.length ?? 0})</SectionLabel>
          {content.sources && content.sources.length > 0 ? (
            <ul className="text-xs text-muted-foreground space-y-0.5">
              {content.sources.map((s, i) => (
                <li key={`${s.sourceType}:${s.refId}:${i}`}>
                  <code>{s.sourceType}</code> → {s.refId}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">No source manifest.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between">
            <SectionLabel>Composer dry-run preview</SectionLabel>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPreviewVisible((v) => !v)}
            >
              <Eye className="h-3 w-3 mr-1" />
              {previewVisible ? "Hide" : "Show"}
            </Button>
          </div>
          {previewVisible && previewQuery.isLoading && (
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> Running composer…
            </div>
          )}
          {previewVisible && previewQuery.isError && (
            <p className="text-xs text-red-400">
              Preview failed:{" "}
              {(previewQuery.error as { message?: string } | null)?.message ??
                "unknown"}
            </p>
          )}
          {previewVisible && previewQuery.data && (
            <div className="space-y-2">
              <div className="text-[10px] text-muted-foreground">
                tokens≈{(previewQuery.data as { tokenEstimate?: number }).tokenEstimate ?? "?"}
                {Array.isArray((previewQuery.data as { warnings?: string[] }).warnings) &&
                (previewQuery.data as { warnings: string[] }).warnings.length > 0
                  ? ` · warnings: ${(previewQuery.data as { warnings: string[] }).warnings.join(", ")}`
                  : ""}
              </div>
              <pre className="text-[11px] bg-muted/30 rounded p-2 max-h-[40vh] overflow-auto whitespace-pre-wrap break-words">
                {String((previewQuery.data as { prompt?: string }).prompt ??
                  JSON.stringify(previewQuery.data, null, 2))}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
