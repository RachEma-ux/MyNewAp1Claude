import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Search, Library } from "lucide-react";
import { useLocation } from "wouter";

export default function PSMLibraryPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);

  const categoriesQuery = trpc.psm.catalog.getCategories.useQuery();
  const methodsQuery = trpc.psm.catalog.list.useQuery({
    categoryId: selectedCategory ?? undefined,
    status: "active",
  });

  const categories = categoriesQuery.data ?? [];
  const methods = methodsQuery.data ?? [];

  const filtered = useMemo(() => {
    if (!search.trim()) return methods;
    const q = search.toLowerCase();
    return methods.filter((m: any) =>
      m.name?.toLowerCase().includes(q) || m.description?.toLowerCase().includes(q)
    );
  }, [methods, search]);

  const complexityColor = (c: string) => {
    if (c === "low") return "text-green-500 border-green-500/30";
    if (c === "high") return "text-red-500 border-red-500/30";
    return "text-amber-500 border-amber-500/30";
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Library className="h-4 w-4 text-teal-500" /> Method Library
          {methods.length > 0 && (
            <Badge variant="secondary" className="text-[9px] px-1.5">{methods.length}</Badge>
          )}
        </h2>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input className="h-8 text-xs pl-8" placeholder="Search methods..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-1">
        <Button size="sm" variant={selectedCategory === null ? "default" : "outline"} className="h-6 text-[10px] px-2"
          onClick={() => setSelectedCategory(null)}>All</Button>
        {categories.map((cat: any) => (
          <Button key={cat.id} size="sm" variant={selectedCategory === cat.id ? "default" : "outline"} className="h-6 text-[10px] px-2"
            onClick={() => setSelectedCategory(cat.id)}>{cat.name}</Button>
        ))}
      </div>

      {/* Methods grid */}
      <ScrollArea className="h-[calc(100vh-14rem)]">
        {methodsQuery.isLoading && (
          <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin" /></div>
        )}
        {!methodsQuery.isLoading && filtered.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">No methods found.</p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pr-2">
          {filtered.map((m: any) => (
            <Card key={m.id} className="hover:border-teal-500/30 transition-colors cursor-pointer"
              onClick={() => navigate(`/psm/methods/${m.id}`)}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between">
                  <p className="text-xs font-semibold">{m.name}</p>
                  <Badge variant="outline" className={`text-[9px] px-1 py-0 ${complexityColor(m.complexity)}`}>
                    {m.complexity}
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground line-clamp-2 mt-1">{m.description}</p>
                <div className="flex items-center gap-1.5 mt-2">
                  <Badge variant="outline" className="text-[8px] px-1 py-0">{m.timeframe}</Badge>
                  <Badge variant="outline" className="text-[8px] px-1 py-0">{m.participantsMin}-{m.participantsMax} people</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
