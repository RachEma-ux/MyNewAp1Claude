import { useState } from "react";
import type { Agent, AgentMode, GovernanceStatus, AgentRoleClass } from "@shared/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Target,
  Pencil,
  Copy,
  Workflow,
  MessageSquare,
  Zap,
  FileUp,
  ChevronLeft,
  ChevronRight,
  Check,
} from "lucide-react";

interface AgentWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

type CreationMode =
  | "template"
  | "scratch"
  | "clone"
  | "workflow"
  | "conversation"
  | "event"
  | "import";

type WizardStep = "mode" | "identity" | "role" | "llm" | "capabilities" | "limits" | "review";

const CREATION_MODES = [
  {
    id: "template" as CreationMode,
    icon: Target,
    title: "From Template",
    description: "Deploy pre-built agents (Research Assistant, Code Helper, etc.)",
  },
  {
    id: "scratch" as CreationMode,
    icon: Pencil,
    title: "From Scratch",
    description: "Manual configuration with full control",
  },
  {
    id: "clone" as CreationMode,
    icon: Copy,
    title: "Clone Existing",
    description: "Fork an existing agent",
  },
  {
    id: "workflow" as CreationMode,
    icon: Workflow,
    title: "From Workflow",
    description: "Automation-first approach",
  },
  {
    id: "conversation" as CreationMode,
    icon: MessageSquare,
    title: "From Conversation",
    description: "Intent extraction from chat",
  },
  {
    id: "event" as CreationMode,
    icon: Zap,
    title: "From Event Trigger",
    description: "Event-driven agents",
  },
  {
    id: "import" as CreationMode,
    icon: FileUp,
    title: "Import Spec",
    description: "Upload JSON/YAML agent definitions",
  },
];

const STEPS: WizardStep[] = ["mode", "identity", "role", "llm", "capabilities", "limits", "review"];

