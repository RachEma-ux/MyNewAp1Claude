/**
 * Knowledge Search — Full-text search across documents
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Search } from "lucide-react";

export function KnowledgeSearchPage({ workspaceId }: { workspaceId: number }) {
  const [query, setQuery] = useState("");

  const { data: results, isFetching } = trpc.modules.knowledge.search.query.useQuery(
    { workspaceId, q: query },
    { enabled: query.length >= 2 }
  );

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <Search className="h-6 w-6" />
        Search Knowledge Base
      </h1>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search documents by title..."
          className="pl-9"
        />
      </div>

      {isFetching ? (
        <div className="text-sm text-muted-foreground">Searching...</div>
      ) : results && results.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {results.length} result{results.length !== 1 ? "s" : ""}
          </p>
          {results.map((doc) => (
            <Card key={doc.id}>
              <CardContent className="py-3">
                <p className="text-sm font-medium">{doc.title}</p>
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]">
                    v{doc.version}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {doc.status || "draft"}
                  </Badge>
                  <span>{new Date(doc.updatedAt).toLocaleDateString()}</span>
                </div>
                {doc.content && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                    {doc.content.substring(0, 200)}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : query.length >= 2 ? (
        <div className="text-center py-8 text-muted-foreground">
          No results found for "{query}"
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          Type at least 2 characters to search
        </div>
      )}
    </div>
  );
}
