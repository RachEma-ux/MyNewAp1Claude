/**
 * PS Wizard — 4-step project creation wizard using ModuleWizardShell
 */
import { useState } from "react";
import { ModuleWizardShell, type WizardStep } from "@/components/wizard/ModuleWizardShell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const STEPS: WizardStep[] = [
  { id: "context", label: "Context", description: "Define the project context and objectives" },
  { id: "scope", label: "Scope", description: "Set the project scope and boundaries" },
  { id: "classification", label: "Classification", description: "Classify the project type and priority" },
  { id: "review", label: "Review", description: "Review and confirm project details" },
];

export function PSWizardPage({ workspaceId }: { workspaceId: number }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectScope, setProjectScope] = useState("");
  const [projectType, setProjectType] = useState("standard");
  const [projectPriority, setProjectPriority] = useState("medium");

  const stepsWithValidity = STEPS.map((s, i) => ({
    ...s,
    isValid: i === 0 ? projectName.length > 0 : i === 1 ? projectScope.length > 0 : i === 2 ? true : false,
  }));

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-4">
            <div>
              <Label>Project Name</Label>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Enter project name" className="mt-1" />
            </div>
            <div>
              <Label>Description</Label>
              <textarea
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                placeholder="Describe the project objectives..."
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[100px] resize-none"
              />
            </div>
          </div>
        );
      case 1:
        return (
          <div className="space-y-4">
            <div>
              <Label>Project Scope</Label>
              <textarea
                value={projectScope}
                onChange={(e) => setProjectScope(e.target.value)}
                placeholder="Define the scope and boundaries..."
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm min-h-[100px] resize-none"
              />
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <div>
              <Label>Project Type</Label>
              <select
                value={projectType}
                onChange={(e) => setProjectType(e.target.value)}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="standard">Standard</option>
                <option value="agile">Agile</option>
                <option value="waterfall">Waterfall</option>
                <option value="hybrid">Hybrid</option>
              </select>
            </div>
            <div>
              <Label>Priority</Label>
              <select
                value={projectPriority}
                onChange={(e) => setProjectPriority(e.target.value)}
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-3">
            <Card><CardContent className="pt-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span className="font-medium">{projectName || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Type</span><Badge variant="outline">{projectType}</Badge></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Priority</span><Badge variant="outline">{projectPriority}</Badge></div>
              {projectDescription && <div><span className="text-muted-foreground">Description:</span><p className="mt-1">{projectDescription}</p></div>}
              {projectScope && <div><span className="text-muted-foreground">Scope:</span><p className="mt-1">{projectScope}</p></div>}
            </CardContent></Card>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-[calc(100vh-8rem)]">
      <ModuleWizardShell
        title="Projects System Wizard"
        accentColor="text-indigo-500"
        steps={stepsWithValidity}
        currentStep={currentStep}
        onStepChange={setCurrentStep}
        previewPanel={
          <div className="space-y-2 text-sm">
            <p className="font-medium">{projectName || "Untitled Project"}</p>
            <Badge variant="outline">{projectType}</Badge>
            <Badge variant="outline" className="ml-1">{projectPriority}</Badge>
            {projectDescription && <p className="text-muted-foreground text-xs mt-2">{projectDescription}</p>}
          </div>
        }
        summaryBar={
          <span>Step {currentStep + 1} of {STEPS.length} — {STEPS[currentStep]?.label}</span>
        }
        isFinalStep={currentStep === STEPS.length - 1}
        canPublish={projectName.length > 0 && projectScope.length > 0}
      >
        {renderStep()}
      </ModuleWizardShell>
    </div>
  );
}

export default PSWizardPage;
