import { useLocation } from "wouter";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Cloud, Plug, Settings } from "lucide-react";

const links = [
  { label: "Manage", description: "View & configure providers", icon: Cloud, href: "/providers", color: "bg-blue-500/10 text-blue-500" },
  { label: "Connections", description: "Provider connection status", icon: Plug, href: "/providers/connections", color: "bg-green-500/10 text-green-500" },
  { label: "Settings", description: "Provider settings & defaults", icon: Settings, href: "/settings", color: "bg-purple-500/10 text-purple-500" },
];

export default function ProviderControlPanelPage() {
  const [, navigate] = useLocation();

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Provider Control Panel</h1>
        <p className="text-muted-foreground mt-1">
          Manage, connect, and configure your LLM providers.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {links.map((item) => (
          <Card
            key={item.href}
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => navigate(item.href)}
          >
            <CardHeader className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className={`${item.color} px-2 py-1`}>
                  <item.icon className="w-3.5 h-3.5" />
                </Badge>
                <CardTitle className="text-sm font-semibold">{item.label}</CardTitle>
              </div>
              <CardDescription className="text-xs">{item.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}
