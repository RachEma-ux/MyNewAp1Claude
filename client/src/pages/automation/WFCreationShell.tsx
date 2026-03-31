/**
 * WFCreationShell — Create New Workflow (Simple IBM Shell)
 *
 * Two modes:
 *   - Form: name, category, description, steps editor
 *   - Designer: n8n-style ReactFlow canvas with draggable nodes
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

// ── n8n Node Palette ─────────────────────────────────────

const NODE_PALETTE = [
  { type: "editor", label: "WF Editor", icon: GitBranch, color: "#60a5fa" },
  { type: "triggers", label: "Triggers", icon: Zap, color: "#facc15" },
  { type: "debug", label: "Debug Console", icon: Eye, color: "#fb923c" },
  { type: "deploy", label: "Deploy", icon: Gauge, color: "#4ade80" },
  { type: "metrics", label: "Metrics", icon: BarChart3, color: "#a78bfa" },
];

// ── n8n-style Custom Node ────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  pending: "#64748b",
  running: "#3b82f6",
  done: "#22c55e",
  failed: "#ef4444",
};

function N8nNode({ data, selected }: NodeProps) {
  const palette = NODE_PALETTE.find((p) => p.type === data.nodeType);
  const Icon = palette?.icon || Workflow;
  const nodeColor = palette?.color || "#64748b";
  const statusColor = STATUS_COLORS[data.status] || "#64748b";

  return (
    <div
      className={cn(
        "rounded-lg border-2 bg-card shadow-md min-w-[160px] transition-all",
        selected ? "ring-2 ring-primary shadow-lg" : "",
      )}
      style={{ borderColor: nodeColor }}
    >
      <Handle type="target" position={Position.Left} className="!w-3 !h-3 !border-2 !border-background" style={{ background: nodeColor }} />
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-t-md"
        style={{ background: `${nodeColor}20` }}
      >
        <Icon className="h-4 w-4 shrink-0" style={{ color: nodeColor }} />
        <span className="text-xs font-semibold truncate">{data.label || "Untitled"}</span>
      </div>
      {/* Body */}
      <div className="px-3 py-2">
        <p className="text-[10px] text-muted-foreground line-clamp-2">{data.description || "No description"}</p>
        <div className="flex items-center gap-1.5 mt-1.5">
          <div className="h-2 w-2 rounded-full" style={{ background: statusColor }} />
          <span className="text-[10px] capitalize text-muted-foreground">{data.status}</span>
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
  const isMobile = useIsMobile();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(isMobile);
  const collapsed = sidebarCollapsed;
  const [mode, setMode] = useState<"form" | "designer">("form");

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

  // ── ReactFlow State ────────────────────────────────────

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true, markerEnd: { type: MarkerType.ArrowClosed } }, eds)),
    [setEdges],
  );

  // Sync steps → nodes when switching to designer
  useEffect(() => {
    if (mode === "designer") {
      const newNodes: Node[] = steps.map((step, idx) => ({
        id: step.key,
        type: "n8nNode",
        position: { x: 80 + idx * 220, y: 120 + (idx % 2) * 80 },
        data: {
          label: step.label || `Step ${idx + 1}`,
          description: step.description,
          status: step.status,
          nodeType: idx === 0 ? "trigger" : "action",
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

  // Sync nodes → steps when switching back to form
  const syncNodesToSteps = useCallback(() => {
    if (nodes.length === 0) return;
    const updated = nodes.map((node, idx) => ({
      key: node.id,
      label: node.data.label || "",
      description: node.data.description || "",
      status: node.data.status || "pending",
    }));
    setSteps(updated);
  }, [nodes]);

  // ── tRPC ───────────────────────────────────────────────

  const utils = trpc.useUtils();
  const createMutation = trpc.sandboxWf.workflows.create.useMutation({
    onSuccess: () => {
      utils.sandboxWf.invalidate();
      navigate("/automation/sandbox-wf");
    },
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

  const addNodeFromPalette = (paletteType: string, paletteLabel: string) => {
    const id = `${paletteType}-${Date.now()}`;
    const newNode: Node = {
      id,
      type: "n8nNode",
      position: { x: 100 + Math.random() * 300, y: 100 + Math.random() * 200 },
      data: {
        label: paletteLabel,
        description: "",
        status: "pending",
        nodeType: paletteType,
      },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  // ── Submit ─────────────────────────────────────────────

  const canSubmit = name.trim().length > 0 && steps.some((s) => s.label.trim().length > 0);

  const handleSubmit = () => {
    if (!canSubmit) return;
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
  };

  // ── Mode switch handler ────────────────────────────────

  const handleModeSwitch = (newMode: "form" | "designer") => {
    if (newMode === "form" && mode === "designer") {
      syncNodesToSteps();
    }
    setMode(newMode);
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
                      <span className="text-[10px] opacity-40">{idx + 1}</span>
                    </button>
                  );
                })}
                {!collapsed && (
                  <button
                    onClick={addStep}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  >
                    <Plus className="h-3 w-3 shrink-0" />
                    <span>Add Step</span>
                  </button>
                )}
                {collapsed && (
                  <button
                    onClick={addStep}
                    title="Add Step"
                    className="flex items-center justify-center w-full py-1.5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </>
            )}

            {/* ── Designer mode sidebar: Node Palette ── */}
            {mode === "designer" && (
              <>
                {!collapsed && (
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Node Palette
                  </div>
                )}
                {NODE_PALETTE.map((item) => {
                  const Icon = item.icon;
                  return collapsed ? (
                    <button
                      key={item.type}
                      onClick={() => addNodeFromPalette(item.type, item.label)}
                      title={item.label}
                      className="flex items-center justify-center w-full py-1.5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                    >
                      <Icon className="h-3.5 w-3.5" style={{ color: item.color }} />
                    </button>
                  ) : (
                    <button
                      key={item.type}
                      onClick={() => addNodeFromPalette(item.type, item.label)}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-xs rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: item.color }} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ── Content ───────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b px-4 h-10 shrink-0">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => navigate("/automation/sandbox-wf")} title="Back">
              <ArrowLeft className="h-3.5 w-3.5" />
            </Button>
            <Plus className="h-4 w-4 text-blue-400" />
            <h1 className="text-sm font-semibold">New Workflow</h1>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant={mode === "designer" ? "default" : "outline"}
              size="sm" className="h-7 text-xs px-3"
              onClick={() => handleModeSwitch(mode === "designer" ? "form" : "designer")}
            >
              {mode === "designer" ? (
                <><FileText className="h-3 w-3 mr-1" /> Form</>
              ) : (
                <><PenTool className="h-3 w-3 mr-1" /> Designer</>
              )}
            </Button>
            <Button
              size="sm" className="h-7 text-xs px-3"
              onClick={handleSubmit}
              disabled={!canSubmit || createMutation.isPending}
            >
              {createMutation.isPending ? (
                <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Saving...</>
              ) : (
                <><Save className="h-3 w-3 mr-1" /> Save</>
              )}
            </Button>
          </div>
        </div>

        {/* ═══ Form Mode ═══ */}
        {mode === "form" && (
          <div className="flex-1 min-h-0 overflow-y-auto p-4">
            <div className="max-w-2xl mx-auto space-y-4">

              {/* Workflow Details */}
              <Card>
                <CardHeader className="p-4 pb-3">
                  <CardTitle className="text-sm">Workflow Details</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Name</label>
                    <Input
                      placeholder="e.g. Invoice Approval Pipeline"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Category</label>
                      <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CATEGORIES.map((c) => (
                            <SelectItem key={c.key} value={c.key} className="text-xs">{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Status</label>
                      <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((s) => (
                            <SelectItem key={s.key} value={s.key} className="text-xs">{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Description</label>
                    <Textarea
                      placeholder="What does this workflow do?"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="text-sm min-h-[60px]"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Tags <span className="opacity-50">(comma-separated)</span></label>
                    <Input
                      placeholder="e.g. Approval, Finance, HITL"
                      value={tags}
                      onChange={(e) => setTags(e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Selected Step Editor */}
              {steps[selectedStepIdx] && (
                <Card className="border-primary/20">
                  <CardHeader className="p-4 pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">Step {selectedStepIdx + 1}</CardTitle>
                      <div className="flex items-center gap-2">
                        <Select
                          value={steps[selectedStepIdx].status}
                          onValueChange={(v) => updateStep(selectedStepIdx, "status", v)}
                        >
                          <SelectTrigger className="h-6 text-[10px] w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STEP_STATUSES.map((s) => (
                              <SelectItem key={s.key} value={s.key} className="text-xs">{s.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {steps.length > 1 && (
                          <Button
                            variant="ghost" size="sm" className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                            onClick={() => removeStep(selectedStepIdx)}
                            title="Remove step"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 space-y-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Label</label>
                      <Input
                        placeholder="e.g. Validate Input"
                        value={steps[selectedStepIdx].label}
                        onChange={(e) => updateStep(selectedStepIdx, "label", e.target.value)}
                        className="h-8 text-sm"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">Key: <code className="bg-muted px-1 rounded">{steps[selectedStepIdx].key}</code></p>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">Description</label>
                      <Textarea
                        placeholder="What does this step do?"
                        value={steps[selectedStepIdx].description}
                        onChange={(e) => updateStep(selectedStepIdx, "description", e.target.value)}
                        className="text-sm min-h-[50px]"
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Steps Summary */}
              <Card>
                <CardHeader className="p-4 pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">All Steps ({steps.filter((s) => s.label.trim()).length})</CardTitle>
                    <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={addStep}>
                      <Plus className="h-3 w-3 mr-1" /> Add
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  {steps.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No steps yet</p>
                  ) : (
                    <div className="space-y-1">
                      {steps.map((step, idx) => {
                        const stepStatus = STEP_STATUSES.find((s) => s.key === step.status);
                        const StepIcon = stepStatus?.icon || Circle;
                        return (
                          <div
                            key={idx}
                            onClick={() => setSelectedStepIdx(idx)}
                            className={cn(
                              "flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors",
                              selectedStepIdx === idx ? "bg-primary/10 text-primary" : "hover:bg-muted/50 text-muted-foreground",
                            )}
                          >
                            <GripVertical className="h-3 w-3 shrink-0 opacity-30" />
                            <StepIcon className={cn("h-3 w-3 shrink-0", stepStatus?.color)} />
                            <span className="flex-1 truncate">{step.label || <span className="italic opacity-50">Untitled</span>}</span>
                            <Badge variant="outline" className="text-[9px] px-1">{step.status}</Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Error display */}
              {createMutation.isError && (
                <div className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded p-3">
                  {createMutation.error.message}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ Designer Mode — n8n Canvas ═══ */}
        {mode === "designer" && (
          <div className="flex-1 min-h-0" style={{ background: "#0a0a0a" }}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
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
                  const p = NODE_PALETTE.find((x) => x.type === node.data?.nodeType);
                  return p?.color || "#64748b";
                }}
                maskColor="rgba(0,0,0,0.7)"
                className="!bg-zinc-900 !border-border"
              />
            </ReactFlow>
          </div>
        )}

        {/* Status bar */}
        <div className="flex items-center justify-between border-t bg-card/50 px-4 h-7 text-xs text-muted-foreground shrink-0">
          <div className="flex items-center gap-4">
            <span className="font-mono text-blue-500">New Workflow</span>
            <span>
              {mode === "form"
                ? `${steps.filter((s) => s.label.trim()).length} steps`
                : `${nodes.length} nodes · ${edges.length} edges`}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-[9px] px-1 py-0 capitalize">
              {mode === "form" ? "Form" : "Designer"}
            </Badge>
            <span className="capitalize">{category}</span>
            <Badge variant="outline" className="text-[9px] px-1 py-0 capitalize">{status}</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
