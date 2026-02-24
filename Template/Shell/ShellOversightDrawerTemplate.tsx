/**
 * Shell Oversight Drawer Template — Right-side governance panel
 *
 * Copy to: client/src/components/your-shell/YourOversightDrawer.tsx
 * Adapt: governance queries, activity timeline
 */

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Shield, Activity, CheckCircle2, XCircle } from "lucide-react";

interface OversightDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: number;
}

export function ShellOversightDrawer({ open, onOpenChange, entityId }: OversightDrawerProps) {
  // Wire your governance/health queries here (only fetch when open)
  // const { data: selfCheck } = trpc.governance.selfCheck.useQuery(undefined, {
  //   enabled: open,
  //   retry: false,
  // });

  const checks = [
    { name: "Schema Valid", passed: true },
    { name: "Permissions OK", passed: true },
    { name: "Data Integrity", passed: true },
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[380px] sm:max-w-[380px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Oversight
          </SheetTitle>
          <SheetDescription>
            Status and health checks for entity {entityId}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 mt-4">
          <div className="space-y-4 pr-4">
            {/* Health Checks */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Health Checks
              </h3>
              <div className="space-y-1">
                {checks.map((check, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground ml-2">
                    {check.passed ? (
                      <CheckCircle2 className="h-3 w-3 text-green-500" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-500" />
                    )}
                    <span>{check.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Activity Feed */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Recent Activity</h3>
              <p className="text-xs text-muted-foreground">Wire your activity timeline query here</p>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
