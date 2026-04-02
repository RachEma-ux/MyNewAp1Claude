import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useParams, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ArrowLeft, PlayCircle, StickyNote, GitBranch, Compass } from "lucide-react";
import { toast } from "sonner";

export default function PSMCaseDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const caseId = Number(params.id);
  const [noteText, setNoteText] = useState("");

  const caseQuery = trpc.psm.cases.getById.useQuery({ id: caseId }, { enabled: !!caseId });
  const c = caseQuery.data;

  const addNoteMutation = trpc.psm.cases.addNote.useMutation({
    onSuccess: () => { toast.success("Note added"); setNoteText(""); caseQuery.refetch(); },
  });

  const startRunMutation = trpc.psm.workflow.startRun.useMutation({
    onSuccess: (data: any) => {
      toast.success("Workflow started");
      if (data?.id) navigate(`/psm/runs/${data.id}`);
    },
    onError: () => toast.error("Failed to start workflow"),
  });

  if (caseQuery.isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  if (!c) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-muted-foreground">Case not found.</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => navigate("/psm/cases")}>
          <ArrowLeft className="h-3 w-3 mr-1" /> Back to Cases
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <Button size="sm" variant="ghost" className="text-xs" onClick={() => navigate("/psm/cases")}>
        <ArrowLeft className="h-3 w-3 mr-1" /> Cases
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">{c.title}</h1>
          {c.description && <p className="text-sm text-muted-foreground mt-1">{c.description}</p>}
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="text-[10px] capitalize">{c.status}</Badge>
            <span className="text-[10px] text-muted-foreground">Case #{c.id}</span>
          </div>
        </div>
        <Button size="sm" variant="outline" className="text-xs" onClick={() => navigate("/psm/selector")}>
          <Compass className="h-3 w-3 mr-1" /> Get Recommendations
        </Button>
      </div>

      <Tabs defaultValue="methods">
        <TabsList className="h-8">
          <TabsTrigger value="methods" className="text-xs">Methods</TabsTrigger>
          <TabsTrigger value="runs" className="text-xs">Runs</TabsTrigger>
          <TabsTrigger value="notes" className="text-xs">Notes</TabsTrigger>
          <TabsTrigger value="decisions" className="text-xs">Decisions</TabsTrigger>
          <TabsTrigger value="recommendations" className="text-xs">Recs</TabsTrigger>
        </TabsList>

        {/* Selected Methods */}
        <TabsContent value="methods">
          {c.selectedMethods && c.selectedMethods.length > 0 ? (
            <div className="space-y-2">
              {c.selectedMethods.map((sm: any) => (
                <Card key={sm.id}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold">Method #{sm.methodId}</p>
                      {sm.reason && <p className="text-[10px] text-muted-foreground mt-0.5">{sm.reason}</p>}
                    </div>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => navigate(`/psm/methods/${sm.methodId}`)}>
                        View
                      </Button>
                      <Button
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => startRunMutation.mutate({ caseId: c.id, methodId: sm.methodId })}
                        disabled={startRunMutation.isPending}
                      >
                        <PlayCircle className="h-3 w-3 mr-1" /> Run
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-4">No methods selected. Use the Selector to get recommendations.</p>
          )}
        </TabsContent>

        {/* Runs */}
        <TabsContent value="runs">
          {c.runs && c.runs.length > 0 ? (
            <div className="space-y-2">
              {c.runs.map((run: any) => (
                <Card key={run.id} className="cursor-pointer hover:border-teal-500/30" onClick={() => navigate(`/psm/runs/${run.id}`)}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold">Run #{run.id}</p>
                      <p className="text-[10px] text-muted-foreground">Method #{run.methodId}</p>
                    </div>
                    <Badge variant="outline" className="text-[9px] capitalize">{run.status}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-4">No workflow runs yet.</p>
          )}
        </TabsContent>

        {/* Notes */}
        <TabsContent value="notes">
          <div className="space-y-3">
            <div className="flex gap-2">
              <Textarea
                className="text-xs h-16 resize-none flex-1"
                placeholder="Add a note..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
              />
              <Button
                size="sm"
                className="text-xs self-end"
                disabled={!noteText.trim() || addNoteMutation.isPending}
                onClick={() => addNoteMutation.mutate({ caseId: c.id, content: noteText.trim() })}
              >
                <StickyNote className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            {c.notes && c.notes.length > 0 ? (
              <div className="space-y-2">
                {c.notes.map((n: any) => (
                  <Card key={n.id}>
                    <CardContent className="p-3">
                      <p className="text-xs whitespace-pre-wrap">{n.content}</p>
                      <p className="text-[9px] text-muted-foreground mt-1">
                        {n.createdAt && new Date(n.createdAt).toLocaleString()}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground py-2">No notes yet.</p>
            )}
          </div>
        </TabsContent>

        {/* Decisions */}
        <TabsContent value="decisions">
          {c.decisions && c.decisions.length > 0 ? (
            <div className="space-y-2">
              {c.decisions.map((d: any) => (
                <Card key={d.id}>
                  <CardContent className="p-3">
                    <p className="text-xs font-semibold">{d.decision}</p>
                    {d.rationale && <p className="text-[10px] text-muted-foreground mt-1">{d.rationale}</p>}
                    <p className="text-[9px] text-muted-foreground mt-1">
                      {d.createdAt && new Date(d.createdAt).toLocaleString()}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-4">No decisions recorded.</p>
          )}
        </TabsContent>

        {/* Recommendations */}
        <TabsContent value="recommendations">
          {c.recommendations && c.recommendations.length > 0 ? (
            <div className="space-y-2">
              {c.recommendations.map((r: any) => (
                <Card key={r.id}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold">Method #{r.methodId}</p>
                      {r.explanation && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{r.explanation}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-[9px]">
                        Rank #{r.rank} · {r.score}
                      </Badge>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => navigate(`/psm/methods/${r.methodId}`)}>
                        <GitBranch className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-4">No recommendations yet. Use the Selector first.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
