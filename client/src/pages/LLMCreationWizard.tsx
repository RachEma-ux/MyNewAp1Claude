/**
 * LLM Creation (Full Lifecycle) - Complete pipeline for training custom LLMs
 *
 * Purpose: Train/fine-tune actual AI models from scratch or base models
 * Use when: You need to create a custom model with your own data
 *
 * Follows the "COMPLETE LLM CREATION GUIDE" methodology:
 * - PATH A: Fine-tuning (Recommended) - 8 phases, 2-4 weeks
 * - PATH B: Pre-training from scratch (Advanced) - 6 phases, 2-6 months
 *
 * Features:
 * - Multi-step guided creation process
 * - Dataset management (SFT, DPO, eval)
 * - Training configuration & monitoring
 * - Evaluation & benchmarking
 * - Quantization & GGUF conversion
 * - Auto-save drafts to localStorage
 * - Complete audit trail
 * - Real-time progress tracking
 * - Build spec generation
 * - Promotion workflow integration
 *
 * NOTE: This trains actual models. For quick registration of existing models,
 * use "LLM Quick Setup" wizard at /llm/wizard
 */

import { useState, useEffect } from "react";
import { useLocation } from "wouter";
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
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  AlertTriangle,
  Info,
  Zap,
  Database,
  Brain,
  Settings,
  BarChart,
  Package,
  Rocket,
  GitBranch,
} from "lucide-react";
import { toast } from "sonner";

// ============================================================================
// Types
// ============================================================================

type WizardStep =
  | "path"
  | "target"
  | "base_model"
  | "datasets"
  | "training_sft"
  | "training_dpo"
  | "training_tools"
  | "evaluation"
  | "quantization"
  | "review";

interface CreationProject {
  name: string;
  description: string;
  path: "PATH_A" | "PATH_B";
  target: {
    useCase: string;
    deployment: string;
    maxModelSize: string;
    contextLength: string;
    allowedData: string;
  };
  baseModel?: {
    name: string;
    ollamaTag: string;
    hfRepo: string;
    size: string;
    license: string;
    context: number;
    rationale: string;
  };
  datasets: {
    sft?: { name: string; format: string; source: string };
    dpo?: { name: string; format: string; source: string };
    eval?: { name: string; format: string; source: string };
  };
  trainingConfig: {
    sft?: {
      framework: string;
      epochs: number;
      batchSize: number;
      learningRate: number;
      useQLora: boolean;
    };
    dpo?: {
      epochs: number;
      batchSize: number;
      learningRate: number;
      beta: number;
    };
    tools?: {
      enabled: boolean;
      toolSchemas: any[];
    };
  };
  evaluation: {
    benchmarks: string[];
    customTests: boolean;
  };
  quantization: {
    enabled: boolean;
    type: "Q4_K_M" | "Q5_K_M" | "Q8_0" | "Q2_K" | "f16";
    method: "llama.cpp" | "gptq" | "awq";
  };
}

const DRAFT_KEY = "llm-creation-wizard-draft";

// ============================================================================
// Default Values
// ============================================================================

const defaultProject: CreationProject = {
  name: "",
  description: "",
  path: "PATH_A",
  target: {
    useCase: "chat_assistant",
    deployment: "cloud",
    maxModelSize: "7B",
    contextLength: "8k",
    allowedData: "public_and_proprietary",
  },
  datasets: {},
  trainingConfig: {},
  evaluation: {
    benchmarks: [],
    customTests: false,
  },
  quantization: {
    enabled: true,
    type: "Q4_K_M",
    method: "llama.cpp",
  },
};

// ============================================================================
// Step Configuration
// ============================================================================

