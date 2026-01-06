import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Toggle } from "@/components/ui/toggle";
import {
  Search,
  Globe,
  Database,
  FileText,
  Mail,
  Zap,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useState as useStateHook } from "react";

interface Tool {
  id: string;
  name: string;
  category: string;
  description: string;
  enabled: boolean;
}

const categoryIcons: Record<string, React.ReactNode> = {
  information: <Globe className="h-5 w-5" />,
  data: <Database className="h-5 w-5" />,
  file: <FileText className="h-5 w-5" />,
  communication: <Mail className="h-5 w-5" />,
  integration: <Zap className="h-5 w-5" />,
};

const categoryColors: Record<string, string> = {
  information: "bg-blue-50 border-blue-200",
  data: "bg-purple-50 border-purple-200",
  file: "bg-yellow-50 border-yellow-200",
  communication: "bg-green-50 border-green-200",
  integration: "bg-red-50 border-red-200",
};

export default function ToolsManagementPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [enabledTools, setEnabledTools] = useState<Set<string>>(new Set());

  // Query
  const toolsQuery = trpc.agents.listTools.useQuery();

  const tools = toolsQuery.data || [];

  const filteredTools = tools.filter((tool) => {
    const matchesSearch =
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = !selectedCategory || tool.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = Array.from(new Set(tools.map((t) => t.category)));

  const handleToggleTool = (toolId: string) => {
    const newEnabled = new Set(enabledTools);
    if (newEnabled.has(toolId)) {
      newEnabled.delete(toolId);
      toast({
        title: "Tool disabled",
        description: `Tool has been disabled`,
      });
    } else {
      newEnabled.add(toolId);
      toast({
        title: "Tool enabled",
        description: `Tool has been enabled`,
      });
    }
    setEnabledTools(newEnabled);
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Tools Management</h1>
        <p className="text-gray-600 mt-1">
          Manage available tools and integrations for your agents
        </p>
      </div>

      {/* Search and Filter */}
      <Card className="p-4">
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search tools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Category Filter */}
          <div>
            <p className="text-sm font-semibold text-gray-700 mb-2">
              Filter by Category
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedCategory === null ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedCategory(null)}
              >
                All
              </Button>
              {categories.map((category) => (
                <Button
                  key={category}
                  variant={
                    selectedCategory === category ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() => setSelectedCategory(category)}
                >
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Tools Grid */}
      {toolsQuery.isLoading ? (
        <div className="text-center py-12 text-gray-500">Loading tools...</div>
      ) : filteredTools.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTools.map((tool) => {
            const isEnabled = enabledTools.has(tool.id) || tool.enabled;
            return (
              <Card
                key={tool.id}
                className={`p-4 border-2 transition-all ${
                  categoryColors[tool.category] || "bg-gray-50 border-gray-200"
                }`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-start gap-3">
                    <div className="text-gray-700">
                      {categoryIcons[tool.category] || <Zap className="h-5 w-5" />}
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{tool.name}</h3>
                      <Badge variant="outline" className="mt-1">
                        {tool.category}
                      </Badge>
                    </div>
                  </div>
                  <Toggle
                    pressed={isEnabled}
                    onPressedChange={() => handleToggleTool(tool.id)}
                    className="ml-2"
                  >
                    {isEnabled ? "On" : "Off"}
                  </Toggle>
                </div>

                <p className="text-sm text-gray-700 mb-4">{tool.description}</p>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">ID: {tool.id}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1"
                  >
                    Details <ChevronRight className="h-3 w-3" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="p-12 text-center">
          <p className="text-gray-600">No tools found matching your search</p>
        </Card>
      )}

      {/* Summary */}
      {tools.length > 0 && (
        <Card className="p-4 bg-blue-50 border-blue-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-blue-600 font-semibold">
                Total Tools
              </p>
              <p className="text-2xl font-bold text-blue-900 mt-1">
                {tools.length}
              </p>
            </div>
            <div>
              <p className="text-sm text-blue-600 font-semibold">Enabled</p>
              <p className="text-2xl font-bold text-blue-900 mt-1">
                {tools.filter((t) => t.enabled || enabledTools.has(t.id))
                  .length}
              </p>
            </div>
            <div>
              <p className="text-sm text-blue-600 font-semibold">Categories</p>
              <p className="text-2xl font-bold text-blue-900 mt-1">
                {categories.length}
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
