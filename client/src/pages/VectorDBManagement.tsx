import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Trash2, Search, Database } from "lucide-react";

export default function VectorDBManagement() {
  const [newCollectionName, setNewCollectionName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCollection, setSearchCollection] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const createCollectionMutation = trpc.vectordb.createCollection.useMutation();
  const deleteCollectionMutation = trpc.vectordb.deleteCollection.useMutation();
  // Search is a query, not a mutation - we'll use manual fetching
  const utils = trpc.useUtils();

  const handleCreateCollection = async () => {
    if (!newCollectionName.trim()) return;

    try {
      await createCollectionMutation.mutateAsync({
        name: newCollectionName,
        vectorSize: 1536, // Default OpenAI embedding dimension
      });
      setNewCollectionName("");
    } catch (error) {
      console.error("Failed to create collection:", error);
    }
  };

  const handleDeleteCollection = async (name: string) => {
    if (!confirm(`Delete collection "${name}"?`)) return;

    try {
      await deleteCollectionMutation.mutateAsync({ name });
    } catch (error) {
      console.error("Failed to delete collection:", error);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim() || !searchCollection.trim()) return;

    try {
      // For now, show a message that search requires embedding the query first
      alert("Search requires converting query to embedding first. Use Embeddings page to generate embedding, then use vectordb.search API with the embedding vector.");
      setSearchResults([]);
    } catch (error) {
      console.error("Failed to search:", error);
      setSearchResults([]);
    }
  };

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Vector Database Management</h1>
        <p className="text-muted-foreground">
          Manage Qdrant collections and perform semantic search
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Create Collection */}
        <Card>
          <CardHeader>
            <CardTitle>Create Collection</CardTitle>
            <CardDescription>Create a new vector collection</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="collection-name">Collection Name</Label>
              <Input
                id="collection-name"
                value={newCollectionName}
                onChange={(e) => setNewCollectionName(e.target.value)}
                placeholder="my-documents"
              />
            </div>

            <Button
              onClick={handleCreateCollection}
              disabled={!newCollectionName.trim() || createCollectionMutation.isPending}
              className="w-full"
            >
              <Database className="w-4 h-4 mr-2" />
              {createCollectionMutation.isPending ? "Creating..." : "Create Collection"}
            </Button>

            <div className="text-sm text-muted-foreground">
              Collections store vector embeddings for semantic search. Each collection has a fixed
              dimension (default: 1536 for OpenAI embeddings).
            </div>
          </CardContent>
        </Card>

        {/* Semantic Search */}
        <Card>
          <CardHeader>
            <CardTitle>Semantic Search</CardTitle>
            <CardDescription>Search vectors by similarity</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="search-collection">Collection</Label>
              <Input
                id="search-collection"
                value={searchCollection}
                onChange={(e) => setSearchCollection(e.target.value)}
                placeholder="my-documents"
              />
            </div>

            <div>
              <Label htmlFor="search-query">Query</Label>
              <Textarea
                id="search-query"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Enter search query..."
                rows={3}
              />
            </div>

            <Button
              onClick={handleSearch}
              disabled={!searchQuery.trim() || !searchCollection.trim()}
              className="w-full"
            >
              <Search className="w-4 h-4 mr-2" />
              Search
            </Button>

            {searchResults.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="font-semibold">Results ({searchResults.length})</div>
                {searchResults.map((result, idx) => (
                  <div key={idx} className="p-3 bg-muted rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">Match #{idx + 1}</span>
                      <Badge variant="outline">
                        Score: {(result.score * 100).toFixed(1)}%
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      ID: {result.id}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Usage Guide */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>How to Use Vector Database</CardTitle>
            <CardDescription>Complete workflow for semantic search</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="p-4 border rounded-lg">
                <div className="text-2xl font-bold mb-2">1</div>
                <div className="font-semibold mb-1">Create Collection</div>
                <p className="text-sm text-muted-foreground">
                  Set up a collection with appropriate dimensions
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="text-2xl font-bold mb-2">2</div>
                <div className="font-semibold mb-1">Generate Embeddings</div>
                <p className="text-sm text-muted-foreground">
                  Use the Embeddings page to convert text to vectors
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="text-2xl font-bold mb-2">3</div>
                <div className="font-semibold mb-1">Insert Vectors</div>
                <p className="text-sm text-muted-foreground">
                  Store embeddings in the collection via API
                </p>
              </div>
              <div className="p-4 border rounded-lg">
                <div className="text-2xl font-bold mb-2">4</div>
                <div className="font-semibold mb-1">Semantic Search</div>
                <p className="text-sm text-muted-foreground">
                  Query with natural language to find similar content
                </p>
              </div>
            </div>

            <div className="mt-6 p-4 bg-muted rounded-lg">
              <div className="font-semibold mb-2">Integration with RAG</div>
              <p className="text-sm text-muted-foreground">
                Vector search powers Retrieval-Augmented Generation (RAG). When you ask a question
                in chat with RAG enabled, the system: (1) Converts your question to an embedding,
                (2) Searches for similar document chunks, (3) Injects relevant context into the LLM
                prompt, (4) Generates a grounded response with sources.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
