/**
 * ModuleWizardShell — Shared wizard framework component
 *
 * Layout: Top stepper | Center form | Right preview panel | Bottom summary bar
 *
 * This is a UI-only shell with NO domain logic.
 * Each module provides its own steps, preview, and summary content.
 */

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Check, Save } from "lucide-react";

export interface WizardStep {
  id: string;
  label: string;
  description?: string;
  /** Whether this step's data is valid and complete */
  isValid?: boolean;
}

export interface ModuleWizardShellProps {
  /** Module title shown in the header */
  title: string;
  /** Module-specific accent color class (e.g. "text-blue-500") */
  accentColor?: string;
  /** Step definitions */
  steps: WizardStep[];
  /** Current step index (controlled externally) */
  currentStep: number;
  /** Step change handler */
  onStepChange: (step: number) => void;
  /** Center form content for the current step */
  children: ReactNode;
  /** Right preview panel content */
  previewPanel: ReactNode;
  /** Bottom summary bar content */
  summaryBar: ReactNode;
  /** Save draft handler */
  onSaveDraft?: () => void;
  /** Publish handler (final step) */
  onPublish?: () => void;
  /** Whether we're on the final step */
  isFinalStep?: boolean;
  /** Whether publish is enabled */
  canPublish?: boolean;
  /** Whether the wizard is saving */
  isSaving?: boolean;
}

export function ModuleWizardShell({
  title,
  accentColor = "text-blue-500",
  steps,
  currentStep,
  onStepChange,
  children,
  previewPanel,
  summaryBar,
  onSaveDraft,
  onPublish,
  isFinalStep,
  canPublish,
  isSaving,
}: ModuleWizardShellProps) {
  const canGoBack = currentStep > 0;
  const canGoForward = currentStep < steps.length - 1;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Top Stepper ── */}
      <div className="border-b bg-card px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <h2 className={`text-lg font-semibold ${accentColor}`}>{title}</h2>
          <div className="flex items-center gap-2">
            {onSaveDraft && (
              <Button variant="outline" size="sm" onClick={onSaveDraft} disabled={isSaving}>
                <Save className="w-4 h-4 mr-1" /> Save Draft
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {steps.map((step, i) => (
            <button
              key={step.id}
              onClick={() => onStepChange(i)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors ${
                i === currentStep
                  ? "bg-primary text-primary-foreground font-medium"
                  : i < currentStep
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <span className={`flex items-center justify-center w-5 h-5 rounded-full text-xs font-bold ${
                step.isValid ? "bg-green-500 text-white" : i === currentStep ? "bg-primary-foreground text-primary" : "bg-muted-foreground/30"
              }`}>
                {step.isValid ? <Check className="w-3 h-3" /> : i + 1}
              </span>
              {step.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Center + Right Preview ── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Center Form */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="max-w-2xl mx-auto space-y-4">
            <div className="mb-2">
              <h3 className="text-base font-medium">{steps[currentStep]?.label}</h3>
              {steps[currentStep]?.description && (
                <p className="text-sm text-muted-foreground mt-1">{steps[currentStep].description}</p>
              )}
            </div>
            {children}
          </div>
        </div>

        {/* Right Preview Panel */}
        <div className="w-80 border-l bg-muted/30 overflow-y-auto p-4 hidden lg:block">
          <h4 className="text-sm font-medium text-muted-foreground mb-3">Preview</h4>
          {previewPanel}
        </div>
      </div>

      {/* ── Bottom Summary Bar ── */}
      <div className="border-t bg-card px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex-1 text-sm text-muted-foreground truncate">
            {summaryBar}
          </div>
          <div className="flex items-center gap-2 ml-4">
            <Button variant="outline" size="sm" onClick={() => onStepChange(currentStep - 1)} disabled={!canGoBack}>
              <ChevronLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            {isFinalStep && onPublish ? (
              <Button size="sm" onClick={onPublish} disabled={!canPublish || isSaving}>
                <Check className="w-4 h-4 mr-1" /> Publish
              </Button>
            ) : (
              <Button size="sm" onClick={() => onStepChange(currentStep + 1)} disabled={!canGoForward}>
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
