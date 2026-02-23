import { useRoute } from "wouter";
import { Cloud, Database, Package, Bot, MessageSquare, Layers } from "lucide-react";

const typesMeta: Record<string, { label: string; icon: React.ReactNode }> = {
  providers: { label: "Providers", icon: <Cloud className="h-8 w-8 text-primary" /> },
  llms: { label: "LLMs", icon: <Database className="h-8 w-8 text-primary" /> },
  models: { label: "Models", icon: <Package className="h-8 w-8 text-primary" /> },
  agents: { label: "Agents", icon: <Bot className="h-8 w-8 text-primary" /> },
  bots: { label: "Bots", icon: <MessageSquare className="h-8 w-8 text-primary" /> },
  other: { label: "Other", icon: <Layers className="h-8 w-8 text-primary" /> },
};

export default function AITypesPage() {
  const [, params] = useRoute("/ai-types/:type");
  const type = params?.type || "providers";
  const meta = typesMeta[type] || typesMeta.providers;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
      <div className="flex items-center justify-center h-20 w-20 rounded-2xl bg-primary/10">
        {meta.icon}
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">{meta.label}</h1>
      <p className="text-muted-foreground text-lg">Coming soon</p>
    </div>
  );
}