const STEPS: Record<string, { title: string; icon: any; description: string }> = {
  path: {
    title: "Path Selection",
    icon: GitBranch,
    description: "Choose between fine-tuning (PATH A) or pre-training (PATH B)",
  },
  target: {
    title: "Target Specification",
    icon: Settings,
    description: "Define your use case, deployment, and requirements",
  },
  base_model: {
    title: "Base Model",
    icon: Brain,
    description: "Select the foundation model to build upon",
  },
  datasets: {
    title: "Datasets",
    icon: Database,
    description: "Prepare your training, evaluation, and preference data",
  },
  training_sft: {
    title: "SFT Training",
    icon: Zap,
    description: "Configure supervised fine-tuning parameters",
  },
  training_dpo: {
    title: "DPO Training",
    icon: Zap,
    description: "Configure preference optimization settings",
  },
  training_tools: {
    title: "Tool Calling",
    icon: Settings,
    description: "Enable and configure tool calling capabilities",
  },
  evaluation: {
    title: "Evaluation",
    icon: BarChart,
    description: "Set up benchmarks and testing criteria",
  },
  quantization: {
    title: "Quantization",
    icon: Package,
    description: "Optimize model size and performance",
  },
  review: {
    title: "Review & Launch",
    icon: Rocket,
    description: "Review configuration and start creation",
  },
};

// ============================================================================
// Main Wizard Component
// ============================================================================

