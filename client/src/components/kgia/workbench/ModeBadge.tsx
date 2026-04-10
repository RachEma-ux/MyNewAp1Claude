import { Badge } from "@/components/ui/badge";
import { Route, Database, BrainCircuit, HardDrive } from "lucide-react";

const MODE_CONFIG: Record<string, { label: string; icon: React.ElementType; variant: "default" | "secondary" | "outline" }> = {
  direct_query: { label: "Direct Query", icon: Database, variant: "default" },
  hybrid: { label: "Hybrid", icon: Route, variant: "secondary" },
  graph_rag: { label: "Graph RAG", icon: BrainCircuit, variant: "secondary" },
  memory: { label: "Memory", icon: HardDrive, variant: "outline" },
  path_reasoning: { label: "Path Reasoning", icon: Route, variant: "secondary" },
};

export default function ModeBadge({ mode }: { mode: string }) {
  const config = MODE_CONFIG[mode] ?? { label: mode, icon: Database, variant: "outline" as const };
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className="text-[10px] gap-1">
      <Icon className="w-2.5 h-2.5" />
      {config.label}
    </Badge>
  );
}
