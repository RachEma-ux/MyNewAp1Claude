import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Send, FlaskConical } from "lucide-react";
import { toast } from "sonner";

const METHODS = [
  { value: "basic", label: "Basic", description: "Keyword-based search" },
  { value: "local", label: "Local", description: "Entity-focused neighborhood search" },
  { value: "global", label: "Global", description: "Community-level summarization" },
  { value: "drift", label: "DRIFT", description: "Dynamic reasoning with iterative follow-up" },
] as const;

export function GraphRAGQueryLab() {
  const [moduleSlug, setModuleSlug] = useState("");
  const [datasetKey, setDatasetKey] = useState("");
  const [method, setMethod] = useState<string>("local");
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<{
    answer: string;
    status: string;
    error?: string;
  } | null>(null);

  const { data: sources } = trpc.dataAnalysis.graphRag.listSources.useQuery();

  const queryMut = trpc.dataAnalysis.graphRag.query.useMutation({
    onSuccess: (data) => {
      setResult({
        answer: data.answer,
        status: data.status,
        error: data.error,
      });
      if (data.status === "completed") {
        toast.success("Query completed");
      } else {
        toast.error(`Query failed: ${data.error}`);
      }
    },
    onError: (e) => {
      toast.error(e.message);
      setResult({ answer: "", status: "failed", error: e.message });
    },
  });

  // When a source is selected, populate moduleSlug and datasetKey
  function handleSourceSelect(sourceId: string) {
    const src = sources?.find((s) => String(s.id) === sourceId);
    if (src) {
      setModuleSlug(src.moduleSlug);
      setDatasetKey(src.datasetKey);
    }
  }

  function handleSubmit() {
    if (!moduleSlug || !datasetKey || !question.trim()) {
      toast.error("Select a dataset and enter a question");
      return;
    }
    setResult(null);
    queryMut.mutate({
      moduleSlug,
      datasetKey,
      method: method as any,
      question: question.trim(),
    });
  }

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <FlaskConical className="w-4 h-4" />
            Query Lab
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Source Selection */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Dataset Source</Label>
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

            <div>
              <Label>Search Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label} — {m.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <div className="text-xs text-muted-foreground">
                <p>
                  <strong>Module:</strong> {moduleSlug || "—"}
                </p>
                <p>
                  <strong>Dataset:</strong> {datasetKey || "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Question Input */}
          <div className="flex gap-2">
            <Input
              placeholder="Ask a question about this dataset..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="flex-1"
            />
            <Button
              onClick={handleSubmit}
              disabled={queryMut.isPending || !question.trim()}
            >
              {queryMut.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>

          {/* Method Descriptions */}
          <div className="flex gap-2 flex-wrap">
            {METHODS.map((m) => (
              <Badge
                key={m.value}
                variant={method === m.value ? "default" : "outline"}
                className="cursor-pointer"
                onClick={() => setMethod(m.value)}
              >
                {m.label}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Result */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              Result
              <Badge
                variant={
                  result.status === "completed" ? "default" : "destructive"
                }
              >
                {result.status}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {result.error ? (
              <p className="text-sm text-destructive">{result.error}</p>
            ) : (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <p className="whitespace-pre-wrap">{result.answer}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
