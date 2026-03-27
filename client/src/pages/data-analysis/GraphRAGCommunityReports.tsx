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
import { Loader2, FileText } from "lucide-react";

export function GraphRAGCommunityReports() {
  const [moduleSlug, setModuleSlug] = useState("");
  const [datasetKey, setDatasetKey] = useState("");

  const { data: sources } = trpc.dataAnalysis.graphRag.listSources.useQuery();

  const { data: reports, isLoading } =
    trpc.dataAnalysis.graphRag.listCommunityReports.useQuery(
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

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardContent className="pt-4">
          <div className="max-w-sm">
            <Label>Dataset</Label>
            <Select onValueChange={handleSourceSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Select a dataset..." />
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
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Community Reports
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : !reports?.available ? (
              <div className="py-8 text-center">
                <FileText className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {reports?.message}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {reports.reports.map((r) => (
                  <Card key={r.communityId}>
                    <CardContent className="py-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge>Level {r.level}</Badge>
                        <h3 className="font-medium text-sm">{r.title}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        {r.summary}
                      </p>
                      {r.findings.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-medium mb-1">Findings:</p>
                          <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                            {r.findings.map((f, i) => (
                              <li key={i}>{f}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
