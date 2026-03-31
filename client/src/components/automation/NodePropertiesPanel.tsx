/**
 * NodePropertiesPanel — Right-side panel for configuring selected nodes.
 *
 * Opens when a node is selected on the Designer canvas.
 * Shows type-specific configuration fields with validation.
 */

import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { X, Trash2, Settings2, Zap, GitBranch, Globe, Brain, Shield, Clock, FileText } from "lucide-react";
import type { Node } from "reactflow";

// ── Types ────────────────────────────────────────────────

interface NodeConfig {
  url?: string;
  method?: string;
  headers?: string;
  body?: string;
  timeout?: number;
  condition?: string;
  operator?: string;
  value?: string;
  expression?: string;
  delayMs?: number;
  provider?: string;
  model?: string;
  systemPrompt?: string;
  userPrompt?: string;
  temperature?: number;
  approvers?: string;
  logMessage?: string;
  cron?: string;
  timezone?: string;
  to?: string;
  subject?: string;
  [key: string]: any;
}

interface NodePropertiesPanelProps {
  node: Node | null;
  onClose: () => void;
  onUpdateNode: (nodeId: string, data: Partial<Node["data"]>) => void;
  onDeleteNode?: (nodeId: string) => void;
}

// ── Operator Options ─────────────────────────────────────

const OPERATORS = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Not Equals" },
  { value: "contains", label: "Contains" },
  { value: "greater_than", label: "Greater Than" },
  { value: "less_than", label: "Less Than" },
  { value: "is_empty", label: "Is Empty" },
  { value: "is_not_empty", label: "Is Not Empty" },
];

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

// ── Category Icons ───────────────────────────────────────

const TYPE_ICONS: Record<string, any> = {
  manual_trigger: Zap,
  schedule_trigger: Clock,
  webhook_trigger: Globe,
  event_trigger: Zap,
  http_request: Globe,
  db_query: FileText,
  transform: GitBranch,
  send_email: FileText,
  call_api: Globe,
  run_script: FileText,
  if_else: GitBranch,
  switch: GitBranch,
  loop: GitBranch,
  delay: Clock,
  merge: GitBranch,
  llm_prompt: Brain,
  rag_query: Brain,
  doc_extract: Brain,
  classify: Brain,
  summarize: Brain,
  approval: Shield,
  policy_check: Shield,
  audit_log: Shield,
  human_review: Shield,
  escalation: Shield,
  log_message: FileText,
};

// ── Field Components ─────────────────────────────────────

