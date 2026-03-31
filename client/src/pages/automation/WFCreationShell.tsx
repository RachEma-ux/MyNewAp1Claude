/**
 * WFCreationShell — Workflow Designer (Simple IBM Shell)
 *
 * Full implementation with:
 *   - Phase 1: 24+ node types across 6 categories
 *   - Phase 2: Node properties panel
 *   - Phase 3: Execution monitor
 *   - Phase 4: Data-aware edges
 *   - Phase 5: Templates, versioning, keyboard shortcuts, toasts
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useLocation, useRoute } from "wouter";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Trash2,
  Save,
  ArrowLeft,
  GripVertical,
  Workflow,
  GitBranch,
  Plug,
  Brain,
  Shield,
  WifiOff,
  LayoutDashboard,
  Loader2,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Play,
  PenTool,
  FileText,
  Zap,
  Eye,
  Gauge,
  BarChart3,
  FolderOpen,
  FlaskConical,
  Rocket,
  Upload,
  Globe,
  Clock,
  Mail,
  Terminal,
  Repeat,
  Merge,
  Search,
  ChevronDown,
  ChevronRight,
  History,
  LayoutTemplate,
  Keyboard,
} from "lucide-react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";

import { NodePropertiesPanel } from "@/components/automation/NodePropertiesPanel";
import { ExecutionMonitor } from "@/components/automation/ExecutionMonitor";

// ── Constants ────────────────────────────────────────────

const CATEGORIES = [
  { key: "decision", label: "Decision Engine", icon: GitBranch },
  { key: "integration", label: "Integrations", icon: Plug },
  { key: "ai", label: "AI Intelligence", icon: Brain },
  { key: "governance", label: "Governance", icon: Shield },
  { key: "offline", label: "Offline Exec", icon: WifiOff },
  { key: "canvas", label: "Canvas Builder", icon: LayoutDashboard },
];

const STATUS_OPTIONS = [
  { key: "draft", label: "Draft" },
  { key: "running", label: "Running" },
  { key: "completed", label: "Completed" },
  { key: "failed", label: "Failed" },
];

const STEP_STATUSES = [
  { key: "pending", label: "Pending", icon: Circle, color: "text-muted-foreground" },
  { key: "running", label: "Running", icon: Play, color: "text-blue-500" },
  { key: "done", label: "Done", icon: CheckCircle2, color: "text-green-500" },
  { key: "failed", label: "Failed", icon: AlertTriangle, color: "text-red-500" },
];

interface StepDraft {
  key: string;
  label: string;
  description: string;
  status: string;
}

// ── Form Actions ─────────────────────────────────────────

const FORM_ACTIONS = [
  { key: "new", label: "New Form", icon: Plus, color: "text-blue-400" },
  { key: "open", label: "Open", icon: FolderOpen, color: "text-yellow-400" },
  { key: "save", label: "Save", icon: Save, color: "text-green-400" },
  { key: "test", label: "Test", icon: FlaskConical, color: "text-orange-400" },
  { key: "run", label: "Run", icon: Play, color: "text-cyan-400" },
  { key: "publish", label: "Publish", icon: Upload, color: "text-purple-400" },
];

// ── Phase 1: Real Workflow Node Types (6 categories, 24+ types) ─────────

interface NodeTypeDefinition {
  type: string;
  label: string;
  icon: any;
  color: string;
  category: "triggers" | "actions" | "logic" | "ai" | "integrations" | "governance";
}

const NODE_TYPES: NodeTypeDefinition[] = [
  // Triggers
  { type: "manual_trigger", label: "Manual Trigger", icon: Zap, color: "#facc15", category: "triggers" },
  { type: "schedule_trigger", label: "Schedule (Cron)", icon: Clock, color: "#facc15", category: "triggers" },
  { type: "webhook_trigger", label: "Webhook", icon: Globe, color: "#facc15", category: "triggers" },
  { type: "event_trigger", label: "Event Listener", icon: Zap, color: "#facc15", category: "triggers" },
  // Actions
  { type: "http_request", label: "HTTP Request", icon: Globe, color: "#60a5fa", category: "actions" },
  { type: "db_query", label: "Database Query", icon: LayoutDashboard, color: "#60a5fa", category: "actions" },
  { type: "transform", label: "Transform Data", icon: Repeat, color: "#60a5fa", category: "actions" },
  { type: "send_email", label: "Send Email", icon: Mail, color: "#60a5fa", category: "actions" },
  { type: "call_api", label: "Call API", icon: Plug, color: "#60a5fa", category: "actions" },
  { type: "run_script", label: "Run Script", icon: Terminal, color: "#60a5fa", category: "actions" },
  // Logic
  { type: "if_else", label: "If/Else Branch", icon: GitBranch, color: "#fb923c", category: "logic" },
  { type: "switch", label: "Switch", icon: GitBranch, color: "#fb923c", category: "logic" },
  { type: "loop", label: "Loop (ForEach)", icon: Repeat, color: "#fb923c", category: "logic" },
  { type: "delay", label: "Wait/Delay", icon: Clock, color: "#fb923c", category: "logic" },
  { type: "merge", label: "Merge", icon: Merge, color: "#fb923c", category: "logic" },
  // AI
  { type: "llm_prompt", label: "LLM Prompt", icon: Brain, color: "#a78bfa", category: "ai" },
  { type: "rag_query", label: "RAG Query", icon: Search, color: "#a78bfa", category: "ai" },
  { type: "doc_extract", label: "Document Extract", icon: FileText, color: "#a78bfa", category: "ai" },
  { type: "classify", label: "Classify", icon: Brain, color: "#a78bfa", category: "ai" },
  { type: "summarize", label: "Summarize", icon: FileText, color: "#a78bfa", category: "ai" },
  // Integrations
  { type: "slack", label: "Slack", icon: Plug, color: "#4ade80", category: "integrations" },
  { type: "jira", label: "Jira", icon: Plug, color: "#4ade80", category: "integrations" },
  { type: "github", label: "GitHub", icon: Plug, color: "#4ade80", category: "integrations" },
  { type: "custom_connector", label: "Custom Connector", icon: Plug, color: "#4ade80", category: "integrations" },
  // Governance
  { type: "approval", label: "Approval Gate", icon: Shield, color: "#f472b6", category: "governance" },
  { type: "policy_check", label: "Policy Check", icon: Shield, color: "#f472b6", category: "governance" },
  { type: "audit_log", label: "Audit Log", icon: Eye, color: "#f472b6", category: "governance" },
  { type: "human_review", label: "Human Review", icon: Shield, color: "#f472b6", category: "governance" },
  { type: "escalation", label: "Escalation", icon: AlertTriangle, color: "#f472b6", category: "governance" },
  { type: "log_message", label: "Log Message", icon: Terminal, color: "#f472b6", category: "governance" },
];

const NODE_CATEGORIES = [
  { key: "triggers", label: "Triggers", icon: Zap, color: "#facc15" },
  { key: "actions", label: "Actions", icon: Globe, color: "#60a5fa" },
  { key: "logic", label: "Logic", icon: GitBranch, color: "#fb923c" },
  { key: "ai", label: "AI", icon: Brain, color: "#a78bfa" },
  { key: "integrations", label: "Integrations", icon: Plug, color: "#4ade80" },
  { key: "governance", label: "Governance", icon: Shield, color: "#f472b6" },
];

// ── n8n-style Custom Node ────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  pending: "#64748b",
  running: "#3b82f6",
  done: "#22c55e",
  failed: "#ef4444",
};

function N8nNode({ data, selected }: NodeProps) {
  const nodeDef = NODE_TYPES.find((t) => t.type === data.nodeType);
  const Icon = nodeDef?.icon || Workflow;
  const nodeColor = nodeDef?.color || "#64748b";
  const statusColor = STATUS_COLORS[data.status] || "#64748b";
  const hasConfig = data.config && Object.keys(data.config).length > 0;

  return (
    <div
      className={cn(
        "rounded-lg border-2 bg-card shadow-md min-w-[160px] transition-all",
        selected ? "ring-2 ring-primary shadow-lg" : "",
        !hasConfig && data.nodeType !== "manual_trigger" && data.nodeType !== "log_message" ? "border-dashed" : "",
      )}
      style={{ borderColor: nodeColor }}
    >
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !border-2 !border-background" style={{ background: nodeColor }} />
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-t-md" style={{ background: `${nodeColor}20` }}>
        <Icon className="h-4 w-4 shrink-0" style={{ color: nodeColor }} />
        <span className="text-xs font-semibold truncate">{data.label || "Untitled"}</span>
        {hasConfig && <CheckCircle2 className="h-3 w-3 shrink-0 text-green-500 ml-auto" />}
      </div>
      {/* Body */}
      <div className="px-3 py-2">
        <p className="text-[10px] text-muted-foreground line-clamp-2">{data.description || nodeDef?.label || "No description"}</p>
        <div className="flex items-center gap-1.5 mt-1.5">
          <div className="h-2 w-2 rounded-full" style={{ background: statusColor }} />
          <span className="text-[10px] capitalize text-muted-foreground">{data.status}</span>
          <Badge variant="outline" className="text-[8px] px-1 py-0 ml-auto capitalize">{(data.nodeType || "").replace(/_/g, " ")}</Badge>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!w-3 !h-3 !border-2 !border-background" style={{ background: nodeColor }} />
    </div>
  );
}

