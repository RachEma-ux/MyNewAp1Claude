import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { ChevronLeft, ChevronRight, Save, AlertTriangle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { TRIGGER_DEFAULTS } from "../../../shared/trigger-defaults";

interface TriggerCreationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function TriggerCreationDialog({ open, onOpenChange }: TriggerCreationDialogProps) {
  const [currentGate, setCurrentGate] = useState(1);
  const [formData, setFormData] = useState({
    // Gate T1: Trigger Identity
    triggerId: "",
    name: "",
    category: "event" as "time" | "event" | "data" | "user" | "system" | "integration",
    semanticVersion: "1.0.0",
    owner: "",
    icon: "zap",
    
    // Gate T2: Intent & Semantics
    purpose: "",
    guarantees: [] as string[],
    nonGoals: ["No business data mutation", "No outbound messages", "No workflow logic"],
    
    // Gate T4: Event Input Contract
    eventInputSchema: "{}",
    
    // Gate T5: Workflow Context Output
    workflowContextSchema: "{}",
    
    // Gate T6: Trigger Execution Model
    ingestionMode: "event" as "event" | "poll" | "schedule",
    deduplicationEnabled: false,
    deduplicationKey: "",
    ordering: "none" as "none" | "fifo",
    ingestionRetryPolicy: "{}",
    pollingInterval: 0,
    
    // Gate T7: Side-Effects Declaration
    sideEffects: ["workflow_state_write"],
    
    // Gate T8: Security & Trust Model
    authenticationType: "none" as "none" | "hmac" | "jwt" | "mTLS" | "api_key",
    authorizationScopes: [] as string[],
    sourceVerification: false,
    maxEventsPerMinute: 100,
    
    // Gate T9: Error Model
    errorTaxonomy: [] as string[],
    
    // Gate T10: Observability
    observabilityConfig: "{}",
    
    // Gate T11: Load & Limits
    maxPayloadKb: 256,
    maxEventsPerSecond: 10,
    
    // Gate T12: Simulation (MANDATORY)
    supportsDryRun: true,
    eventStub: "{}",
    
    // Gate T13: Lifecycle
    replacementTriggerId: "",
    
    // Gate T14: UI Integration Contract
    uiIntegrationSpec: "{}",
    
    // Risk Level
    riskLevel: "low" as "low" | "medium" | "high" | "critical",
  });

  const createTriggerMutation = trpc.triggers.create.useMutation({
    onSuccess: () => {
      onOpenChange(false);
      setCurrentGate(1);
      // Reset form
    },
    onError: (error) => {
      console.error("Failed to create trigger:", error);
    },
  });

  const handleCategoryChange = (category: typeof formData.category) => {
    const defaults = TRIGGER_DEFAULTS[category];
    setFormData({
      ...formData,
      category,
      riskLevel: defaults.defaultRisk,
      sideEffects: defaults.defaultSideEffects,
    });
  };

  const handleNext = () => {
    if (currentGate < 15) {
      setCurrentGate(currentGate + 1);
    }
  };

  const handlePrevious = () => {
    if (currentGate > 1) {
      setCurrentGate(currentGate - 1);
    }
  };

  const handleSaveDraft = () => {
    // Save draft logic
    console.log("Saving draft...", formData);
  };

  const handleSubmit = () => {
    createTriggerMutation.mutate({
      ...formData,
      guarantees: formData.guarantees.length > 0 ? formData.guarantees : undefined,
      eventInputSchema: JSON.parse(formData.eventInputSchema),
      workflowContextSchema: JSON.parse(formData.workflowContextSchema),
      ingestionRetryPolicy: formData.ingestionRetryPolicy ? JSON.parse(formData.ingestionRetryPolicy) : undefined,
      pollingInterval: formData.pollingInterval || undefined,
      authorizationScopes: formData.authorizationScopes.length > 0 ? formData.authorizationScopes : undefined,
      errorTaxonomy: JSON.parse(JSON.stringify(formData.errorTaxonomy)),
      observabilityConfig: JSON.parse(formData.observabilityConfig),
      eventStub: JSON.parse(formData.eventStub),
      uiIntegrationSpec: JSON.parse(formData.uiIntegrationSpec),
      replacementTriggerId: formData.replacementTriggerId || undefined,
      createdBy: "admin", // TODO: Get from auth context
    });
  };

  const gates = [
    { id: 1, title: "Trigger Identity", priority: "Critical" },
    { id: 2, title: "Intent & Semantics", priority: "Critical" },
    { id: 3, title: "Category", priority: "Critical" },
    { id: 4, title: "Event Input Contract", priority: "Critical" },
    { id: 5, title: "Workflow Context Output", priority: "Critical" },
    { id: 6, title: "Trigger Execution Model", priority: "Critical" },
    { id: 7, title: "Side-Effects Declaration", priority: "Critical" },
    { id: 8, title: "Security & Trust Model", priority: "Critical" },
    { id: 9, title: "Error Model", priority: "Important" },
    { id: 10, title: "Observability", priority: "Important" },
    { id: 11, title: "Load & Limits", priority: "Critical" },
    { id: 12, title: "Simulation & Injection", priority: "Critical" },
    { id: 13, title: "Lifecycle & Compatibility", priority: "Optional" },
    { id: 14, title: "UI Integration Contract", priority: "Important" },
    { id: 15, title: "Final Compliance", priority: "Critical" },
  ];

  const currentGateInfo = gates[currentGate - 1];
  const progress = Math.round((currentGate / 15) * 100);

  const lucideIcons = [
    "zap", "clock", "calendar", "webhook", "mail", "database", 
    "file", "upload", "download", "bell", "user", "users",
    "settings", "activity", "trending-up", "bar-chart", "pie-chart",
    "globe", "server", "code"
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="text-2xl">⚡</span>
            <span>Create New Trigger Type</span>
            <span className={`ml-auto px-3 py-1 rounded text-sm ${
              currentGateInfo.priority === "Critical" ? "bg-red-500/20 text-red-400" :
              currentGateInfo.priority === "Important" ? "bg-yellow-500/20 text-yellow-400" :
              "bg-blue-500/20 text-blue-400"
            }`}>
              {currentGateInfo.priority}
            </span>
          </DialogTitle>
          <div className="text-sm text-muted-foreground">
            Gate {currentGate} of 15: {currentGateInfo.title}
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Gate Content */}
          <div className="space-y-4 p-6 bg-card/50 rounded-lg border">
            {currentGate === 1 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="triggerId">Trigger ID * (stable, unique identifier)</Label>
                  <Input
                    id="triggerId"
                    value={formData.triggerId}
                    onChange={(e) => setFormData({ ...formData, triggerId: e.target.value })}
                    placeholder="e.g., T1"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., HTTP Webhook Trigger"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="semanticVersion">Semantic Version *</Label>
                  <Input
                    id="semanticVersion"
                    value={formData.semanticVersion}
                    onChange={(e) => setFormData({ ...formData, semanticVersion: e.target.value })}
                    placeholder="1.0.0"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="owner">Owner *</Label>
                  <Input
                    id="owner"
                    value={formData.owner}
                    onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                    placeholder="team@company.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="icon">Icon (Lucide icon name)</Label>
                  <Select value={formData.icon} onValueChange={(value) => setFormData({ ...formData, icon: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {lucideIcons.map((icon) => (
                        <SelectItem key={icon} value={icon}>
                          {icon}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {currentGate === 2 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="purpose">Purpose * (What does this trigger do?)</Label>
                  <Textarea
                    id="purpose"
                    value={formData.purpose}
                    onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                    placeholder="Describe the trigger's purpose..."
                    rows={4}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Non-Goals * (What this trigger NEVER does)</Label>
                  <div className="p-4 bg-red-500/10 border border-red-500/30 rounded space-y-2">
                    {formData.nonGoals.map((goal, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                        <span className="text-sm">{goal}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Triggers MUST NOT mutate business data, send outbound messages, or execute workflow logic.
                  </p>
                </div>
              </>
            )}

            {currentGate === 3 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="category">Category *</Label>
                  <Select value={formData.category} onValueChange={handleCategoryChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="time">Time - Scheduled/cron triggers</SelectItem>
                      <SelectItem value="event">Event - External event listeners</SelectItem>
                      <SelectItem value="data">Data - Database change triggers</SelectItem>
                      <SelectItem value="user">User - User action triggers</SelectItem>
                      <SelectItem value="system">System - Internal system events</SelectItem>
                      <SelectItem value="integration">Integration - Third-party webhooks</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Auto-populates risk level and allowed side-effects based on category.
                  </p>
                </div>
              </>
            )}

            {currentGate === 4 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="eventInputSchema">Event Input Schema * (JSON Schema)</Label>
                  <Textarea
                    id="eventInputSchema"
                    value={formData.eventInputSchema}
                    onChange={(e) => setFormData({ ...formData, eventInputSchema: e.target.value })}
                    placeholder='{"type": "object", "properties": {...}}'
                    rows={6}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Strict schema for inbound event validation.
                  </p>
                </div>
              </>
            )}

            {currentGate === 5 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="workflowContextSchema">Workflow Context Output Schema * (JSON Schema)</Label>
                  <Textarea
                    id="workflowContextSchema"
                    value={formData.workflowContextSchema}
                    onChange={(e) => setFormData({ ...formData, workflowContextSchema: e.target.value })}
                    placeholder='{"type": "object", "properties": {...}}'
                    rows={6}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Output becomes immutable workflow input context.
                  </p>
                </div>
              </>
            )}

            {currentGate === 6 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="ingestionMode">Ingestion Mode *</Label>
                  <Select value={formData.ingestionMode} onValueChange={(value: any) => setFormData({ ...formData, ingestionMode: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="event">Event - Push-based (webhooks)</SelectItem>
                      <SelectItem value="poll">Poll - Pull-based (polling)</SelectItem>
                      <SelectItem value="schedule">Schedule - Time-based (cron)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deduplicationEnabled">
                    <input
                      type="checkbox"
                      id="deduplicationEnabled"
                      checked={formData.deduplicationEnabled}
                      onChange={(e) => setFormData({ ...formData, deduplicationEnabled: e.target.checked })}
                      className="mr-2"
                    />
                    Enable Deduplication
                  </Label>
                </div>
                {formData.deduplicationEnabled && (
                  <div className="space-y-2">
                    <Label htmlFor="deduplicationKey">Deduplication Key</Label>
                    <Input
                      id="deduplicationKey"
                      value={formData.deduplicationKey}
                      onChange={(e) => setFormData({ ...formData, deduplicationKey: e.target.value })}
                      placeholder="event.id"
                    />
                  </div>
                )}
                {formData.ingestionMode === "poll" && (
                  <div className="space-y-2">
                    <Label htmlFor="pollingInterval">Polling Interval (milliseconds)</Label>
                    <Input
                      type="number"
                      id="pollingInterval"
                      value={formData.pollingInterval}
                      onChange={(e) => setFormData({ ...formData, pollingInterval: parseInt(e.target.value) })}
                      placeholder="60000"
                    />
                  </div>
                )}
              </>
            )}

            {currentGate === 7 && (
              <>
                <div className="space-y-2">
                  <Label>Side-Effects * (Strictly Limited)</Label>
                  <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded space-y-2">
                    <p className="text-sm font-medium">Allowed Side-Effects:</p>
                    {formData.sideEffects.map((effect, idx) => (
                      <div key={idx} className="text-sm">• {effect}</div>
                    ))}
                  </div>
                  <p className="text-xs text-red-400">
                    ⚠️ FORBIDDEN: database_write, file_write, external_send, external_api_call
                  </p>
                </div>
              </>
            )}

            {currentGate === 8 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="authenticationType">Authentication Type *</Label>
                  <Select value={formData.authenticationType} onValueChange={(value: any) => setFormData({ ...formData, authenticationType: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="hmac">HMAC</SelectItem>
                      <SelectItem value="jwt">JWT</SelectItem>
                      <SelectItem value="mTLS">mTLS</SelectItem>
                      <SelectItem value="api_key">API Key</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sourceVerification">
                    <input
                      type="checkbox"
                      id="sourceVerification"
                      checked={formData.sourceVerification}
                      onChange={(e) => setFormData({ ...formData, sourceVerification: e.target.checked })}
                      className="mr-2"
                    />
                    Enable Source Verification
                  </Label>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxEventsPerMinute">Max Events Per Minute (Rate Limit)</Label>
                  <Input
                    type="number"
                    id="maxEventsPerMinute"
                    value={formData.maxEventsPerMinute}
                    onChange={(e) => setFormData({ ...formData, maxEventsPerMinute: parseInt(e.target.value) })}
                  />
                </div>
              </>
            )}

            {currentGate === 9 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="errorTaxonomy">Error Taxonomy * (Machine-readable error types)</Label>
                  <Textarea
                    id="errorTaxonomy"
                    value={formData.errorTaxonomy.join("\n")}
                    onChange={(e) => setFormData({ ...formData, errorTaxonomy: e.target.value.split("\n").filter(Boolean) })}
                    placeholder="INVALID_PAYLOAD&#10;AUTH_FAILED&#10;RATE_LIMITED"
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">
                    One error type per line.
                  </p>
                </div>
              </>
            )}

            {currentGate === 10 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="observabilityConfig">Observability Config * (JSON)</Label>
                  <Textarea
                    id="observabilityConfig"
                    value={formData.observabilityConfig}
                    onChange={(e) => setFormData({ ...formData, observabilityConfig: e.target.value })}
                    placeholder='{"logging": true, "metrics": true, "tracing": false}'
                    rows={4}
                    className="font-mono text-sm"
                  />
                </div>
              </>
            )}

            {currentGate === 11 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="maxPayloadKb">Max Payload Size (KB) *</Label>
                  <Input
                    type="number"
                    id="maxPayloadKb"
                    value={formData.maxPayloadKb}
                    onChange={(e) => setFormData({ ...formData, maxPayloadKb: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxEventsPerSecond">Max Events Per Second *</Label>
                  <Input
                    type="number"
                    id="maxEventsPerSecond"
                    value={formData.maxEventsPerSecond}
                    onChange={(e) => setFormData({ ...formData, maxEventsPerSecond: parseInt(e.target.value) })}
                  />
                </div>
              </>
            )}

            {currentGate === 12 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="supportsDryRun">
                    <input
                      type="checkbox"
                      id="supportsDryRun"
                      checked={formData.supportsDryRun}
                      onChange={(e) => setFormData({ ...formData, supportsDryRun: e.target.checked })}
                      className="mr-2"
                    />
                    Supports Dry Run * (MANDATORY)
                  </Label>
                  <p className="text-xs text-red-400">
                    ⚠️ All triggers MUST support simulation for testing.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="eventStub">Event Stub * (Sample event for testing - JSON)</Label>
                  <Textarea
                    id="eventStub"
                    value={formData.eventStub}
                    onChange={(e) => setFormData({ ...formData, eventStub: e.target.value })}
                    placeholder='{"payload": {...}, "headers": {...}}'
                    rows={6}
                    className="font-mono text-sm"
                  />
                </div>
              </>
            )}

            {currentGate === 13 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="replacementTriggerId">Replacement Trigger ID (if deprecated)</Label>
                  <Input
                    id="replacementTriggerId"
                    value={formData.replacementTriggerId}
                    onChange={(e) => setFormData({ ...formData, replacementTriggerId: e.target.value })}
                    placeholder="T2"
                  />
                </div>
              </>
            )}

            {currentGate === 14 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="uiIntegrationSpec">UI Integration Spec * (JSON)</Label>
                  <Textarea
                    id="uiIntegrationSpec"
                    value={formData.uiIntegrationSpec}
                    onChange={(e) => setFormData({ ...formData, uiIntegrationSpec: e.target.value })}
                    placeholder='{"fields": [...], "layout": "vertical"}'
                    rows={6}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Full UI rendering specification for workflow builder.
                  </p>
                </div>
              </>
            )}

            {currentGate === 15 && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="riskLevel">Risk Level *</Label>
                  <Select value={formData.riskLevel} onValueChange={(value: any) => setFormData({ ...formData, riskLevel: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Auto-populated based on category. High/Critical risk requires admin approval.
                  </p>
                </div>
                <div className="p-4 bg-green-500/10 border border-green-500/30 rounded">
                  <p className="text-sm font-medium text-green-400">✓ Ready to Submit</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    All critical gates completed. Click "Submit for Approval" to create trigger type.
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Navigation */}
          <div className="flex justify-between gap-4">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={currentGate === 1}
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Previous
            </Button>

            <Button
              variant="outline"
              onClick={handleSaveDraft}
            >
              <Save className="w-4 h-4 mr-2" />
              Save Draft
            </Button>

            {currentGate < 15 ? (
              <Button onClick={handleNext}>
                Next
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={createTriggerMutation.isPending}>
                {createTriggerMutation.isPending ? "Submitting..." : "Submit for Approval"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
