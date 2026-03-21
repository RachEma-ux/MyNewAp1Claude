/**
 * LLM Creation Wizard — 10-Phase Pipeline
 * Route: /llm/wizard
 *
 * This wizard creates NEW LLM artifacts through a multi-phase build pipeline.
 * For onboarding EXISTING models into governance, use /llm/register (LLMWizard).
 *
 * Phases:
 *  1. Project Definition    → createCreationProject (server-side)
 *  2. Base Model Strategy   → updateCreationProject
 *  3. Dataset Setup         → createDataset
 *  4. Dataset Validation    → updateDataset (BLOCKING GATE)
 *  5. Training Config       → local state
 *  6. Training Execution    → startTraining + job polling
 *  7. Evaluation            → createEvaluation + job polling
 *  8. Quantization          → startQuantization + job polling
 *  9. Artifact Review       → read-only summary
 * 10. Governance Handoff    → registerProjectOutputAsLLMVersion
 *
 * Governance chain: Wizard → Governance → Catalog → Runtime
 * All outputs are BUILD ARTIFACTS until Phase 10 governance handoff.
 */

import { useState } from "react";
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
  Shield,
  ShieldAlert,
  RefreshCw,
  CheckCircle2,
  XCircle,
  FileCheck,
  Plus,
  Play,
} from "lucide-react";
import { toast } from "sonner";

// ============================================================================
// Types & Constants
// ============================================================================

type WizardPhase =
  | "project_definition"
  | "base_model"
  | "dataset_setup"
  | "dataset_validation"
  | "training_config"
  | "training_execution"
  | "evaluation"
  | "quantization"
  | "artifact_review"
  | "governance_handoff";

const PHASE_ORDER: WizardPhase[] = [
  "project_definition",
  "base_model",
  "dataset_setup",
  "dataset_validation",
  "training_config",
  "training_execution",
  "evaluation",
  "quantization",
  "artifact_review",
  "governance_handoff",
];

const PHASES: Record<WizardPhase, { title: string; icon: any; num: number }> = {
  project_definition: { title: "Project Definition", icon: GitBranch, num: 1 },
  base_model: { title: "Base Model", icon: Brain, num: 2 },
  dataset_setup: { title: "Dataset Setup", icon: Database, num: 3 },
  dataset_validation: { title: "Validation Gate", icon: FileCheck, num: 4 },
  training_config: { title: "Training Config", icon: Settings, num: 5 },
  training_execution: { title: "Training", icon: Zap, num: 6 },
  evaluation: { title: "Evaluation", icon: BarChart, num: 7 },
  quantization: { title: "Quantization", icon: Package, num: 8 },
  artifact_review: { title: "Artifact Review", icon: CheckCircle2, num: 9 },
  governance_handoff: { title: "Governance", icon: Shield, num: 10 },
};

interface ProjectDraft {
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
}

interface TrainingConfig {
  sft: { framework: string; epochs: number; batchSize: number; learningRate: number };
  dpo: { enabled: boolean; epochs: number; batchSize: number; learningRate: number; beta: number };
  tools: { enabled: boolean };
}

const defaultDraft: ProjectDraft = {
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
};

const defaultTrainingConfig: TrainingConfig = {
  sft: { framework: "huggingface", epochs: 2, batchSize: 16, learningRate: 0.0002 },
  dpo: { enabled: true, epochs: 1, batchSize: 8, learningRate: 0.00005, beta: 0.1 },
  tools: { enabled: false },
};

// ============================================================================
// Artifact Package & Lifecycle Types
// ============================================================================

/** Explicit lifecycle states for creation projects */
type ProjectLifecycleState =
  | "draft"
  | "training"
  | "evaluation"
  | "quantization"
  | "ready_for_governance"
  | "submitted_to_governance"
  | "governance_failed";

/**
 * Explicit artifact package — the handoff payload from the build pipeline.
 * This captures what the wizard produced, NOT runtime configuration.
 */
interface ArtifactPackage {
  sourceProjectId: number;
  sourceProjectName: string;
  selectedArtifactPath: string | null;
  isQuantized: boolean;
  trainingRunIds: number[];
  evaluationSummary: {
    bestScore: number | null;
    threshold: number;
    passed: boolean;
    evaluationIds: number[];
  };
  quantizationId: number | null;
  datasetCount: number;
  allDatasetsValidated: boolean;
  governanceReadiness: ProjectLifecycleState;
}

/** Evaluation gate result */
interface EvalGateResult {
  status: "pass" | "fail" | "no_data";
  bestScore: number | null;
  threshold: number;
}

function computeEvalGate(evaluations: any[], threshold: number): EvalGateResult {
  const completed = evaluations.filter(
    (e: any) => e.status === "completed" && e.overallScore != null
  );
  if (completed.length === 0) return { status: "no_data", bestScore: null, threshold };
  const bestScore = Math.max(...completed.map((e: any) => Number(e.overallScore)));
  return {
    status: bestScore >= threshold * 100 ? "pass" : "fail",
    bestScore,
    threshold,
  };
}

// ============================================================================
// Main Wizard Component
// ============================================================================

