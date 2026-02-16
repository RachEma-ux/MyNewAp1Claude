import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StepItem {
  step: string;
  label: string;
}

interface StepProgressProps {
  steps: StepItem[];
  currentStep: string;
  className?: string;
}

export function StepProgress({ steps, currentStep, className }: StepProgressProps) {
  const currentIndex = steps.findIndex((s) => s.step === currentStep);

  return (
    <div className={cn("flex items-center justify-center gap-2 overflow-x-auto", className)}>
      {steps.map((item, index) => {
        const isCompleted = currentIndex > index;
        const isCurrent = currentStep === item.step;

        return (
          <div key={item.step} className="flex items-center">
            <div className="flex flex-col items-center min-w-max">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all",
                  isCurrent && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                  isCompleted && "bg-primary text-primary-foreground",
                  !isCurrent && !isCompleted && "bg-muted text-muted-foreground"
                )}
              >
                {isCompleted ? <Check className="h-5 w-5" /> : index + 1}
              </div>
              <span className="text-xs text-muted-foreground mt-2">{item.label}</span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={cn(
                  "h-1 w-12 mx-2 mb-6 transition-all",
                  isCompleted ? "bg-primary" : "bg-muted"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
