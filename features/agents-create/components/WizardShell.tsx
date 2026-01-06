/**
 * Wizard Shell Component
 * 
 * Reusable wizard container with stepper, navigation, autosave,
 * policy banners, and progress persistence.
 */

import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Check, AlertTriangle, Lock, Save, Loader2 } from "lucide-react";
import { useDebounce } from "../hooks/useDebounce";
import { trpc } from "@/lib/trpc";

export interface WizardStep {
  id: string;
  title: string;
  description?: string;
  component: React.ComponentType<any>;
  validate?: (data: any) => Promise<boolean>;
}

export interface WizardShellProps {
  steps: WizardStep[];
  initialData?: any;
  draftId?: string;
  onSave: (data: any) => Promise<void>;
  onComplete: (data: any) => Promise<void>;
  onCancel: () => void;
}

export function WizardShell({
  steps,
  initialData = {},
  draftId,
  onSave,
  onComplete,
  onCancel,
}: WizardShellProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [data, setData] = useState(initialData);
  const [saveStatus, setSaveStatus] = useState<"synced" | "saving" | "error">("synced");
  const [policyBanner, setPolicyBanner] = useState<any>(null);

  // Debounced autosave
  const debouncedData = useDebounce(data, 2000);

  useEffect(() => {
    if (debouncedData && draftId) {
      handleAutosave();
    }
  }, [debouncedData]);

  const handleAutosave = async () => {
    setSaveStatus("saving");
    try {
      await onSave(data);
      setSaveStatus("synced");
    } catch (error) {
      console.error("Autosave failed:", error);
      setSaveStatus("error");
    }
  };

  const handleNext = async () => {
    const currentStep = steps[currentStepIndex];

    // Validate current step
    if (currentStep.validate) {
      const isValid = await currentStep.validate(data);
      if (!isValid) {
        return;
      }
    }

    // Policy validation on step exit
    const policyResult = await validatePolicy("on_step_exit");
    if (policyResult.status === "deny") {
      setPolicyBanner({
        type: "error",
        message: "Policy blocks this configuration",
        violations: policyResult.violations,
      });
      return;
    }

    if (policyResult.status === "warn") {
      setPolicyBanner({
        type: "warning",
        message: "Policy warnings detected",
        warnings: policyResult.warnings,
      });
    }

    // Move to next step
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
      setPolicyBanner(null);
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
      setPolicyBanner(null);
    }
  };

  const handleComplete = async () => {
    // Final validation
    const policyResult = await validatePolicy("on_create_attempt");
    if (policyResult.status === "deny") {
      setPolicyBanner({
        type: "error",
        message: "Policy blocks agent creation",
        violations: policyResult.violations,
      });
      return;
    }

    await onComplete(data);
  };

  const validatePolicy = async (hook: string) => {
    // Call backend validation endpoint
    try {
      const result = await trpc.agentsControlPlane.validate.mutate({
        agent: data,
        hook,
      });
      return result.policyResult;
    } catch (error) {
      console.error("Policy validation failed:", error);
      return { status: "allow", violations: [], warnings: [] };
    }
  };

  const updateData = useCallback((updates: any) => {
    setData((prev: any) => ({ ...prev, ...updates }));
  }, []);

  const currentStep = steps[currentStepIndex];
  const StepComponent = currentStep.component;

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Create Agent</h1>
        <p className="text-muted-foreground">
          Step {currentStepIndex + 1} of {steps.length}: {currentStep.title}
        </p>
      </div>

      {/* Stepper */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className="flex items-center flex-1"
            >
              <div
                className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                  index < currentStepIndex
                    ? "bg-primary border-primary text-primary-foreground"
                    : index === currentStepIndex
                    ? "border-primary text-primary"
                    : "border-muted text-muted-foreground"
                }`}
              >
                {index < currentStepIndex ? (
                  <Check className="w-5 h-5" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 ${
                    index < currentStepIndex ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Policy Banner */}
      {policyBanner && (
        <Alert
          variant={policyBanner.type === "error" ? "destructive" : "default"}
          className="mb-6"
        >
          {policyBanner.type === "error" ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
          )}
          <AlertDescription>
            <div className="font-semibold mb-2">{policyBanner.message}</div>
            {policyBanner.violations && (
              <ul className="list-disc list-inside space-y-1">
                {policyBanner.violations.map((v: any, i: number) => (
                  <li key={i} className="text-sm">
                    {v.message}
                    {v.runbookUrl && (
                      <a
                        href={v.runbookUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 underline"
                      >
                        Learn more
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {policyBanner.warnings && (
              <ul className="list-disc list-inside space-y-1">
                {policyBanner.warnings.map((w: any, i: number) => (
                  <li key={i} className="text-sm">
                    {w.message}
                  </li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Step Content */}
      <Card className="p-6 mb-6">
        <StepComponent data={data} updateData={updateData} />
      </Card>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {saveStatus === "saving" && (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Saving...</span>
            </>
          )}
          {saveStatus === "synced" && (
            <>
              <Check className="w-4 h-4 text-green-600" />
              <span>All changes saved</span>
            </>
          )}
          {saveStatus === "error" && (
            <>
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span>Save failed</span>
            </>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          {currentStepIndex > 0 && (
            <Button variant="outline" onClick={handleBack}>
              Back
            </Button>
          )}
          {currentStepIndex < steps.length - 1 ? (
            <Button onClick={handleNext}>Next</Button>
          ) : (
            <Button onClick={handleComplete}>Create Agent</Button>
          )}
        </div>
      </div>
    </div>
  );
}
