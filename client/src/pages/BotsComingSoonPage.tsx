import { useRoute } from "wouter";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock } from "lucide-react";

const titles: Record<string, string> = {
  dashboard: "Bots Dashboard",
  "control-panel": "Bots Control Panel",
  wizard: "Bot Wizard",
};

export default function BotsComingSoonPage() {
  const [, params] = useRoute("/bots/:section");
  const section = params?.section ?? "";
  const title = titles[section] ?? "Bots";

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="text-muted-foreground mt-1">Coming soon</p>
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
