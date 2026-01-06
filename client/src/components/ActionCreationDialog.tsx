import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ChevronLeft, 
  ChevronRight, 
  Save, 
  CheckCircle2, 
  AlertCircle, 
  Info,
  Zap,
  Shield,
  Database,
  Clock,
  FileText,
  TestTube,
  GitBranch
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useToast } from "@/hooks/use-toast";
import { CATEGORY_DEFAULTS, type ActionCategory } from "@/../../shared/category-defaults";

interface ActionCreationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// 14-gate form structure
const GATES = [
  { id: 0, title: "Classification & Intent", icon: Info, critical: true },
  { id: 1, title: "Registry & Identity", icon: Database, critical: true },
  { id: 2, title: "Configuration Schema", icon: FileText, critical: true },
  { id: 3, title: "UX Safety", icon: Shield, critical: false },
  { id: 4, title: "Data Flow & Contracts", icon: GitBranch, critical: true },
  { id: 5, title: "Execution Semantics", icon: Zap, critical: true },
  { id: 6, title: "Error Propagation", icon: AlertCircle, critical: true },
  { id: 7, title: "Security & Governance", icon: Shield, critical: true },
  { id: 8, title: "Multi-Tenancy", icon: Database, critical: true },
  { id: 9, title: "Observability", icon: Info, critical: true },
  { id: 10, title: "Performance & Cost", icon: Zap, critical: true },
  { id: 11, title: "Documentation", icon: FileText, critical: false },
  { id: 12, title: "Testing & Simulation", icon: TestTube, critical: false },
  { id: 13, title: "Lifecycle Management", icon: Clock, critical: true },
  { id: 14, title: "Review & Submit", icon: CheckCircle2, critical: true },
];

