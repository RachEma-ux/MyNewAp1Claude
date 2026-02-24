/**
 * Workspace Governance — Governance overview within the workspace shell
 * Shows action registry, preflight status, and self-check
 */

import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Activity,
  Lock,
  AlertTriangle,
} from "lucide-react";

const riskColors: Record<string, string> = {
  R1: "text-green-500",
  R2: "text-blue-500",
  R3: "text-yellow-500",
  R4: "text-orange-500",
  R5: "text-red-500",
};

export function GovernancePage({ workspaceId }: { workspaceId: number }) {
  const { data: selfCheck } = trpc.governance.selfCheck.useQuery(undefined, {
    retry: false,
  });

  const { data: registry } = trpc.governance.actionRegistry.useQuery(undefined, {
    retry: false,
  });

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <ShieldCheck className="h-6 w-6" />
        Governance
      </h1>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Self-Check */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" />
              System Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            {selfCheck ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {selfCheck.healthy ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                  <span className="text-sm font-medium">
                    {selfCheck.healthy ? "All checks passing" : "Issues detected"}
                  </span>
                </div>
                {selfCheck.checks?.map(
                  (
                    check: { name: string; passed: boolean; message?: string },
                    i: number
                  ) => (
                    <div key={i} className="flex items-center gap-2 text-xs ml-7">
                      {check.passed ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                      ) : (
                        <XCircle className="h-3 w-3 text-red-500" />
                      )}
                      <span>{check.name}</span>
                      {check.message && (
                        <span className="text-muted-foreground">{check.message}</span>
                      )}
                    </div>
                  )
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Loading...</p>
            )}
          </CardContent>
        </Card>

        {/* Registry Summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Action Registry
            </CardTitle>
          </CardHeader>
          <CardContent>
            {registry ? (
              <div className="space-y-2">
                <p className="text-sm">
                  <span className="font-bold text-lg">{registry.length}</span>{" "}
                  <span className="text-muted-foreground">registered actions</span>
                </p>
                <div className="flex gap-2 flex-wrap">
                  {["R1", "R2", "R3", "R4", "R5"].map((level) => {
                    const count = registry.filter(
                      (a: { risk: string }) => a.risk === level
                    ).length;
                    return (
                      <Badge key={level} variant="outline" className={`text-xs ${riskColors[level]}`}>
                        {level}: {count}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Loading...</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Registry Detail */}
      {registry && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              Governed Actions ({registry.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-1">
                {registry.map(
                  (
                    action: {
                      actionKey: string;
                      risk: string;
                      approvals?: string;
                      evidence?: string[];
                    },
                    i: number
                  ) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-xs border-b last:border-0 py-1.5"
                    >
                      <span className="font-mono truncate max-w-xs">
                        {action.actionKey}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${riskColors[action.risk] || ""}`}
                        >
                          {action.risk}
                        </Badge>
                        {action.approvals && action.approvals !== "none" && (
                          <Badge variant="outline" className="text-[10px]">
                            {action.approvals}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