export default function AgentWizard({ open, onOpenChange, onSuccess }: AgentWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>("mode");
  const [mode, setMode] = useState<CreationMode | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    name: "",
    version: "1.0.0",
    description: "",
    roleClass: "analysis" as "compliance" | "analysis" | "ideation",
    systemPrompt: "",
    anatomy: {},
    localConstraints: {
      maxTokens: 2000,
      dailyBudget: 100,
    },
    sandboxConstraints: {},
    expiresAt: "",
  });

  const createMutation = trpc.agents.create.useMutation({
    onSuccess: () => {
      toast.success("Agent created successfully");
      onOpenChange(false);
      onSuccess?.();
      resetWizard();
    },
    onError: (error) => {
      toast.error(`Failed to create agent: ${error.message}`);
    },
  });

  const validateIdentity = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = "Agent name is required";
    if (!formData.version.trim()) newErrors.version = "Version is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateRole = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.roleClass) newErrors.roleClass = "Role class is required";
    if (!formData.systemPrompt.trim()) newErrors.systemPrompt = "System prompt is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateStep = (): boolean => {
    switch (currentStep) {
      case "identity":
        return validateIdentity();
      case "role":
        return validateRole();
      default:
        return true;
    }
  };

  const resetWizard = () => {
    setCurrentStep("mode");
    setMode(null);
    setErrors({});
    setFormData({
      name: "",
      version: "1.0.0",
      description: "",
      roleClass: "analysis",
      systemPrompt: "",
      anatomy: {},
      localConstraints: {
        maxTokens: 2000,
        dailyBudget: 100,
      },
      sandboxConstraints: {},
      expiresAt: "",
    });
  };

  const handleModeSelect = (selectedMode: CreationMode) => {
    setMode(selectedMode);
    setCurrentStep("identity");
  };

  const handleNext = () => {
    if (!validateStep()) return;
    const currentIndex = STEPS.indexOf(currentStep);
    if (currentIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentIndex + 1]);
      setErrors({});
    }
  };

  const handleBack = () => {
    const currentIndex = STEPS.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(STEPS[currentIndex - 1]);
    }
  };

  const handleSubmit = async () => {
    try {
      await createMutation.mutateAsync({
        ...formData,
        anatomy: {
          mode: mode,
          systemPrompt: formData.systemPrompt,
        },
      });
    } catch (error) {
      // Error handled by mutation
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case "mode":
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Choose Creation Mode</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Select how you want to create your agent
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {CREATION_MODES.map((modeOption) => {
                const Icon = modeOption.icon;
                return (
                  <Card
                    key={modeOption.id}
                    className="cursor-pointer hover:border-primary transition-colors"
                    onClick={() => handleModeSelect(modeOption.id)}
                  >
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Icon className="w-5 h-5" />
                        {modeOption.title}
                      </CardTitle>
                      <CardDescription className="text-sm">
                        {modeOption.description}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                );
              })}
            </div>
          </div>
        );

      case "identity":
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Agent Identity</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Define the basic information for your agent
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="My Research Agent"
                  className={errors.name ? "border-red-500" : ""}
                />
                {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
              </div>

              <div>
                <Label htmlFor="version">Version *</Label>
                <Input
                  id="version"
                  value={formData.version}
                  onChange={(e) => setFormData({ ...formData, version: e.target.value })}
                  placeholder="1.0.0"
                  className={errors.version ? "border-red-500" : ""}
                />
                {errors.version && <p className="text-red-500 text-sm mt-1">{errors.version}</p>}
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe what this agent does..."
                  rows={3}
                />
              </div>
            </div>
          </div>
        );

      case "role":
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Agent Role</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Define the agent's purpose and behavior
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="roleClass">Role Class *</Label>
                <Select
                  value={formData.roleClass}
                  onValueChange={(value: any) => setFormData({ ...formData, roleClass: value })}
                >
                  <SelectTrigger id="roleClass" className={errors.roleClass ? "border-red-500" : ""}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="compliance">Compliance</SelectItem>
                    <SelectItem value="analysis">Analysis</SelectItem>
                    <SelectItem value="ideation">Ideation</SelectItem>
                  </SelectContent>
                </Select>
                {errors.roleClass && <p className="text-red-500 text-sm mt-1">{errors.roleClass}</p>}
                {!errors.roleClass && <p className="text-xs text-muted-foreground mt-1">
                  Determines policy enforcement rules
                </p>}
              </div>

              <div>
                <Label htmlFor="systemPrompt">System Prompt *</Label>
                <Textarea
                  id="systemPrompt"
                  value={formData.systemPrompt}
                  onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                  placeholder="You are a helpful research assistant that..."
                  rows={6}
                  className={errors.systemPrompt ? "border-red-500" : ""}
                />
                {errors.systemPrompt && <p className="text-red-500 text-sm mt-1">{errors.systemPrompt}</p>}
              </div>
            </div>
          </div>
        );

      case "llm":
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">LLM Configuration</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Choose the language model and parameters
              </p>
            </div>

            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  LLM configuration will use the default provider settings. Advanced configuration
                  can be done after agent creation.
                </p>
              </CardContent>
            </Card>
          </div>
        );

      case "capabilities":
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Capabilities</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Define what the agent can access and do
              </p>
            </div>

            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  Capabilities will be configured based on the role class. Custom capabilities can
                  be added after agent creation.
                </p>
              </CardContent>
            </Card>
          </div>
        );

      case "limits":
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Limits & Constraints</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Set budget limits and expiry date
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="maxTokens">Max Tokens per Request</Label>
                <Input
                  id="maxTokens"
                  type="number"
                  value={formData.localConstraints.maxTokens}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      localConstraints: {
                        ...formData.localConstraints,
                        maxTokens: parseInt(e.target.value),
                      },
                    })
                  }
                />
              </div>

              <div>
                <Label htmlFor="dailyBudget">Daily Budget (USD)</Label>
                <Input
                  id="dailyBudget"
                  type="number"
                  value={formData.localConstraints.dailyBudget}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      localConstraints: {
                        ...formData.localConstraints,
                        dailyBudget: parseInt(e.target.value),
                      },
                    })
                  }
                />
              </div>

              <div>
                <Label htmlFor="expiresAt">Expiry Date (Optional)</Label>
                <Input
                  id="expiresAt"
                  type="date"
                  value={formData.expiresAt}
                  onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Leave empty for default 30-day expiry
                </p>
              </div>
            </div>
          </div>
        );

      case "review":
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Review & Create</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Review your agent configuration before creating
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Agent Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="text-muted-foreground">Name:</div>
                  <div className="font-medium">{formData.name || "—"}</div>

                  <div className="text-muted-foreground">Version:</div>
                  <div className="font-medium">{formData.version}</div>

                  <div className="text-muted-foreground">Role Class:</div>
                  <div>
                    <Badge variant="outline">{formData.roleClass}</Badge>
                  </div>

                  <div className="text-muted-foreground">Creation Mode:</div>
                  <div>
                    <Badge variant="secondary">{mode}</Badge>
                  </div>

                  <div className="text-muted-foreground">Max Tokens:</div>
                  <div className="font-medium">{formData.localConstraints.maxTokens}</div>

                  <div className="text-muted-foreground">Daily Budget:</div>
                  <div className="font-medium">${formData.localConstraints.dailyBudget}</div>

                  <div className="text-muted-foreground">Expiry:</div>
                  <div className="font-medium">
                    {formData.expiresAt || "30 days (default)"}
                  </div>
                </div>

                {formData.description && (
                  <div className="pt-3 border-t">
                    <div className="text-sm text-muted-foreground mb-1">Description:</div>
                    <div className="text-sm">{formData.description}</div>
                  </div>
                )}

                {formData.systemPrompt && (
                  <div className="pt-3 border-t">
                    <div className="text-sm text-muted-foreground mb-1">System Prompt:</div>
                    <div className="text-sm bg-muted p-3 rounded">
                      {formData.systemPrompt.slice(0, 200)}
                      {formData.systemPrompt.length > 200 && "..."}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );

      default:
        return null;
    }
  };

  const canProceed = () => {
    if (Object.keys(errors).length > 0) return false;
    switch (currentStep) {
      case "mode":
        return mode !== null;
      case "identity":
        return formData.name && formData.version;
      case "role":
        return formData.roleClass && formData.systemPrompt;
      default:
        return true;
    }
  };

  const isFormValid = () => {
    return formData.name && formData.version && formData.roleClass && formData.systemPrompt;
  };

  const currentStepIndex = STEPS.indexOf(currentStep);
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Agent</DialogTitle>
          <DialogDescription>
            {currentStep === "mode"
              ? "Choose how you want to create your agent"
              : `Step ${currentStepIndex} of ${STEPS.length - 1}`}
          </DialogDescription>
        </DialogHeader>

        {/* Progress bar */}
        {currentStep !== "mode" && (
          <div className="w-full bg-muted rounded-full h-2 mb-4">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* Step content */}
        <div className="py-4">{renderStepContent()}</div>

        {/* Navigation buttons */}
        {currentStep !== "mode" && (
          <div className="flex justify-between pt-4 border-t">
            <Button variant="outline" onClick={handleBack} disabled={currentStepIndex === 1}>
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back
            </Button>

            {currentStep === "review" ? (
              <Button onClick={handleSubmit} disabled={createMutation.isPending || !isFormValid()}>
                <Check className="w-4 h-4 mr-2" />
                {createMutation.isPending ? "Creating..." : "Create Agent"}
              </Button>
            ) : (
              <Button onClick={handleNext} disabled={!canProceed()}>
                Next
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
