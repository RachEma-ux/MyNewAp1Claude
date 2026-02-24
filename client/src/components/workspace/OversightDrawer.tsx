/**
 * OversightDrawer — Right-side governance oversight panel
 *
 * Shows: governance health, recent activity, freeze status, drift alerts.
 * Slides in from the right.
 */

import { trpc } from "@/lib/trpc";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Shield, Activity, Lock, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

interface OversightDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: number;
}

export function OversightDrawer({ open, onOpenChange, workspaceId }: OversightDrawerProps) {
  const { data: selfCheck } = trpc.governance.selfCheck.useQuery(undefined, {
    enabled: open,
    retry: false,
  });

  const { data: activity } = trpc.modules.reporting.activityTimeline.useQuery(
    { workspaceId, limit: 20 },
    { enabled: open }
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[380px] sm:max-w-[380px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Governance Oversight
          </SheetTitle>
          <SheetDescription>
            Real-time governance status for this workspace
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 mt-4">
          <div className="space-y-4 pr-4">
            {/* Health Check */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4" />
                System Health
              </h3>
              {selfCheck ? (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    {selfCheck.healthy ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                    <span>
                      {selfCheck.healthy ? "All checks passing" : "Issues detected"}
                    </span>
                  </div>
                  {selfCheck.checks?.map((check: { name: string; passed: boolean; message?: string }, i: number) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-xs text-muted-foreground ml-6"
                    >
                      {check.passed ? (
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                      ) : (
                        <XCircle className="h-3 w-3 text-red-500" />
                      )}
                      <span>{check.name}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Loading...</p>
              )}
            </div>

            <Separator />

            {/* Recent Activity */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Recent Activity</h3>
              {activity && activity.length > 0 ? (
                <div className="space-y-2">
                  {activity.slice(0, 15).map((entry: { id: number; action: string; moduleKey?: string | null; createdAt: Date | string }) => (
                    <div key={entry.id} className="flex items-start gap-2 text-xs">
                      <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground mt-1.5 shrink-0" />
                      <div className="min-w-0">
                        <span className="font-medium">{entry.action}</span>
                        {entry.moduleKey && (
                          <Badge variant="outline" className="ml-1 text-[10px] px-1 py-0">
                            {entry.moduleKey}
                          </Badge>
                        )}
                        <div className="text-muted-foreground">
                          {new Date(entry.createdAt).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">No recent activity</p>
              )}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
