import { useRoute } from "wouter";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Clock } from "lucide-react";

const meta: Record<string, { title: string; description: string }> = {
  providers: { title: "Providers List", description: "Coming soon" },
  llms: { title: "LLMs List", description: "Coming soon" },
  agents: { title: "Agents List", description: "AI agents with cognitive loops, tools, and governance" },
  bots: { title: "Bots List", description: "Coming soon" },
};

export default function ComingSoonListPage() {
  const [, params] = useRoute("/list/:type");
  const type = params?.type ?? "";
  const { title, description } = meta[type] ?? { title: "List", description: "Coming soon" };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground mt-1">{description}</p>
      </div>
      <div className="flex items-center justify-center min-h-[40vh]">
        <Card className="max-w-md w-full text-center">
          <CardHeader className="space-y-4 py-12">
            <Clock className="w-12 h-12 mx-auto text-muted-foreground" />
            <CardTitle className="text-xl">Coming soon</CardTitle>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
