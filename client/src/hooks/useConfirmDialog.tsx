import { useState, useCallback } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfirmDialogState {
  open: boolean;
  title: string;
  description: string;
  onConfirm: (() => void) | null;
}

interface UseConfirmDialogOptions {
  title?: string;
  description?: string;
}

const defaultState: ConfirmDialogState = {
  open: false,
  title: "",
  description: "",
  onConfirm: null,
};

export function useConfirmDialog(defaults?: UseConfirmDialogOptions) {
  const [state, setState] = useState<ConfirmDialogState>(defaultState);

  const confirm = useCallback(
    (onConfirm: () => void, options?: { title?: string; description?: string }) => {
      setState({
        open: true,
        title: options?.title ?? defaults?.title ?? "Are you sure?",
        description:
          options?.description ??
          defaults?.description ??
          "This action cannot be undone.",
        onConfirm,
      });
    },
    [defaults?.title, defaults?.description],
  );

  const handleConfirm = useCallback(() => {
    state.onConfirm?.();
    setState(defaultState);
  }, [state.onConfirm]);

  const handleCancel = useCallback(() => {
    setState(defaultState);
  }, []);

  function ConfirmDialog() {
    return (
      <AlertDialog open={state.open} onOpenChange={(open) => !open && handleCancel()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{state.title}</AlertDialogTitle>
            <AlertDialogDescription>{state.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return { confirm, ConfirmDialog };
}
