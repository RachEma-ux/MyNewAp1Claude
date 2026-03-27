/**
 * PS Ideation — Sticky Mobile Action Bar
 *
 * Bottom-pinned action bar for mobile with Prev / Save state / Next / Wizard.
 * Uses safe-area-inset-bottom for notched devices.
 */
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ChevronRight,
  Save,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Wand2,
} from "lucide-react";
import {
  IDEATION_STEP_KEYS,
  IDEATION_STEP_LABELS,
  type IdeationStepKey,
} from "../../../../../server/ps/ps.ideation-types";

export type SaveStatus = "idle" | "saving" | "saved" | "unsaved" | "error";

interface Props {
  currentStep: IdeationStepKey;
  saveStatus: SaveStatus;
  readinessReady: boolean;
  isConverted: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSave: () => void;
  onWizard: () => void;
}

const SAVE_DISPLAY: Record<SaveStatus, { label: string; icon: React.ReactNode; className: string }> = {
  idle: { label: "Saved", icon: <CheckCircle2 className="w-3 h-3" />, className: "text-muted-foreground" },
  saving: { label: "Saving…", icon: <Loader2 className="w-3 h-3 animate-spin" />, className: "text-blue-500" },
  saved: { label: "Saved", icon: <CheckCircle2 className="w-3 h-3" />, className: "text-green-500" },
  unsaved: { label: "Unsaved", icon: <Save className="w-3 h-3" />, className: "text-amber-500" },
  error: { label: "Failed", icon: <AlertCircle className="w-3 h-3" />, className: "text-red-500" },
};

export function PSIdeationMobileBar({
  currentStep, saveStatus, readinessReady, isConverted,
  onPrev, onNext, onSave, onWizard,
}: Props) {
  const stepIdx = IDEATION_STEP_KEYS.indexOf(currentStep);
  const hasPrev = stepIdx > 0;
  const hasNext = stepIdx < IDEATION_STEP_KEYS.length - 1;
  const display = SAVE_DISPLAY[saveStatus];

  return (
    <div
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-sm"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-center justify-between px-2 py-1.5 gap-1">
        {/* Previous */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onPrev}
          disabled={!hasPrev || isConverted}
          className="h-8 px-2"
        >
          <ChevronLeft className="w-4 h-4" />
          <span className="sr-only sm:not-sr-only text-xs">Prev</span>
        </Button>

        {/* Save status */}
        <button
          onClick={onSave}
          disabled={saveStatus === "saving" || saveStatus === "saved" || saveStatus === "idle" || isConverted}
          className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${display.className} ${
            saveStatus === "unsaved" ? "hover:bg-accent" : ""
          }`}
        >
          {display.icon}
          {display.label}
        </button>

        {/* Step indicator */}
        <Badge variant="outline" className="text-[10px] shrink-0">
          {stepIdx + 1} / {IDEATION_STEP_KEYS.length}
        </Badge>

        {/* Wizard handoff or Next */}
        {readinessReady && !isConverted ? (
          <Button
            size="sm"
            onClick={onWizard}
            className="h-8 px-2 bg-green-600 hover:bg-green-700 text-xs"
          >
            <Wand2 className="w-3.5 h-3.5 mr-1" />
            Wizard
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={onNext}
            disabled={!hasNext || isConverted}
            className="h-8 px-2"
          >
            <span className="sr-only sm:not-sr-only text-xs">Next</span>
            <ChevronRight className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
