/**
 * PSOverrideDialog — Allow user to override the matrix recommendation
 *
 * Presents all available scopes and lets the user pick a different one
 * with a required justification. The override is tracked in the wizard
 * run payload for audit.
 */
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pencil } from "lucide-react";

interface ScopeScore {
  code: string;
  label: string;
  score: number;
  rank: number;
}

export function PSOverrideDialog({
  ranking,
  currentScope,
  onOverride,
}: {
  ranking: ScopeScore[];
  currentScope: string;
  onOverride: (scopeCode: string, reason: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const handleConfirm = () => {
    if (!selected || !reason.trim()) return;
    onOverride(selected, reason.trim());
    setOpen(false);
    setSelected(null);
    setReason("");
  };

  const alternativeScopes = ranking.filter((s) => s.code !== currentScope);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="text-xs"
      >
        <Pencil className="w-3 h-3 mr-1" />
        Override
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Override Recommendation</DialogTitle>
            <DialogDescription>
              Select a different scope and provide a justification. This will be
              recorded in the wizard run for audit.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-sm">Current recommendation</Label>
              <div className="mt-1">
                <Badge className="bg-indigo-500/10 text-indigo-600 border-indigo-500/30">
                  {ranking.find((s) => s.code === currentScope)?.label ||
                    currentScope}
                </Badge>
              </div>
            </div>

            <div>
              <Label className="text-sm">Select alternative scope</Label>
              <div className="mt-2 space-y-1.5">
                {alternativeScopes.map((s) => (
                  <button
                    key={s.code}
                    onClick={() => setSelected(s.code)}
                    className={`w-full flex items-center justify-between p-2 rounded border text-sm transition-colors ${
                      selected === s.code
                        ? "border-indigo-500 bg-indigo-500/5"
                        : "border-border hover:border-indigo-500/30"
                    }`}
                  >
                    <span className="font-medium">{s.label}</span>
                    <span className="text-muted-foreground text-xs">
                      Score: {s.score} (#{s.rank})
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-sm">
                Justification <span className="text-red-500">*</span>
              </Label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why you are overriding the recommendation..."
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[80px] resize-none"
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {reason.length}/500
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!selected || !reason.trim()}
            >
              Confirm Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
