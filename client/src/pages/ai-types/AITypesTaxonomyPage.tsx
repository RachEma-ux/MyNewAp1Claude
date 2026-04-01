import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Layers, ChevronRight, ChevronDown, Tag, BarChart3, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

type EntryType = "provider" | "llm" | "model" | "agent" | "bot";

const typeLabels: Record<EntryType, string> = {
  provider: "Providers",
  llm: "LLMs",
  model: "Models",
  agent: "Agents",
  bot: "Bots",
};

const typeColors: Record<EntryType, string> = {
  provider: "text-blue-400",
  llm: "text-purple-400",
  model: "text-emerald-400",
  agent: "text-orange-400",
  bot: "text-pink-400",
};

interface TaxonomyNode {
  id: number;
  parentId: number | null;
  entryType: string;
  level: string;
  key: string;
  label: string;
  description: string | null;
  sortOrder: number;
}

function TaxonomyTree({ nodes }: { nodes: TaxonomyNode[] }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const roots = nodes.filter((n) => n.parentId === null);
  const childrenOf = (parentId: number) => nodes.filter((n) => n.parentId === parentId);

  const renderNode = (node: TaxonomyNode, depth: number) => {
    const children = childrenOf(node.id);
    const hasChildren = children.length > 0;
    const isExpanded = expanded.has(node.id);

    const levelBadge =
      node.level === "axis"
        ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
        : node.level === "subcategory"
          ? "bg-purple-500/15 text-purple-400 border-purple-500/30"
          : "bg-zinc-500/15 text-zinc-400 border-zinc-500/30";

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-zinc-800/50 cursor-pointer`}
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
          onClick={() => hasChildren && toggle(node.id)}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
            )
          ) : (
            <Tag className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
          )}
          <span className="text-sm text-zinc-200">{node.label}</span>
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${levelBadge}`}>
            {node.level}
          </Badge>
          {hasChildren && (
            <span className="text-xs text-zinc-500 ml-auto">{children.length}</span>
          )}
        </div>
        {isExpanded && children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div className="space-y-0.5">
      {roots.map((root) => renderNode(root, 0))}
    </div>
  );
}

function CoveragePanel() {
  const { data: coverage, isLoading } = trpc.aiTypes.taxonomy.coverage.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {coverage?.map((item) => (
        <Card key={item.entryType} className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm font-medium ${typeColors[item.entryType as EntryType] || "text-zinc-300"}`}>
                {typeLabels[item.entryType as EntryType] || item.entryType}
              </span>
              <span className="text-xs text-zinc-500">
                {item.classified}/{item.total} classified
              </span>
            </div>
            <Progress value={item.coveragePercent} className="h-1.5" />
            <div className="flex justify-between mt-1.5">
              <span className="text-xs text-zinc-600">{item.coveragePercent}% coverage</span>
              {item.unclassified > 0 && (
                <span className="text-xs text-yellow-500">{item.unclassified} unclassified</span>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function StatsPanel() {
  const { data: stats, isLoading } = trpc.aiTypes.taxonomy.stats.useQuery();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
      </div>
    );
  }

  // Group by entryType
  const grouped: Record<string, Array<{ level: string; count: number }>> = {};
  stats?.forEach((row) => {
    if (!grouped[row.entryType]) grouped[row.entryType] = [];
    grouped[row.entryType].push({ level: row.level, count: row.count });
  });

  return (
    <div className="grid gap-3">
      {Object.entries(grouped).map(([entryType, levels]) => (
        <Card key={entryType} className="bg-zinc-900/50 border-zinc-800">
          <CardContent className="pt-4 pb-3 px-4">
            <span className={`text-sm font-medium ${typeColors[entryType as EntryType] || "text-zinc-300"}`}>
              {typeLabels[entryType as EntryType] || entryType}
            </span>
            <div className="flex gap-4 mt-2">
              {levels.map((l) => (
                <div key={l.level} className="text-center">
                  <div className="text-lg font-semibold text-zinc-200">{l.count}</div>
                  <div className="text-xs text-zinc-500">{l.level}s</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function AITypesTaxonomyPage() {
  const [selectedType, setSelectedType] = useState<EntryType>("agent");
  const { data: nodes, isLoading } = trpc.aiTypes.taxonomy.tree.useQuery({ entryType: selectedType });

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <div className="flex items-center gap-3 mb-6">
        <Layers className="h-6 w-6 text-blue-400" />
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">AI Types Taxonomy</h1>
          <p className="text-sm text-zinc-500">Multi-axis classification system for all AI type entries</p>
        </div>
      </div>

      <Tabs defaultValue="tree" className="space-y-4">
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="tree">Tree View</TabsTrigger>
          <TabsTrigger value="coverage">Coverage</TabsTrigger>
          <TabsTrigger value="stats">Statistics</TabsTrigger>
        </TabsList>

        <TabsContent value="tree" className="space-y-4">
          {/* Entry type selector */}
          <div className="flex gap-2">
            {(Object.keys(typeLabels) as EntryType[]).map((t) => (
              <button
                key={t}
                onClick={() => setSelectedType(t)}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                  selectedType === t
                    ? "bg-zinc-700 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
                }`}
              >
                {typeLabels[t]}
              </button>
            ))}
          </div>

          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-400 flex items-center gap-2">
                <Layers className="h-4 w-4" />
                {typeLabels[selectedType]} Taxonomy
                {nodes && (
                  <Badge variant="outline" className="text-xs ml-auto">
                    {nodes.length} nodes
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
                </div>
              ) : nodes && nodes.length > 0 ? (
                <TaxonomyTree nodes={nodes} />
              ) : (
                <p className="text-sm text-zinc-500 py-4 text-center">
                  No taxonomy nodes for {typeLabels[selectedType]}. Run seed to populate.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="coverage">
          <CoveragePanel />
        </TabsContent>

        <TabsContent value="stats">
          <StatsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
