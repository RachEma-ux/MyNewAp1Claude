import { useMemo, useState } from "react";
import type { AgentCreateInput } from "@shared/schemas/agent-create";
import {
  AGENT_CREATE_ROLE_CLASSES,
  AgentCreateInputSchema,
  DEFAULT_AGENT_CREATE_INPUT,
} from "@shared/schemas/agent-create";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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

type CreationMode = AgentCreateInput["definition"]["creationMode"];
type WizardStep = "mode" | "identity" | "role" | "llm" | "capabilities" | "limits" | "review";

const CREATION_MODES: Array<{
  id: CreationMode;
  icon: typeof Target;
  title: string;
  description: string;
}> = [
  {
    id: "template",
    icon: Target,
    title: "From Template",
    description: "Deploy pre-built agents (Research Assistant, Code Helper, etc.)",
  },
  {
    id: "scratch",
    icon: Pencil,
    title: "From Scratch",
    description: "Manual configuration with full control",
  },
  {
    id: "clone",
    icon: Copy,
    title: "Clone Existing",
    description: "Fork an existing agent",
  },
  {
    id: "workflow",
    icon: Workflow,
    title: "From Workflow",
    description: "Automation-first approach",
  },
  {
    id: "conversation",
    icon: MessageSquare,
    title: "From Conversation",
    description: "Intent extraction from chat",
  },
  {
    id: "event",
    icon: Zap,
    title: "From Event Trigger",
    description: "Event-driven agents",
  },
  {
    id: "import",
    icon: FileUp,
    title: "Import Spec",
    description: "Upload JSON/YAML agent definitions",
  },
];

const ROLE_LABELS: Record<string, string> = {
  assistant: "Assistant",
  analyst: "Analyst",
  executor: "Executor",
  monitor: "Monitor",
  compliance: "Compliance",
  analysis: "Analysis",
  ideation: "Ideation",
  support: "Support",
  reviewer: "Reviewer",
  automator: "Automator",
  custom: "Custom",
};

const STEPS: WizardStep[] = ["mode", "identity", "role", "llm", "capabilities", "limits", "review"];

function formatIssues(issues: Array<{ path: (string | number)[]; message: string }>) {
  const nextErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.join(".");
    if (key && !nextErrors[key]) {
      nextErrors[key] = issue.message;
    }
  }
  return nextErrors;
}

function parseJsonObject(value: string, fieldPath: string, errors: Record<string, string>) {
  if (!value.trim()) {
    delete errors[fieldPath];
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      errors[fieldPath] = "Must be a JSON object";
      return null;
    }
    delete errors[fieldPath];
    return parsed as Record<string, unknown>;
  } catch {
    errors[fieldPath] = "Invalid JSON object";
    return null;
  }
}

