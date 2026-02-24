/**
 * PreflightModal — Governance preflight check dialog
 *
 * Shows governance requirements for R3+ actions before execution.
 * Displays: risk level, required approvals, evidence requirements.
 */

import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ShieldAlert, AlertTriangle, CheckCircle2, Lock, FileText } from "lucide-react";

interface PreflightModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actionKey: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const riskColors: Record<string, string> = {
  R1: "bg-green-500/10 text-green-500 border-green-500/20",
  R2: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  R3: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  R4: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  R5: "bg-red-500/10 text-red-500 border-red-500/20",
};

export function PreflightModal({
  open,
  onOpenChange,
  actionKey,
  onConfirm,
  onCancel,
}: PreflightModalProps) {
  const { data: preflight, isLoading } = trpc.governance.preflight.useQuery(
    { actionKey },
    { enabled: open && !!actionKey, retry: false }
  );

  const riskLevel = preflight?.risk || "R1";
  const isHighRisk = ["R3", "R4", "R5"].includes(riskLevel);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5" />
            Governance Preflight
          </DialogTitle>
          <DialogDescription>
            Review governance requirements before proceeding
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Checking governance requirements...
          </div>
        ) : preflight ? (
          <div className="space-y-4">
            {/* Action + Risk Level */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium font-mono">{actionKey}</span>
              <Badge className={riskColors[riskLevel] || ""} variant="outline">
                {riskLevel}
              </Badge>
            </div>

            <Separator />

            {/* Approvals */}
            {preflight.approvals && preflight.approvals !== "none" && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Lock className="h-4 w-4" />
                  Approval Required
                </div>
                <p className="text-xs text-muted-foreground ml-6">
                  Rule: {preflight.approvals}
                </p>
              </div>
            )}

            {/* Evidence */}
            {preflight.evidence && preflight.evidence.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <FileText className="h-4 w-4" />
                  Evidence Required
                </div>
                <div className="ml-6 flex flex-wrap gap-1">
                  {preflight.evidence.map((e: string) => (
                    <Badge key={e} variant="secondary" className="text-[10px]">
                      {e}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Warning for high risk */}
            {isHighRisk && (
              <div className="flex items-start gap-2 rounded-md border border-yellow-500/20 bg-yellow-500/5 p-3">
                <AlertTriangle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                <p className="text-xs text-yellow-600 dark:text-yellow-400">
                  This action requires governance evaluation. It will be logged
                  and may require approval before taking effect.
                </p>
              </div>
            )}

            {/* Denial */}
            {preflight.denied && (
              <div className="flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/5 p-3">
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-xs text-red-600 dark:text-red-400">
                  {preflight.denialReason || "This action is currently blocked by governance."}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="py-4 text-center text-sm text-muted-foreground">
            Unable to retrieve governance requirements
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={preflight?.denied}
          >
            {preflight?.denied ? "Blocked" : isHighRisk ? "Proceed with Governance" : "Confirm"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