export default function LLMCreationWizard() {
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState<WizardStep>("path");
  const [project, setProject] = useState<CreationProject>(defaultProject);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const createProjectMutation = trpc.llm.createCreationProject.useMutation();
  const createDatasetMutation = trpc.llm.createDataset.useMutation();

  // Load draft from localStorage on mount
  useEffect(() => {
    const draft = localStorage.getItem(DRAFT_KEY);
    if (draft) {
      try {
        const parsed = JSON.parse(draft);
        setProject(parsed);
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
        localStorage.setItem(DRAFT_KEY, JSON.stringify(project));
        setHasUnsavedChanges(false);
        toast.success("Draft saved", { duration: 1000 });
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [project, hasUnsavedChanges]);

  const updateProject = (updates: Partial<CreationProject>) => {
    setProject((prev) => ({ ...prev, ...updates }));
    setHasUnsavedChanges(true);
  };

  const getStepOrder = (): WizardStep[] => {
    if (project.path === "PATH_A") {
      return [
        "path",
        "target",
        "base_model",
        "datasets",
        "training_sft",
        "training_dpo",
        "training_tools",
        "evaluation",
        "quantization",
        "review",
      ];
    } else {
      // PATH B has different steps (simplified for now)
      return [
        "path",
        "target",
        "base_model",
        "datasets",
        "training_sft",
        "evaluation",
        "quantization",
        "review",
      ];
    }
  };

  const stepOrder = getStepOrder();
  const currentStepIndex = stepOrder.indexOf(currentStep);
  const progress = ((currentStepIndex + 1) / stepOrder.length) * 100;

  const goToNextStep = () => {
    // Validate required fields before leaving the current step
    if (currentStep === "path" && (!project.name || project.name.trim().length === 0)) {
      toast.error("Please enter a project name before continuing.");
      return;
    }

    const nextIndex = currentStepIndex + 1;
    if (nextIndex < stepOrder.length) {
      setCurrentStep(stepOrder[nextIndex]);
    }
  };

  const goToPreviousStep = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(stepOrder[prevIndex]);
    }
  };

  const handleSubmit = async () => {
    // Client-side validation
    if (!project.name || project.name.trim().length === 0) {
      toast.error("Project name is required. Go back to Step 1 to fill it in.");
      return;
    }

    try {
      // Create the project
      const createdProject = await createProjectMutation.mutateAsync({
        name: project.name.trim(),
        description: project.description,
        path: project.path,
        target: project.target,
        baseModel: project.baseModel,
      });

      toast.success("LLM creation project started!");
      localStorage.removeItem(DRAFT_KEY);
      setLocation("/llm");
    } catch (error: any) {
      // Parse Zod validation errors into readable messages
      try {
        const parsed = JSON.parse(error.message);
        if (Array.isArray(parsed)) {
          const msgs = parsed.map((v: any) => `${v.path?.join(".")}: ${v.message}`).join("; ");
          toast.error(msgs);
          return;
        }
      } catch {}
      toast.error(error.message || "Failed to create project");
    }
  };

  return (
    <div className="container max-w-5xl py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold">LLM Creation (Full Lifecycle)</h1>
            <p className="text-muted-foreground mt-1">
              Train custom models via PATH A (Fine-tuning) or PATH B (Pre-training from scratch)
            </p>
          </div>
          <Button variant="outline" onClick={() => setLocation("/llm")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Cancel
          </Button>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Step {currentStepIndex + 1} of {stepOrder.length}</span>
            <span className="text-muted-foreground">{Math.round(progress)}% Complete</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Step Indicators */}
        <div className="flex gap-2 mt-4 overflow-x-auto pb-2">
          {stepOrder.map((step, index) => {
            const stepConfig = STEPS[step];
            const isActive = step === currentStep;
            const isCompleted = index < currentStepIndex;

            return (
              <button
                key={step}
                onClick={() => setCurrentStep(step)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm whitespace-nowrap transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground border-primary"
                    : isCompleted
                    ? "bg-green-50 border-green-200 text-green-700"
                    : "bg-background hover:bg-muted"
                }`}
              >
                {isCompleted ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <stepConfig.icon className="h-4 w-4" />
                )}
                <span>{stepConfig.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            {(() => {
              const StepIcon = STEPS[currentStep].icon;
              return <StepIcon className="h-6 w-6 text-primary" />;
            })()}
            <div>
              <CardTitle>{STEPS[currentStep].title}</CardTitle>
              <CardDescription>{STEPS[currentStep].description}</CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Path Selection Step */}
          {currentStep === "path" && (
            <PathSelectionStep project={project} updateProject={updateProject} />
          )}

          {/* Target Specification Step */}
          {currentStep === "target" && (
            <TargetSpecificationStep project={project} updateProject={updateProject} />
          )}

          {/* Base Model Selection Step */}
          {currentStep === "base_model" && (
            <BaseModelSelectionStep project={project} updateProject={updateProject} />
          )}

          {/* Datasets Step */}
          {currentStep === "datasets" && (
            <DatasetsStep project={project} updateProject={updateProject} />
          )}

          {/* SFT Training Step */}
          {currentStep === "training_sft" && (
            <SFTTrainingStep project={project} updateProject={updateProject} />
          )}

          {/* DPO Training Step */}
          {currentStep === "training_dpo" && (
            <DPOTrainingStep project={project} updateProject={updateProject} />
          )}

          {/* Tool Calling Step */}
          {currentStep === "training_tools" && (
            <ToolCallingStep project={project} updateProject={updateProject} />
          )}

          {/* Evaluation Step */}
          {currentStep === "evaluation" && (
            <EvaluationStep project={project} updateProject={updateProject} />
          )}

          {/* Quantization Step */}
          {currentStep === "quantization" && (
            <QuantizationStep project={project} updateProject={updateProject} />
          )}

          {/* Review Step */}
          {currentStep === "review" && <ReviewStep project={project} />}

          {/* Navigation */}
          <Separator />
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={goToPreviousStep}
              disabled={currentStepIndex === 0}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Previous
            </Button>

            {currentStep === "review" ? (
              <Button
                onClick={handleSubmit}
                disabled={createProjectMutation.isPending}
              >
                {createProjectMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Rocket className="mr-2 h-4 w-4" />
                    Start Creation
                  </>
                )}
              </Button>
            ) : (
              <Button onClick={goToNextStep}>
                Next
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Step Components
// ============================================================================

function PathSelectionStep({
  project,
  updateProject,
}: {
  project: CreationProject;
  updateProject: (updates: Partial<CreationProject>) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Project Name */}
      <div className="space-y-2">
        <Label htmlFor="name">Project Name *</Label>
        <Input
          id="name"
          value={project.name}
          onChange={(e) => updateProject({ name: e.target.value })}
          placeholder="my-custom-llm"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={project.description}
          onChange={(e) => updateProject({ description: e.target.value })}
          placeholder="Describe your LLM project..."
          rows={3}
        />
      </div>

      {/* Path Selection */}
      <div className="space-y-4">
        <Label>Training Path *</Label>
        <RadioGroup
          value={project.path}
          onValueChange={(value) => updateProject({ path: value as "PATH_A" | "PATH_B" })}
        >
          <Card className={project.path === "PATH_A" ? "border-primary" : ""}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="PATH_A" id="path-a" />
                  <div>
                    <CardTitle className="text-lg">PATH A: Fine-Tuning</CardTitle>
                    <CardDescription>Recommended for most projects</CardDescription>
                  </div>
                </div>
                <Badge variant="secondary">Recommended</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Check className="h-4 w-4 text-green-600" />
                <span>Timeline: 2-4 weeks</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Check className="h-4 w-4 text-green-600" />
                <span>Cost: $100-$10K</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Check className="h-4 w-4 text-green-600" />
                <span>Best for: Adapting existing models to your domain</span>
              </div>
              <Alert className="mt-4">
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Fine-tune models like Qwen2.5, LLaMA 3.1, or Mistral using your own data
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>

          <Card className={project.path === "PATH_B" ? "border-primary" : ""}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="PATH_B" id="path-b" />
                  <div>
                    <CardTitle className="text-lg">PATH B: Pre-Training</CardTitle>
                    <CardDescription>Advanced: Build from scratch</CardDescription>
                  </div>
                </div>
                <Badge variant="destructive">Advanced</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span>Timeline: 2-6 months</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span>Cost: $100K-$10M+</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span>Requires: 100B+ tokens, 5+ engineers</span>
              </div>
              <Alert variant="destructive" className="mt-4">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Only use if you need custom architecture or have massive proprietary data
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </RadioGroup>
      </div>

      {/* Decision Framework */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          <strong>How to choose:</strong> If you have &lt;100B tokens, budget &lt;$100K, or timeline
          &lt;3 months, use PATH A. PATH B is for companies building novel architectures.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function TargetSpecificationStep({
  project,
  updateProject,
}: {
  project: CreationProject;
  updateProject: (updates: Partial<CreationProject>) => void;
}) {
  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Define your target deployment and requirements (Phase 0 from guide)
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <Label htmlFor="useCase">Use Case *</Label>
        <Select
          value={project.target.useCase}
          onValueChange={(value) =>
            updateProject({ target: { ...project.target, useCase: value } })
          }
        >
          <SelectTrigger id="useCase">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="chat_assistant">Chat Assistant</SelectItem>
            <SelectItem value="coding_helper">Coding Helper</SelectItem>
            <SelectItem value="enterprise_doc_qa">Enterprise Doc Q&A</SelectItem>
            <SelectItem value="router">Router / Orchestrator</SelectItem>
            <SelectItem value="agent">Agent System</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="deployment">Deployment Target *</Label>
        <Select
          value={project.target.deployment}
          onValueChange={(value) =>
            updateProject({ target: { ...project.target, deployment: value } })
          }
        >
          <SelectTrigger id="deployment">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="phone">Phone / Mobile</SelectItem>
            <SelectItem value="laptop">Laptop / Edge Device</SelectItem>
            <SelectItem value="single_gpu">Single GPU Server</SelectItem>
            <SelectItem value="cloud">Cloud / Multi-GPU</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="maxModelSize">Max Model Size *</Label>
        <Select
          value={project.target.maxModelSize}
          onValueChange={(value) =>
            updateProject({ target: { ...project.target, maxModelSize: value } })
          }
        >
          <SelectTrigger id="maxModelSize">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1B">1B - Lightweight (2-4 GB VRAM)</SelectItem>
            <SelectItem value="3B">3B - Edge Devices (4-6 GB VRAM)</SelectItem>
            <SelectItem value="7B">7B - General Purpose (6-8 GB VRAM)</SelectItem>
            <SelectItem value="13B">13B - Higher Quality (12-16 GB VRAM)</SelectItem>
            <SelectItem value="70B">70B - Enterprise (48-80 GB VRAM)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="contextLength">Context Length *</Label>
        <Select
          value={project.target.contextLength}
          onValueChange={(value) =>
            updateProject({ target: { ...project.target, contextLength: value } })
          }
        >
          <SelectTrigger id="contextLength">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="4k">4K tokens</SelectItem>
            <SelectItem value="8k">8K tokens</SelectItem>
            <SelectItem value="32k">32K tokens</SelectItem>
            <SelectItem value="128k">128K tokens</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="allowedData">Allowed Training Data *</Label>
        <Select
          value={project.target.allowedData}
          onValueChange={(value) =>
            updateProject({ target: { ...project.target, allowedData: value } })
          }
        >
          <SelectTrigger id="allowedData">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="public_only">Public Data Only</SelectItem>
            <SelectItem value="public_and_proprietary">
              Public + Proprietary Docs
            </SelectItem>
            <SelectItem value="proprietary_only">Proprietary Only</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function BaseModelSelectionStep({
  project,
  updateProject,
}: {
  project: CreationProject;
  updateProject: (updates: Partial<CreationProject>) => void;
}) {
  const catalogQuery = trpc.modelDownloads.getUnifiedCatalog.useQuery({});

  // Map all catalog models to training-compatible format, filtering out embedding models
  const allModels = (catalogQuery.data || [])
    .filter((m) => m.category !== "embedding" && (m.displayName || m.name || "").trim() !== "")
    .map((m) => ({
      name: m.displayName || m.name,
      ollamaTag: m.ollamaTag || "",
      hfRepo: m.downloadUrl ? m.downloadUrl.replace("https://huggingface.co/", "") : "",
      size: m.parameters || m.size || "",
      license: m.license || "",
      context: 0,
      bestFor: m.bestFor || m.description,
      isProviderModel: m.isProviderModel,
      providerName: m.providerName,
    }));

  const hubModels = allModels.filter((m) => !m.isProviderModel);
  const providerModels = allModels.filter((m) => m.isProviderModel);

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Select a base model to fine-tune (Phase 1 from guide)
        </AlertDescription>
      </Alert>

      {catalogQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading models from catalog...
        </div>
      ) : catalogQuery.error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load catalog: {catalogQuery.error.message}
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-6">
          {/* Provider Models */}
          {providerModels.length > 0 && (
            <div className="space-y-4">
              <Label>Configured Provider Models ({providerModels.length})</Label>
              <div className="grid gap-4">
                {providerModels.map((model) => (
                  <Card
                    key={`prov-${model.name}`}
                    className={`cursor-pointer transition-all ${
                      project.baseModel?.name === model.name
                        ? "border-primary ring-2 ring-primary"
                        : "hover:border-primary/50"
                    }`}
                    onClick={() =>
                      updateProject({
                        baseModel: {
                          name: model.name,
                          ollamaTag: model.ollamaTag,
                          hfRepo: model.hfRepo,
                          size: model.size,
                          license: model.license,
                          context: model.context,
                          rationale: model.bestFor,
                        },
                      })
                    }
                  >
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">{model.name}</CardTitle>
                        <div className="flex gap-2">
                          {model.providerName && (
                            <Badge variant="outline">{model.providerName}</Badge>
                          )}
                          {model.size && <Badge variant="secondary">{model.size}</Badge>}
                        </div>
                      </div>
                      <CardDescription>{model.bestFor}</CardDescription>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Hub Models */}
          <div className="space-y-4">
            <Label>Model Hub ({hubModels.length})</Label>
            <div className="grid gap-4">
              {hubModels.map((model) => (
                <Card
                  key={`hub-${model.name}`}
                  className={`cursor-pointer transition-all ${
                    project.baseModel?.name === model.name
                      ? "border-primary ring-2 ring-primary"
                      : "hover:border-primary/50"
                  }`}
                  onClick={() =>
                    updateProject({
                      baseModel: {
                        name: model.name,
                        ollamaTag: model.ollamaTag,
                        hfRepo: model.hfRepo,
                        size: model.size,
                        license: model.license,
                        context: model.context,
                        rationale: model.bestFor,
                      },
                    })
                  }
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{model.name}</CardTitle>
                      <Badge variant="secondary">{model.size}</Badge>
                    </div>
                    <CardDescription>{model.bestFor}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {model.ollamaTag && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Ollama:</span>
                        <code className="text-xs bg-muted px-2 py-1 rounded">{model.ollamaTag}</code>
                      </div>
                    )}
                    {model.hfRepo && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">HuggingFace:</span>
                        <code className="text-xs bg-muted px-2 py-1 rounded">{model.hfRepo}</code>
                      </div>
                    )}
                    {model.license && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">License:</span>
                        <span>{model.license}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}

      {project.baseModel && (
        <Alert className="bg-green-50 border-green-200">
          <Check className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            <strong>Selected:</strong> {project.baseModel.name} - {project.baseModel.rationale}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function DatasetsStep({
  project,
  updateProject,
}: {
  project: CreationProject;
  updateProject: (updates: Partial<CreationProject>) => void;
}) {
  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Prepare datasets for training (Phase 2 from guide). You'll upload actual files after
          project creation.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="sft">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="sft">SFT Dataset</TabsTrigger>
          <TabsTrigger value="dpo">DPO Dataset</TabsTrigger>
          <TabsTrigger value="eval">Eval Dataset</TabsTrigger>
        </TabsList>

        <TabsContent value="sft" className="space-y-4">
          <div className="space-y-2">
            <Label>SFT (Supervised Fine-Tuning) Dataset</Label>
            <p className="text-sm text-muted-foreground">
              Instruction-response pairs to teach the model your task format and style.
              Recommended: 2K-50K examples.
            </p>
            <div className="space-y-2">
              <Input
                placeholder="Dataset name (e.g., 'customer-support-sft')"
                value={project.datasets.sft?.name || ""}
                onChange={(e) =>
                  updateProject({
                    datasets: {
                      ...project.datasets,
                      sft: { ...project.datasets.sft, name: e.target.value, format: "jsonl", source: "upload" } as any,
                    },
                  })
                }
              />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="dpo" className="space-y-4">
          <div className="space-y-2">
            <Label>DPO (Direct Preference Optimization) Dataset</Label>
            <p className="text-sm text-muted-foreground">
              Preference pairs (chosen vs rejected responses) to improve output quality.
              Recommended: 500-10K pairs.
            </p>
            <Input
              placeholder="Dataset name (e.g., 'preferences-dpo')"
              value={project.datasets.dpo?.name || ""}
              onChange={(e) =>
                updateProject({
                  datasets: {
                    ...project.datasets,
                    dpo: { ...project.datasets.dpo, name: e.target.value, format: "jsonl", source: "upload" } as any,
                  },
                })
              }
            />
          </div>
        </TabsContent>

        <TabsContent value="eval" className="space-y-4">
          <div className="space-y-2">
            <Label>Evaluation Dataset</Label>
            <p className="text-sm text-muted-foreground">
              Test cases to measure model quality. Keep separate from training data. Recommended:
              200-1K examples.
            </p>
            <Input
              placeholder="Dataset name (e.g., 'test-set-eval')"
              value={project.datasets.eval?.name || ""}
              onChange={(e) =>
                updateProject({
                  datasets: {
                    ...project.datasets,
                    eval: { ...project.datasets.eval, name: e.target.value, format: "jsonl", source: "upload" } as any,
                  },
                })
              }
            />
          </div>
        </TabsContent>
      </Tabs>

      <Alert>
        <Database className="h-4 w-4" />
        <AlertDescription>
          Datasets will be uploaded and validated in the next phase after project creation.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function SFTTrainingStep({
  project,
  updateProject,
}: {
  project: CreationProject;
  updateProject: (updates: Partial<CreationProject>) => void;
}) {
  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Configure supervised fine-tuning parameters (Phase 3 from guide)
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <Label htmlFor="framework">Training Framework</Label>
        <Select
          value={project.trainingConfig.sft?.framework || "huggingface"}
          onValueChange={(value) =>
            updateProject({
              trainingConfig: {
                ...project.trainingConfig,
                sft: { ...project.trainingConfig.sft, framework: value } as any,
              },
            })
          }
        >
          <SelectTrigger id="framework">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="huggingface">HuggingFace + QLoRA</SelectItem>
            <SelectItem value="ollama">Ollama (Simple)</SelectItem>
            <SelectItem value="deepspeed">DeepSpeed (Advanced)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="epochs">Training Epochs</Label>
          <Input
            id="epochs"
            type="number"
            min="1"
            max="10"
            value={project.trainingConfig.sft?.epochs || 2}
            onChange={(e) =>
              updateProject({
                trainingConfig: {
                  ...project.trainingConfig,
                  sft: {
                    ...project.trainingConfig.sft,
                    epochs: parseInt(e.target.value),
                  } as any,
                },
              })
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="batchSize">Batch Size</Label>
          <Input
            id="batchSize"
            type="number"
            min="1"
            max="32"
            value={project.trainingConfig.sft?.batchSize || 16}
            onChange={(e) =>
              updateProject({
                trainingConfig: {
                  ...project.trainingConfig,
                  sft: {
                    ...project.trainingConfig.sft,
                    batchSize: parseInt(e.target.value),
                  } as any,
                },
              })
            }
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="learningRate">Learning Rate</Label>
        <Input
          id="learningRate"
          type="number"
          step="0.00001"
          value={project.trainingConfig.sft?.learningRate || 0.0002}
          onChange={(e) =>
            updateProject({
              trainingConfig: {
                ...project.trainingConfig,
                sft: {
                  ...project.trainingConfig.sft,
                  learningRate: parseFloat(e.target.value),
                } as any,
              },
            })
          }
        />
      </div>

      <Alert>
        <Zap className="h-4 w-4" />
        <AlertDescription>
          Default values are based on the guide's recommendations for 7B models with QLoRA. Adjust
          based on your hardware capabilities.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function DPOTrainingStep({
  project,
  updateProject,
}: {
  project: CreationProject;
  updateProject: (updates: Partial<CreationProject>) => void;
}) {
  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Configure preference optimization (Phase 4 from guide)
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="dpoEpochs">DPO Epochs</Label>
          <Input
            id="dpoEpochs"
            type="number"
            min="1"
            max="5"
            value={project.trainingConfig.dpo?.epochs || 1}
            onChange={(e) =>
              updateProject({
                trainingConfig: {
                  ...project.trainingConfig,
                  dpo: {
                    ...project.trainingConfig.dpo,
                    epochs: parseInt(e.target.value),
                  } as any,
                },
              })
            }
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="dpoBeta">Beta (KL Penalty)</Label>
          <Input
            id="dpoBeta"
            type="number"
            step="0.01"
            value={project.trainingConfig.dpo?.beta || 0.1}
            onChange={(e) =>
              updateProject({
                trainingConfig: {
                  ...project.trainingConfig,
                  dpo: {
                    ...project.trainingConfig.dpo,
                    beta: parseFloat(e.target.value),
                  } as any,
                },
              })
            }
          />
        </div>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          DPO improves output quality by learning from preference data. Lower beta = more deviation
          from base model, higher beta = conservative changes.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function ToolCallingStep({
  project,
  updateProject,
}: {
  project: CreationProject;
  updateProject: (updates: Partial<CreationProject>) => void;
}) {
  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Enable tool calling capabilities (Phase 5 from guide)
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Label>Enable Tool Calling</Label>
          <p className="text-sm text-muted-foreground">
            Train the model to call external tools and APIs
          </p>
        </div>
        <input
          type="checkbox"
          checked={project.trainingConfig.tools?.enabled || false}
          onChange={(e) =>
            updateProject({
              trainingConfig: {
                ...project.trainingConfig,
                tools: {
                  ...project.trainingConfig.tools,
                  enabled: e.target.checked,
                  toolSchemas: [],
                } as any,
              },
            })
          }
          className="h-5 w-5"
        />
      </div>

      {project.trainingConfig.tools?.enabled && (
        <Alert>
          <Settings className="h-4 w-4" />
          <AlertDescription>
            Tool schemas and training examples can be added after project creation in the detailed
            configuration phase.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function EvaluationStep({
  project,
  updateProject,
}: {
  project: CreationProject;
  updateProject: (updates: Partial<CreationProject>) => void;
}) {
  const availableBenchmarks = [
    "Task Accuracy",
    "Format Correctness",
    "Refusal Correctness",
    "Latency",
    "Throughput",
  ];

  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Configure evaluation benchmarks (Phase 6 from guide)
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <Label>Evaluation Metrics</Label>
        <div className="space-y-2">
          {availableBenchmarks.map((benchmark) => (
            <div key={benchmark} className="flex items-center space-x-2">
              <input
                type="checkbox"
                id={benchmark}
                checked={project.evaluation.benchmarks.includes(benchmark)}
                onChange={(e) => {
                  const benchmarks = e.target.checked
                    ? [...project.evaluation.benchmarks, benchmark]
                    : project.evaluation.benchmarks.filter((b) => b !== benchmark);
                  updateProject({
                    evaluation: { ...project.evaluation, benchmarks },
                  });
                }}
                className="h-4 w-4"
              />
              <Label htmlFor={benchmark} className="font-normal cursor-pointer">
                {benchmark}
              </Label>
            </div>
          ))}
        </div>
      </div>

      <Alert>
        <BarChart className="h-4 w-4" />
        <AlertDescription>
          Evaluations will run automatically after each training phase to track improvements.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function QuantizationStep({
  project,
  updateProject,
}: {
  project: CreationProject;
  updateProject: (updates: Partial<CreationProject>) => void;
}) {
  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Configure model quantization for deployment (Phase 7 from guide)
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Label>Enable Quantization</Label>
          <p className="text-sm text-muted-foreground">
            Reduce model size for faster inference and lower memory usage
          </p>
        </div>
        <input
          type="checkbox"
          checked={project.quantization.enabled}
          onChange={(e) =>
            updateProject({
              quantization: { ...project.quantization, enabled: e.target.checked },
            })
          }
          className="h-5 w-5"
        />
      </div>

      {project.quantization.enabled && (
        <>
          <div className="space-y-2">
            <Label htmlFor="quantType">Quantization Type</Label>
            <Select
              value={project.quantization.type}
              onValueChange={(value: any) =>
                updateProject({
                  quantization: { ...project.quantization, type: value },
                })
              }
            >
              <SelectTrigger id="quantType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Q4_K_M">Q4_K_M - Best balance (Recommended)</SelectItem>
                <SelectItem value="Q5_K_M">Q5_K_M - Better quality, larger</SelectItem>
                <SelectItem value="Q8_0">Q8_0 - Near-original quality</SelectItem>
                <SelectItem value="Q2_K">Q2_K - Smallest, lower quality</SelectItem>
                <SelectItem value="f16">F16 - Full precision</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quantMethod">Quantization Method</Label>
            <Select
              value={project.quantization.method}
              onValueChange={(value: any) =>
                updateProject({
                  quantization: { ...project.quantization, method: value },
                })
              }
            >
              <SelectTrigger id="quantMethod">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="llama.cpp">llama.cpp - GGUF format (Recommended)</SelectItem>
                <SelectItem value="gptq">GPTQ - GPU quantization</SelectItem>
                <SelectItem value="awq">AWQ - Activation-aware</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Alert>
            <Package className="h-4 w-4" />
            <AlertDescription>
              Q4_K_M provides the best balance of size and quality, reducing model size by ~4x with
              minimal accuracy loss (&lt;2%).
            </AlertDescription>
          </Alert>
        </>
      )}
    </div>
  );
}

function ReviewStep({ project }: { project: CreationProject }) {
  return (
    <div className="space-y-6">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Review your configuration before starting the creation process
        </AlertDescription>
      </Alert>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Project Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Name:</span>
              <span className="font-medium">{project.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Path:</span>
              <Badge variant={project.path === "PATH_A" ? "secondary" : "destructive"}>
                {project.path === "PATH_A" ? "Fine-Tuning" : "Pre-Training"}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Use Case:</span>
              <span>{project.target.useCase.replace(/_/g, " ")}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Model Size:</span>
              <span>{project.target.maxModelSize}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Base Model</CardTitle>
          </CardHeader>
          <CardContent>
            {project.baseModel ? (
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Model:</span>
                  <span className="font-medium">{project.baseModel.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">HuggingFace:</span>
                  <code className="text-xs bg-muted px-2 py-1 rounded">
                    {project.baseModel.hfRepo}
                  </code>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No base model selected</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Training Pipeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">SFT Training:</span>
              <Check className="h-5 w-5 text-green-600" />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">DPO Training:</span>
              <Check className="h-5 w-5 text-green-600" />
            </div>
            {project.trainingConfig.tools?.enabled && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Tool Calling:</span>
                <Check className="h-5 w-5 text-green-600" />
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Evaluation:</span>
              <Check className="h-5 w-5 text-green-600" />
            </div>
            {project.quantization.enabled && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Quantization:</span>
                <Badge variant="secondary">{project.quantization.type}</Badge>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Alert variant="default" className="bg-blue-50 border-blue-200">
        <Rocket className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-800">
          After clicking "Start Creation", you'll be able to upload datasets, monitor training
          progress, and track all metrics in real-time.
        </AlertDescription>
      </Alert>
    </div>
  );
}
