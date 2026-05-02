import { trpc } from "@/lib/trpc";
import { useParams, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ArrowLeft, PlayCircle, Clock, Users } from "lucide-react";
import { toast } from "sonner";

export default function PSMMethodDetailPage() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const methodId = Number(params.id);

  const methodQuery = trpc.psm.catalog.getMethodById.useQuery({ id: methodId }, { enabled: !!methodId });
  const m = methodQuery.data;

  if (methodQuery.isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  if (!m) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-muted-foreground">Method not found.</p>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => navigate("/psm/library")}>
          <ArrowLeft className="h-3 w-3 mr-1" /> Back to Library
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      {/* Back */}
      <Button size="sm" variant="ghost" className="text-xs" onClick={() => navigate("/psm/library")}>
        <ArrowLeft className="h-3 w-3 mr-1" /> Library
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold">{m.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">{m.description}</p>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="text-[10px] capitalize">{m.complexity}</Badge>
            <Badge variant="outline" className="text-[10px] flex items-center gap-1">
              <Clock className="h-2.5 w-2.5" /> {m.timeframe}
            </Badge>
            <Badge variant="outline" className="text-[10px] flex items-center gap-1">
              <Users className="h-2.5 w-2.5" /> {m.participantsMin}-{m.participantsMax}
            </Badge>
          </div>
          {m.aliases && m.aliases.length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-1">Also known as: {m.aliases.join(", ")}</p>
          )}
        </div>
        <Button size="sm" onClick={() => {
          toast.info("Create a case first, then start a workflow from the case page.");
          navigate("/psm/cases");
        }}>
          <PlayCircle className="h-3 w-3 mr-1" /> Start Workflow
        </Button>
      </div>

      {/* Tags */}
      {m.tags && m.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {m.tags.map((tag: string) => (
            <Badge key={tag} variant="outline" className="text-[8px] px-1 py-0">{tag}</Badge>
          ))}
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="h-8">
          <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="workflow" className="text-xs">Workflow</TabsTrigger>
          <TabsTrigger value="bestfor" className="text-xs">Best For</TabsTrigger>
          <TabsTrigger value="tools" className="text-xs">Tools</TabsTrigger>
          <TabsTrigger value="example" className="text-xs">Example</TabsTrigger>
          <TabsTrigger value="related" className="text-xs">Related</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card><CardContent className="p-4 text-sm whitespace-pre-wrap">{m.definition?.definition || m.summary || "No definition available."}</CardContent></Card>
        </TabsContent>

        <TabsContent value="workflow">
          {m.workflow && m.workflow.steps && m.workflow.steps.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{m.workflow.description}</p>
              {m.workflow.steps.map((step: any, idx: number) => (
                <Card key={idx}>
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                      <Badge className="text-[10px] h-5 w-5 flex items-center justify-center rounded-full p-0">{step.stepNumber || idx + 1}</Badge>
                      <p className="text-xs font-semibold">{step.title}</p>
                      <Badge variant="outline" className="text-[9px] ml-auto">{step.durationMinutes} min</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">{step.description}</p>
                    {step.deliverable && (
                      <p className="text-[10px] text-teal-500 mt-1">Deliverable: {step.deliverable}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-4">No workflow defined.</p>
          )}
        </TabsContent>

        <TabsContent value="bestfor">
          <Card><CardContent className="p-4 text-sm">{m.definition?.bestFor || "No information available."}</CardContent></Card>
        </TabsContent>

        <TabsContent value="tools">
          <Card><CardContent className="p-4 text-sm">{m.definition?.tools || "No tools information available."}</CardContent></Card>
        </TabsContent>

        <TabsContent value="example">
          <Card><CardContent className="p-4 text-sm">{m.definition?.example || "No example available."}</CardContent></Card>
        </TabsContent>

        <TabsContent value="related">
          {m.relations && m.relations.length > 0 ? (
            <div className="space-y-2">
              {m.relations.map((r: any) => (
                <Card key={r.id} className="cursor-pointer hover:border-teal-500/30" onClick={() => navigate(`/psm/methods/${r.relatedMethodId}`)}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <span className="text-xs">Method #{r.relatedMethodId}</span>
                    <Badge variant="outline" className="text-[9px] capitalize">{r.relationType}</Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-4">No related methods.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
