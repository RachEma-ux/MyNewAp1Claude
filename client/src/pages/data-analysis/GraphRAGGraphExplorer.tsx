import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, GitFork, CircleDot, ArrowRight, Users } from "lucide-react";
import { WorkerOfflineBanner } from "./GraphRAGWorkerBanner";

interface Props {
  workerOnline?: boolean;
}

export function GraphRAGGraphExplorer({ workerOnline = false }: Props) {
  const [moduleSlug, setModuleSlug] = useState("");
  const [datasetKey, setDatasetKey] = useState("");

  const { data: sources } = trpc.dataAnalysis.graphRag.listSources.useQuery();

  const { data: entities, isLoading: entLoading } =
    trpc.dataAnalysis.graphRag.listEntities.useQuery(
      { moduleSlug, datasetKey },
      { enabled: !!moduleSlug && !!datasetKey }
    );

  const { data: relationships, isLoading: relLoading } =
    trpc.dataAnalysis.graphRag.listRelationships.useQuery(
      { moduleSlug, datasetKey },
      { enabled: !!moduleSlug && !!datasetKey }
    );

  const { data: communities, isLoading: comLoading } =
    trpc.dataAnalysis.graphRag.listCommunities.useQuery(
      { moduleSlug, datasetKey },
      { enabled: !!moduleSlug && !!datasetKey }
    );

  function handleSourceSelect(sourceId: string) {
    const src = sources?.find((s) => String(s.id) === sourceId);
    if (src) {
      setModuleSlug(src.moduleSlug);
      setDatasetKey(src.datasetKey);
    }
  }

  const loading = entLoading || relLoading || comLoading;

  return (
    <div className="space-y-4 mt-4">
      {!workerOnline && (
        <WorkerOfflineBanner context="Graph exploration" />
      )}

      {/* Source Selector */}
      <Card>
        <CardContent className="pt-4">
          <div className="max-w-sm">
            <Label>Dataset</Label>
            <Select onValueChange={handleSourceSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Select a dataset to explore..." />
              </SelectTrigger>
              <SelectContent>
                {sources?.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.displayName} ({s.moduleSlug})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {moduleSlug && datasetKey && (
        <Tabs defaultValue="entities">
          <TabsList>
            <TabsTrigger value="entities" className="flex items-center gap-1">
              <CircleDot className="w-3 h-3" />
              Entities
            </TabsTrigger>
            <TabsTrigger value="relationships" className="flex items-center gap-1">
              <ArrowRight className="w-3 h-3" />
              Relationships
            </TabsTrigger>
            <TabsTrigger value="communities" className="flex items-center gap-1">
              <Users className="w-3 h-3" />
              Communities
            </TabsTrigger>
          </TabsList>

          <TabsContent value="entities">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Entities</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : !entities?.available ? (
                  <div className="text-sm text-muted-foreground py-4">
                    <GitFork className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-center">{entities?.message}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {entities.entities.map((e) => (
                      <div
                        key={e.id}
                        className="flex items-center gap-2 p-2 rounded border"
                      >
                        <Badge variant="outline">{e.type}</Badge>
                        <span className="font-medium text-sm">{e.name}</span>
                        <span className="text-xs text-muted-foreground flex-1 truncate">
                          {e.description}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="relationships">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Relationships</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : !relationships?.available ? (
                  <div className="text-sm text-muted-foreground py-4 text-center">
                    {relationships?.message}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {relationships.relationships.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center gap-2 p-2 rounded border text-sm"
                      >
                        <span className="font-medium">{r.source}</span>
                        <ArrowRight className="w-3 h-3" />
                        <span className="font-medium">{r.target}</span>
                        <Badge variant="secondary">{r.type}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="communities">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Communities</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : !communities?.available ? (
                  <div className="text-sm text-muted-foreground py-4 text-center">
                    {communities?.message}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {communities.communities.map((c) => (
                      <Card key={c.id}>
                        <CardContent className="py-3">
                          <div className="flex items-center gap-2">
                            <Badge>Level {c.level}</Badge>
                            <span className="font-medium text-sm">{c.title}</span>
                            <span className="text-xs text-muted-foreground">
                              {c.entityCount} entities
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {c.summary}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
