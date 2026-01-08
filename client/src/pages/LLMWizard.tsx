/**
 * LLM Wizard - Multi-step form for creating and configuring LLMs
 *
 * RFC-001 Compliant Wizard Implementation:
 * - 3-step flow: Identity → Configuration → Review
 * - Auto-save drafts to localStorage
 * - Policy validation on submit
 * - Creates version in sandbox environment
 */

import { useState, useEffect } from "react";
import { useNavigate } from "wouter";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  Save,
  Wand2,
  AlertTriangle,
  Info,
  Loader2,
  Shield,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

// ============================================================================
// Types
// ============================================================================

type WizardStep = "identity" | "configuration" | "review";

interface LLMIdentity {
  name: string;
  role: "planner" | "executor" | "router" | "guard" | "observer" | "embedder";
  description: string;
  ownerTeam: string;
}

interface LLMConfiguration {
  runtime: {
    type: "local" | "cloud" | "remote";
    provider?: string;
    endpoint?: string;
  };
  model: {
    name: string;
    version?: string;
    contextLength?: number;
  };
  parameters: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    streaming?: boolean;
  };
}

interface WizardState {
  identity: LLMIdentity;
  configuration: LLMConfiguration;
}

const DRAFT_KEY = "llm-wizard-draft";

// ============================================================================
// Default Values
// ============================================================================

const defaultIdentity: LLMIdentity = {
  name: "",
  role: "executor",
  description: "",
  ownerTeam: "",
};

const defaultConfiguration: LLMConfiguration = {
  runtime: {
    type: "cloud",
    provider: "anthropic",
  },
  model: {
    name: "",
    contextLength: 200000,
  },
  parameters: {
    temperature: 0.7,
    maxTokens: 4096,
    topP: 1.0,
    streaming: true,
  },
};

// ============================================================================
// Main Wizard Component
// ============================================================================

