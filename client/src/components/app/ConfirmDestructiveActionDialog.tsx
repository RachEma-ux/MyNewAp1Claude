import * as React from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface ConfirmDestructiveActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  isLoading?: boolean;
  /** When set, the user must type this exact text to enable the confirm button. */
  typeToConfirmText?: string;
}

function ConfirmDestructiveActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  onConfirm,
  isLoading = false,
  typeToConfirmText,
}: ConfirmDestructiveActionDialogProps) {
  const [confirmInput, setConfirmInput] = React.useState("");

  const isConfirmEnabled = typeToConfirmText
    ? confirmInput === typeToConfirmText
    : true;

  // Reset input when dialog opens/closes
  React.useEffect(() => {
    if (!open) {
      setConfirmInput("");
    }
  }, [open]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {typeToConfirmText && (
          <div className="space-y-2 py-2">
            <Label htmlFor="confirm-input" className="text-sm">
              Type <span className="font-mono font-semibold">{typeToConfirmText}</span> to confirm
            </Label>
            <Input
              id="confirm-input"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={typeToConfirmText}
              autoComplete="off"
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>
            {cancelLabel}
          </AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isLoading || !isConfirmEnabled}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { ConfirmDestructiveActionDialog };
export type { ConfirmDestructiveActionDialogProps };