function FieldLabel({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="mb-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      {hint && <span className="text-[10px] text-muted-foreground/60 ml-1">({hint})</span>}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────

export function NodePropertiesPanel({ node, onClose, onUpdateNode, onDeleteNode }: NodePropertiesPanelProps) {
  const [config, setConfig] = useState<NodeConfig>({});
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (node) {
      setLabel(node.data.label || "");
      setDescription(node.data.description || "");
      setConfig(node.data.config || {});
    }
  }, [node?.id]);

  if (!node) return null;

  const nodeType = node.data.nodeType || "action";
  const Icon = TYPE_ICONS[nodeType] || Settings2;

  const updateConfig = (key: string, value: any) => {
    const newConfig = { ...config, [key]: value };
    setConfig(newConfig);
    onUpdateNode(node.id, { config: newConfig });
  };

  const updateLabel = (val: string) => {
    setLabel(val);
    onUpdateNode(node.id, { label: val });
  };

  const updateDescription = (val: string) => {
    setDescription(val);
    onUpdateNode(node.id, { description: val });
  };

  // ── Type-specific config sections ──────────────────────

  const renderHttpConfig = () => (
    <>
      <FieldLabel label="Method" />
      <Select value={config.method || "GET"} onValueChange={(v) => updateConfig("method", v)}>
        <SelectTrigger className="h-7 text-xs mb-2"><SelectValue /></SelectTrigger>
        <SelectContent>
          {HTTP_METHODS.map((m) => <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>)}
        </SelectContent>
      </Select>
      <FieldLabel label="URL" hint="supports {{step.field}}" />
      <Input className="h-7 text-xs mb-2" placeholder="https://api.example.com/data" value={config.url || ""} onChange={(e) => updateConfig("url", e.target.value)} />
      <FieldLabel label="Headers" hint="JSON" />
      <Textarea className="text-xs min-h-[40px] mb-2" placeholder='{"Authorization": "Bearer ..."}' value={config.headers || ""} onChange={(e) => updateConfig("headers", e.target.value)} />
      {config.method !== "GET" && (
        <>
          <FieldLabel label="Body" />
          <Textarea className="text-xs min-h-[40px] mb-2" placeholder='{"key": "value"}' value={config.body || ""} onChange={(e) => updateConfig("body", e.target.value)} />
        </>
      )}
      <FieldLabel label="Timeout (ms)" />
      <Input className="h-7 text-xs" type="number" placeholder="30000" value={config.timeout || ""} onChange={(e) => updateConfig("timeout", parseInt(e.target.value) || 30000)} />
    </>
  );

  const renderIfElseConfig = () => (
    <>
      <FieldLabel label="Condition" hint="{{step.field}} reference" />
      <Input className="h-7 text-xs mb-2" placeholder="{{request.amount}}" value={config.condition || ""} onChange={(e) => updateConfig("condition", e.target.value)} />
      <FieldLabel label="Operator" />
      <Select value={config.operator || "equals"} onValueChange={(v) => updateConfig("operator", v)}>
        <SelectTrigger className="h-7 text-xs mb-2"><SelectValue /></SelectTrigger>
        <SelectContent>
          {OPERATORS.map((op) => <SelectItem key={op.value} value={op.value} className="text-xs">{op.label}</SelectItem>)}
        </SelectContent>
      </Select>
      <FieldLabel label="Value" />
      <Input className="h-7 text-xs" placeholder="expected value" value={config.value || ""} onChange={(e) => updateConfig("value", e.target.value)} />
    </>
  );

  const renderLlmConfig = () => (
    <>
      <FieldLabel label="Provider" />
      <Select value={config.provider || "openai"} onValueChange={(v) => updateConfig("provider", v)}>
        <SelectTrigger className="h-7 text-xs mb-2"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="openai" className="text-xs">OpenAI</SelectItem>
          <SelectItem value="anthropic" className="text-xs">Anthropic</SelectItem>
          <SelectItem value="ollama" className="text-xs">Ollama</SelectItem>
          <SelectItem value="sandbox" className="text-xs">Sandbox (Mock)</SelectItem>
        </SelectContent>
      </Select>
      <FieldLabel label="Model" />
      <Input className="h-7 text-xs mb-2" placeholder="gpt-4" value={config.model || ""} onChange={(e) => updateConfig("model", e.target.value)} />
      <FieldLabel label="System Prompt" />
      <Textarea className="text-xs min-h-[40px] mb-2" placeholder="You are a helpful assistant..." value={config.systemPrompt || ""} onChange={(e) => updateConfig("systemPrompt", e.target.value)} />
      <FieldLabel label="User Prompt" hint="supports {{step.field}}" />
      <Textarea className="text-xs min-h-[60px] mb-2" placeholder="Analyze this: {{extract.result}}" value={config.userPrompt || ""} onChange={(e) => updateConfig("userPrompt", e.target.value)} />
      <FieldLabel label="Temperature" />
      <Input className="h-7 text-xs" type="number" step="0.1" min="0" max="2" placeholder="0.7" value={config.temperature || ""} onChange={(e) => updateConfig("temperature", parseFloat(e.target.value) || 0.7)} />
    </>
  );

  const renderDelayConfig = () => (
    <>
      <FieldLabel label="Delay (ms)" hint="max 10000" />
      <Input className="h-7 text-xs" type="number" placeholder="1000" value={config.delayMs || ""} onChange={(e) => updateConfig("delayMs", parseInt(e.target.value) || 1000)} />
    </>
  );

  const renderApprovalConfig = () => (
    <>
      <FieldLabel label="Approvers" hint="user/role" />
      <Input className="h-7 text-xs mb-2" placeholder="manager, director" value={config.approvers || ""} onChange={(e) => updateConfig("approvers", e.target.value)} />
      <FieldLabel label="Timeout (hours)" />
      <Input className="h-7 text-xs mb-2" type="number" placeholder="24" value={config.timeoutHours || ""} onChange={(e) => updateConfig("timeoutHours", parseInt(e.target.value) || 24)} />
      <FieldLabel label="Escalation" />
      <Input className="h-7 text-xs" placeholder="vp@company.com" value={config.escalation || ""} onChange={(e) => updateConfig("escalation", e.target.value)} />
    </>
  );

  const renderTransformConfig = () => (
    <>
      <FieldLabel label="Expression" hint="supports {{step.field}}" />
      <Textarea className="text-xs min-h-[60px]" placeholder="normalize({{extract.data}})" value={config.expression || ""} onChange={(e) => updateConfig("expression", e.target.value)} />
    </>
  );

  const renderScheduleConfig = () => (
    <>
      <FieldLabel label="Cron Expression" />
      <Input className="h-7 text-xs mb-2" placeholder="0 8 * * *" value={config.cron || ""} onChange={(e) => updateConfig("cron", e.target.value)} />
      <FieldLabel label="Timezone" />
      <Input className="h-7 text-xs" placeholder="UTC" value={config.timezone || ""} onChange={(e) => updateConfig("timezone", e.target.value)} />
    </>
  );

  const renderEmailConfig = () => (
    <>
      <FieldLabel label="To" hint="supports {{step.field}}" />
      <Input className="h-7 text-xs mb-2" placeholder="team@company.com" value={config.to || ""} onChange={(e) => updateConfig("to", e.target.value)} />
      <FieldLabel label="Subject" />
      <Input className="h-7 text-xs mb-2" placeholder="Notification" value={config.subject || ""} onChange={(e) => updateConfig("subject", e.target.value)} />
      <FieldLabel label="Body" />
      <Textarea className="text-xs min-h-[40px]" placeholder="{{step.message}}" value={config.body || ""} onChange={(e) => updateConfig("body", e.target.value)} />
    </>
  );

  const renderLogConfig = () => (
    <>
      <FieldLabel label="Log Message" hint="supports {{step.field}}" />
      <Textarea className="text-xs min-h-[40px]" placeholder="Step completed: {{result}}" value={config.logMessage || ""} onChange={(e) => updateConfig("logMessage", e.target.value)} />
    </>
  );

  const renderConfig = () => {
    switch (nodeType) {
      case "http_request":
      case "call_api":
        return renderHttpConfig();
      case "if_else":
      case "switch":
        return renderIfElseConfig();
      case "llm_prompt":
      case "rag_query":
      case "classify":
      case "summarize":
      case "doc_extract":
        return renderLlmConfig();
      case "delay":
        return renderDelayConfig();
      case "approval":
      case "human_review":
        return renderApprovalConfig();
      case "transform":
      case "run_script":
        return renderTransformConfig();
      case "schedule_trigger":
        return renderScheduleConfig();
      case "send_email":
        return renderEmailConfig();
      case "log_message":
      case "audit_log":
        return renderLogConfig();
      default:
        return (
          <p className="text-[10px] text-muted-foreground italic">
            No configuration needed for this node type.
          </p>
        );
    }
  };

  // Validation indicator
  const isConfigured = () => {
    switch (nodeType) {
      case "http_request":
      case "call_api":
        return !!(config.url);
      case "if_else":
        return !!(config.condition);
      case "llm_prompt":
        return !!(config.userPrompt);
      case "approval":
        return !!(config.approvers);
      case "schedule_trigger":
        return !!(config.cron);
      case "send_email":
        return !!(config.to);
      default:
        return true;
    }
  };

  return (
    <div className="w-72 border-l bg-background flex flex-col h-full shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-xs font-semibold truncate">Node Properties</span>
        </div>
        <div className="flex items-center gap-1">
          {isConfigured() ? (
            <Badge variant="outline" className="text-[9px] px-1 py-0 text-green-500 border-green-500/30">OK</Badge>
          ) : (
            <Badge variant="outline" className="text-[9px] px-1 py-0 text-yellow-500 border-yellow-500/30">Config</Badge>
          )}
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onClose}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {/* General Section */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">General</div>
            <FieldLabel label="Name" />
            <Input className="h-7 text-xs mb-2" value={label} onChange={(e) => updateLabel(e.target.value)} placeholder="Node name" />
            <FieldLabel label="Description" />
            <Textarea className="text-xs min-h-[40px] mb-2" value={description} onChange={(e) => updateDescription(e.target.value)} placeholder="What does this node do?" />
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span>Type:</span>
              <Badge variant="outline" className="text-[9px] px-1 py-0">{nodeType.replace(/_/g, " ")}</Badge>
            </div>
          </div>

          <Separator />

          {/* Parameters Section */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Parameters</div>
            {renderConfig()}
          </div>

          <Separator />

          {/* Data Section */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Data Reference</div>
            <p className="text-[10px] text-muted-foreground">
              Use <code className="bg-muted px-1 rounded">{"{{stepKey.field}}"}</code> to reference output from upstream nodes.
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              Use <code className="bg-muted px-1 rounded">{"{{var.name}}"}</code> for workflow variables.
            </p>
          </div>

          {onDeleteNode && (
            <>
              <Separator />
              <Button
                variant="outline"
                size="sm"
                className="w-full h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                onClick={() => onDeleteNode(node.id)}
              >
                <Trash2 className="h-3 w-3 mr-1.5" />
                Delete Node
              </Button>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
