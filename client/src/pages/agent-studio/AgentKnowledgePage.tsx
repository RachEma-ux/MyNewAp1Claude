/**
 * AI Agent Studio — Knowledge Page
 *
 * Source library, source detail, context policy, retrieval preview.
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Plus, X, Search, BookOpen } from "lucide-react";
import {
  PageHeader,
  EmptyState,
  LoadingState,
} from "@/components/agent-studio/ui";

interface Binding {
  sourceKey: string;
  sourceName: string;
  priority: number;
  freshness: string;
  groundingMode: string;
  retrievalDepth: number;
  contextBudget: number;
}

export default function AgentKnowledgePage({ agentId }: { agentId: number }) {
  const utils = trpc.useUtils();
  const sourcesQuery = trpc.agentStudio.knowledge.listSources.useQuery();
  const configQuery = trpc.agentStudio.knowledge.getConfig.useQuery({ agentId });
  const updateMut = trpc.agentStudio.knowledge.updateConfig.useMutation({
    onSuccess: () => {
      toast.success("Knowledge updated");
      utils.agentStudio.knowledge.getConfig.invalidate({ agentId });
      utils.agentStudio.shell.getShellSummary.invalidate({ agentId });
    },
    onError: (e) => toast.error(e.message),
  });

  const [bindings, setBindings] = useState<Binding[]>([]);
  const [previewQuery, setPreviewQuery] = useState("");

  useEffect(() => {
    if (configQuery.data?.bindings) {
      setBindings(
        configQuery.data.bindings.map((b: any) => ({
          sourceKey: b.sourceKey,
          sourceName: b.sourceName,
          priority: b.priority ?? 50,
          freshness: b.freshness ?? "standard",
          groundingMode: b.groundingMode ?? "hybrid",
          retrievalDepth: b.retrievalDepth ?? 5,
          contextBudget: b.contextBudget ?? 4000,
        }))
      );
    }
  }, [configQuery.data]);

  const previewMut = trpc.agentStudio.knowledge.previewRetrieval.useQuery(
    { agentId, query: previewQuery },
    { enabled: false }
  );

  if (sourcesQuery.isLoading || configQuery.isLoading)
    return <LoadingState label="Loading knowledge…" />;

  const addBinding = (s: any) => {
    if (bindings.find((b) => b.sourceKey === s.key)) return;
    setBindings([
      ...bindings,
      {
        sourceKey: s.key,
        sourceName: s.name,
        priority: 50,
        freshness: "standard",
        groundingMode: "hybrid",
        retrievalDepth: 5,
        contextBudget: 4000,
      },
    ]);
  };

  const removeBinding = (key: string) => setBindings(bindings.filter((b) => b.sourceKey !== key));

  const updateBinding = (key: string, patch: Partial<Binding>) =>
    setBindings(bindings.map((b) => (b.sourceKey === key ? { ...b, ...patch } : b)));

  const handleSave = () => {
    updateMut.mutate({
      agentId,
      config: { defaultGrounding: "hybrid" },
      bindings,
    });
  };

  return (
    <div className="p-4 space-y-4">
      <PageHeader
        title="Knowledge"
        subtitle="Source library, attached bindings, retrieval policy, and live preview"
        icon={<BookOpen className="h-4 w-4" />}
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
      {/* Source library */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <h3 className="text-sm font-semibold">Source Library</h3>
          <ul className="space-y-1">
            {(sourcesQuery.data ?? []).map((s: any) => (
              <li key={s.key} className="flex items-center justify-between border rounded p-2 text-xs">
                <div>
                  <div className="font-medium">{s.name}</div>
                  <Badge variant="outline" className="text-[9px]">
                    {s.type}
                  </Badge>
                </div>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => addBinding(s)}>
                  <Plus className="h-3 w-3" />
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Source details + context policy */}
      <Card className="lg:col-span-2">
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold">Configured Sources</h3>
          {bindings.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="h-7 w-7" />}
              title="No sources attached"
              description="Click + on a source in the library to attach it."
            />
          ) : (
            <ul className="space-y-2">
              {bindings.map((b) => (
                <li key={b.sourceKey} className="border rounded p-2 text-xs">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium">{b.sourceName}</div>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => removeBinding(b.sourceKey)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Priority">
                      <Input
                        type="number"
                        value={b.priority}
                        onChange={(e) => updateBinding(b.sourceKey, { priority: parseInt(e.target.value, 10) || 0 })}
                        className="h-7 text-[10px]"
                      />
                    </Field>
                    <Field label="Freshness">
                      <select
                        value={b.freshness}
                        onChange={(e) => updateBinding(b.sourceKey, { freshness: e.target.value })}
                        className="h-7 px-2 rounded border bg-background text-[10px] w-full"
                      >
                        <option value="real-time">Real-time</option>
                        <option value="standard">Standard</option>
                        <option value="batch">Batch</option>
                      </select>
                    </Field>
                    <Field label="Grounding Mode">
                      <select
                        value={b.groundingMode}
                        onChange={(e) => updateBinding(b.sourceKey, { groundingMode: e.target.value })}
                        className="h-7 px-2 rounded border bg-background text-[10px] w-full"
                      >
                        <option value="strict">Strict</option>
                        <option value="hybrid">Hybrid</option>
                        <option value="loose">Loose</option>
                      </select>
                    </Field>
                    <Field label="Retrieval Depth">
                      <Input
                        type="number"
                        value={b.retrievalDepth}
                        onChange={(e) => updateBinding(b.sourceKey, { retrievalDepth: parseInt(e.target.value, 10) || 0 })}
                        className="h-7 text-[10px]"
                      />
                    </Field>
                    <Field label="Context Budget">
                      <Input
                        type="number"
                        value={b.contextBudget}
                        onChange={(e) => updateBinding(b.sourceKey, { contextBudget: parseInt(e.target.value, 10) || 0 })}
                        className="h-7 text-[10px]"
                      />
                    </Field>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Button size="sm" onClick={handleSave} disabled={updateMut.isPending}>
            {updateMut.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            Save Knowledge Config
          </Button>

          {/* Retrieval preview */}
          <div className="border-t pt-3 mt-3 space-y-2">
            <h4 className="text-xs font-semibold">Retrieval Preview</h4>
            <div className="flex items-center gap-2">
              <Input
                value={previewQuery}
                onChange={(e) => setPreviewQuery(e.target.value)}
                placeholder="Try a query..."
                className="h-7 text-xs"
              />
              <Button
                size="sm"
                onClick={() => previewMut.refetch()}
                disabled={!previewQuery}
                className="h-7"
              >
                <Search className="h-3 w-3 mr-1" /> Preview
              </Button>
            </div>
            {previewMut.data && (
              <div className="space-y-1">
                <div className="text-[10px] text-muted-foreground">
                  {previewMut.data.totalHits} hits · grounding:{" "}
                  <strong>{previewMut.data.groundingPolicy}</strong>
                </div>
                <ul className="text-[10px] space-y-1">
                  {previewMut.data.hits.map((r: any, i: number) => (
                    <li key={i} className="border rounded p-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono">[{r.source}]</span>
                        <span className="text-emerald-400">score={r.score}</span>
                      </div>
                      <div>{r.snippet}</div>
                      <div className="font-mono text-[9px] opacity-60">{r.uri}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <Label className="text-[9px] uppercase text-muted-foreground/70">{label}</Label>
      {children}
    </div>
  );
}
