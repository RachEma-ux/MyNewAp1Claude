/**
 * AI Agent Studio — Versions Page
 *
 * Version timeline, draft create, immutable snapshots, compare, rollback hook.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, GitBranch, GitCompare, Undo2 } from "lucide-react";
import {
  PageHeader,
  EmptyState,
  LoadingState,
} from "../components/ui";

export default function AgentVersionsPage({
  agentId,
  initialMode = "list",
}: {
  agentId: number;
  /** "list" shows the timeline; "compare" auto-opens the compare panel */
  initialMode?: "list" | "compare";
}) {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const versionsQuery = trpc.agentStudio.versions.list.useQuery({ agentId });

  const [label, setLabel] = useState("");
  const [summary, setSummary] = useState("");
  const [compareA, setCompareA] = useState<number | null>(null);
  const [compareB, setCompareB] = useState<number | null>(null);

  const createMut = trpc.agentStudio.versions.create.useMutation({
    onSuccess: () => {
      toast.success("Version created");
      setLabel("");
      setSummary("");
      utils.agentStudio.versions.list.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });

  const compareQuery = trpc.agentStudio.versions.compare.useQuery(
    { agentId, versionAId: compareA ?? 0, versionBId: compareB ?? 0 },
    { enabled: compareA !== null && compareB !== null }
  );

  const rollbackMut = trpc.agentStudio.versions.rollback.useMutation({
    onSuccess: () => {
      toast.success("Rolled back");
      // Rollback rewrites the draft + all bindings. Invalidate every section
      // query so any open section page sees the restored state on next read.
      utils.agentStudio.shell.getShellSummary.invalidate({ agentId });
      utils.agentStudio.identity.get.invalidate({ agentId });
      utils.agentStudio.behavior.get.invalidate({ agentId });
      utils.agentStudio.prompts.get.invalidate({ agentId });
      utils.agentStudio.prompts.assemblePreview.invalidate({ agentId });
      utils.agentStudio.tools.listBindings.invalidate({ agentId });
      utils.agentStudio.knowledge.getConfig.invalidate({ agentId });
      utils.agentStudio.memory.get.invalidate({ agentId });
      utils.agentStudio.workflows.get.invalidate({ agentId });
      utils.agentStudio.workflows.validate.invalidate({ agentId });
      utils.agentStudio.governance.get.invalidate({ agentId });
      utils.agentStudio.governance.evaluate.invalidate({ agentId });
      utils.agentStudio.publish.preflight.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });

  if (versionsQuery.isLoading) return <LoadingState label="Loading versions…" />;

  const versions = versionsQuery.data ?? [];

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Versions"
        subtitle="Immutable snapshots of the draft. Compare, rollback, or publish."
        icon={<GitBranch className="h-4 w-4 text-blue-500" />}
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      <Card className="lg:col-span-1">
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-blue-500" /> Create Version
          </h3>
          <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label (e.g. v1.0)" className="h-8 text-xs" />
          <Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Summary" className="h-8 text-xs" />
          <Button
            size="sm"
            onClick={() => createMut.mutate({ agentId, label, summary })}
            disabled={!label || createMut.isPending}
          >
            {createMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Snapshot Now
          </Button>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-base font-semibold">Version Timeline</h3>
            <Button
              size="sm"
              variant={initialMode === "compare" ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() =>
                navigate(
                  initialMode === "compare"
                    ? `/agent-studio/${agentId}/versions`
                    : `/agent-studio/${agentId}/versions/compare`
                )
              }
            >
              <GitCompare className="h-3 w-3 mr-1" />
              {initialMode === "compare" ? "Exit Compare" : "Compare Mode"}
            </Button>
          </div>
          {initialMode === "compare" && (
            <p className="text-[10px] text-muted-foreground mb-2">
              Compare mode — click <strong>A</strong> on one version and <strong>B</strong> on another to see the diff.
            </p>
          )}
          {versions.length === 0 ? (
            <EmptyState
              icon={<GitBranch className="h-7 w-7" />}
              title="No versions yet"
              description="Snapshot the current draft to create the first version."
            />
          ) : (
            <ul className="space-y-2">
              {versions.map((v: any) => (
                <li key={v.id} className="border rounded p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-mono text-[10px]">v{v.versionNumber}</span>{" "}
                      <span className="font-medium">{v.label}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant="outline" className="text-[9px]">
                        Readiness {v.readinessScore ?? 0}
                      </Badge>
                      <Badge variant="outline" className="text-[9px]">
                        {v.governanceVerdict ?? "—"}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={() => setCompareA(v.id)}
                        title="Compare A"
                      >
                        A
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={() => setCompareB(v.id)}
                        title="Compare B"
                      >
                        B
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Rollback to v${v.versionNumber} (${v.label})? This will overwrite the current draft (including tools, knowledge, memory, workflows).`
                            )
                          ) {
                            rollbackMut.mutate({ agentId, versionId: v.id });
                          }
                        }}
                        title="Rollback"
                      >
                        <Undo2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {v.summary} · {new Date(v.createdAt).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {compareA !== null && compareB !== null && compareQuery.data && (
            <div className="mt-3 border-t pt-3">
              <h4 className="text-xs font-semibold flex items-center gap-1">
                <GitCompare className="h-3 w-3" /> Diff
              </h4>
              <p className="text-[10px] text-muted-foreground">
                Readiness delta: {compareQuery.data.readinessDelta}
              </p>
              <ul className="space-y-1 text-[10px]">
                {compareQuery.data.diffs.map((d: any, i: number) => (
                  <li key={i} className="border rounded p-1.5">
                    <div className="font-mono">{d.field}</div>
                    <div className="text-red-300">- {String(d.before).slice(0, 80)}</div>
                    <div className="text-emerald-300">+ {String(d.after).slice(0, 80)}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