const nodeTypes = { n8nNode: N8nNode };

// ── Mobile hook ──────────────────────────────────────────

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false,
  );
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);
  return isMobile;
}

// ── Main Component ───────────────────────────────────────

export default function WFCreationShell() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/automation/sandbox-wf/:id");
  const urlId = params?.id ? parseInt(params.id, 10) : null;
  const urlEditMode = urlId !== null && !isNaN(urlId);

  const [savedId, setSavedId] = useState<number | null>(null);
  const editId = savedId ?? (urlEditMode ? urlId : null);
  const isEditMode = editId !== null;

  const isMobile = useIsMobile();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(isMobile);
  const collapsed = sidebarCollapsed;
  const [mode, setMode] = useState<"form" | "designer">("form");
  const [loaded, setLoaded] = useState(false);
  const [showOpenPicker, setShowOpenPicker] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [showMonitor, setShowMonitor] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveCategory, setSaveCategory] = useState("decision");
  const [paletteSearch, setPaletteSearch] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({ triggers: true, actions: true, logic: true, ai: true, integrations: true, governance: true });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeExecutionId, setActiveExecutionId] = useState<number | null>(null);

  // ── Form State ─────────────────────────────────────────

  const [name, setName] = useState("");
  const [category, setCategory] = useState("decision");
  const [status, setStatus] = useState("draft");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [steps, setSteps] = useState<StepDraft[]>([
    { key: "step-1", label: "", description: "", status: "pending" },
  ]);
  const [selectedStepIdx, setSelectedStepIdx] = useState(0);

  // ── tRPC ───────────────────────────────────────────────

  const utils = trpc.useUtils();
  const triggersQuery = trpc.sandboxWf.triggers.list.useQuery({});
  const triggers = triggersQuery.data ?? [];
  const allWorkflowsQuery = trpc.sandboxWf.workflows.list.useQuery({});
  const allWorkflows = allWorkflowsQuery.data ?? [];
  const templatesQuery = trpc.sandboxWf.templates.list.useQuery();
  const templates = templatesQuery.data ?? [];
  const versionsQuery = trpc.sandboxWf.versions.list.useQuery(
    { workflowId: editId! },
    { enabled: isEditMode },
  );
  const versions = versionsQuery.data ?? [];

  const workflowQuery = trpc.sandboxWf.workflows.get.useQuery(
    { id: editId! },
    { enabled: isEditMode },
  );

  // Populate form on load
  useEffect(() => {
    if (isEditMode && workflowQuery.data && !loaded) {
      const wf = workflowQuery.data;
      setName(wf.name);
      setCategory(wf.category);
      setStatus(wf.status);
      setDescription(wf.description || "");
      setTags((wf.tags as string[] || []).join(", "));
      if (wf.steps && wf.steps.length > 0) {
        setSteps(
          wf.steps.map((s: any) => ({
            key: s.key,
            label: s.label,
            description: s.description || "",
            status: s.status,
          })),
        );
      }
      setLoaded(true);
    }
  }, [isEditMode, workflowQuery.data, loaded]);

  // ── ReactFlow State ────────────────────────────────────

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true, markerEnd: { type: MarkerType.ArrowClosed } }, eds)),
    [setEdges],
  );

  // ── Reset form ─────────────────────────────────────────

  const resetForm = useCallback(() => {
    setName("");
    setCategory("decision");
    setStatus("draft");
    setDescription("");
    setTags("");
    setSteps([{ key: "step-1", label: "", description: "", status: "pending" }]);
    setSelectedStepIdx(0);
    setNodes([]);
    setEdges([]);
    setLoaded(false);
    setSavedId(null);
    setShowOpenPicker(false);
    setSelectedNodeId(null);
    setMode("designer");
  }, [setNodes, setEdges]);

  // ── Node selection ─────────────────────────────────────

  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find((n) => n.id === selectedNodeId) || null;
  }, [selectedNodeId, nodes]);

  const handleUpdateNode = useCallback((nodeId: string, data: Partial<Node["data"]>) => {
    setNodes((nds) =>
      nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n),
    );
  }, [setNodes]);

  // Sync steps → nodes when switching to designer
  useEffect(() => {
    if (mode === "designer" && steps.some((s) => s.label.trim())) {
      const newNodes: Node[] = steps.map((step, idx) => ({
        id: step.key,
        type: "n8nNode",
        position: { x: 80 + idx * 220, y: 120 + (idx % 2) * 80 },
        data: {
          label: step.label || `Step ${idx + 1}`,
          description: step.description,
          status: step.status,
          nodeType: idx === 0 ? "manual_trigger" : "transform",
          config: {},
        },
      }));
      const newEdges: Edge[] = steps.slice(1).map((step, idx) => ({
        id: `e-${steps[idx].key}-${step.key}`,
        source: steps[idx].key,
        target: step.key,
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: "#64748b" },
      }));
      setNodes(newNodes);
      setEdges(newEdges);
    }
  }, [mode]);

  // Sync nodes → steps
  const syncNodesToSteps = useCallback(() => {
    if (nodes.length === 0) return;
    const updated = nodes.map((node) => ({
      key: node.id,
      label: node.data.label || "",
      description: node.data.description || "",
      status: node.data.status || "pending",
    }));
    setSteps(updated);
  }, [nodes]);

  // ── Mutations ──────────────────────────────────────────

  const createMutation = trpc.sandboxWf.workflows.create.useMutation({
    onSuccess: (data) => {
      utils.sandboxWf.invalidate();
      if (data?.id) {
        setSavedId(data.id);
        setLoaded(true);
        toast.success("Workflow saved as draft");
      }
    },
    onError: (e) => toast.error(e.message),
  });
  const updateMutation = trpc.sandboxWf.workflows.update.useMutation({
    onSuccess: () => {
      utils.sandboxWf.invalidate();
      toast.success("Workflow updated");
    },
    onError: (e) => toast.error(e.message),
  });
  const executeMutation = trpc.sandboxWf.executions.create.useMutation({
    onSuccess: (data) => {
      utils.sandboxWf.invalidate();
      if (data) {
        setActiveExecutionId(data.id);
        setShowMonitor(true);
        toast.success(`Execution #${data.id} started`);
      }
    },
    onError: (e) => toast.error(`Execution failed: ${e.message}`),
  });
  const versionMutation = trpc.sandboxWf.versions.create.useMutation({
    onSuccess: () => {
      utils.sandboxWf.invalidate();
      toast.success("Version saved");
    },
    onError: (e) => toast.error(e.message),
  });
  const templateMutation = trpc.sandboxWf.templates.createFrom.useMutation({
    onSuccess: (data: any) => {
      utils.sandboxWf.invalidate();
      if (data?.id) {
        setSavedId(data.id);
        setName(data.name || "");
        setCategory(data.category || "decision");
        setStatus(data.status || "draft");
        setDescription(data.description || "");
        setTags((data.tags as string[] || []).join(", "));
        if (data.steps && data.steps.length > 0) {
          setSteps(
            data.steps.map((s: any) => ({
              key: s.key,
              label: s.label,
              description: s.description || "",
              status: s.status || "pending",
            })),
          );
        }
        setLoaded(true);
        setShowTemplates(false);
        toast.success("Created from template");
      }
    },
    onError: (e) => toast.error(e.message),
  });

  // ── Step Handlers ──────────────────────────────────────

  const addStep = () => {
    const idx = steps.length + 1;
    setSteps([...steps, { key: `step-${idx}`, label: "", description: "", status: "pending" }]);
    setSelectedStepIdx(steps.length);
  };

  const removeStep = (idx: number) => {
    if (steps.length <= 1) return;
    const next = steps.filter((_, i) => i !== idx);
    setSteps(next);
    if (selectedStepIdx >= next.length) setSelectedStepIdx(next.length - 1);
  };

  const updateStep = (idx: number, field: keyof StepDraft, value: string) => {
    const next = [...steps];
    next[idx] = { ...next[idx], [field]: value };
    if (field === "label") {
      next[idx].key = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `step-${idx + 1}`;
    }
    setSteps(next);
  };

  // ── Designer: add node from palette ────────────────────

  const addNodeFromPalette = (typeDef: NodeTypeDefinition) => {
    const id = `${typeDef.type}-${Date.now()}`;
    const newNode: Node = {
      id,
      type: "n8nNode",
      position: { x: 100 + Math.random() * 300, y: 100 + Math.random() * 200 },
      data: {
        label: typeDef.label,
        description: "",
        status: "pending",
        nodeType: typeDef.type,
        config: {},
      },
    };
    setNodes((nds) => [...nds, newNode]);
    toast(`Added ${typeDef.label} node`);
  };

  // ── Submit ─────────────────────────────────────────────

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const canSubmit = name.trim().length > 0 && steps.some((s) => s.label.trim().length > 0);

  const handleSubmit = () => {
    if (!canSubmit) return;
    if (isEditMode) {
      updateMutation.mutate({
        id: editId!,
        name: name.trim(),
        category,
        status,
        description: description.trim(),
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      // Auto-create version on save
      versionMutation.mutate({ workflowId: editId! });
    } else {
      createMutation.mutate({
        name: name.trim(),
        category,
        status,
        description: description.trim(),
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        steps: steps
          .filter((s) => s.label.trim().length > 0)
          .map((s) => ({
            key: s.key,
            label: s.label.trim(),
            description: s.description.trim(),
            status: s.status,
          })),
      });
    }
  };

  // ── Form action handler ────────────────────────────────

  const handleFormAction = (key: string) => {
    switch (key) {
      case "new":
        resetForm();
        if (isEditMode) navigate("/automation/sandbox-wf/new");
        break;
      case "open":
        setShowOpenPicker(!showOpenPicker);
        break;
      case "save":
        if (isEditMode) {
          handleSubmit();
        } else {
          setSaveName(name);
          setSaveCategory(category);
          setShowSaveDialog(true);
        }
        break;
      case "test":
        handleModeSwitch("designer");
        toast("Switched to Designer for testing");
        break;
      case "run":
        if (isEditMode) {
          executeMutation.mutate({ workflowId: editId!, triggerType: "manual" });
        } else {
          toast.error("Save the workflow first before running");
        }
        break;
      case "publish":
        if (isEditMode) {
          updateMutation.mutate({ id: editId!, status: "running" });
          toast.success("Workflow published");
        } else {
          toast.error("Save the workflow first before publishing");
        }
        break;
    }
    if (isMobile && key !== "open") setSidebarCollapsed(true);
  };

  // ── Save as Draft ──────────────────────────────────────

  const handleSaveAsDraft = () => {
    if (!saveName.trim()) return;
    if (mode === "designer") syncNodesToSteps();
    setName(saveName.trim());
    setCategory(saveCategory);
    setStatus("draft");
    createMutation.mutate({
      name: saveName.trim(),
      category: saveCategory,
      status: "draft",
      description: description.trim(),
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      steps: steps
        .filter((s) => s.label.trim().length > 0)
        .map((s) => ({
          key: s.key,
          label: s.label.trim(),
          description: s.description.trim(),
          status: s.status,
        })),
    });
    setShowSaveDialog(false);
  };

  const handleModeSwitch = (newMode: "form" | "designer") => {
    if (newMode === "form" && mode === "designer") syncNodesToSteps();
    setMode(newMode);
  };

  // ── Phase 5: Keyboard shortcuts ────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl+S: Save
      if (e.ctrlKey && e.key === "s") {
        e.preventDefault();
        handleFormAction("save");
      }
      // Ctrl+Enter: Run
      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        handleFormAction("run");
      }
      // Escape: Deselect / Close panel
      if (e.key === "Escape") {
        setSelectedNodeId(null);
        setShowMonitor(false);
      }
      // Delete: Remove selected node
      if ((e.key === "Delete" || e.key === "Backspace") && selectedNodeId && mode === "designer") {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
        setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
        setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
        setSelectedNodeId(null);
        toast("Node deleted");
      }
      // Ctrl+Shift+L: Toggle monitor
      if (e.ctrlKey && e.shiftKey && e.key === "L") {
        e.preventDefault();
        setShowMonitor((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedNodeId, mode, isEditMode, editId]);

  // ── Filtered palette ───────────────────────────────────

  const filteredTypes = useMemo(() => {
    if (!paletteSearch) return NODE_TYPES;
    const q = paletteSearch.toLowerCase();
    return NODE_TYPES.filter((t) => t.label.toLowerCase().includes(q) || t.type.includes(q) || t.category.includes(q));
  }, [paletteSearch]);

  const toggleCategory = (key: string) => {
    setExpandedCategories((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div
      className="flex -mx-6 -mt-6 overflow-hidden"
      style={{ height: "calc(100vh - 4rem)" }}
    >
      {/* ── Sidebar ──────────────────────────────────── */}
      <div
        className={cn(
          "border-r bg-background flex flex-col h-full transition-all duration-200 shrink-0",
          collapsed ? "w-12" : "w-56",
        )}
      >
        {/* Header + toggle */}
        <div className={cn(
          "flex items-center border-b shrink-0",
          collapsed ? "justify-center py-1.5" : "justify-between px-2 py-1.5",
        )}>
          {!collapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <Workflow className="h-3.5 w-3.5 shrink-0 text-blue-500" />
              <span className="text-xs font-semibold text-muted-foreground truncate">
                {mode === "form" ? "Steps" : "Nodes"}
              </span>
            </div>
          )}
          <Button
            variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className={collapsed ? "px-1 py-1" : "py-1"}>

            {/* ── Form mode sidebar: Steps list ── */}
            {mode === "form" && (
              <>
                {!collapsed && (
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Workflow Steps
                  </div>
                )}
                {steps.map((step, idx) => {
                  const stepStatus = STEP_STATUSES.find((s) => s.key === step.status);
                  const StepIcon = stepStatus?.icon || Circle;
                  return collapsed ? (
                    <button
                      key={idx}
                      onClick={() => setSelectedStepIdx(idx)}
                      title={step.label || `Step ${idx + 1}`}
                      className={cn(
                        "flex items-center justify-center w-full py-1.5 rounded-sm transition-colors",
                        selectedStepIdx === idx ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                      )}
                    >
                      <span className="text-[10px] font-mono">{idx + 1}</span>
                    </button>
                  ) : (
                    <button
                      key={idx}
                      onClick={() => setSelectedStepIdx(idx)}
                      className={cn(
                        "flex items-center gap-2 w-full px-3 py-1.5 text-xs rounded-sm transition-colors",
                        selectedStepIdx === idx ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                      )}
                    >
                      <StepIcon className={cn("h-3 w-3 shrink-0", stepStatus?.color)} />
                      <span className="truncate flex-1 text-left">{step.label || `Step ${idx + 1}`}</span>
                    </button>
                  );
                })}
                {!collapsed && (
                  <button onClick={addStep} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                    <Plus className="h-3 w-3 shrink-0" /><span>Add Step</span>
                  </button>
                )}
                {collapsed && (
                  <button onClick={addStep} title="Add Step" className="flex items-center justify-center w-full py-1.5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </>
            )}

            {/* ── Designer mode: Categorized Node Palette ── */}
            {mode === "designer" && (
              <>
                {!collapsed && (
                  <>
                    <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Node Palette
                    </div>
                    <div className="px-3 pb-1">
                      <Input
                        className="h-6 text-[10px]"
                        placeholder="Search nodes..."
                        value={paletteSearch}
                        onChange={(e) => setPaletteSearch(e.target.value)}
                      />
                    </div>
                  </>
                )}
                {NODE_CATEGORIES.map(({ key, label, icon: CatIcon, color }) => {
                  const catTypes = filteredTypes.filter((t) => t.category === key);
                  if (catTypes.length === 0) return null;
                  const isExpanded = expandedCategories[key];
                  return (
                    <div key={key}>
                      {!collapsed ? (
                        <button
                          onClick={() => toggleCategory(key)}
                          className="flex items-center gap-1.5 w-full px-3 py-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          <CatIcon className="h-3 w-3" style={{ color }} />
                          <span className="uppercase tracking-wider">{label}</span>
                          <Badge variant="outline" className="text-[8px] px-1 py-0 ml-auto">{catTypes.length}</Badge>
                        </button>
                      ) : (
                        <div className="py-0.5">
                          <div className="h-px bg-border mx-1" />
                        </div>
                      )}
                      {(isExpanded || collapsed) && catTypes.map((item) => {
                        const Icon = item.icon;
                        return collapsed ? (
                          <button
                            key={item.type}
                            onClick={() => addNodeFromPalette(item)}
                            title={item.label}
                            className="flex items-center justify-center w-full py-1.5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                          >
                            <Icon className="h-3.5 w-3.5" style={{ color: item.color }} />
                          </button>
                        ) : (
                          <button
                            key={item.type}
                            onClick={() => addNodeFromPalette(item)}
                            className="flex items-center gap-2 w-full px-3 pl-7 py-1 text-xs rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                          >
                            <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: item.color }} />
                            <span className="truncate text-[11px]">{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </>
            )}

            <Separator className="my-1.5" />

            {/* ── Form section ── */}
            {!collapsed && (
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Form
              </div>
            )}
            {FORM_ACTIONS.map(({ key, label, icon: Icon, color }) => (
              collapsed ? (
                <button key={key} onClick={() => handleFormAction(key)} title={label} className={cn("flex items-center justify-center w-full py-1.5 rounded-sm transition-colors text-muted-foreground hover:text-foreground hover:bg-muted/50")}>
                  <Icon className={cn("h-3.5 w-3.5", color)} />
                </button>
              ) : (
                <button key={key} onClick={() => handleFormAction(key)} className={cn("flex items-center gap-2 w-full px-3 py-1.5 text-xs rounded-sm transition-colors text-muted-foreground hover:text-foreground hover:bg-muted/50")}>
                  <Icon className={cn("h-3.5 w-3.5 shrink-0", color)} />
                  <span className="truncate">{label}</span>
                </button>
              )
            ))}

            <Separator className="my-1.5" />

            {/* ── Extra actions ── */}
            {!collapsed && (
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Tools
              </div>
            )}
            {[
              { key: "templates", label: "Templates", icon: LayoutTemplate, color: "text-emerald-400", action: () => setShowTemplates(true) },
              { key: "versions", label: "Versions", icon: History, color: "text-sky-400", action: () => setShowVersions(!showVersions) },
              { key: "monitor", label: "Monitor", icon: Eye, color: "text-orange-400", action: () => setShowMonitor(!showMonitor) },
            ].map(({ key, label, icon: Icon, color, action }) => (
              collapsed ? (
                <button key={key} onClick={action} title={label} className="flex items-center justify-center w-full py-1.5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                  <Icon className={cn("h-3.5 w-3.5", color)} />
                </button>
              ) : (
                <button key={key} onClick={action} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
                  <Icon className={cn("h-3.5 w-3.5 shrink-0", color)} />
                  <span className="truncate">{label}</span>
                </button>
              )
            ))}

            {/* ── Open Workflow Picker ── */}
            {showOpenPicker && !collapsed && (
              <>
                <Separator className="my-1.5" />
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Open Workflow</div>
                {allWorkflows.length === 0 ? (
                  <div className="px-3 py-2 text-[10px] text-muted-foreground italic">No workflows</div>
                ) : (
                  allWorkflows.map((wf) => (
                    <button
                      key={wf.id}
                      onClick={() => { setShowOpenPicker(false); navigate(`/automation/sandbox-wf/${wf.id}`); }}
                      className={cn("flex items-center gap-2 w-full px-3 py-1.5 text-xs rounded-sm transition-colors", editId === wf.id ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50")}
                    >
                      <Workflow className="h-3 w-3 shrink-0 text-blue-400" />
                      <span className="truncate flex-1 text-left">{wf.name}</span>
                      <Badge variant="outline" className="text-[9px] px-1 py-0 capitalize shrink-0">{wf.status}</Badge>
                    </button>
                  ))
                )}
              </>
            )}

            {/* ── Version History ── */}
            {showVersions && !collapsed && isEditMode && (
              <>
                <Separator className="my-1.5" />
                <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Versions</div>
                {versions.length === 0 ? (
                  <div className="px-3 py-2 text-[10px] text-muted-foreground italic">No versions yet — save to create one</div>
                ) : (
                  versions.map((v) => (
                    <div key={v.id} className="flex items-center gap-2 px-3 py-1 text-[10px] text-muted-foreground">
                      <History className="h-3 w-3 shrink-0 text-sky-400" />
                      <span>v{v.version}</span>
                      <span className="ml-auto opacity-50">{new Date(v.createdAt).toLocaleTimeString()}</span>
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ── Content + Properties Panel ────────────────── */}
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b px-4 h-10 shrink-0">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => navigate("/automation/sandbox-wf")} title="Back">
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
            {isEditMode ? <Workflow className="h-4 w-4 text-blue-400" /> : <Plus className="h-4 w-4 text-blue-400" />}
            <h1 className="text-sm font-semibold truncate">{isEditMode ? (name || "Loading...") : "New Workflow"}</h1>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant={mode === "designer" ? "default" : "outline"}
              size="sm" className="h-7 text-xs px-3"
              onClick={() => handleModeSwitch(mode === "designer" ? "form" : "designer")}
            >
              {mode === "designer" ? <><FileText className="h-3 w-3 mr-1" /> Form</> : <><PenTool className="h-3 w-3 mr-1" /> Designer</>}
            </Button>
            <Button size="sm" className="h-7 text-xs px-3" onClick={handleSubmit} disabled={!canSubmit || isSaving}>
              {isSaving ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Saving...</> : <><Save className="h-3 w-3 mr-1" /> {isEditMode ? "Update" : "Save"}</>}
            </Button>
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* Center content */}
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
            {/* ═══ Form Mode ═══ */}
            {mode === "form" && (
              <div className="flex-1 min-h-0 overflow-y-auto p-4">
                <div className="max-w-2xl mx-auto space-y-4">
                  <Card>
                    <CardHeader className="p-4 pb-3"><CardTitle className="text-sm">Workflow Details</CardTitle></CardHeader>
                    <CardContent className="p-4 pt-0 space-y-3">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Name</label>
                        <Input placeholder="e.g. Invoice Approval Pipeline" value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Category</label>
                          <Select value={category} onValueChange={setCategory}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.key} value={c.key} className="text-xs">{c.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Status</label>
                          <Select value={status} onValueChange={setStatus}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>{STATUS_OPTIONS.map((s) => <SelectItem key={s.key} value={s.key} className="text-xs">{s.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Description</label>
                        <Textarea placeholder="What does this workflow do?" value={description} onChange={(e) => setDescription(e.target.value)} className="text-sm min-h-[60px]" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Tags <span className="opacity-50">(comma-separated)</span></label>
                        <Input placeholder="e.g. Approval, Finance, HITL" value={tags} onChange={(e) => setTags(e.target.value)} className="h-8 text-sm" />
                      </div>
                    </CardContent>
                  </Card>

                  {steps[selectedStepIdx] && (
                    <Card className="border-primary/20">
                      <CardHeader className="p-4 pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm">Step {selectedStepIdx + 1}</CardTitle>
                          <div className="flex items-center gap-2">
                            <Select value={steps[selectedStepIdx].status} onValueChange={(v) => updateStep(selectedStepIdx, "status", v)}>
                              <SelectTrigger className="h-6 text-[10px] w-24"><SelectValue /></SelectTrigger>
                              <SelectContent>{STEP_STATUSES.map((s) => <SelectItem key={s.key} value={s.key} className="text-xs">{s.label}</SelectItem>)}</SelectContent>
                            </Select>
                            {steps.length > 1 && (
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive" onClick={() => removeStep(selectedStepIdx)} title="Remove step">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4 pt-0 space-y-3">
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Label</label>
                          <Input placeholder="e.g. Validate Input" value={steps[selectedStepIdx].label} onChange={(e) => updateStep(selectedStepIdx, "label", e.target.value)} className="h-8 text-sm" />
                          <p className="text-[10px] text-muted-foreground mt-1">Key: <code className="bg-muted px-1 rounded">{steps[selectedStepIdx].key}</code></p>
                        </div>
                        <div>
                          <label className="text-xs text-muted-foreground mb-1 block">Description</label>
                          <Textarea placeholder="What does this step do?" value={steps[selectedStepIdx].description} onChange={(e) => updateStep(selectedStepIdx, "description", e.target.value)} className="text-sm min-h-[50px]" />
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  <Card>
                    <CardHeader className="p-4 pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">All Steps ({steps.filter((s) => s.label.trim()).length})</CardTitle>
                        <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={addStep}><Plus className="h-3 w-3 mr-1" /> Add</Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                      <div className="space-y-1">
                        {steps.map((step, idx) => {
                          const stepStatus = STEP_STATUSES.find((s) => s.key === step.status);
                          const StepIcon = stepStatus?.icon || Circle;
                          return (
                            <div key={idx} onClick={() => setSelectedStepIdx(idx)} className={cn("flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors", selectedStepIdx === idx ? "bg-primary/10 text-primary" : "hover:bg-muted/50 text-muted-foreground")}>
                              <GripVertical className="h-3 w-3 shrink-0 opacity-30" />
                              <StepIcon className={cn("h-3 w-3 shrink-0", stepStatus?.color)} />
                              <span className="flex-1 truncate">{step.label || <span className="italic opacity-50">Untitled</span>}</span>
                              <Badge variant="outline" className="text-[9px] px-1">{step.status}</Badge>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  {(createMutation.isError || updateMutation.isError) && (
                    <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded p-3">
                      {createMutation.error?.message || updateMutation.error?.message}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ═══ Designer Mode ═══ */}
            {mode === "designer" && (
              <div className="flex-1 min-h-0" style={{ background: "#0a0a0a" }}>
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onConnect={onConnect}
                  onNodeClick={onNodeClick}
                  onPaneClick={onPaneClick}
                  nodeTypes={nodeTypes}
                  fitView
                  snapToGrid
                  snapGrid={[20, 20]}
                  defaultEdgeOptions={{
                    animated: true,
                    style: { stroke: "#64748b", strokeWidth: 2 },
                    markerEnd: { type: MarkerType.ArrowClosed, color: "#64748b" },
                  }}
                  proOptions={{ hideAttribution: true }}
                >
                  <Background color="#1e293b" gap={20} size={1} />
                  <Controls className="!bg-card !border-border !shadow-lg [&>button]:!bg-card [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-muted" />
                  <MiniMap
                    nodeColor={(node) => {
                      const def = NODE_TYPES.find((x) => x.type === node.data?.nodeType);
                      return def?.color || "#64748b";
                    }}
                    maskColor="rgba(0,0,0,0.7)"
                    className="!bg-zinc-900 !border-border"
                  />
                </ReactFlow>
              </div>
            )}

            {/* Execution Monitor */}
            {showMonitor && (
              <ExecutionMonitor
                workflowId={editId}
                executionId={activeExecutionId}
                onClose={() => setShowMonitor(false)}
                onSelectExecution={setActiveExecutionId}
              />
            )}
          </div>

          {/* Phase 2: Properties Panel (right side, designer only) */}
          {mode === "designer" && selectedNode && (
            <NodePropertiesPanel
              node={selectedNode}
              onClose={() => setSelectedNodeId(null)}
              onUpdateNode={handleUpdateNode}
              onDeleteNode={(nodeId) => {
                setNodes((nds) => nds.filter((n) => n.id !== nodeId));
                setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
                setSelectedNodeId(null);
                toast("Node deleted");
              }}
            />
          )}
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between border-t bg-card/50 px-4 h-7 text-xs text-muted-foreground shrink-0">
          <div className="flex items-center gap-4">
            <span className="font-mono text-blue-500">{isEditMode ? "Edit Workflow" : "New Workflow"}</span>
            <span>{mode === "form" ? `${steps.filter((s) => s.label.trim()).length} steps` : `${nodes.length} nodes · ${edges.length} edges`}</span>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-[9px] px-1 py-0 capitalize">{mode}</Badge>
            <span className="capitalize">{category}</span>
            <Badge variant="outline" className="text-[9px] px-1 py-0 capitalize">{status}</Badge>
            <span className="text-[9px] opacity-50">Ctrl+S save · Ctrl+Enter run · Del remove</span>
          </div>
        </div>
      </div>

      {/* ── Save as Draft Dialog ── */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">Save as Draft</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Workflow Name</label>
              <Input placeholder="e.g. Invoice Approval Pipeline" value={saveName} onChange={(e) => setSaveName(e.target.value)} className="h-8 text-sm" autoFocus />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Category</label>
              <Select value={saveCategory} onValueChange={setSaveCategory}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c.key} value={c.key} className="text-xs">{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowSaveDialog(false)}>Cancel</Button>
            <Button size="sm" className="h-7 text-xs" onClick={handleSaveAsDraft} disabled={!saveName.trim() || createMutation.isPending}>
              {createMutation.isPending ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Saving...</> : <><Save className="h-3 w-3 mr-1" /> Save Draft</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Templates Gallery Dialog ── */}
      <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
        <DialogContent className="max-w-lg max-h-[70vh]">
          <DialogHeader><DialogTitle className="text-sm flex items-center gap-2"><LayoutTemplate className="h-4 w-4" /> Workflow Templates</DialogTitle></DialogHeader>
          <ScrollArea className="max-h-[50vh]">
            <div className="space-y-2 pr-2">
              {templates.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No templates available. Run seed to populate.</p>
              ) : (
                templates.map((tmpl) => (
                  <Card key={tmpl.id} className="hover:border-primary/30 transition-colors cursor-pointer" onClick={() => templateMutation.mutate({ templateId: tmpl.id, name: tmpl.name })}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs font-semibold">{tmpl.name}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">{tmpl.description}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <Badge variant="outline" className="text-[9px] px-1 py-0">{tmpl.category}</Badge>
                          <Badge variant="outline" className="text-[9px] px-1 py-0">{((tmpl.steps as any[]) || []).length} steps</Badge>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {((tmpl.tags as string[]) || []).map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[8px] px-1 py-0">{tag}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