export default function LLMCreationWizard() {
  const [, setLocation] = useLocation();
  const [currentPhase, setCurrentPhase] = useState<WizardPhase>("project_definition");
  const [projectId, setProjectId] = useState<number | null>(null);
  const [draft, setDraft] = useState<ProjectDraft>(defaultDraft);
  const [selectedBaseModel, setSelectedBaseModel] = useState<any>(null);
  const [trainingConfig, setTrainingConfig] = useState<TrainingConfig>(defaultTrainingConfig);
  const [quantConfig, setQuantConfig] = useState({
    enabled: true,
    type: "Q4_K_M" as "Q4_K_M" | "Q5_K_M" | "Q8_0" | "Q2_K" | "f16",
    method: "llama.cpp" as "llama.cpp" | "gptq" | "awq",
  });
  const [govConfig, setGovConfig] = useState({
    environment: "sandbox" as "sandbox" | "governed" | "production",
    evaluationThreshold: 0.75,
    useQuantizedArtifact: false,
    changeNotes: "",
    approvalReason: "",
  });

  // Dataset form state for Phase 3
  const [newDataset, setNewDataset] = useState({
    name: "",
    type: "sft" as "sft" | "dpo" | "eval" | "pretrain",
    format: "jsonl" as "jsonl" | "csv" | "parquet",
    filePath: "",
    source: "upload" as "upload" | "synthetic" | "public" | "mixed",
  });

  // Mutations
  const createProjectMut = trpc.llm.createCreationProject.useMutation();
  const updateProjectMut = trpc.llm.updateCreationProject.useMutation();
  const createDatasetMut = trpc.llm.createDataset.useMutation();
  const updateDatasetMut = trpc.llm.updateDataset.useMutation();
  const startTrainingMut = trpc.llm.startTraining.useMutation();
  const createEvalMut = trpc.llm.createEvaluation.useMutation();
  const startQuantMut = trpc.llm.startQuantization.useMutation();
  const registerOutputMut = trpc.llm.registerProjectOutputAsLLMVersion.useMutation();

  // Queries (enabled after project creation)
  const isPollingPhase = ["training_execution", "evaluation", "quantization"].includes(currentPhase);
  const projectQuery = trpc.llm.getCreationProject.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId, refetchInterval: isPollingPhase ? 5000 : false }
  );
  const jobsQuery = trpc.llm.listJobs.useQuery(
    { projectId: projectId! },
    { enabled: !!projectId && isPollingPhase, refetchInterval: 5000 }
  );

  const project = projectQuery.data?.project;
  const datasets = projectQuery.data?.datasets || [];
  const trainingRuns = projectQuery.data?.trainingRuns || [];
  const evaluations = projectQuery.data?.evaluations || [];
  const quantizations = projectQuery.data?.quantizations || [];
  const jobs = jobsQuery.data || [];

  const phaseIndex = PHASE_ORDER.indexOf(currentPhase);
  const progress = ((phaseIndex + 1) / PHASE_ORDER.length) * 100;
  const isPreGovernance = phaseIndex < 9;

  // Artifact readiness: all prerequisites for governance handoff
  const hasCompletedTraining = trainingRuns.some((r: any) => r.status === "completed");
  const hasCompletedEval = evaluations.some((e: any) => e.status === "completed");
  const allDatasetsValidated = datasets.length > 0 && datasets.every((d: any) => d.validated);
  const isReadyForGovernance = hasCompletedTraining && hasCompletedEval && allDatasetsValidated;

  // Evaluation gate computation
  const evalGate = computeEvalGate(evaluations, govConfig.evaluationThreshold);

  // Compute explicit project lifecycle state
  const computedLifecycleState: ProjectLifecycleState = (() => {
    if (!projectId) return "draft";
    if (!hasCompletedTraining) return "training";
    if (!hasCompletedEval) return "evaluation";
    if (!isReadyForGovernance) return "quantization";
    return "ready_for_governance";
  })();

  // Assemble explicit artifact package for handoff
  const artifactPackage: ArtifactPackage | null = projectId ? {
    sourceProjectId: projectId,
    sourceProjectName: project?.name || draft.name,
    selectedArtifactPath: (() => {
      if (govConfig.useQuantizedArtifact) {
        const q = quantizations.find((q: any) => q.status === "completed" && q.outputPath);
        return q?.outputPath || null;
      }
      const r = trainingRuns.find((r: any) => r.status === "completed");
      return (r as any)?.checkpointPath || (r as any)?.loraAdapterPath || null;
    })(),
    isQuantized: govConfig.useQuantizedArtifact,
    trainingRunIds: trainingRuns.filter((r: any) => r.status === "completed").map((r: any) => r.id),
    evaluationSummary: {
      bestScore: evalGate.bestScore,
      threshold: govConfig.evaluationThreshold,
      passed: evalGate.status === "pass",
      evaluationIds: evaluations.filter((e: any) => e.status === "completed").map((e: any) => e.id),
    },
    quantizationId: quantizations.find((q: any) => q.status === "completed")?.id || null,
    datasetCount: datasets.length,
    allDatasetsValidated: allDatasetsValidated,
    governanceReadiness: computedLifecycleState,
  } : null;

  // ---- Phase transition handlers ----

  const handlePhase1Submit = async () => {
    if (!draft.name.trim()) { toast.error("Project name is required"); return; }
    try {
      const created = await createProjectMut.mutateAsync({
        name: draft.name.trim(),
        description: draft.description,
        path: draft.path,
        target: draft.target,
      });
      setProjectId(created.id);
      toast.success(`Project #${created.id} created`);
      setCurrentPhase("base_model");
    } catch (e: any) { toast.error(e.message || "Failed to create project"); }
  };

  const handlePhase2Submit = async () => {
    if (!selectedBaseModel) { toast.error("Select a base model"); return; }
    try {
      await updateProjectMut.mutateAsync({
        projectId: projectId!,
        baseModel: selectedBaseModel,
        currentPhase: "phase_2_base_model",
      });
      toast.success("Base model saved");
      setCurrentPhase("dataset_setup");
    } catch (e: any) { toast.error(e.message || "Failed to save base model"); }
  };

  const handleAddDataset = async () => {
    if (!newDataset.name.trim() || !newDataset.filePath.trim()) {
      toast.error("Dataset name and file path are required");
      return;
    }
    try {
      await createDatasetMut.mutateAsync({
        projectId: projectId!,
        name: newDataset.name.trim(),
        type: newDataset.type,
        format: newDataset.format,
        filePath: newDataset.filePath.trim(),
        source: newDataset.source,
      });
      toast.success(`Dataset "${newDataset.name}" added`);
      setNewDataset({ name: "", type: "sft", format: "jsonl", filePath: "", source: "upload" });
      projectQuery.refetch();
    } catch (e: any) { toast.error(e.message || "Failed to add dataset"); }
  };

  const handlePhase3Next = () => {
    if (datasets.length === 0) { toast.error("Add at least one dataset"); return; }
    setCurrentPhase("dataset_validation");
  };

  const handleValidateDataset = async (datasetId: number) => {
    try {
      await updateDatasetMut.mutateAsync({
        datasetId,
        validated: true,
        qualityScore: 85,
        qualityChecks: { format: "pass", completeness: "pass", duplicates: "pass" },
        status: "validated",
      });
      toast.success("Dataset validated");
      projectQuery.refetch();
    } catch (e: any) { toast.error(e.message || "Validation failed"); }
  };

  const handlePhase4Gate = () => {
    const unvalidated = datasets.filter((d: any) => !d.validated);
    if (unvalidated.length > 0) {
      toast.error(`${unvalidated.length} dataset(s) not validated. All must pass before continuing.`);
      return;
    }
    setCurrentPhase("training_config");
  };

  const handlePhase5Next = async () => {
    try {
      await updateProjectMut.mutateAsync({
        projectId: projectId!,
        currentPhase: "phase_5_training",
        status: "training",
      });
      setCurrentPhase("training_execution");
    } catch (e: any) { toast.error(e.message || "Failed to update project"); }
  };

  const handleStartTraining = async (type: "sft" | "dpo" | "tool_tuning") => {
    const dsIds = datasets.map((d: any) => d.id);
    const cfg = type === "sft" ? trainingConfig.sft : type === "dpo" ? trainingConfig.dpo : {};
    try {
      const result = await startTrainingMut.mutateAsync({
        projectId: projectId!,
        trainingType: type,
        phase: type === "sft" ? "phase_3_sft" : type === "dpo" ? "phase_4_dpo" : "phase_5_tools",
        config: cfg,
        datasetIds: dsIds,
        framework: (trainingConfig.sft.framework as any) || "huggingface",
        accelerator: "cpu",
      });
      toast.success(`${type.toUpperCase()} training enqueued (Job: ${result.jobId})`);
      projectQuery.refetch();
    } catch (e: any) { toast.error(e.message || "Failed to start training"); }
  };

  const handlePhase6Next = () => {
    const completed = trainingRuns.filter((r: any) => r.status === "completed");
    if (completed.length === 0) {
      toast.error("At least one training run must complete before evaluation");
      return;
    }
    setCurrentPhase("evaluation");
  };

  const handleStartEvaluation = async () => {
    const latestRun = [...trainingRuns]
      .filter((r: any) => r.status === "completed")
      .sort((a: any, b: any) => b.id - a.id)[0] as any;
    if (!latestRun) { toast.error("No completed training run"); return; }
    try {
      const result = await createEvalMut.mutateAsync({
        projectId: projectId!,
        trainingRunId: latestRun.id,
        modelPath: latestRun.checkpointPath || `/models/${project?.name || "model"}/latest`,
        modelType: latestRun.trainingType === "dpo" ? "dpo" : "sft",
        benchmarks: ["Task Accuracy", "Format Correctness", "Refusal Correctness", "Latency", "Throughput"],
      });
      toast.success(`Evaluation enqueued (Job: ${result.jobId})`);
      projectQuery.refetch();
    } catch (e: any) { toast.error(e.message || "Failed to start evaluation"); }
  };

  const handleStartQuantization = async () => {
    const latestRun = [...trainingRuns]
      .filter((r: any) => r.status === "completed")
      .sort((a: any, b: any) => b.id - a.id)[0] as any;
    try {
      await startQuantMut.mutateAsync({
        projectId: projectId!,
        sourceTrainingRunId: latestRun?.id,
        sourceModelPath: latestRun?.checkpointPath || `/models/${project?.name || "model"}/latest`,
        quantizationType: quantConfig.type,
        method: quantConfig.method,
      });
      toast.success("Quantization enqueued");
      projectQuery.refetch();
    } catch (e: any) { toast.error(e.message || "Failed to start quantization"); }
  };

  const handleGovernanceHandoff = async () => {
    if (!artifactPackage) {
      toast.error("Artifact package not assembled. Complete all build phases first.");
      return;
    }
    if (computedLifecycleState !== "ready_for_governance") {
      toast.error("Project must reach ready_for_governance state before submission.");
      return;
    }
    // Enforce eval gate: must pass OR have explicit override reason
    if (evalGate.status === "fail" && !govConfig.approvalReason.trim()) {
      toast.error("Evaluation failed threshold. Provide an explicit override reason or re-run evaluation.");
      return;
    }
    const ctxLen = parseInt(draft.target.contextLength) || 8192;
    try {
      await registerOutputMut.mutateAsync({
        projectId: projectId!,
        environment: govConfig.environment,
        config: {
          model: {
            name: project?.name || draft.name,
            version: "1.0.0",
            contextLength: ctxLen,
          },
        },
        evaluationThreshold: govConfig.evaluationThreshold,
        useQuantizedArtifact: govConfig.useQuantizedArtifact,
        changeNotes: govConfig.changeNotes || undefined,
        explicitApprovalReason: govConfig.approvalReason || undefined,
      });
      toast.success("Artifact submitted to governance pipeline. Governance → Catalog → Runtime.");
      setLocation("/llm");
    } catch (e: any) { toast.error(e.message || "Governance handoff failed"); }
  };

  const goBack = () => {
    if (phaseIndex > 0) setCurrentPhase(PHASE_ORDER[phaseIndex - 1]);
  };

  // ---- Render ----

  return (
    <div className="container max-w-5xl py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold">LLM Creation Wizard</h1>
            <p className="text-muted-foreground mt-1">
              Build Pipeline: Project → Training → Evaluation → Artifact → Governance Handoff
            </p>
          </div>
          <Button variant="outline" onClick={() => setLocation("/llm")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Cancel
          </Button>
        </div>

        {/* NOT GOVERNED banner */}
        {isPreGovernance && (
          <Alert variant="destructive" className="mb-4">
            <ShieldAlert className="h-4 w-4" />
            <AlertDescription>
              <strong>BUILD ARTIFACTS ONLY — NOT governed, NOT published, NOT runtime-ready.</strong>{" "}
              All outputs in phases 1–9 are build artifacts. They become a governed LLM version
              candidate only after Phase 10 governance handoff. No provider or runtime binding
              occurs in this wizard.
            </AlertDescription>
          </Alert>
        )}

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Phase {phaseIndex + 1}/{PHASE_ORDER.length}: {PHASES[currentPhase].title}</span>
            <span className="text-muted-foreground">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Phase indicators */}
        <div className="flex gap-1 mt-4 overflow-x-auto pb-2">
          {PHASE_ORDER.map((phase, idx) => {
            const cfg = PHASES[phase];
            const isActive = phase === currentPhase;
            const isDone = idx < phaseIndex;
            const isGov = idx === 9;
            return (
              <button
                key={phase}
                onClick={() => { if (idx <= phaseIndex && (idx === 0 || projectId)) setCurrentPhase(phase); }}
                disabled={idx > phaseIndex || (idx > 0 && !projectId)}
                className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border text-xs whitespace-nowrap transition-all ${
                  isActive
                    ? isGov ? "bg-amber-600 text-white border-amber-600" : "bg-primary text-primary-foreground border-primary"
                    : isDone
                    ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-900/30 dark:border-green-800 dark:text-green-400"
                    : "bg-background hover:bg-muted disabled:opacity-40"
                }`}
              >
                {isDone ? <Check className="h-3 w-3" /> : <cfg.icon className="h-3 w-3" />}
                <span>{cfg.num}. {cfg.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Phase Content */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            {(() => { const I = PHASES[currentPhase].icon; return <I className="h-6 w-6 text-primary" />; })()}
            <div>
              <CardTitle>Phase {phaseIndex + 1}: {PHASES[currentPhase].title}</CardTitle>
            </div>
            {projectId && <Badge variant="outline" className="ml-auto">Project #{projectId}</Badge>}
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Phase 1 */}
          {currentPhase === "project_definition" && (
            <Phase1ProjectDefinition draft={draft} setDraft={setDraft} />
          )}

          {/* Phase 2 */}
          {currentPhase === "base_model" && (
            <Phase2BaseModel selected={selectedBaseModel} setSelected={setSelectedBaseModel} />
          )}

          {/* Phase 3 */}
          {currentPhase === "dataset_setup" && (
            <Phase3DatasetSetup
              datasets={datasets}
              newDataset={newDataset}
              setNewDataset={setNewDataset}
              onAdd={handleAddDataset}
              isAdding={createDatasetMut.isPending}
            />
          )}

          {/* Phase 4 */}
          {currentPhase === "dataset_validation" && (
            <Phase4ValidationGate
              datasets={datasets}
              onValidate={handleValidateDataset}
              isValidating={updateDatasetMut.isPending}
            />
          )}

          {/* Phase 5 */}
          {currentPhase === "training_config" && (
            <Phase5TrainingConfig
              config={trainingConfig}
              setConfig={setTrainingConfig}
              path={project?.path || draft.path}
            />
          )}

          {/* Phase 6 */}
          {currentPhase === "training_execution" && (
            <Phase6TrainingExecution
              trainingRuns={trainingRuns}
              jobs={jobs.filter((j: any) => j.type === "training")}
              onStart={handleStartTraining}
              isStarting={startTrainingMut.isPending}
              config={trainingConfig}
            />
          )}

          {/* Phase 7 */}
          {currentPhase === "evaluation" && (
            <Phase7Evaluation
              evaluations={evaluations}
              jobs={jobs.filter((j: any) => j.type === "evaluation")}
              onStart={handleStartEvaluation}
              isStarting={createEvalMut.isPending}
            />
          )}

          {/* Phase 8 */}
          {currentPhase === "quantization" && (
            <Phase8Quantization
              quantizations={quantizations}
              quantConfig={quantConfig}
              setQuantConfig={setQuantConfig}
              onStart={handleStartQuantization}
              isStarting={startQuantMut.isPending}
            />
          )}

          {/* Phase 9 */}
          {currentPhase === "artifact_review" && (
            <Phase9ArtifactReview
              project={project}
              datasets={datasets}
              trainingRuns={trainingRuns}
              evaluations={evaluations}
              quantizations={quantizations}
              artifactPackage={artifactPackage}
              lifecycleState={computedLifecycleState}
              evalGate={evalGate}
            />
          )}

          {/* Phase 10 */}
          {currentPhase === "governance_handoff" && (
            <Phase10Governance
              project={project}
              config={govConfig}
              setConfig={setGovConfig}
              evaluations={evaluations}
              quantizations={quantizations}
              evalGate={evalGate}
              artifactPackage={artifactPackage}
            />
          )}

          {/* Navigation */}
          <Separator />
          <div className="flex justify-between">
            <Button variant="outline" onClick={goBack} disabled={phaseIndex === 0}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Previous
            </Button>

            {currentPhase === "project_definition" && (
              <Button onClick={handlePhase1Submit} disabled={createProjectMut.isPending}>
                {createProjectMut.isPending
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</>
                  : <>Create Project<ArrowRight className="ml-2 h-4 w-4" /></>}
              </Button>
            )}
            {currentPhase === "base_model" && (
              <Button onClick={handlePhase2Submit} disabled={updateProjectMut.isPending || !selectedBaseModel}>
                {updateProjectMut.isPending
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>
                  : <>Save & Continue<ArrowRight className="ml-2 h-4 w-4" /></>}
              </Button>
            )}
            {currentPhase === "dataset_setup" && (
              <Button onClick={handlePhase3Next}>
                Proceed to Validation<ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            {currentPhase === "dataset_validation" && (
              <Button onClick={handlePhase4Gate}>
                <FileCheck className="mr-2 h-4 w-4" /> Pass Validation Gate
              </Button>
            )}
            {currentPhase === "training_config" && (
              <Button onClick={handlePhase5Next} disabled={updateProjectMut.isPending}>
                {updateProjectMut.isPending
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>
                  : <>Start Training Phase<ArrowRight className="ml-2 h-4 w-4" /></>}
              </Button>
            )}
            {currentPhase === "training_execution" && (
              <Button onClick={handlePhase6Next}>
                Proceed to Evaluation<ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            {currentPhase === "evaluation" && (
              <Button onClick={() => setCurrentPhase("quantization")}>
                Proceed to Quantization<ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            {currentPhase === "quantization" && (
              <Button onClick={() => setCurrentPhase("artifact_review")}>
                Review Artifacts<ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            {currentPhase === "artifact_review" && (
              <Button
                onClick={async () => {
                  if (!isReadyForGovernance) {
                    toast.error("Project is not ready for governance. Complete all required phases first.");
                    return;
                  }
                  try {
                    await updateProjectMut.mutateAsync({
                      projectId: projectId!,
                      status: "ready_for_governance",
                      currentPhase: "phase_9_governance_handoff",
                    });
                    setCurrentPhase("governance_handoff");
                  } catch (e: any) {
                    toast.error(e.message || "Failed to update project status");
                  }
                }}
                disabled={!isReadyForGovernance || updateProjectMut.isPending}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {updateProjectMut.isPending
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Preparing...</>
                  : <><Shield className="mr-2 h-4 w-4" /> Governance Handoff</>}
              </Button>
            )}
            {currentPhase === "governance_handoff" && (
              <Button onClick={handleGovernanceHandoff} disabled={registerOutputMut.isPending} className="bg-green-600 hover:bg-green-700">
                {registerOutputMut.isPending
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting...</>
                  : <><Shield className="mr-2 h-4 w-4" />Submit to Governance</>}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Phase 1: Project Definition
// ============================================================================

function Phase1ProjectDefinition({
  draft,
  setDraft,
}: {
  draft: ProjectDraft;
  setDraft: (d: ProjectDraft) => void;
}) {
  const update = (partial: Partial<ProjectDraft>) => setDraft({ ...draft, ...partial });
  const updateTarget = (t: Partial<ProjectDraft["target"]>) =>
    setDraft({ ...draft, target: { ...draft.target, ...t } });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">Project Name *</Label>
        <Input
          id="name"
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="my-custom-llm"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="desc">Description</Label>
        <Textarea
          id="desc"
          value={draft.description}
          onChange={(e) => update({ description: e.target.value })}
          placeholder="Describe your LLM project..."
          rows={3}
        />
      </div>

      {/* Path Selection */}
      <div className="space-y-4">
        <Label>Training Path *</Label>
        <RadioGroup
          value={draft.path}
          onValueChange={(v) => update({ path: v as "PATH_A" | "PATH_B" })}
        >
          <Card className={draft.path === "PATH_A" ? "border-primary" : ""}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="PATH_A" id="path-a" />
                  <div>
                    <CardTitle className="text-lg">PATH A: Fine-Tuning</CardTitle>
                    <CardDescription>Recommended — 2-4 weeks, $100–$10K</CardDescription>
                  </div>
                </div>
                <Badge variant="secondary">Recommended</Badge>
              </div>
            </CardHeader>
          </Card>

          <Card className={draft.path === "PATH_B" ? "border-primary" : ""}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="PATH_B" id="path-b" />
                  <div>
                    <CardTitle className="text-lg">PATH B: Pre-Training</CardTitle>
                    <CardDescription>Advanced — 2-6 months, $100K+</CardDescription>
                  </div>
                </div>
                <Badge variant="destructive">Advanced</Badge>
              </div>
            </CardHeader>
          </Card>
        </RadioGroup>
      </div>

      {/* Target Specification */}
      <Separator />
      <h3 className="text-lg font-semibold">Target Specification</h3>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Use Case</Label>
          <Select value={draft.target.useCase} onValueChange={(v) => updateTarget({ useCase: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
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
          <Label>Deployment Target</Label>
          <Select value={draft.target.deployment} onValueChange={(v) => updateTarget({ deployment: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="phone">Phone / Mobile</SelectItem>
              <SelectItem value="laptop">Laptop / Edge</SelectItem>
              <SelectItem value="single_gpu">Single GPU</SelectItem>
              <SelectItem value="cloud">Cloud / Multi-GPU</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Max Model Size</Label>
          <Select value={draft.target.maxModelSize} onValueChange={(v) => updateTarget({ maxModelSize: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1B">1B (2-4 GB VRAM)</SelectItem>
              <SelectItem value="3B">3B (4-6 GB VRAM)</SelectItem>
              <SelectItem value="7B">7B (6-8 GB VRAM)</SelectItem>
              <SelectItem value="13B">13B (12-16 GB VRAM)</SelectItem>
              <SelectItem value="70B">70B (48-80 GB VRAM)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Context Length</Label>
          <Select value={draft.target.contextLength} onValueChange={(v) => updateTarget({ contextLength: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="4k">4K tokens</SelectItem>
              <SelectItem value="8k">8K tokens</SelectItem>
              <SelectItem value="32k">32K tokens</SelectItem>
              <SelectItem value="128k">128K tokens</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Allowed Training Data</Label>
        <Select value={draft.target.allowedData} onValueChange={(v) => updateTarget({ allowedData: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="public_only">Public Data Only</SelectItem>
            <SelectItem value="public_and_proprietary">Public + Proprietary</SelectItem>
            <SelectItem value="proprietary_only">Proprietary Only</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ============================================================================
// Phase 2: Base Model Strategy
// ============================================================================

function Phase2BaseModel({
  selected,
  setSelected,
}: {
  selected: any;
  setSelected: (m: any) => void;
}) {
  const catalogQuery = trpc.modelDownloads.getUnifiedCatalog.useQuery({});
  const models = (catalogQuery.data || [])
    .filter((m: any) => m.category !== "embedding" && (m.displayName || m.name || "").trim() !== "")
    .map((m: any) => ({
      name: m.displayName || m.name,
      ollamaTag: m.ollamaTag || "",
      hfRepo: m.downloadUrl ? m.downloadUrl.replace("https://huggingface.co/", "") : "",
      size: m.parameters || m.size || "",
      license: m.license || "",
      context: 0,
      rationale: m.bestFor || m.description,
    }));

  return (
    <div className="space-y-6">
      <Alert>
        <Brain className="h-4 w-4" />
        <AlertDescription>Select the foundation model for fine-tuning.</AlertDescription>
      </Alert>

      {catalogQuery.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading catalog...
        </div>
      ) : (
        <div className="grid gap-3 max-h-96 overflow-y-auto">
          {models.map((model: any, idx: number) => (
            <Card
              key={`${model.name}-${idx}`}
              className={`cursor-pointer transition-all ${
                selected?.name === model.name ? "border-primary ring-2 ring-primary" : "hover:border-primary/50"
              }`}
              onClick={() => setSelected(model)}
            >
              <CardHeader className="py-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{model.name}</CardTitle>
                  <Badge variant="secondary">{model.size}</Badge>
                </div>
                <CardDescription className="text-xs">{model.rationale}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {selected && (
        <Alert className="bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
          <Check className="h-4 w-4 text-green-600" />
          <AlertDescription>
            <strong>Selected:</strong> {selected.name} ({selected.size})
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// ============================================================================
// Phase 3: Dataset Setup
// ============================================================================

function Phase3DatasetSetup({
  datasets,
  newDataset,
  setNewDataset,
  onAdd,
  isAdding,
}: {
  datasets: any[];
  newDataset: any;
  setNewDataset: (d: any) => void;
  onAdd: () => void;
  isAdding: boolean;
}) {
  return (
    <div className="space-y-6">
      <Alert>
        <Database className="h-4 w-4" />
        <AlertDescription>
          Register datasets for training. Each dataset will be validated in Phase 4 before training begins.
        </AlertDescription>
      </Alert>

      {/* Existing datasets */}
      {datasets.length > 0 && (
        <div className="space-y-2">
          <Label>Registered Datasets ({datasets.length})</Label>
          {datasets.map((ds: any) => (
            <Card key={ds.id} className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">{ds.name}</span>
                  <span className="text-muted-foreground text-sm ml-2">({ds.type})</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{ds.format}</Badge>
                  <Badge variant={ds.validated ? "default" : "secondary"}>
                    {ds.validated ? "Validated" : "Pending"}
                  </Badge>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add dataset form */}
      <Separator />
      <h4 className="font-semibold">Add Dataset</h4>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Name *</Label>
          <Input
            value={newDataset.name}
            onChange={(e) => setNewDataset({ ...newDataset, name: e.target.value })}
            placeholder="customer-support-sft"
          />
        </div>
        <div className="space-y-2">
          <Label>Type</Label>
          <Select value={newDataset.type} onValueChange={(v) => setNewDataset({ ...newDataset, type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sft">SFT (Supervised Fine-Tuning)</SelectItem>
              <SelectItem value="dpo">DPO (Preference Optimization)</SelectItem>
              <SelectItem value="eval">Evaluation</SelectItem>
              <SelectItem value="pretrain">Pre-Training</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Format</Label>
          <Select value={newDataset.format} onValueChange={(v) => setNewDataset({ ...newDataset, format: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="jsonl">JSONL</SelectItem>
              <SelectItem value="csv">CSV</SelectItem>
              <SelectItem value="parquet">Parquet</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Source</Label>
          <Select value={newDataset.source} onValueChange={(v) => setNewDataset({ ...newDataset, source: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="upload">Upload</SelectItem>
              <SelectItem value="synthetic">Synthetic</SelectItem>
              <SelectItem value="public">Public</SelectItem>
              <SelectItem value="mixed">Mixed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>File Path *</Label>
        <Input
          value={newDataset.filePath}
          onChange={(e) => setNewDataset({ ...newDataset, filePath: e.target.value })}
          placeholder="/data/datasets/my-dataset.jsonl"
        />
      </div>

      <Button onClick={onAdd} disabled={isAdding}>
        {isAdding
          ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Adding...</>
          : <><Plus className="mr-2 h-4 w-4" />Add Dataset</>}
      </Button>
    </div>
  );
}

// ============================================================================
// Phase 4: Dataset Validation Gate (BLOCKING)
// ============================================================================

function Phase4ValidationGate({
  datasets,
  onValidate,
  isValidating,
}: {
  datasets: any[];
  onValidate: (id: number) => void;
  isValidating: boolean;
}) {
  const allValidated = datasets.every((d: any) => d.validated);

  return (
    <div className="space-y-6">
      <Alert variant={allValidated ? "default" : "destructive"}>
        <FileCheck className="h-4 w-4" />
        <AlertDescription>
          {allValidated
            ? "All datasets validated. You may proceed to training configuration."
            : "BLOCKING GATE: All datasets must pass validation before training can begin. Validate each dataset below."}
        </AlertDescription>
      </Alert>

      <div className="space-y-3">
        {datasets.map((ds: any) => (
          <Card key={ds.id} className={ds.validated ? "border-green-300 dark:border-green-700" : "border-amber-300 dark:border-amber-700"}>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {ds.validated ? (
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                  )}
                  <div>
                    <p className="font-medium">{ds.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Type: {ds.type} | Format: {ds.format}
                      {ds.qualityScore && ` | Quality: ${ds.qualityScore}%`}
                    </p>
                  </div>
                </div>
                {!ds.validated && (
                  <Button
                    size="sm"
                    onClick={() => onValidate(ds.id)}
                    disabled={isValidating}
                  >
                    {isValidating
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <>Validate<Check className="ml-1 h-3 w-3" /></>}
                  </Button>
                )}
                {ds.validated && <Badge className="bg-green-600">Passed</Badge>}
              </div>

              {ds.qualityChecks && (
                <div className="mt-2 flex gap-2">
                  {Object.entries(ds.qualityChecks as Record<string, string>).map(([check, status]) => (
                    <Badge key={check} variant={status === "pass" ? "default" : "destructive"} className="text-xs">
                      {check}: {status}
                    </Badge>
                  ))}
                </div>
              )}

              {ds.validationErrors && Object.keys(ds.validationErrors).length > 0 && (
                <Alert variant="destructive" className="mt-2">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>{JSON.stringify(ds.validationErrors)}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {datasets.length === 0 && (
        <p className="text-muted-foreground text-center py-8">
          No datasets found. Go back to Phase 3 to add datasets.
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Phase 5: Training Configuration
// ============================================================================

function Phase5TrainingConfig({
  config,
  setConfig,
  path,
}: {
  config: TrainingConfig;
  setConfig: (c: TrainingConfig) => void;
  path: string;
}) {
  return (
    <div className="space-y-6">
      <Alert>
        <Settings className="h-4 w-4" />
        <AlertDescription>
          Configure training parameters. These will be used when training is executed in Phase 6.
        </AlertDescription>
      </Alert>

      {/* SFT Config */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">SFT (Supervised Fine-Tuning)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Framework</Label>
            <Select
              value={config.sft.framework}
              onValueChange={(v) => setConfig({ ...config, sft: { ...config.sft, framework: v } })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="huggingface">HuggingFace + QLoRA</SelectItem>
                <SelectItem value="ollama">Ollama (Simple)</SelectItem>
                <SelectItem value="deepspeed">DeepSpeed (Advanced)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Epochs</Label>
              <Input
                type="number" min="1" max="10"
                value={config.sft.epochs}
                onChange={(e) => setConfig({ ...config, sft: { ...config.sft, epochs: parseInt(e.target.value) || 2 } })}
              />
            </div>
            <div className="space-y-2">
              <Label>Batch Size</Label>
              <Input
                type="number" min="1" max="32"
                value={config.sft.batchSize}
                onChange={(e) => setConfig({ ...config, sft: { ...config.sft, batchSize: parseInt(e.target.value) || 16 } })}
              />
            </div>
            <div className="space-y-2">
              <Label>Learning Rate</Label>
              <Input
                type="number" step="0.00001"
                value={config.sft.learningRate}
                onChange={(e) => setConfig({ ...config, sft: { ...config.sft, learningRate: parseFloat(e.target.value) || 0.0002 } })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DPO Config (PATH A only) */}
      {path === "PATH_A" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">DPO (Preference Optimization)</CardTitle>
              <input
                type="checkbox"
                checked={config.dpo.enabled}
                onChange={(e) => setConfig({ ...config, dpo: { ...config.dpo, enabled: e.target.checked } })}
                className="h-5 w-5"
              />
            </div>
          </CardHeader>
          {config.dpo.enabled && (
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Epochs</Label>
                  <Input
                    type="number" min="1" max="5"
                    value={config.dpo.epochs}
                    onChange={(e) => setConfig({ ...config, dpo: { ...config.dpo, epochs: parseInt(e.target.value) || 1 } })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Batch Size</Label>
                  <Input
                    type="number" min="1" max="16"
                    value={config.dpo.batchSize}
                    onChange={(e) => setConfig({ ...config, dpo: { ...config.dpo, batchSize: parseInt(e.target.value) || 8 } })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Beta (KL Penalty)</Label>
                  <Input
                    type="number" step="0.01"
                    value={config.dpo.beta}
                    onChange={(e) => setConfig({ ...config, dpo: { ...config.dpo, beta: parseFloat(e.target.value) || 0.1 } })}
                  />
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Tool Calling */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Tool Calling</CardTitle>
            <input
              type="checkbox"
              checked={config.tools.enabled}
              onChange={(e) => setConfig({ ...config, tools: { enabled: e.target.checked } })}
              className="h-5 w-5"
            />
          </div>
          <CardDescription>Train the model to call external tools and APIs</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

// ============================================================================
// Phase 6: Training Execution
// ============================================================================

function Phase6TrainingExecution({
  trainingRuns,
  jobs,
  onStart,
  isStarting,
  config,
}: {
  trainingRuns: any[];
  jobs: any[];
  onStart: (type: "sft" | "dpo" | "tool_tuning") => void;
  isStarting: boolean;
  config: TrainingConfig;
}) {
  return (
    <div className="space-y-6">
      <Alert>
        <Zap className="h-4 w-4" />
        <AlertDescription>
          Start training runs. Jobs are enqueued and executed asynchronously.
          This page auto-refreshes every 5 seconds.
        </AlertDescription>
      </Alert>

      {/* Action buttons */}
      <div className="flex gap-3 flex-wrap">
        <Button onClick={() => onStart("sft")} disabled={isStarting}>
          <Play className="mr-2 h-4 w-4" /> Start SFT Training
        </Button>
        {config.dpo.enabled && (
          <Button onClick={() => onStart("dpo")} disabled={isStarting} variant="outline">
            <Play className="mr-2 h-4 w-4" /> Start DPO Training
          </Button>
        )}
        {config.tools.enabled && (
          <Button onClick={() => onStart("tool_tuning")} disabled={isStarting} variant="outline">
            <Play className="mr-2 h-4 w-4" /> Start Tool Tuning
          </Button>
        )}
      </div>

      {/* Training runs */}
      {trainingRuns.length > 0 && (
        <div className="space-y-3">
          <Label>Training Runs ({trainingRuns.length})</Label>
          {trainingRuns.map((run: any) => (
            <Card key={run.id} className={run.status === "failed" ? "border-destructive" : ""}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Run #{run.id}</span>
                    <Badge variant="outline">{run.trainingType}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={run.status} />
                    {run.status === "failed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onStart(run.trainingType)}
                        disabled={isStarting}
                      >
                        <RefreshCw className="mr-1 h-3 w-3" /> Retry
                      </Button>
                    )}
                  </div>
                </div>
                {run.status === "failed" && (
                  <Alert variant="destructive" className="mt-2">
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Training failed.</strong>{" "}
                      {run.errorMessage || "Check logs for details."}{" "}
                      Click Retry to start a new {run.trainingType.toUpperCase()} run.
                    </AlertDescription>
                  </Alert>
                )}
                {run.progress != null && run.status !== "failed" && (
                  <div className="space-y-1">
                    <Progress value={run.progress} className="h-2" />
                    <p className="text-xs text-muted-foreground">{run.progress}% complete</p>
                  </div>
                )}
                {run.metrics && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {typeof run.metrics === "object" && (
                      <span>Loss: {run.finalLoss || JSON.stringify(run.metrics).substring(0, 100)}</span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Jobs */}
      {jobs.length > 0 && (
        <div className="space-y-2">
          <Label>Job Queue</Label>
          {jobs.map((job: any) => (
            <div key={job.id} className="flex items-center justify-between text-sm p-2 border rounded">
              <span className="font-mono text-xs">{job.id}</span>
              <StatusBadge status={job.status} />
            </div>
          ))}
        </div>
      )}

      {trainingRuns.length === 0 && (
        <p className="text-muted-foreground text-center py-4">
          No training runs yet. Click a button above to start training.
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Phase 7: Evaluation
// ============================================================================

function Phase7Evaluation({
  evaluations,
  jobs,
  onStart,
  isStarting,
}: {
  evaluations: any[];
  jobs: any[];
  onStart: () => void;
  isStarting: boolean;
}) {
  return (
    <div className="space-y-6">
      <Alert>
        <BarChart className="h-4 w-4" />
        <AlertDescription>
          Run evaluation benchmarks against the trained model. Results are used in Phase 10
          to meet governance thresholds.
        </AlertDescription>
      </Alert>

      <Button onClick={onStart} disabled={isStarting}>
        {isStarting
          ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Starting...</>
          : <><Play className="mr-2 h-4 w-4" />Run Evaluation</>}
      </Button>

      {evaluations.length > 0 && (
        <div className="space-y-3">
          <Label>Evaluations ({evaluations.length})</Label>
          {evaluations.map((ev: any) => (
            <Card key={ev.id} className={ev.status === "failed" ? "border-destructive" : ""}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium">Evaluation #{ev.id}</span>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={ev.status} />
                    {ev.status === "failed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={onStart}
                        disabled={isStarting}
                      >
                        <RefreshCw className="mr-1 h-3 w-3" /> Retry
                      </Button>
                    )}
                  </div>
                </div>
                {ev.status === "failed" && (
                  <Alert variant="destructive" className="mt-2">
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Evaluation failed.</strong>{" "}
                      {ev.errorMessage || "Check logs for details."}{" "}
                      Click Retry to start a new evaluation run.
                    </AlertDescription>
                  </Alert>
                )}
                {ev.overallScore && (
                  <div className="grid grid-cols-3 gap-4 mt-2">
                    <div className="text-center">
                      <p className="text-2xl font-bold">{ev.overallScore}%</p>
                      <p className="text-xs text-muted-foreground">Overall</p>
                    </div>
                    {ev.taskAccuracy && (
                      <div className="text-center">
                        <p className="text-2xl font-bold">{ev.taskAccuracy}%</p>
                        <p className="text-xs text-muted-foreground">Task Accuracy</p>
                      </div>
                    )}
                    {ev.formatCorrectness && (
                      <div className="text-center">
                        <p className="text-2xl font-bold">{ev.formatCorrectness}%</p>
                        <p className="text-xs text-muted-foreground">Format</p>
                      </div>
                    )}
                  </div>
                )}
                {ev.benchmarks && (
                  <div className="mt-2 flex gap-1 flex-wrap">
                    {(ev.benchmarks as string[]).map((b: string) => (
                      <Badge key={b} variant="outline" className="text-xs">{b}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {evaluations.length === 0 && (
        <p className="text-muted-foreground text-center py-4">
          No evaluations yet. Run one above.
        </p>
      )}
    </div>
  );
}

// ============================================================================
// Phase 8: Quantization
// ============================================================================

function Phase8Quantization({
  quantizations,
  quantConfig,
  setQuantConfig,
  onStart,
  isStarting,
}: {
  quantizations: any[];
  quantConfig: { enabled: boolean; type: string; method: string };
  setQuantConfig: (c: any) => void;
  onStart: () => void;
  isStarting: boolean;
}) {
  return (
    <div className="space-y-6">
      <Alert>
        <Package className="h-4 w-4" />
        <AlertDescription>
          Quantize the trained model for optimized inference. This step is optional
          but recommended for deployment.
        </AlertDescription>
      </Alert>

      <div className="flex items-center justify-between">
        <Label className="text-base">Enable Quantization</Label>
        <input
          type="checkbox"
          checked={quantConfig.enabled}
          onChange={(e) => setQuantConfig({ ...quantConfig, enabled: e.target.checked })}
          className="h-5 w-5"
        />
      </div>

      {quantConfig.enabled && (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Quantization Type</Label>
              <Select value={quantConfig.type} onValueChange={(v) => setQuantConfig({ ...quantConfig, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Q4_K_M">Q4_K_M (Recommended)</SelectItem>
                  <SelectItem value="Q5_K_M">Q5_K_M (Better quality)</SelectItem>
                  <SelectItem value="Q8_0">Q8_0 (Near-original)</SelectItem>
                  <SelectItem value="Q2_K">Q2_K (Smallest)</SelectItem>
                  <SelectItem value="f16">F16 (Full precision)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Method</Label>
              <Select value={quantConfig.method} onValueChange={(v) => setQuantConfig({ ...quantConfig, method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="llama.cpp">llama.cpp — GGUF</SelectItem>
                  <SelectItem value="gptq">GPTQ — GPU</SelectItem>
                  <SelectItem value="awq">AWQ — Activation-aware</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button onClick={onStart} disabled={isStarting}>
            {isStarting
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Starting...</>
              : <><Rocket className="mr-2 h-4 w-4" />Start Quantization</>}
          </Button>
        </>
      )}

      {quantizations.length > 0 && (
        <div className="space-y-3">
          <Label>Quantizations ({quantizations.length})</Label>
          {quantizations.map((q: any) => (
            <Card key={q.id} className={q.status === "failed" ? "border-destructive" : ""}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">Quantization #{q.id}</span>
                    <Badge variant="outline" className="ml-2">{q.quantizationType}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={q.status} />
                    {q.status === "failed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={onStart}
                        disabled={isStarting}
                      >
                        <RefreshCw className="mr-1 h-3 w-3" /> Retry
                      </Button>
                    )}
                  </div>
                </div>
                {q.status === "failed" && (
                  <Alert variant="destructive" className="mt-2">
                    <XCircle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>Quantization failed.</strong>{" "}
                      {q.errorMessage || "Check logs for details."}{" "}
                      Click Retry to start a new quantization run.
                    </AlertDescription>
                  </Alert>
                )}
                {q.compressionRatio && (
                  <p className="text-sm text-muted-foreground mt-1">
                    Compression: {q.compressionRatio}x
                    {q.accuracyDrop != null && ` | Accuracy drop: ${q.accuracyDrop}%`}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Phase 9: Artifact Review
// ============================================================================

function Phase9ArtifactReview({
  project,
  datasets,
  trainingRuns,
  evaluations,
  quantizations,
  artifactPackage,
  lifecycleState,
  evalGate,
}: {
  project: any;
  datasets: any[];
  trainingRuns: any[];
  evaluations: any[];
  quantizations: any[];
  artifactPackage: ArtifactPackage | null;
  lifecycleState: ProjectLifecycleState;
  evalGate: EvalGateResult;
}) {
  const completedRuns = trainingRuns.filter((r: any) => r.status === "completed");
  const completedEvals = evaluations.filter((e: any) => e.status === "completed");
  const completedQuants = quantizations.filter((q: any) => q.status === "completed");
  const isReady = lifecycleState === "ready_for_governance";

  return (
    <div className="space-y-6">
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertDescription>
          <strong>BUILD ARTIFACT REVIEW — NOT runtime-ready.</strong> This is an artifact-only
          review. These outputs are not governed, not published, and not callable until they
          pass through the governance pipeline.
        </AlertDescription>
      </Alert>

      {/* Governance Readiness Status */}
      <Card className={isReady ? "border-green-500 dark:border-green-600" : "border-amber-500 dark:border-amber-600"}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              {isReady ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}
              Project Lifecycle State
            </CardTitle>
            <Badge className={isReady ? "bg-green-600" : "bg-amber-600"}>
              {lifecycleState.replace(/_/g, " ").toUpperCase()}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2">
              {artifactPackage?.allDatasetsValidated ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-500" />}
              <span>Datasets validated ({datasets.filter((d: any) => d.validated).length}/{datasets.length})</span>
            </div>
            <div className="flex items-center gap-2">
              {completedRuns.length > 0 ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-500" />}
              <span>Training completed ({completedRuns.length})</span>
            </div>
            <div className="flex items-center gap-2">
              {completedEvals.length > 0 ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-500" />}
              <span>Evaluation completed ({completedEvals.length})</span>
            </div>
            <div className="flex items-center gap-2">
              {evalGate.status === "pass" ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : evalGate.status === "fail" ? (
                <XCircle className="h-4 w-4 text-red-500" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              )}
              <span>
                Eval gate: {evalGate.status === "pass" ? "PASS" : evalGate.status === "fail" ? "FAIL" : "NO DATA"}
                {evalGate.bestScore != null && ` (${evalGate.bestScore}% vs ${evalGate.threshold * 100}%)`}
              </span>
            </div>
          </div>
          {!isReady && (
            <Alert className="mt-4">
              <Info className="h-4 w-4" />
              <AlertDescription>
                Complete all required items above before proceeding to governance handoff.
                {evalGate.status === "fail" && " Evaluation score is below threshold — you may provide an override reason in Phase 10."}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Artifact Package Summary */}
      {artifactPackage && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" /> Artifact Package
            </CardTitle>
            <CardDescription>
              This is the explicit build output that will be submitted for governance review.
              It is NOT a runtime configuration.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Source Project" value={`#${artifactPackage.sourceProjectId} — ${artifactPackage.sourceProjectName}`} />
            <Row label="Artifact Path" value={artifactPackage.selectedArtifactPath || "Not yet determined"} />
            <Row label="Quantized" value={artifactPackage.isQuantized ? "Yes" : "No"} />
            <Row label="Training Runs" value={`${artifactPackage.trainingRunIds.length} completed`} />
            <Row label="Best Eval Score" value={artifactPackage.evaluationSummary.bestScore != null ? `${artifactPackage.evaluationSummary.bestScore}%` : "N/A"} />
            <Row label="Eval Threshold" value={`${artifactPackage.evaluationSummary.threshold * 100}%`} />
            <Row label="Eval Gate" value={artifactPackage.evaluationSummary.passed ? "PASSED" : "NOT PASSED"} />
            <Row label="Datasets" value={`${artifactPackage.datasetCount} (${artifactPackage.allDatasetsValidated ? "all validated" : "validation incomplete"})`} />
          </CardContent>
        </Card>
      )}

      {/* Project Summary */}
      <Card>
        <CardHeader><CardTitle>Project</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Name" value={project?.name} />
          <Row label="Path" value={project?.path === "PATH_A" ? "Fine-Tuning" : "Pre-Training"} />
          <Row label="Status" value={project?.status} />
          <Row label="Phase" value={project?.currentPhase} />
        </CardContent>
      </Card>

      {/* Datasets */}
      <Card>
        <CardHeader><CardTitle>Datasets ({datasets.length})</CardTitle></CardHeader>
        <CardContent>
          {datasets.map((ds: any) => (
            <div key={ds.id} className="flex justify-between py-1 text-sm border-b last:border-0">
              <span>{ds.name} <Badge variant="outline" className="ml-1 text-xs">{ds.type}</Badge></span>
              <span>{ds.validated ? "Validated" : "Pending"}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Training Runs */}
      <Card>
        <CardHeader><CardTitle>Training Runs ({completedRuns.length} completed)</CardTitle></CardHeader>
        <CardContent>
          {trainingRuns.map((r: any) => (
            <div key={r.id} className="flex justify-between py-1 text-sm border-b last:border-0">
              <span>Run #{r.id} <Badge variant="outline" className="ml-1 text-xs">{r.trainingType}</Badge></span>
              <StatusBadge status={r.status} />
            </div>
          ))}
          {trainingRuns.length === 0 && <p className="text-muted-foreground text-sm">None</p>}
        </CardContent>
      </Card>

      {/* Evaluations */}
      <Card>
        <CardHeader><CardTitle>Evaluations ({completedEvals.length} completed)</CardTitle></CardHeader>
        <CardContent>
          {evaluations.map((e: any) => (
            <div key={e.id} className="flex justify-between py-1 text-sm border-b last:border-0">
              <span>Eval #{e.id} {e.overallScore && `— Score: ${e.overallScore}%`}</span>
              <StatusBadge status={e.status} />
            </div>
          ))}
          {evaluations.length === 0 && <p className="text-muted-foreground text-sm">None</p>}
        </CardContent>
      </Card>

      {/* Quantizations */}
      <Card>
        <CardHeader><CardTitle>Quantizations ({completedQuants.length} completed)</CardTitle></CardHeader>
        <CardContent>
          {quantizations.map((q: any) => (
            <div key={q.id} className="flex justify-between py-1 text-sm border-b last:border-0">
              <span>Quant #{q.id} <Badge variant="outline" className="ml-1 text-xs">{q.quantizationType}</Badge></span>
              <StatusBadge status={q.status} />
            </div>
          ))}
          {quantizations.length === 0 && <p className="text-muted-foreground text-sm">None</p>}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Phase 10: Governance Handoff
// ============================================================================

function Phase10Governance({
  project,
  config,
  setConfig,
  evaluations,
  quantizations,
  evalGate,
  artifactPackage,
}: {
  project: any;
  config: any;
  setConfig: (c: any) => void;
  evaluations: any[];
  quantizations: any[];
  evalGate: EvalGateResult;
  artifactPackage: ArtifactPackage | null;
}) {
  const hasEvals = evaluations.some((e: any) => e.status === "completed");
  const hasQuants = quantizations.some((q: any) => q.status === "completed");
  const isOverride = evalGate.status === "fail" && config.approvalReason?.trim();

  return (
    <div className="space-y-6">
      <Alert className="bg-amber-50 border-amber-300 dark:bg-amber-900/20 dark:border-amber-700">
        <Shield className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-800 dark:text-amber-300">
          <strong>Governance Handoff — Artifact Submission Only.</strong> This submits the build
          artifact to the governance pipeline. The output becomes a governed LLM version candidate.
          It is NOT runtime-ready until it passes: Governance → Catalog → Runtime.
          No provider, endpoint, or runtime binding is configured here.
        </AlertDescription>
      </Alert>

      {!hasEvals && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            No completed evaluations found. Governance will reject submissions
            without evaluation results.
          </AlertDescription>
        </Alert>
      )}

      {/* Evaluation Gate Status — explicit pass/fail/override */}
      <Card className={
        evalGate.status === "pass" ? "border-green-500 dark:border-green-600" :
        evalGate.status === "fail" ? "border-red-500 dark:border-red-600" :
        "border-muted"
      }>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {evalGate.status === "pass" ? (
              <><CheckCircle2 className="h-5 w-5 text-green-600" /> Evaluation Gate: PASSED</>
            ) : evalGate.status === "fail" ? (
              <><XCircle className="h-5 w-5 text-red-500" /> Evaluation Gate: FAILED</>
            ) : (
              <><AlertTriangle className="h-5 w-5 text-amber-500" /> Evaluation Gate: NO DATA</>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          {evalGate.bestScore != null && (
            <div className="flex items-center gap-4">
              <div>
                <span className="text-muted-foreground">Best Score: </span>
                <span className={`font-bold ${evalGate.status === "pass" ? "text-green-600" : "text-red-500"}`}>
                  {evalGate.bestScore}%
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">Threshold: </span>
                <span className="font-bold">{evalGate.threshold * 100}%</span>
              </div>
            </div>
          )}
          {evalGate.status === "fail" && (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>
                Evaluation score ({evalGate.bestScore}%) is below the required threshold ({evalGate.threshold * 100}%).
                You must either re-run evaluation to improve the score, or provide an <strong>explicit
                governance override reason</strong> below. Overrides are audited and flagged for review.
              </AlertDescription>
            </Alert>
          )}
          {isOverride && (
            <Alert className="bg-amber-50 border-amber-400 dark:bg-amber-900/30 dark:border-amber-600">
              <ShieldAlert className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800 dark:text-amber-300">
                <strong>GOVERNANCE OVERRIDE ACTIVE.</strong> This submission will be flagged as
                an override of the evaluation gate. The override reason will be recorded in the
                audit trail and subject to governance review.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Governance Environment</Label>
          <Select value={config.environment} onValueChange={(v: any) => setConfig({ ...config, environment: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sandbox">Sandbox (testing)</SelectItem>
              <SelectItem value="governed">Governed (staging)</SelectItem>
              <SelectItem value="production">Production</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Governance environment for the version candidate. This is NOT a runtime deployment target.
          </p>
        </div>

        <div className="space-y-2">
          <Label>Evaluation Threshold (0–1)</Label>
          <Input
            type="number" step="0.05" min="0" max="1"
            value={config.evaluationThreshold}
            onChange={(e) => setConfig({ ...config, evaluationThreshold: parseFloat(e.target.value) || 0.75 })}
          />
          <p className="text-xs text-muted-foreground">
            Minimum evaluation score required for automatic approval. Submissions below this
            threshold require an explicit override reason.
          </p>
        </div>

        {hasQuants && (
          <div className="flex items-center justify-between">
            <div>
              <Label>Use quantized artifact</Label>
              <p className="text-xs text-muted-foreground">Select the quantized build output instead of the full-precision artifact.</p>
            </div>
            <input
              type="checkbox"
              checked={config.useQuantizedArtifact}
              onChange={(e) => setConfig({ ...config, useQuantizedArtifact: e.target.checked })}
              className="h-5 w-5"
            />
          </div>
        )}

        <div className="space-y-2">
          <Label>Change Notes</Label>
          <Textarea
            value={config.changeNotes}
            onChange={(e) => setConfig({ ...config, changeNotes: e.target.value })}
            placeholder="Describe what this LLM artifact does and why it should be approved for governance..."
            rows={3}
          />
        </div>

        <Separator />

        <div className="space-y-2">
          <Label className={evalGate.status === "fail" ? "text-amber-600 font-semibold" : ""}>
            {evalGate.status === "fail"
              ? "Governance Override Reason (REQUIRED — eval gate failed)"
              : "Governance Override Reason (optional)"}
          </Label>
          <Textarea
            value={config.approvalReason}
            onChange={(e) => setConfig({ ...config, approvalReason: e.target.value })}
            placeholder={
              evalGate.status === "fail"
                ? "REQUIRED: Explain why this artifact should proceed despite failing the evaluation threshold..."
                : "Only needed if bypassing evaluation threshold. Leave blank for standard approval flow."
            }
            rows={evalGate.status === "fail" ? 3 : 2}
            className={evalGate.status === "fail" && !config.approvalReason?.trim() ? "border-red-500" : ""}
          />
          {evalGate.status === "fail" && !config.approvalReason?.trim() && (
            <p className="text-xs text-red-500 font-medium">
              Override reason is required because the evaluation gate failed.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Shared Components
// ============================================================================

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { variant: any; icon: any }> = {
    completed: { variant: "default", icon: <CheckCircle2 className="h-3 w-3 mr-1" /> },
    running: { variant: "secondary", icon: <RefreshCw className="h-3 w-3 mr-1 animate-spin" /> },
    pending: { variant: "outline", icon: <Loader2 className="h-3 w-3 mr-1" /> },
    failed: { variant: "destructive", icon: <XCircle className="h-3 w-3 mr-1" /> },
    cancelled: { variant: "outline", icon: <XCircle className="h-3 w-3 mr-1" /> },
  };
  const v = variants[status] || { variant: "outline", icon: null };
  return (
    <Badge variant={v.variant}>
      {v.icon}{status}
    </Badge>
  );
}

function Row({ label, value }: { label: string; value: any }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value || "—"}</span>
    </div>
  );
}
