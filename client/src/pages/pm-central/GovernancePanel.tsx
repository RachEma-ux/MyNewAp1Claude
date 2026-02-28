import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";

export default function GovernancePanel() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">PM Governance</h1>
        <p className="text-muted-foreground mt-1">
          Project governance framework, compliance checks, and quality gates
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Governance Framework</CardTitle>
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Define governance policies, quality gates, and compliance requirements for your projects.</p>
        </CardContent>
      </Card>
    </div>
  );
}