export default function LLMWizard() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<WizardStep>("identity");
  const [state, setState] = useState<WizardState>({
    identity: defaultIdentity,
    configuration: defaultConfiguration,
  });
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Load draft from localStorage on mount
  useEffect(() => {
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        setState(parsed);
        toast.info("Draft loaded from previous session");
      } catch (e) {
        console.error("Failed to parse draft:", e);
      }
    }
  }, []);

  // Auto-save to localStorage
  useEffect(() => {
    const timer = setTimeout(() => {
      if (hasUnsavedChanges) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
        setHasUnsavedChanges(false);
        toast.success("Draft saved", { duration: 1000 });
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [state, hasUnsavedChanges]);

  const updateIdentity = (updates: Partial<LLMIdentity>) => {
    setState((prev) => ({ ...prev, identity: { ...prev.identity, ...updates } }));
    setHasUnsavedChanges(true);
  };

  const updateConfiguration = (updates: Partial<LLMConfiguration>) => {
    setState((prev) => ({
      ...prev,
      configuration: { ...prev.configuration, ...updates },
    }));
    setHasUnsavedChanges(true);
  };

  const clearDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
  };

  const handleBack = () => {
    if (currentStep === "configuration") {
      setCurrentStep("identity");
    } else if (currentStep === "review") {
      setCurrentStep("configuration");
    }
  };

  const handleNext = () => {
    if (currentStep === "identity") {
      if (!validateIdentity()) return;
      setCurrentStep("configuration");
    } else if (currentStep === "configuration") {
      if (!validateConfiguration()) return;
      setCurrentStep("review");
    }
  };

  const validateIdentity = (): boolean => {
    if (!state.identity.name.trim()) {
      toast.error("Name is required");
      return false;
    }
    if (!state.identity.role) {
      toast.error("Role is required");
      return false;
    }
    return true;
  };

  const validateConfiguration = (): boolean => {
    if (!state.configuration.model.name.trim()) {
      toast.error("Model name is required");
      return false;
    }
    return true;
  };

  const steps = [
    { id: "identity", title: "Identity", description: "Name and role" },
    { id: "configuration", title: "Configuration", description: "Runtime and model" },
    { id: "review", title: "Review", description: "Review and submit" },
  ];

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate("/llm")}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <div className="flex items-center gap-3">
            <Wand2 className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">LLM Wizard</h1>
          </div>
          <p className="text-muted-foreground">Create and configure a new LLM identity</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                    index < currentStepIndex
                      ? "bg-primary border-primary text-primary-foreground"
                      : index === currentStepIndex
                      ? "border-primary text-primary"
                      : "border-muted text-muted-foreground"
                  }`}
                >
                  {index < currentStepIndex ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>
                <div className="mt-2 text-center">
                  <div className="text-sm font-medium">{step.title}</div>
                  <div className="text-xs text-muted-foreground hidden sm:block">
                    {step.description}
                  </div>
                </div>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`h-[2px] flex-1 transition-colors ${
                    index < currentStepIndex ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="min-h-[500px]">
        {currentStep === "identity" && (
          <IdentityStep identity={state.identity} onUpdate={updateIdentity} />
        )}
        {currentStep === "configuration" && (
          <ConfigurationStep
            configuration={state.configuration}
            onUpdate={updateConfiguration}
          />
        )}
        {currentStep === "review" && (
          <ReviewStep
            state={state}
            onSuccess={() => {
              clearDraft();
              navigate("/llm");
            }}
          />
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t">
        <div className="flex items-center gap-2">
          {hasUnsavedChanges && (
            <Badge variant="secondary" className="gap-1">
              <Save className="h-3 w-3" />
              Saving...
            </Badge>
          )}
        </div>

        <div className="flex gap-3">
          {currentStep !== "identity" && (
            <Button variant="outline" onClick={handleBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          )}

          {currentStep !== "review" ? (
            <Button onClick={handleNext}>
              Next
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Step 1: Identity
// ============================================================================

function IdentityStep({
  identity,
  onUpdate,
}: {
  identity: LLMIdentity;
  onUpdate: (updates: Partial<LLMIdentity>) => void;
}) {
  const roleDescriptions: Record<string, string> = {
    planner: "Strategic decision-making and task planning",
    executor: "Direct task execution and action completion",
    router: "Request routing and workload distribution",
    guard: "Safety validation and policy enforcement",
    observer: "Monitoring, logging, and system observation",
    embedder: "Text embedding and semantic encoding",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>LLM Identity</CardTitle>
        <CardDescription>Define the identity and purpose of this LLM</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="name">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            placeholder="e.g., my-planner-llm"
            value={identity.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Unique identifier for this LLM. Use lowercase with hyphens.
          </p>
        </div>

        {/* Role */}
        <div className="space-y-2">
          <Label htmlFor="role">
            Role <span className="text-destructive">*</span>
          </Label>
          <Select value={identity.role} onValueChange={(value: any) => onUpdate({ role: value })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(roleDescriptions).map(([role, description]) => (
                <SelectItem key={role} value={role}>
                  <div>
                    <div className="font-medium capitalize">{role}</div>
                    <div className="text-xs text-muted-foreground">{description}</div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {roleDescriptions[identity.role]}
          </p>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            placeholder="Describe the purpose and responsibilities of this LLM..."
            value={identity.description}
            onChange={(e) => onUpdate({ description: e.target.value })}
            rows={4}
          />
        </div>

        {/* Owner Team */}
        <div className="space-y-2">
          <Label htmlFor="ownerTeam">Owner Team</Label>
          <Input
            id="ownerTeam"
            placeholder="e.g., platform-team"
            value={identity.ownerTeam}
            onChange={(e) => onUpdate({ ownerTeam: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Team responsible for managing this LLM
          </p>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            The identity cannot be changed after creation. Version configuration can be updated
            through promotions.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Step 2: Configuration
// ============================================================================

function ConfigurationStep({
  configuration,
  onUpdate,
}: {
  configuration: LLMConfiguration;
  onUpdate: (updates: Partial<LLMConfiguration>) => void;
}) {
  const updateRuntime = (updates: Partial<typeof configuration.runtime>) => {
    onUpdate({ runtime: { ...configuration.runtime, ...updates } });
  };

  const updateModel = (updates: Partial<typeof configuration.model>) => {
    onUpdate({ model: { ...configuration.model, ...updates } });
  };

  const updateParameters = (updates: Partial<typeof configuration.parameters>) => {
    onUpdate({ parameters: { ...configuration.parameters, ...updates } });
  };

  return (
    <div className="space-y-6">
      {/* Runtime Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Runtime Configuration</CardTitle>
          <CardDescription>Where and how this LLM will execute</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Runtime Type</Label>
            <Select
              value={configuration.runtime.type}
              onValueChange={(value: any) => updateRuntime({ type: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cloud">Cloud (API-based)</SelectItem>
                <SelectItem value="local">Local (Self-hosted)</SelectItem>
                <SelectItem value="remote">Remote (Custom endpoint)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {configuration.runtime.type === "cloud" && (
            <div className="space-y-2">
              <Label>Provider</Label>
              <Select
                value={configuration.runtime.provider}
                onValueChange={(value) => updateRuntime({ provider: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                  <SelectItem value="openai">OpenAI (GPT)</SelectItem>
                  <SelectItem value="google">Google (Gemini)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {configuration.runtime.type === "remote" && (
            <div className="space-y-2">
              <Label>Endpoint URL</Label>
              <Input
                placeholder="https://api.example.com/v1/chat"
                value={configuration.runtime.endpoint || ""}
                onChange={(e) => updateRuntime({ endpoint: e.target.value })}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Model Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Model Configuration</CardTitle>
          <CardDescription>Model details and capabilities</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>
              Model Name <span className="text-destructive">*</span>
            </Label>
            <Input
              placeholder="e.g., claude-sonnet-4-5-20250929"
              value={configuration.model.name}
              onChange={(e) => updateModel({ name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Model Version</Label>
            <Input
              placeholder="e.g., 20250929"
              value={configuration.model.version || ""}
              onChange={(e) => updateModel({ version: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label>Context Length</Label>
            <Input
              type="number"
              placeholder="200000"
              value={configuration.model.contextLength || ""}
              onChange={(e) =>
                updateModel({ contextLength: parseInt(e.target.value) || undefined })
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Parameters */}
      <Card>
        <CardHeader>
          <CardTitle>Inference Parameters</CardTitle>
          <CardDescription>Control generation behavior</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Temperature</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="2"
                value={configuration.parameters.temperature || 0.7}
                onChange={(e) =>
                  updateParameters({ temperature: parseFloat(e.target.value) || 0.7 })
                }
              />
              <p className="text-xs text-muted-foreground">0.0 - 2.0</p>
            </div>

            <div className="space-y-2">
              <Label>Max Tokens</Label>
              <Input
                type="number"
                value={configuration.parameters.maxTokens || 4096}
                onChange={(e) =>
                  updateParameters({ maxTokens: parseInt(e.target.value) || 4096 })
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Top P</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                max="1"
                value={configuration.parameters.topP || 1.0}
                onChange={(e) =>
                  updateParameters({ topP: parseFloat(e.target.value) || 1.0 })
                }
              />
              <p className="text-xs text-muted-foreground">0.0 - 1.0</p>
            </div>

            <div className="space-y-2">
              <Label>Streaming</Label>
              <Select
                value={configuration.parameters.streaming ? "true" : "false"}
                onValueChange={(value) => updateParameters({ streaming: value === "true" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Enabled</SelectItem>
                  <SelectItem value="false">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Step 3: Review & Submit
// ============================================================================

function ReviewStep({ state, onSuccess }: { state: WizardState; onSuccess: () => void }) {
  const createLLMMutation = trpc.llm.create.useMutation();
  const createVersionMutation = trpc.llm.createVersion.useMutation();
  const validatePolicyMutation = trpc.llm.validatePolicy.useMutation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [policyResult, setPolicyResult] = useState<any>(null);
  const [showPolicyResults, setShowPolicyResults] = useState(false);

  const handleValidatePolicy = async () => {
    try {
      const result = await validatePolicyMutation.mutateAsync({
        identity: state.identity,
        configuration: state.configuration,
        environment: "sandbox",
      });

      setPolicyResult(result);
      setShowPolicyResults(true);

      if (result.decision === "allow") {
        toast.success("Policy validation passed!");
      } else if (result.decision === "warn") {
        toast.warning(`Policy validation passed with ${result.warnings.length} warnings`);
      } else {
        toast.error(`Policy validation failed with ${result.violations.length} errors`);
      }
    } catch (error: any) {
      toast.error(`Policy validation error: ${error.message}`);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      // Step 1: Validate policy first
      if (!policyResult) {
        toast.error("Please validate policy before submitting");
        setIsSubmitting(false);
        return;
      }

      if (policyResult.decision === "deny") {
        toast.error("Cannot create LLM: Policy validation failed");
        setIsSubmitting(false);
        return;
      }

      // Step 2: Create LLM identity
      const llm = await createLLMMutation.mutateAsync({
        name: state.identity.name,
        role: state.identity.role,
        description: state.identity.description || undefined,
        ownerTeam: state.identity.ownerTeam || undefined,
      });

      toast.success(`LLM "${llm.name}" created`);

      // Step 3: Create initial version in sandbox
      const version = await createVersionMutation.mutateAsync({
        llmId: llm.id,
        environment: "sandbox",
        config: {
          runtime: state.configuration.runtime,
          model: state.configuration.model,
          parameters: state.configuration.parameters,
        },
      });

      toast.success(`Version ${version.version} created in sandbox`);

      // Success!
      onSuccess();
    } catch (error: any) {
      toast.error(`Failed to create LLM: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Review Configuration</CardTitle>
          <CardDescription>Verify all details before creating the LLM</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Identity Summary */}
          <div>
            <h3 className="font-semibold mb-3">Identity</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">Name:</span>
                <p className="font-medium">{state.identity.name}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Role:</span>
                <p className="font-medium capitalize">{state.identity.role}</p>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Description:</span>
                <p className="font-medium">{state.identity.description || "—"}</p>
              </div>
              <div>
                <span className="text-muted-foreground">Owner Team:</span>
                <p className="font-medium">{state.identity.ownerTeam || "—"}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Configuration Summary */}
          <div>
            <h3 className="font-semibold mb-3">Configuration</h3>
            <div className="space-y-4 text-sm">
              <div>
                <span className="text-muted-foreground block mb-1">Runtime:</span>
                <div className="bg-muted p-3 rounded-md">
                  <p>Type: {state.configuration.runtime.type}</p>
                  {state.configuration.runtime.provider && (
                    <p>Provider: {state.configuration.runtime.provider}</p>
                  )}
                  {state.configuration.runtime.endpoint && (
                    <p>Endpoint: {state.configuration.runtime.endpoint}</p>
                  )}
                </div>
              </div>

              <div>
                <span className="text-muted-foreground block mb-1">Model:</span>
                <div className="bg-muted p-3 rounded-md">
                  <p>Name: {state.configuration.model.name}</p>
                  {state.configuration.model.version && (
                    <p>Version: {state.configuration.model.version}</p>
                  )}
                  {state.configuration.model.contextLength && (
                    <p>Context: {state.configuration.model.contextLength.toLocaleString()} tokens</p>
                  )}
                </div>
              </div>

              <div>
                <span className="text-muted-foreground block mb-1">Parameters:</span>
                <div className="bg-muted p-3 rounded-md grid grid-cols-2 gap-2">
                  <p>Temperature: {state.configuration.parameters.temperature}</p>
                  <p>Max Tokens: {state.configuration.parameters.maxTokens}</p>
                  <p>Top P: {state.configuration.parameters.topP}</p>
                  <p>Streaming: {state.configuration.parameters.streaming ? "Yes" : "No"}</p>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Deployment Info */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>Initial Deployment:</strong> Version 1 will be created in the{" "}
              <Badge variant="secondary" className="mx-1">
                sandbox
              </Badge>{" "}
              environment. You can promote to governed/production after validation.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Policy Validation */}
      <Card>
        <CardHeader>
          <CardTitle>Policy Validation</CardTitle>
          <CardDescription>
            Validate configuration against governance policies
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={handleValidatePolicy}
              disabled={validatePolicyMutation.isPending}
            >
              {validatePolicyMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Validating...
                </>
              ) : (
                <>
                  <Shield className="h-4 w-4 mr-2" />
                  Validate Policy
                </>
              )}
            </Button>

            {policyResult && (
              <div className="flex items-center gap-2">
                {policyResult.decision === "allow" && (
                  <Badge variant="default" className="bg-green-600">
                    <Check className="h-3 w-3 mr-1" />
                    Passed
                  </Badge>
                )}
                {policyResult.decision === "warn" && (
                  <Badge variant="secondary" className="bg-yellow-600">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Warnings
                  </Badge>
                )}
                {policyResult.decision === "deny" && (
                  <Badge variant="destructive">
                    <XCircle className="h-3 w-3 mr-1" />
                    Failed
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Policy Results */}
          {showPolicyResults && policyResult && (
            <div className="space-y-3 mt-4">
              {/* Violations */}
              {policyResult.violations && policyResult.violations.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-destructive">
                    Policy Violations ({policyResult.violations.length})
                  </h4>
                  {policyResult.violations.map((violation: any, index: number) => (
                    <Alert key={index} variant="destructive">
                      <XCircle className="h-4 w-4" />
                      <AlertDescription>
                        <div>
                          <strong>{violation.rule}</strong>
                          {violation.field && <span className="text-xs"> ({violation.field})</span>}
                        </div>
                        <div className="text-sm mt-1">{violation.message}</div>
                        {violation.suggestion && (
                          <div className="text-xs mt-1 opacity-80">
                            💡 {violation.suggestion}
                          </div>
                        )}
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              )}

              {/* Warnings */}
              {policyResult.warnings && policyResult.warnings.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-yellow-600">
                    Warnings ({policyResult.warnings.length})
                  </h4>
                  {policyResult.warnings.map((warning: any, index: number) => (
                    <Alert key={index}>
                      <AlertTriangle className="h-4 w-4 text-yellow-600" />
                      <AlertDescription>
                        <div>
                          <strong>{warning.rule}</strong>
                          {warning.field && <span className="text-xs"> ({warning.field})</span>}
                        </div>
                        <div className="text-sm mt-1">{warning.message}</div>
                        {warning.suggestion && (
                          <div className="text-xs mt-1 opacity-80">
                            💡 {warning.suggestion}
                          </div>
                        )}
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              )}

              {/* Success Message */}
              {policyResult.decision === "allow" &&
                (!policyResult.warnings || policyResult.warnings.length === 0) && (
                  <Alert>
                    <Check className="h-4 w-4 text-green-600" />
                    <AlertDescription>
                      All policy checks passed! Configuration is compliant and ready for deployment.
                    </AlertDescription>
                  </Alert>
                )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submit Button */}
      <div className="flex justify-end">
        <Button
          size="lg"
          onClick={handleSubmit}
          disabled={isSubmitting || createLLMMutation.isPending || createVersionMutation.isPending}
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Creating...
            </>
          ) : (
            <>
              <Check className="h-4 w-4 mr-2" />
              Create LLM
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
