import { useRoute } from "wouter";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Clock } from "lucide-react";

const titles: Record<string, string> = {
  providers: "Providers List",
  llms: "LLMs List",
  agents: "Agents List",
};

export default function ComingSoonListPage() {
  const [, params] = useRoute("/list/:type");
  const type = params?.type ?? "";
  const title = titles[type] ?? "List";

  return (
    <div className="p-6 flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full text-center">
        <CardHeader className="space-y-4 py-12">
          <Clock className="w-12 h-12 mx-auto text-muted-foreground" />
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription className="text-base">
            Coming soon
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