export default function ActionCreationDialog({ open, onOpenChange }: ActionCreationDialogProps){
  const [currentGate, setCurrentGate] = useState(0);
  const [formData, setFormData] = useState<any>({
    // Gate 0: Classification & Intent
    classification: "",
    isDeterministic: false,
    isIdempotent: false,
    safeByDefault: true,
    intentDoc: "",
    sideEffects: "[]",
    
    // Gate 1: Registry & Identity
    typeId: "",
    name: "",
    description: "",
    category: "logic" as ActionCategory,
    riskLevel: "low",
    semanticVersion: "1.0.0",
    icon: "clock",
    
    // Gate 2: Configuration Schema
    configSchema: "{}",
    defaultConfig: "{}",
    
    // Gate 3: UX Safety
    requiredFields: "[]",
    unsafeOptions: "[]",
    validationRules: "{}",
    samplePayload: "{}",
    
    // Gate 4: Data Flow & Contracts
    inputContract: "{}",
    outputContract: "{}",
    outputTypes: "[]",
    initialWorkflowSchema: "{}",
    
    // Gate 5: Execution Semantics
    executionMode: "async",
    blockingBehavior: "non-blocking",
    retryPolicy: JSON.stringify({ maxRetries: 3, backoffMs: 1000 }),
    timeoutPolicy: JSON.stringify({ timeoutMs: 30000 }),
    failureHandling: JSON.stringify({ strategy: "fail-workflow" }),
    stateTier: "ephemeral",
    maxStateSize: 1048576, // 1MB
    concurrentIsolation: "",
    
    // Gate 6: Error Propagation
    compensationStrategy: "",
    workflowFailureHandler: "{}",
    idempotencyKeyField: "",
    
    // Gate 7: Security & Governance
    requiredPermissions: "[]",
    preExecutionPolicies: "[]",
    secretFields: "[]",
    
    // Gate 8: Multi-Tenancy
    tenantScoped: true,
    tenantIsolation: "",
    
    // Gate 9: Observability
    metricsConfig: JSON.stringify({
      trackSuccessRate: true,
      trackLatency: true,
      trackCost: false
    }),
    logFields: JSON.stringify(["nodeId", "workflowId", "runId", "timestamp"]),
    errorClassification: "{}",
    
    // Gate 10: Performance & Cost
    performanceProfile: "standard",
    latencySLA: JSON.stringify({ p50: 100, p95: 500, p99: 1000 }),
    throughputExpectation: 100,
    degradationBehavior: "",
    rateLimits: JSON.stringify({ perTenant: 1000, perMinute: 100 }),
    costQuotas: "{}",
    backpressureStrategy: "",
    
    // Gate 11: Documentation
    purposeDoc: "",
    useCases: "[]",
    failureModes: "[]",
    securityConsiderations: "",
    examples: "[]",
    
    // Gate 12: Testing & Simulation
    testCoverage: "{}",
    dryRunSupported: false,
    simulationConfig: "{}",
    
    // Gate 13: Lifecycle Management
    deprecationNotice: "",
    migrationPath: "",
    replacementTypeId: "",
    
    // Gate 14: Composition & Modularity
    subWorkflowSupport: false,
    maxNestingDepth: 5,
    variableScopingRules: "",
    failureBubblingRules: "",
    
    // Runtime handler
    handlerType: "webhook",
    handlerEndpoint: "",
    handlerCode: "",
    
    // Capability flags
    requiresNetwork: false,
    requiresSecrets: false,
    hasSideEffects: false,
    hasCost: false,
  });

  const [validationErrors, setValidationErrors] = useState<Record<number, string[]>>({});
  const { toast } = useToast();

  const createActionMutation = trpc.actions.create.useMutation({
    onSuccess: () => {
      toast({
        title: "Action Created",
        description: "Your action has been submitted for approval.",
      });
      onOpenChange(false);
      setCurrentGate(0);
      setFormData({});
    },
    onError: (error: any) => {
      toast({
        title: "Creation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const validateGate = (gateId: number): string[] => {
    const errors: string[] = [];
    
    switch (gateId) {
      case 0: // Classification & Intent
        if (!formData.classification) errors.push("Classification is required");
        if (!formData.intentDoc) errors.push("Intent documentation is required");
        break;
      case 1: // Registry & Identity
        if (!formData.typeId) errors.push("Type ID is required");
        if (!formData.name) errors.push("Name is required");
        if (!formData.description) errors.push("Description is required");
        if (!formData.category) errors.push("Category is required");
        if (!/^\d+\.\d+\.\d+$/.test(formData.semanticVersion)) {
          errors.push("Semantic version must be in format X.Y.Z");
        }
        break;
      case 2: // Configuration Schema
        try {
          JSON.parse(formData.configSchema);
        } catch {
          errors.push("Config schema must be valid JSON");
        }
        break;
      case 4: // Data Flow & Contracts
        if (!formData.outputContract || formData.outputContract === "{}") {
          errors.push("Output contract is required");
        }
        break;
      case 5: // Execution Semantics
        if (!formData.concurrentIsolation) {
          errors.push("Concurrent isolation documentation is required");
        }
        break;
      case 7: // Security & Governance
        if (formData.riskLevel === "privileged" && !formData.requiredPermissions) {
          errors.push("Privileged triggers must declare required permissions");
        }
        break;
      case 8: // Multi-Tenancy
        if (formData.tenantScoped && !formData.tenantIsolation) {
          errors.push("Tenant isolation documentation is required");
        }
        break;
      case 10: // Performance & Cost
        if (!formData.degradationBehavior) {
          errors.push("Degradation behavior must be documented");
        }
        if (!formData.backpressureStrategy) {
          errors.push("Backpressure strategy must be documented");
        }
        break;
      case 11: // Documentation
        if (!formData.purposeDoc) errors.push("Purpose documentation is required");
        break;
      case 13: // Lifecycle
        // No critical validations for lifecycle
        break;
    }
    
    return errors;
  };

  const handleNext = () => {
    const errors = validateGate(currentGate);
    if (errors.length > 0) {
      setValidationErrors({ ...validationErrors, [currentGate]: errors });
      toast({
        title: "Validation Failed",
        description: `Please fix ${errors.length} error(s) before proceeding.`,
        variant: "destructive",
      });
      return;
    }
    
    setValidationErrors({ ...validationErrors, [currentGate]: [] });
    setCurrentGate(Math.min(currentGate + 1, GATES.length - 1));
  };

  const handlePrevious = () => {
    setCurrentGate(Math.max(currentGate - 1, 0));
  };

  const handleSubmit = () => {
    // Validate all critical gates
    const criticalGates = GATES.filter(g => g.critical).map(g => g.id);
    const allErrors: Record<number, string[]> = {};
    let hasErrors = false;
    
    for (const gateId of criticalGates) {
      const errors = validateGate(gateId);
      if (errors.length > 0) {
        allErrors[gateId] = errors;
        hasErrors = true;
      }
    }
    
    if (hasErrors) {
      setValidationErrors(allErrors);
      toast({
        title: "Validation Failed",
        description: "Please fix all critical gate errors before submitting.",
        variant: "destructive",
      });
      return;
    }
    
    createActionMutation.mutate(formData);
  };

  const progress = ((currentGate + 1) / GATES.length) * 100;
  const currentGateInfo = GATES[currentGate];
  const gateErrors = validationErrors[currentGate] || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {currentGateInfo && <currentGateInfo.icon className="h-5 w-5" />}
            Create New Action Type
            {currentGateInfo?.critical && (
              <Badge variant="destructive" className="ml-2">Critical</Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            Gate {currentGate + 1} of {GATES.length}: {currentGateInfo?.title}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Progress bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Progress</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} />
          </div>

          {/* Validation errors */}
          {gateErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <ul className="list-disc list-inside">
                  {gateErrors.map((error, idx) => (
                    <li key={idx}>{error}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {/* Gate content */}
          <Card>
            <CardContent className="pt-6">
              {renderGateContent(currentGate, formData, setFormData)}
            </CardContent>
          </Card>

          {/* Navigation buttons */}
          <div className="flex justify-between">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={currentGate === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              Previous
            </Button>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => {
                toast({ title: "Draft Saved", description: "Your progress has been saved." });
              }}>
                <Save className="h-4 w-4 mr-2" />
                Save Draft
              </Button>

              {currentGate < GATES.length - 1 ? (
                <Button onClick={handleNext}>
                  Next
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              ) : (
                <Button onClick={handleSubmit} disabled={createActionMutation.isPending}>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Submit for Approval
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function renderGateContent(gateId: number, formData: any, setFormData: (data: any) => void) {
  const updateField = (field: string, value: any) => {
    setFormData({ ...formData, [field]: value });
  };

  switch (gateId) {
    case 0: // Classification & Intent
      return (
        <div className="space-y-4">
          <div>
            <Label htmlFor="classification">Classification *</Label>
            <Select value={formData.classification} onValueChange={(v) => updateField("classification", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select classification" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="side-effecting">Side-effecting (API call, email, webhook)</SelectItem>
                <SelectItem value="transformational">Transformational (data processing, formatting)</SelectItem>
                <SelectItem value="control-flow">Control-flow (conditional, loop, branch)</SelectItem>
                <SelectItem value="ai">AI (LLM call, embedding, classification)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="isDeterministic" 
                checked={formData.isDeterministic}
                onCheckedChange={(checked) => updateField("isDeterministic", checked)}
              />
              <Label htmlFor="isDeterministic">Deterministic</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="isIdempotent" 
                checked={formData.isIdempotent}
                onCheckedChange={(checked) => updateField("isIdempotent", checked)}
              />
              <Label htmlFor="isIdempotent">Idempotent</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="safeByDefault" 
                checked={formData.safeByDefault}
                onCheckedChange={(checked) => updateField("safeByDefault", checked)}
              />
              <Label htmlFor="safeByDefault">Safe by Default</Label>
            </div>
          </div>

          <div>
            <Label htmlFor="intentDoc">Intent Documentation *</Label>
            <Textarea
              id="intentDoc"
              placeholder="What does this action do? Describe side effects and transformations..."
              value={formData.intentDoc}
              onChange={(e) => updateField("intentDoc", e.target.value)}
              rows={4}
            />
          </div>
        </div>
      );

    case 1: // Registry & Identity
      return (
        <div className="space-y-4">
          <div>
            <Label htmlFor="typeId">Type ID * (stable, unique identifier)</Label>
            <Input
              id="typeId"
              placeholder="e.g., send-email, call-api, transform-data"
              value={formData.typeId}
              onChange={(e) => updateField("typeId", e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              placeholder="Human-readable name"
              value={formData.name}
              onChange={(e) => updateField("name", e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              placeholder="Describe what this action does..."
              value={formData.description}
              onChange={(e) => updateField("description", e.target.value)}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="category">Category *</Label>
              <Select 
                value={formData.category} 
                onValueChange={(value: ActionCategory) => {
                  const defaults = CATEGORY_DEFAULTS[value];
                  updateField("category", value);
                  updateField("riskLevel", defaults.defaultRisk);
                  updateField("sideEffects", JSON.stringify(defaults.defaultSideEffects));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="control">Control (workflow orchestration)</SelectItem>
                  <SelectItem value="logic">Logic (pure compute)</SelectItem>
                  <SelectItem value="communication">Communication (messaging)</SelectItem>
                  <SelectItem value="integration">Integration (external APIs)</SelectItem>
                  <SelectItem value="data">Data (database operations)</SelectItem>
                  <SelectItem value="file">File (file operations)</SelectItem>
                  <SelectItem value="ai">AI (model inference)</SelectItem>
                  <SelectItem value="human">Human (approval/input)</SelectItem>
                  <SelectItem value="security">Security (auth/secrets)</SelectItem>
                  <SelectItem value="observability">Observability (telemetry)</SelectItem>
                  <SelectItem value="system">System (platform-level)</SelectItem>
                  <SelectItem value="custom">Custom (unknown)</SelectItem>
                </SelectContent>
              </Select>
              {formData.category && (
                <p className="text-sm text-muted-foreground mt-1">
                  {CATEGORY_DEFAULTS[formData.category as ActionCategory].notes[0]}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="semanticVersion">Semantic Version *</Label>
              <Input
                id="semanticVersion"
                placeholder="1.0.0"
                value={formData.semanticVersion}
                onChange={(e) => updateField("semanticVersion", e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="icon">Icon</Label>
            <Select value={formData.icon} onValueChange={(v) => updateField("icon", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select icon" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="clock">Clock</SelectItem>
                <SelectItem value="calendar">Calendar</SelectItem>
                <SelectItem value="webhook">Webhook</SelectItem>
                <SelectItem value="mail">Mail</SelectItem>
                <SelectItem value="file">File</SelectItem>
                <SelectItem value="upload">Upload</SelectItem>
                <SelectItem value="database">Database</SelectItem>
                <SelectItem value="zap">Zap</SelectItem>
                <SelectItem value="bell">Bell</SelectItem>
                <SelectItem value="message-square">Message Square</SelectItem>
                <SelectItem value="git-branch">Git Branch</SelectItem>
                <SelectItem value="activity">Activity</SelectItem>
                <SelectItem value="alert-circle">Alert Circle</SelectItem>
                <SelectItem value="check-circle">Check Circle</SelectItem>
                <SelectItem value="play">Play</SelectItem>
                <SelectItem value="pause">Pause</SelectItem>
                <SelectItem value="stop-circle">Stop Circle</SelectItem>
                <SelectItem value="refresh-cw">Refresh</SelectItem>
                <SelectItem value="settings">Settings</SelectItem>
                <SelectItem value="shield">Shield</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );

    case 2: // Configuration Schema
      return (
        <div className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Define the JSON Schema for this trigger's configuration. This schema will be used to validate user inputs.
            </AlertDescription>
          </Alert>

          <div>
            <Label htmlFor="configSchema">Configuration Schema * (JSON Schema)</Label>
            <Textarea
              id="configSchema"
              placeholder='{"type": "object", "properties": {...}, "required": [...]}'
              value={formData.configSchema}
              onChange={(e) => updateField("configSchema", e.target.value)}
              rows={8}
              className="font-mono text-sm"
            />
          </div>

          <div>
            <Label htmlFor="defaultConfig">Default Configuration (JSON)</Label>
            <Textarea
              id="defaultConfig"
              placeholder="{}"
              value={formData.defaultConfig}
              onChange={(e) => updateField("defaultConfig", e.target.value)}
              rows={4}
              className="font-mono text-sm"
            />
          </div>
        </div>
      );

    case 3: // UX Safety
      return (
        <div className="space-y-4">
          <div>
            <Label htmlFor="requiredFields">Required Fields (JSON array)</Label>
            <Textarea
              id="requiredFields"
              placeholder='["field1", "field2"]'
              value={formData.requiredFields}
              onChange={(e) => updateField("requiredFields", e.target.value)}
              rows={2}
              className="font-mono text-sm"
            />
          </div>

          <div>
            <Label htmlFor="unsafeOptions">Unsafe Options (JSON array)</Label>
            <Textarea
              id="unsafeOptions"
              placeholder='["option1", "option2"]'
              value={formData.unsafeOptions}
              onChange={(e) => updateField("unsafeOptions", e.target.value)}
              rows={2}
              className="font-mono text-sm"
            />
          </div>

          <div>
            <Label htmlFor="validationRules">Validation Rules (JSON)</Label>
            <Textarea
              id="validationRules"
              placeholder="{}"
              value={formData.validationRules}
              onChange={(e) => updateField("validationRules", e.target.value)}
              rows={4}
              className="font-mono text-sm"
            />
          </div>

          <div>
            <Label htmlFor="samplePayload">Sample Payload (JSON)</Label>
            <Textarea
              id="samplePayload"
              placeholder="{}"
              value={formData.samplePayload}
              onChange={(e) => updateField("samplePayload", e.target.value)}
              rows={4}
              className="font-mono text-sm"
            />
          </div>
        </div>
      );

    case 4: // Data Flow & Contracts
      return (
        <div className="space-y-4">
          <div>
            <Label htmlFor="inputContract">Input Contract (JSON Schema)</Label>
            <Textarea
              id="inputContract"
              placeholder="{}"
              value={formData.inputContract}
              onChange={(e) => updateField("inputContract", e.target.value)}
              rows={4}
              className="font-mono text-sm"
            />
          </div>

          <div>
            <Label htmlFor="outputContract">Output Contract * (JSON Schema)</Label>
            <Textarea
              id="outputContract"
              placeholder='{"type": "object", "properties": {...}}'
              value={formData.outputContract}
              onChange={(e) => updateField("outputContract", e.target.value)}
              rows={4}
              className="font-mono text-sm"
            />
          </div>

          <div>
            <Label htmlFor="outputTypes">Output Types (JSON array)</Label>
            <Textarea
              id="outputTypes"
              placeholder='["string", "number"]'
              value={formData.outputTypes}
              onChange={(e) => updateField("outputTypes", e.target.value)}
              rows={2}
              className="font-mono text-sm"
            />
          </div>

          <div>
            <Label htmlFor="initialWorkflowSchema">Initial Workflow Schema (JSON)</Label>
            <Textarea
              id="initialWorkflowSchema"
              placeholder="{}"
              value={formData.initialWorkflowSchema}
              onChange={(e) => updateField("initialWorkflowSchema", e.target.value)}
              rows={4}
              className="font-mono text-sm"
            />
          </div>
        </div>
      );

    case 5: // Execution Semantics
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="executionMode">Execution Mode *</Label>
              <Select value={formData.executionMode} onValueChange={(v) => updateField("executionMode", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sync">Synchronous</SelectItem>
                  <SelectItem value="async">Asynchronous</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="blockingBehavior">Blocking Behavior *</Label>
              <Select value={formData.blockingBehavior} onValueChange={(v) => updateField("blockingBehavior", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blocking">Blocking</SelectItem>
                  <SelectItem value="non-blocking">Non-blocking</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="retryPolicy">Retry Policy (JSON)</Label>
            <Textarea
              id="retryPolicy"
              value={formData.retryPolicy}
              onChange={(e) => updateField("retryPolicy", e.target.value)}
              rows={3}
              className="font-mono text-sm"
            />
          </div>

          <div>
            <Label htmlFor="timeoutPolicy">Timeout Policy (JSON)</Label>
            <Textarea
              id="timeoutPolicy"
              value={formData.timeoutPolicy}
              onChange={(e) => updateField("timeoutPolicy", e.target.value)}
              rows={3}
              className="font-mono text-sm"
            />
          </div>

          <div>
            <Label htmlFor="failureHandling">Failure Handling (JSON)</Label>
            <Textarea
              id="failureHandling"
              value={formData.failureHandling}
              onChange={(e) => updateField("failureHandling", e.target.value)}
              rows={3}
              className="font-mono text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="stateTier">State Tier *</Label>
              <Select value={formData.stateTier} onValueChange={(v) => updateField("stateTier", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ephemeral">Ephemeral</SelectItem>
                  <SelectItem value="durable">Durable</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="maxStateSize">Max State Size (bytes)</Label>
              <Input
                id="maxStateSize"
                type="number"
                value={formData.maxStateSize}
                onChange={(e) => updateField("maxStateSize", parseInt(e.target.value))}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="concurrentIsolation">Concurrent Isolation Documentation *</Label>
            <Textarea
              id="concurrentIsolation"
              placeholder="Describe how concurrent runs are isolated..."
              value={formData.concurrentIsolation}
              onChange={(e) => updateField("concurrentIsolation", e.target.value)}
              rows={3}
            />
          </div>
        </div>
      );

    case 6: // Error Propagation & Compensation
      return (
        <div className="space-y-4">
          <div>
            <Label htmlFor="compensationStrategy">Compensation Strategy</Label>
            <Textarea
              id="compensationStrategy"
              placeholder="Describe how to compensate for failures..."
              value={formData.compensationStrategy}
              onChange={(e) => updateField("compensationStrategy", e.target.value)}
              rows={4}
            />
          </div>

          <div>
            <Label htmlFor="workflowFailureHandler">Workflow Failure Handler (JSON)</Label>
            <Textarea
              id="workflowFailureHandler"
              placeholder="{}"
              value={formData.workflowFailureHandler}
              onChange={(e) => updateField("workflowFailureHandler", e.target.value)}
              rows={3}
              className="font-mono text-sm"
            />
          </div>

          <div>
            <Label htmlFor="idempotencyKeyField">Idempotency Key Field</Label>
            <Input
              id="idempotencyKeyField"
              placeholder="Field name for idempotency key"
              value={formData.idempotencyKeyField}
              onChange={(e) => updateField("idempotencyKeyField", e.target.value)}
            />
          </div>
        </div>
      );

    case 7: // Security & Governance
      return (
        <div className="space-y-4">
          <div>
            <Label htmlFor="riskLevel">Risk Level *</Label>
            <Select value={formData.riskLevel} onValueChange={(v) => updateField("riskLevel", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="safe">Safe</SelectItem>
                <SelectItem value="restricted">Restricted</SelectItem>
                <SelectItem value="privileged">Privileged</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="requiredPermissions">Required Permissions (JSON array)</Label>
            <Textarea
              id="requiredPermissions"
              placeholder='["permission1", "permission2"]'
              value={formData.requiredPermissions}
              onChange={(e) => updateField("requiredPermissions", e.target.value)}
              rows={2}
              className="font-mono text-sm"
            />
          </div>

          <div>
            <Label htmlFor="preExecutionPolicies">Pre-execution Policies (JSON array)</Label>
            <Textarea
              id="preExecutionPolicies"
              placeholder='[]'
              value={formData.preExecutionPolicies}
              onChange={(e) => updateField("preExecutionPolicies", e.target.value)}
              rows={2}
              className="font-mono text-sm"
            />
          </div>

          <div>
            <Label htmlFor="secretFields">Secret Fields (JSON array)</Label>
            <Textarea
              id="secretFields"
              placeholder='["apiKey", "token"]'
              value={formData.secretFields}
              onChange={(e) => updateField("secretFields", e.target.value)}
              rows={2}
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="requiresNetwork" 
                checked={formData.requiresNetwork}
                onCheckedChange={(checked) => updateField("requiresNetwork", checked)}
              />
              <Label htmlFor="requiresNetwork">Requires Network Access</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="requiresSecrets" 
                checked={formData.requiresSecrets}
                onCheckedChange={(checked) => updateField("requiresSecrets", checked)}
              />
              <Label htmlFor="requiresSecrets">Requires Secrets</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="hasSideEffects" 
                checked={formData.hasSideEffects}
                onCheckedChange={(checked) => updateField("hasSideEffects", checked)}
              />
              <Label htmlFor="hasSideEffects">Has Side Effects</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="hasCost" 
                checked={formData.hasCost}
                onCheckedChange={(checked) => updateField("hasCost", checked)}
              />
              <Label htmlFor="hasCost">Has Cost</Label>
            </div>
          </div>
        </div>
      );

    case 8: // Multi-Tenancy & Isolation
      return (
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="tenantScoped" 
              checked={formData.tenantScoped}
              onCheckedChange={(checked) => updateField("tenantScoped", checked)}
            />
            <Label htmlFor="tenantScoped">Tenant Scoped</Label>
          </div>

          <div>
            <Label htmlFor="tenantIsolation">Tenant Isolation Documentation *</Label>
            <Textarea
              id="tenantIsolation"
              placeholder="Describe how tenant isolation is enforced..."
              value={formData.tenantIsolation}
              onChange={(e) => updateField("tenantIsolation", e.target.value)}
              rows={4}
            />
          </div>
        </div>
      );

    case 9: // Observability & Metrics
      return (
        <div className="space-y-4">
          <div>
            <Label htmlFor="metricsConfig">Metrics Configuration (JSON)</Label>
            <Textarea
              id="metricsConfig"
              value={formData.metricsConfig}
              onChange={(e) => updateField("metricsConfig", e.target.value)}
              rows={4}
              className="font-mono text-sm"
            />
          </div>

          <div>
            <Label htmlFor="logFields">Log Fields (JSON array)</Label>
            <Textarea
              id="logFields"
              value={formData.logFields}
              onChange={(e) => updateField("logFields", e.target.value)}
              rows={2}
              className="font-mono text-sm"
            />
          </div>

          <div>
            <Label htmlFor="errorClassification">Error Classification (JSON)</Label>
            <Textarea
              id="errorClassification"
              placeholder='{"NetworkError": "retryable", "ValidationError": "fatal"}'
              value={formData.errorClassification}
              onChange={(e) => updateField("errorClassification", e.target.value)}
              rows={4}
              className="font-mono text-sm"
            />
          </div>
        </div>
      );

    case 10: // Performance & Cost
      return (
        <div className="space-y-4">
          <div>
            <Label htmlFor="performanceProfile">Performance Profile *</Label>
            <Select value={formData.performanceProfile} onValueChange={(v) => updateField("performanceProfile", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="heavy">Heavy</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="latencySLA">Latency SLA (JSON)</Label>
            <Textarea
              id="latencySLA"
              value={formData.latencySLA}
              onChange={(e) => updateField("latencySLA", e.target.value)}
              rows={2}
              className="font-mono text-sm"
            />
          </div>

          <div>
            <Label htmlFor="throughputExpectation">Throughput Expectation (req/sec)</Label>
            <Input
              id="throughputExpectation"
              type="number"
              value={formData.throughputExpectation}
              onChange={(e) => updateField("throughputExpectation", parseInt(e.target.value))}
            />
          </div>

          <div>
            <Label htmlFor="degradationBehavior">Degradation Behavior *</Label>
            <Textarea
              id="degradationBehavior"
              placeholder="Describe how the system degrades under load..."
              value={formData.degradationBehavior}
              onChange={(e) => updateField("degradationBehavior", e.target.value)}
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="rateLimits">Rate Limits (JSON)</Label>
            <Textarea
              id="rateLimits"
              value={formData.rateLimits}
              onChange={(e) => updateField("rateLimits", e.target.value)}
              rows={2}
              className="font-mono text-sm"
            />
          </div>

          <div>
            <Label htmlFor="costQuotas">Cost Quotas (JSON)</Label>
            <Textarea
              id="costQuotas"
              placeholder="{}"
              value={formData.costQuotas}
              onChange={(e) => updateField("costQuotas", e.target.value)}
              rows={2}
              className="font-mono text-sm"
            />
          </div>

          <div>
            <Label htmlFor="backpressureStrategy">Backpressure Strategy *</Label>
            <Textarea
              id="backpressureStrategy"
              placeholder="Describe how backpressure is handled..."
              value={formData.backpressureStrategy}
              onChange={(e) => updateField("backpressureStrategy", e.target.value)}
              rows={3}
            />
          </div>
        </div>
      );

    case 11: // Documentation
      return (
        <div className="space-y-4">
          <div>
            <Label htmlFor="purposeDoc">Purpose Documentation *</Label>
            <Textarea
              id="purposeDoc"
              placeholder="Describe the purpose and use cases..."
              value={formData.purposeDoc}
              onChange={(e) => updateField("purposeDoc", e.target.value)}
              rows={4}
            />
          </div>

          <div>
            <Label htmlFor="useCases">Use Cases (JSON array)</Label>
            <Textarea
              id="useCases"
              placeholder='["Use case 1", "Use case 2"]'
              value={formData.useCases}
              onChange={(e) => updateField("useCases", e.target.value)}
              rows={3}
              className="font-mono text-sm"
            />
          </div>

          <div>
            <Label htmlFor="failureModes">Failure Modes (JSON array)</Label>
            <Textarea
              id="failureModes"
              placeholder='["Failure mode 1", "Failure mode 2"]'
              value={formData.failureModes}
              onChange={(e) => updateField("failureModes", e.target.value)}
              rows={3}
              className="font-mono text-sm"
            />
          </div>

          <div>
            <Label htmlFor="securityConsiderations">Security Considerations</Label>
            <Textarea
              id="securityConsiderations"
              placeholder="Describe security considerations..."
              value={formData.securityConsiderations}
              onChange={(e) => updateField("securityConsiderations", e.target.value)}
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="examples">Examples (JSON array)</Label>
            <Textarea
              id="examples"
              placeholder='[{"name": "Example 1", "config": {...}}]'
              value={formData.examples}
              onChange={(e) => updateField("examples", e.target.value)}
              rows={4}
              className="font-mono text-sm"
            />
          </div>
        </div>
      );

    case 12: // Testing & Simulation
      return (
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="dryRunSupported" 
              checked={formData.dryRunSupported}
              onCheckedChange={(checked) => updateField("dryRunSupported", checked)}
            />
            <Label htmlFor="dryRunSupported">Supports Dry-Run</Label>
          </div>

          <div>
            <Label htmlFor="testCoverage">Test Coverage (JSON)</Label>
            <Textarea
              id="testCoverage"
              placeholder='{"unit": 90, "integration": 80}'
              value={formData.testCoverage}
              onChange={(e) => updateField("testCoverage", e.target.value)}
              rows={3}
              className="font-mono text-sm"
            />
          </div>

          <div>
            <Label htmlFor="simulationConfig">Simulation Configuration (JSON)</Label>
            <Textarea
              id="simulationConfig"
              placeholder="{}"
              value={formData.simulationConfig}
              onChange={(e) => updateField("simulationConfig", e.target.value)}
              rows={4}
              className="font-mono text-sm"
            />
          </div>
        </div>
      );

    case 13: // Lifecycle Management
      return (
        <div className="space-y-4">
          <div>
            <Label htmlFor="deprecationNotice">Deprecation Notice</Label>
            <Textarea
              id="deprecationNotice"
              placeholder="Leave empty if not deprecated"
              value={formData.deprecationNotice}
              onChange={(e) => updateField("deprecationNotice", e.target.value)}
              rows={2}
            />
          </div>

          <div>
            <Label htmlFor="migrationPath">Migration Path</Label>
            <Textarea
              id="migrationPath"
              placeholder="Instructions for migrating to newer version"
              value={formData.migrationPath}
              onChange={(e) => updateField("migrationPath", e.target.value)}
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="replacementTypeId">Replacement Type ID</Label>
            <Input
              id="replacementTypeId"
              placeholder="Type ID of replacement trigger"
              value={formData.replacementTypeId}
              onChange={(e) => updateField("replacementTypeId", e.target.value)}
            />
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox 
              id="subWorkflowSupport" 
              checked={formData.subWorkflowSupport}
              onCheckedChange={(checked) => updateField("subWorkflowSupport", checked)}
            />
            <Label htmlFor="subWorkflowSupport">Supports Sub-workflows</Label>
          </div>

          <div>
            <Label htmlFor="maxNestingDepth">Max Nesting Depth</Label>
            <Input
              id="maxNestingDepth"
              type="number"
              value={formData.maxNestingDepth}
              onChange={(e) => updateField("maxNestingDepth", parseInt(e.target.value))}
            />
          </div>

          <div>
            <Label htmlFor="variableScopingRules">Variable Scoping Rules</Label>
            <Textarea
              id="variableScopingRules"
              placeholder="Describe variable scoping..."
              value={formData.variableScopingRules}
              onChange={(e) => updateField("variableScopingRules", e.target.value)}
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="failureBubblingRules">Failure Bubbling Rules</Label>
            <Textarea
              id="failureBubblingRules"
              placeholder="Describe how failures bubble up..."
              value={formData.failureBubblingRules}
              onChange={(e) => updateField("failureBubblingRules", e.target.value)}
              rows={3}
            />
          </div>
        </div>
      );

    case 14: // Review & Submit
      return (
        <div className="space-y-4">
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              Review your trigger configuration before submitting for approval.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle>Trigger Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <strong>Name:</strong> {formData.name || "Not set"}
              </div>
              <div>
                <strong>Type ID:</strong> {formData.typeId || "Not set"}
              </div>
              <div>
                <strong>Classification:</strong> {formData.classification || "Not set"}
              </div>
              <div>
                <strong>Risk Level:</strong> {formData.riskLevel || "Not set"}
              </div>
              <div>
                <strong>Performance Profile:</strong> {formData.performanceProfile || "Not set"}
              </div>
            </CardContent>
          </Card>

          <div>
            <Label htmlFor="handlerType">Handler Type *</Label>
            <Select value={formData.handlerType} onValueChange={(v) => updateField("handlerType", v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="inline">Inline Code</SelectItem>
                <SelectItem value="external">External Service</SelectItem>
                <SelectItem value="webhook">Webhook</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.handlerType === "inline" && (
            <div>
              <Label htmlFor="handlerCode">Handler Code (JavaScript/TypeScript)</Label>
              <Textarea
                id="handlerCode"
                placeholder="async function handler(event) { ... }"
                value={formData.handlerCode}
                onChange={(e) => updateField("handlerCode", e.target.value)}
                rows={8}
                className="font-mono text-sm"
              />
            </div>
          )}

          {(formData.handlerType === "external" || formData.handlerType === "webhook") && (
            <div>
              <Label htmlFor="handlerEndpoint">Handler Endpoint URL</Label>
              <Input
                id="handlerEndpoint"
                placeholder="https://api.example.com/trigger"
                value={formData.handlerEndpoint}
                onChange={(e) => updateField("handlerEndpoint", e.target.value)}
              />
            </div>
          )}
        </div>
      );

    default:
      return <div>Unknown gate</div>;
  }
}
