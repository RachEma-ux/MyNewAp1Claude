import { useLocation } from "wouter";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Settings,
  Activity,
  FileText,
  Zap,
  Package,
  Key,
  CheckCircle,
  Shield,
} from "lucide-react";

const links = [
  { label: "Manage", description: "Create & configure agents", icon: Settings, href: "/agents", color: "bg-blue-500/10 text-blue-500" },
  { label: "Approvals", description: "Promotion requests queue", icon: CheckCircle, href: "/promotion-requests", color: "bg-green-500/10 text-green-500" },
  { label: "Drift Detection", description: "Monitor config drift", icon: Activity, href: "/drift-detection", color: "bg-orange-500/10 text-orange-500" },
  { label: "Compliance Export", description: "Export audit reports", icon: FileText, href: "/compliance-export", color: "bg-purple-500/10 text-purple-500" },
  { label: "Auto-Remediation", description: "Automated fix rules", icon: Zap, href: "/auto-remediation", color: "bg-yellow-500/10 text-yellow-500" },
  { label: "Tools Management", description: "Agent tool registry", icon: Package, href: "/tools-management", color: "bg-cyan-500/10 text-cyan-500" },
  { label: "Protocols", description: "Communication protocols", icon: Shield, href: "/protocols", color: "bg-indigo-500/10 text-indigo-500" },
  { label: "Policies", description: "Governance policies", icon: Key, href: "/policies", color: "bg-rose-500/10 text-rose-500" },
];

export default function AgentControlPanelPage() {
  const [, navigate] = useLocation();

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Agent Control Panel</h1>
        <p className="text-muted-foreground mt-1">
          Manage, govern, and monitor your agents from one place.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
