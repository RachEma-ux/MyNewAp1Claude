import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Lock, Eye, Server, ShieldCheck } from "lucide-react";

export default function OpenRouterGuardrailsPage() {
  const controls = [
    { icon: Lock, title: "Server-Side Only Secrets", desc: "API keys are AES-256-GCM encrypted and never sent to the browser. All OpenRouter calls originate from the server.", status: "enforced" },
    { icon: ShieldCheck, title: "Governance Gate", desc: "All mutations (config save, sync, execution) pass through the platform's governed procedure pipeline with deny-by-default policy.", status: "enforced" },
    { icon: Shield, title: "Action Registry", desc: "11 OpenRouter action keys registered in platform_action_registry.yaml with risk-level classification. Unregistered actions are blocked.", status: "enforced" },
    { icon: Eye, title: "Execution Audit Trail", desc: "Every playground execution, sync operation, and config change is logged to openrouter_executions and openrouter_activity tables.", status: "enforced" },
    { icon: Server, title: "No Direct Browser Calls", desc: "The browser never calls OpenRouter directly. All API traffic goes through the server's tRPC layer with governance checks.", status: "enforced" },
    { icon: Shield, title: "Routing Profile Governance", desc: "Routing profile changes are audited. Preset profiles cannot be deleted. Default profile changes require governed procedure.", status: "enforced" },
  ];

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <div>
        <h3 className="text-lg font-semibold">Guardrails</h3>
        <p className="text-sm text-muted-foreground">Non-bypassable security and governance controls for OpenRouter integration</p>
      </div>

      <div className="space-y-3">
        {controls.map((c, i) => {
          const Icon = c.icon;
          return (
            <Card key={i}>
              <CardContent className="py-3 px-4 flex items-start gap-3">
                <Icon className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{c.title}</span>
                    <Badge variant="default" className="text-[9px] bg-green-600">{c.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{c.desc}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
