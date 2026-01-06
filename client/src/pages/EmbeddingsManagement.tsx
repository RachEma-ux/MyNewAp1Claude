import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export default function EmbeddingsManagement() {
  const [text, setText] = useState("");
  const [selectedModel, setSelectedModel] = useState("bge-large-en");
  const [result, setResult] = useState<{ embedding: number[]; model: string; dimensions: number } | null>(null);

  const modelsQuery = trpc.embeddings.getAvailableModels.useQuery();
  const cacheStatsQuery = trpc.embeddings.getCacheStats.useQuery();
  const generateMutation = trpc.embeddings.generate.useMutation();
  const clearCacheMutation = trpc.embeddings.clearCache.useMutation();

  const handleGenerate = async () => {
    if (!text.trim()) return;

    try {
      const response = await generateMutation.mutateAsync({
        texts: [text],
        model: selectedModel as any,
      });
      // Response is { embeddings: number[][], model: string, dimensions: number }
      setResult({
        embedding: response.embeddings[0],
        model: response.model,
        dimensions: response.dimensions,
      });
    } catch (error) {
      console.error("Failed to generate embedding:", error);
    }
  };

  const handleClearCache = async () => {
    try {
      await clearCacheMutation.mutateAsync();
      cacheStatsQuery.refetch();
    } catch (error) {
      console.error("Failed to clear cache:", error);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Embeddings Management</h1>
        <p className="text-muted-foreground">
          Generate text embeddings using various models for semantic search and RAG
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Generator */}
        <Card>
          <CardHeader>
            <CardTitle>Generate Embeddings</CardTitle>
            <CardDescription>Convert text into vector embeddings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="model">Model</Label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger id="model">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {modelsQuery.data?.map((model) => (
                    <SelectItem key={model.model} value={model.model}>
                      {model.model} ({model.dimensions}d)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="text">Text</Label>
              <Textarea
                id="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Enter text to embed..."
                rows={6}
              />
            </div>

            <Button
              onClick={handleGenerate}
              disabled={!text.trim() || generateMutation.isPending}
              className="w-full"
            >
              {generateMutation.isPending ? "Generating..." : "Generate Embedding"}
            </Button>

            {result && (
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold">Result</span>
                  <Badge>{result.dimensions} dimensions</Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  Model: {result.model}
                </div>
                <div className="mt-2 p-2 bg-background rounded text-xs font-mono overflow-auto max-h-32">
                  [{result.embedding.slice(0, 10).map((v) => v.toFixed(4)).join(", ")}...]
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Available Models */}
        <Card>
          <CardHeader>
            <CardTitle>Available Models</CardTitle>
            <CardDescription>Embedding models ready for use</CardDescription>
          </CardHeader>
          <CardContent>
            {modelsQuery.isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading models...</div>
            ) : (
              <div className="space-y-3">
                {modelsQuery.data?.map((model) => (
                  <div
                    key={model.model}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <div className="font-medium">{model.model}</div>
                      <div className="text-sm text-muted-foreground">
                        {model.device.toUpperCase()} • Max batch: {model.maxBatchSize}
                      </div>
                    </div>
                    <Badge variant="outline">{model.dimensions}d</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cache Statistics */}
        <Card>
          <CardHeader>
            <CardTitle>Cache Statistics</CardTitle>
            <CardDescription>Embedding cache performance metrics</CardDescription>
          </CardHeader>
          <CardContent>
            {cacheStatsQuery.isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading stats...</div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-2xl font-bold">{cacheStatsQuery.data?.size || 0}</div>
                    <div className="text-sm text-muted-foreground">Cached Items</div>
                  </div>
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-2xl font-bold">
                      {cacheStatsQuery.data?.maxSize || 0}
                    </div>
                    <div className="text-sm text-muted-foreground">Max Capacity</div>
                  </div>
                </div>

                {cacheStatsQuery.data && (
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="text-sm text-muted-foreground mb-1">Usage</div>
                    <div className="text-2xl font-bold">
                      {(
                        (cacheStatsQuery.data.size / cacheStatsQuery.data.maxSize) *
                        100
                      ).toFixed(1)}
                      %
                    </div>
                  </div>
                )}

                <Button
                  variant="outline"
                  onClick={handleClearCache}
                  disabled={clearCacheMutation.isPending}
                  className="w-full"
                >
                  {clearCacheMutation.isPending ? "Clearing..." : "Clear Cache"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Usage Guide */}
        <Card>
          <CardHeader>
            <CardTitle>Usage Guide</CardTitle>
            <CardDescription>How to use embeddings in your application</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <div className="font-semibold mb-1">1. Generate Embeddings</div>
              <p className="text-muted-foreground">
                Convert text into vector representations for semantic search
              </p>
            </div>
            <div>
              <div className="font-semibold mb-1">2. Store in Vector Database</div>
              <p className="text-muted-foreground">
                Save embeddings to Qdrant for efficient similarity search
              </p>
            </div>
            <div>
              <div className="font-semibold mb-1">3. Query with Semantic Search</div>
              <p className="text-muted-foreground">
                Find similar content using vector similarity instead of keywords
              </p>
            </div>
            <div>
              <div className="font-semibold mb-1">4. Enable RAG</div>
              <p className="text-muted-foreground">
                Use retrieved context to enhance LLM responses with relevant information
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