export default function AgentWizard({ open, onOpenChange, onSuccess }: AgentWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>("mode");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<AgentCreateInput>(DEFAULT_AGENT_CREATE_INPUT);
  const [tagsInput, setTagsInput] = useState("");
  const [sandboxConstraintsInput, setSandboxConstraintsInput] = useState("{}");
  const [customCapabilitiesInput, setCustomCapabilitiesInput] = useState("{}");

  const { data: availableTools = [] } = trpc.agents.listTools.useQuery(undefined, {
    enabled: open,
  });
  const { data: availableModels = [] } = trpc.models.list.useQuery({ type: "llm" }, {
    enabled: open,
  });

  const createMutation = trpc.agents.create.useMutation({
    onSuccess: () => {
      toast.success("Agent created successfully");
      handleDialogOpenChange(false);
      onSuccess?.();
    },
    onError: (error) => {
      toast.error(`Failed to create agent: ${error.message}`);
    },
  });

  const toolOptions = useMemo(
    () => availableTools.map((tool) => tool.name).sort((a, b) => a.localeCompare(b)),
    [availableTools],
  );

  const resetWizard = () => {
    setCurrentStep("mode");
    setErrors({});
    setFormData(DEFAULT_AGENT_CREATE_INPUT);
    setTagsInput("");
    setSandboxConstraintsInput("{}");
    setCustomCapabilitiesInput("{}");
  };

  const handleDialogOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      resetWizard();
    }
  };

  const handleModeSelect = (selectedMode: CreationMode) => {
    setFormData((prev) => ({
      ...prev,
      definition: {
        ...prev.definition,
        creationMode: selectedMode,
      },
    }));
    setCurrentStep("identity");
    setErrors({});
  };

  const setFieldError = (key: string, value?: string) => {
    setErrors((prev) => {
      const next = { ...prev };
      if (value) {
        next[key] = value;
      } else {
        delete next[key];
      }
      return next;
    });
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
      setErrors({});
    }
  };

  const validateStep = () => {
    const nextErrors: Record<string, string> = {};

    if (currentStep === "identity") {
      if (!formData.identity.name.trim()) nextErrors["identity.name"] = "Agent name is required";
      if (!formData.identity.version.trim()) nextErrors["identity.version"] = "Version is required";
    }

    if (currentStep === "role") {
      if (!formData.definition.roleClass) nextErrors["definition.roleClass"] = "Role class is required";
      if (!formData.definition.systemPrompt.trim()) nextErrors["definition.systemPrompt"] = "System prompt is required";
    }

    if (currentStep === "llm") {
      if (!formData.runtime.modelId.trim()) nextErrors["runtime.modelId"] = "Model is required";
      if (formData.runtime.temperature < 0 || formData.runtime.temperature > 2) {
        nextErrors["runtime.temperature"] = "Temperature must be between 0 and 2";
      }
    }

    if (currentStep === "limits") {
      parseJsonObject(sandboxConstraintsInput, "limits.sandboxConstraints", nextErrors);
      parseJsonObject(customCapabilitiesInput, "capabilities.custom", nextErrors);
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    const submitErrors: Record<string, string> = {};

    const sandboxConstraints = parseJsonObject(
      sandboxConstraintsInput,
      "limits.sandboxConstraints",
      submitErrors,
    );
    const customCapabilities = parseJsonObject(
      customCapabilitiesInput,
      "capabilities.custom",
      submitErrors,
    );

    if (sandboxConstraints === null || customCapabilities === null) {
      setErrors(submitErrors);
      return;
    }

    const payload: AgentCreateInput = {
      ...formData,
      identity: {
        ...formData.identity,
        name: formData.identity.name.trim(),
        version: formData.identity.version.trim(),
        description: formData.identity.description.trim(),
        tags: tagsInput
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      },
      definition: {
        ...formData.definition,
        systemPrompt: formData.definition.systemPrompt.trim(),
      },
      runtime: {
        ...formData.runtime,
        modelId: formData.runtime.modelId.trim(),
      },
      capabilities: {
        ...formData.capabilities,
        allowedTools: formData.capabilities.hasToolAccess ? formData.capabilities.allowedTools : [],
        custom: customCapabilities,
      },
      limits: {
        ...formData.limits,
        sandboxConstraints,
        expiresAt: formData.limits.expiresAt || null,
      },
    };

    const parsed = AgentCreateInputSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors({ ...submitErrors, ...formatIssues(parsed.error.issues) });
      toast.error("Please fix the highlighted fields before creating the agent");
      return;
    }

    setErrors({});
    await createMutation.mutateAsync(parsed.data);
  };

  const canProceed = () => {
    switch (currentStep) {
      case "mode":
        return !!formData.definition.creationMode;
      case "identity":
        return !!formData.identity.name.trim() && !!formData.identity.version.trim();
      case "role":
        return !!formData.definition.roleClass && !!formData.definition.systemPrompt.trim();
      case "llm":
        return !!formData.runtime.modelId.trim();
      default:
        return true;
    }
  };

  const isFormValid = () => {
    const parsed = AgentCreateInputSchema.safeParse({
      ...formData,
      identity: {
        ...formData.identity,
        tags: tagsInput
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      },
      capabilities: {
        ...formData.capabilities,
        allowedTools: formData.capabilities.hasToolAccess ? formData.capabilities.allowedTools : [],
      },
      limits: {
        ...formData.limits,
        expiresAt: formData.limits.expiresAt || null,
      },
    });
    return parsed.success;
  };

  const currentStepIndex = STEPS.indexOf(currentStep);
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

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
                const isSelected = formData.definition.creationMode === modeOption.id;
                return (
                  <Card
                    key={modeOption.id}
                    className={`cursor-pointer transition-colors ${isSelected ? "border-primary" : "hover:border-primary"}`}
                    onClick={() => handleModeSelect(modeOption.id)}
                  >
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Icon className="w-5 h-5" />
                        {modeOption.title}
                      </CardTitle>
                      <CardDescription className="text-sm">{modeOption.description}</CardDescription>
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
                  value={formData.identity.name}
                  onChange={(e) => {
                    setFormData((prev) => ({
                      ...prev,
                      identity: { ...prev.identity, name: e.target.value },
                    }));
                    setFieldError("identity.name");
                  }}
                  placeholder="My Research Agent"
                  className={errors["identity.name"] ? "border-red-500" : ""}
                />
                {errors["identity.name"] && <p className="text-red-500 text-sm mt-1">{errors["identity.name"]}</p>}
              </div>

              <div>
                <Label htmlFor="version">Version *</Label>
                <Input
                  id="version"
                  value={formData.identity.version}
                  onChange={(e) => {
                    setFormData((prev) => ({
                      ...prev,
                      identity: { ...prev.identity, version: e.target.value },
                    }));
                    setFieldError("identity.version");
                  }}
                  placeholder="1.0.0"
                  className={errors["identity.version"] ? "border-red-500" : ""}
                />
                {errors["identity.version"] && <p className="text-red-500 text-sm mt-1">{errors["identity.version"]}</p>}
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.identity.description}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      identity: { ...prev.identity, description: e.target.value },
                    }))
                  }
                  placeholder="Describe what this agent does..."
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="tags">Tags</Label>
                <Input
                  id="tags"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="research, synthesis, finance"
                />
                <p className="text-xs text-muted-foreground mt-1">Comma-separated tags</p>
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
                Define the agent&apos;s purpose and behavior
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="roleClass">Role Class *</Label>
                <Select
                  value={formData.definition.roleClass}
                  onValueChange={(value: AgentCreateInput["definition"]["roleClass"]) => {
                    setFormData((prev) => ({
                      ...prev,
                      definition: { ...prev.definition, roleClass: value },
                    }));
                    setFieldError("definition.roleClass");
                  }}
                >
                  <SelectTrigger id="roleClass" className={errors["definition.roleClass"] ? "border-red-500" : ""}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AGENT_CREATE_ROLE_CLASSES.map((roleClass) => (
                      <SelectItem key={roleClass} value={roleClass}>
                        {ROLE_LABELS[roleClass] ?? roleClass}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors["definition.roleClass"] && (
                  <p className="text-red-500 text-sm mt-1">{errors["definition.roleClass"]}</p>
                )}
              </div>

              <div>
                <Label htmlFor="systemPrompt">System Prompt *</Label>
                <Textarea
                  id="systemPrompt"
                  value={formData.definition.systemPrompt}
                  onChange={(e) => {
                    setFormData((prev) => ({
                      ...prev,
                      definition: { ...prev.definition, systemPrompt: e.target.value },
                    }));
                    setFieldError("definition.systemPrompt");
                  }}
                  placeholder="You are a helpful research assistant that..."
                  rows={6}
                  className={errors["definition.systemPrompt"] ? "border-red-500" : ""}
                />
                {errors["definition.systemPrompt"] && (
                  <p className="text-red-500 text-sm mt-1">{errors["definition.systemPrompt"]}</p>
                )}
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
                Choose the language model and runtime parameters
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="modelId">Model *</Label>
                {availableModels.length > 0 ? (
                  <Select
                    value={formData.runtime.modelId}
                    onValueChange={(value) => {
                      setFormData((prev) => ({
                        ...prev,
                        runtime: { ...prev.runtime, modelId: value },
                      }));
                      setFieldError("runtime.modelId");
                    }}
                  >
                    <SelectTrigger id="modelId" className={errors["runtime.modelId"] ? "border-red-500" : ""}>
                      <SelectValue placeholder="Select a model" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableModels.map((model: any) => (
                        <SelectItem key={String(model.id)} value={model.name}>
                          {model.displayName || model.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="modelId"
                    value={formData.runtime.modelId}
                    onChange={(e) => {
                      setFormData((prev) => ({
                        ...prev,
                        runtime: { ...prev.runtime, modelId: e.target.value },
                      }));
                      setFieldError("runtime.modelId");
                    }}
                    placeholder="gpt-4o-mini"
                    className={errors["runtime.modelId"] ? "border-red-500" : ""}
                  />
                )}
                {errors["runtime.modelId"] && <p className="text-red-500 text-sm mt-1">{errors["runtime.modelId"]}</p>}
              </div>

              <div>
                <Label htmlFor="temperature">Temperature: {formData.runtime.temperature.toFixed(2)}</Label>
                <Input
                  id="temperature"
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={formData.runtime.temperature}
                  onChange={(e) => {
                    const value = Number.parseFloat(e.target.value);
                    setFormData((prev) => ({
                      ...prev,
                      runtime: { ...prev.runtime, temperature: Number.isFinite(value) ? value : 0.7 },
                    }));
                    setFieldError("runtime.temperature");
                  }}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  Lower is more deterministic. Higher is more creative.
                </p>
                {errors["runtime.temperature"] && (
                  <p className="text-red-500 text-sm mt-1">{errors["runtime.temperature"]}</p>
                )}
              </div>
            </div>
          </div>
        );

      case "capabilities":
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Capabilities</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Define what the agent can access and which tools it may use
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3 rounded-md border p-4">
                <Checkbox
                  id="hasDocumentAccess"
                  checked={formData.capabilities.hasDocumentAccess}
                  onCheckedChange={(checked) => {
                    setFormData((prev) => ({
                      ...prev,
                      capabilities: { ...prev.capabilities, hasDocumentAccess: checked === true },
                    }));
                  }}
                />
                <div>
                  <Label htmlFor="hasDocumentAccess" className="cursor-pointer">Document Access</Label>
                  <p className="text-sm text-muted-foreground">Allow the agent to read indexed documents.</p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-md border p-4">
                <Checkbox
                  id="hasToolAccess"
                  checked={formData.capabilities.hasToolAccess}
                  onCheckedChange={(checked) => {
                    const enabled = checked === true;
                    setFormData((prev) => ({
                      ...prev,
                      capabilities: {
                        ...prev.capabilities,
                        hasToolAccess: enabled,
                        allowedTools: enabled ? prev.capabilities.allowedTools : [],
                      },
                    }));
                    setFieldError("capabilities.allowedTools");
                  }}
                />
                <div>
                  <Label htmlFor="hasToolAccess" className="cursor-pointer">Tool Access</Label>
                  <p className="text-sm text-muted-foreground">Enable built-in tools for this agent.</p>
                </div>
              </div>

              {formData.capabilities.hasToolAccess && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Allowed Tools</CardTitle>
                    <CardDescription>Select the tools this agent can call at runtime.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {toolOptions.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {toolOptions.map((tool) => {
                          const checked = formData.capabilities.allowedTools.includes(tool);
                          return (
                            <label key={tool} className="flex items-center gap-3 rounded-md border p-3 cursor-pointer">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(nextChecked) => {
                                  setFormData((prev) => ({
                                    ...prev,
                                    capabilities: {
                                      ...prev.capabilities,
                                      allowedTools: nextChecked === true
                                        ? [...prev.capabilities.allowedTools, tool].sort()
                                        : prev.capabilities.allowedTools.filter((value) => value !== tool),
                                    },
                                  }));
                                  setFieldError("capabilities.allowedTools");
                                }}
                              />
                              <span className="text-sm">{tool}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <Input
                        value={formData.capabilities.allowedTools.join(", ")}
                        onChange={(e) => {
                          const allowedTools = e.target.value
                            .split(",")
                            .map((tool) => tool.trim())
                            .filter(Boolean);
                          setFormData((prev) => ({
                            ...prev,
                            capabilities: { ...prev.capabilities, allowedTools },
                          }));
                        }}
                        placeholder="calculator, text_analysis"
                      />
                    )}
                    {errors["capabilities.allowedTools"] && (
                      <p className="text-red-500 text-sm">{errors["capabilities.allowedTools"]}</p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        );

      case "limits":
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Limits & Constraints</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Set token limits, daily budget, expiry, and sandbox constraints
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="maxTokens">Max Tokens per Request</Label>
                <Input
                  id="maxTokens"
                  type="number"
                  min="1"
                  value={formData.limits.maxTokens}
                  onChange={(e) => {
                    const value = Number.parseInt(e.target.value, 10);
                    setFormData((prev) => ({
                      ...prev,
                      limits: { ...prev.limits, maxTokens: Number.isFinite(value) ? value : 1 },
                    }));
                  }}
                />
              </div>

              <div>
                <Label htmlFor="dailyBudget">Daily Budget (USD)</Label>
                <Input
                  id="dailyBudget"
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.limits.dailyBudget}
                  onChange={(e) => {
                    const value = Number.parseFloat(e.target.value);
                    setFormData((prev) => ({
                      ...prev,
                      limits: { ...prev.limits, dailyBudget: Number.isFinite(value) ? value : 0 },
                    }));
                  }}
                />
              </div>

              <div>
                <Label htmlFor="expiresAt">Expiry Date (Optional)</Label>
                <Input
                  id="expiresAt"
                  type="date"
                  value={formData.limits.expiresAt ?? ""}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      limits: { ...prev.limits, expiresAt: e.target.value || null },
                    }))
                  }
                />
              </div>

              <div>
                <Label htmlFor="sandboxConstraints">Sandbox Constraints (JSON)</Label>
                <Textarea
                  id="sandboxConstraints"
                  value={sandboxConstraintsInput}
                  onChange={(e) => {
                    setSandboxConstraintsInput(e.target.value);
                    setFieldError("limits.sandboxConstraints");
                  }}
                  rows={5}
                  placeholder='{"network": false, "filesystem": "read-only"}'
                  className={errors["limits.sandboxConstraints"] ? "border-red-500" : ""}
                />
                {errors["limits.sandboxConstraints"] && (
                  <p className="text-red-500 text-sm mt-1">{errors["limits.sandboxConstraints"]}</p>
                )}
              </div>

              <div>
                <Label htmlFor="customCapabilities">Custom Capabilities (JSON)</Label>
                <Textarea
                  id="customCapabilities"
                  value={customCapabilitiesInput}
                  onChange={(e) => {
                    setCustomCapabilitiesInput(e.target.value);
                    setFieldError("capabilities.custom");
                  }}
                  rows={4}
                  placeholder='{"memory": {"enabled": true}}'
                  className={errors["capabilities.custom"] ? "border-red-500" : ""}
                />
                {errors["capabilities.custom"] && (
                  <p className="text-red-500 text-sm mt-1">{errors["capabilities.custom"]}</p>
                )}
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
                Review your unified agent configuration before creating
              </p>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Agent Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-muted-foreground">Name:</div>
                  <div className="font-medium">{formData.identity.name || "—"}</div>

                  <div className="text-muted-foreground">Version:</div>
                  <div className="font-medium">{formData.identity.version}</div>

                  <div className="text-muted-foreground">Creation Mode:</div>
                  <div><Badge variant="secondary">{formData.definition.creationMode}</Badge></div>

                  <div className="text-muted-foreground">Role Class:</div>
                  <div><Badge variant="outline">{formData.definition.roleClass}</Badge></div>

                  <div className="text-muted-foreground">Model:</div>
                  <div className="font-medium">{formData.runtime.modelId || "—"}</div>

                  <div className="text-muted-foreground">Temperature:</div>
                  <div className="font-medium">{formData.runtime.temperature.toFixed(2)}</div>

                  <div className="text-muted-foreground">Document Access:</div>
                  <div className="font-medium">{formData.capabilities.hasDocumentAccess ? "Enabled" : "Disabled"}</div>

                  <div className="text-muted-foreground">Tool Access:</div>
                  <div className="font-medium">{formData.capabilities.hasToolAccess ? "Enabled" : "Disabled"}</div>

                  <div className="text-muted-foreground">Max Tokens:</div>
                  <div className="font-medium">{formData.limits.maxTokens}</div>

                  <div className="text-muted-foreground">Daily Budget:</div>
                  <div className="font-medium">${formData.limits.dailyBudget}</div>

                  <div className="text-muted-foreground">Expiry:</div>
                  <div className="font-medium">{formData.limits.expiresAt || "None"}</div>
                </div>

                {formData.identity.description && (
                  <div className="pt-3 border-t">
                    <div className="text-muted-foreground mb-1">Description</div>
                    <div>{formData.identity.description}</div>
                  </div>
                )}

                <div className="pt-3 border-t">
                  <div className="text-muted-foreground mb-1">System Prompt</div>
                  <div className="bg-muted p-3 rounded-md whitespace-pre-wrap">
                    {formData.definition.systemPrompt.slice(0, 400)}
                    {formData.definition.systemPrompt.length > 400 ? "..." : ""}
                  </div>
                </div>

                <div className="pt-3 border-t">
                  <div className="text-muted-foreground mb-1">Allowed Tools</div>
                  <div className="flex flex-wrap gap-2">
                    {formData.capabilities.allowedTools.length > 0 ? (
                      formData.capabilities.allowedTools.map((tool) => (
                        <Badge key={tool} variant="outline">{tool}</Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground">None</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Agent</DialogTitle>
          <DialogDescription>
            {currentStep === "mode"
              ? "Choose how you want to create your agent"
              : `Step ${currentStepIndex} of ${STEPS.length - 1}`}
          </DialogDescription>
        </DialogHeader>

        {currentStep !== "mode" && (
          <div className="w-full bg-muted rounded-full h-2 mb-4">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <div className="py-4">{renderStepContent()}</div>

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
